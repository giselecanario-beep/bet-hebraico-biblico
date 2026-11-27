"use strict";
// Test only. Never accepts a browser-selected subscription or grants commercial access.
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {defineSecret}=require("firebase-functions/params");
const {initializeApp,getApps}=require("firebase-admin/app");
const {getFirestore,Timestamp,FieldValue}=require("firebase-admin/firestore");
const token=defineSecret("MP_TEST_ACCESS_TOKEN");
const config=defineSecret("BET_MP_TEST_CONFIG");
if(!getApps().length)initializeApp();
function validateTrial(sub,cfg,now){
  if(String(sub.collector_id)!==String(cfg.sellerId)||String(sub.payer_id)!==String(cfg.payerId)||sub.preapproval_plan_id!==cfg.planId||sub.id!==cfg.subscriptionId)throw Error("identity mismatch");
  const r=sub.auto_recurring||{};
  if(r.currency_id!=="BRL"||Math.round(Number(r.transaction_amount)*100)!==1990||r.frequency!==1||r.frequency_type!=="months")throw Error("plan mismatch");
  if(r.free_trial?.frequency!==7||r.free_trial?.frequency_type!=="days")throw Error("trial mismatch");
  const start=Date.parse(sub.date_created),next=Date.parse(sub.next_payment_date);
  if(sub.status!=="authorized")return {active:false,reason:"not-authorized",until:now};
  if(!Number.isFinite(start)||!Number.isFinite(next)||start>now||next<=start)throw Error("invalid dates");
  const until=Math.min(next,start+7*86400000);
  return {active:until>now,reason:until>now?"trial":"trial-ended",until};
}
async function mpGet(path){
 const res=await fetch("https://api.mercadopago.com"+path,{headers:{Authorization:"Bearer "+token.value()},signal:AbortSignal.timeout(10000),redirect:"error"});
 if(!res.ok)throw new HttpsError("unavailable","Não foi possível confirmar os dados no Mercado Pago.");
 return res.json();
}
exports.betTestSubscription=onCall({region:"us-central1",secrets:[token,config],maxInstances:1,minInstances:0,concurrency:1,memory:"256MiB",timeoutSeconds:30,cors:["https://bet-hebraico.web.app","https://bet-hebraico.firebaseapp.com"]},async req=>{
 if(!req.auth)throw new HttpsError("unauthenticated","Entre no BET.");
 let cfg;
 try{cfg=JSON.parse(config.value());}catch{throw new HttpsError("failed-precondition","Teste não configurado.");}
 if(!cfg.uid||req.auth.uid!==cfg.uid)throw new HttpsError("permission-denied","Conta não autorizada para o teste.");
 if(!/^[a-f0-9]{32}$/i.test(cfg.subscriptionId)||!/^\d+$/.test(String(cfg.sellerId))||!/^\d+$/.test(String(cfg.payerId))||!cfg.planId)throw new HttpsError("failed-precondition","Configuração incompleta.");
 const me=await mpGet("/users/me");
 if(String(me.id)!==String(cfg.sellerId)||!/^TESTUSER/i.test(me.nickname||""))throw new HttpsError("failed-precondition","A credencial não pertence ao vendedor de teste.");
 const sub=await mpGet("/preapproval/"+encodeURIComponent(cfg.subscriptionId));
 let result;
 try{result=validateTrial(sub,cfg,Date.now());}catch{throw new HttpsError("failed-precondition","Dados da assinatura não conferem com o teste autorizado.");}
 if(req.data?.activate===true){
  const ref=getFirestore().collection("betEntitlements").doc(cfg.uid);
  await getFirestore().runTransaction(async tx=>{
   const snap=await tx.get(ref);
   if(snap.exists&&snap.data()?.source!=="mercadopago-test")throw new HttpsError("failed-precondition","Já existe uma autorização que não pertence a este teste.");
   if(["owner","collaborator"].includes(snap.data()?.role))throw new HttpsError("failed-precondition","Acesso permanente protegido.");
   tx.set(ref,{role:"subscriber",active:result.active,validUntil:Timestamp.fromMillis(result.until),source:"mercadopago-test",updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
 }
 return {status:sub.status,trialActive:result.active,validUntil:new Date(result.until).toISOString(),applied:req.data?.activate===true};
});
