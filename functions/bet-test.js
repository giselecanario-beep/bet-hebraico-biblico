"use strict";
// Restricted integration for the existing fictional seller, buyer and BET test account.
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {defineSecret}=require("firebase-functions/params");
const {initializeApp,getApps}=require("firebase-admin/app");
const {getFirestore,Timestamp,FieldValue}=require("firebase-admin/firestore");
const {addMonth,verifySubscription,evaluateAccess}=require("./bet-access-policy");
const token=defineSecret("MP_TEST_ACCESS_TOKEN"), config=defineSecret("BET_MP_TEST_CONFIG");
if(!getApps().length)initializeApp();
async function mp(path,body){
 const response=await fetch("https://api.mercadopago.com"+path,{
  method:body?"PUT":"GET",headers:{Authorization:"Bearer "+token.value(),...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000),redirect:"error"});
 if(!response.ok)throw new HttpsError("unavailable","Não foi possível confirmar os dados no Mercado Pago.");
 return response.json();
}
function configuration(){
 let cfg;
 try{cfg=JSON.parse(config.value());}catch{throw new HttpsError("failed-precondition","Teste não configurado.");}
 if(!cfg.uid||!/^\w[\w-]{9,127}$/.test(cfg.uid)||!(/^[a-f0-9]{32}$/i.test(cfg.subscriptionId))||!/^\d+$/.test(String(cfg.sellerId))||!/^\d+$/.test(String(cfg.payerId))||!(/^[a-f0-9]{32}$/i.test(cfg.planId)))throw new HttpsError("failed-precondition","Configuração incompleta.");
 return cfg;
}
async function checkProvider(cfg){
 const me=await mp("/users/me");
 if(String(me.id)!==String(cfg.sellerId)||!/^TESTUSER/i.test(me.nickname||""))throw new HttpsError("failed-precondition","A credencial não pertence ao vendedor de teste.");
}
async function getSubscription(cfg){
 const sub=await mp("/preapproval/"+encodeURIComponent(cfg.subscriptionId));
 try{verifySubscription(sub,cfg);}catch{throw new HttpsError("failed-precondition","Dados da assinatura não conferem com o teste autorizado.");}
 return sub;
}
async function invoices(cfg,now){
 const pairs=[];
 for(let offset=0;offset<250;offset+=50){
  const page=await mp("/authorized_payments/search?preapproval_id="+encodeURIComponent(cfg.subscriptionId)+"&limit=50&offset="+offset);
  if(!Array.isArray(page.results)||!Number.isSafeInteger(Number(page.paging?.total))||Number(page.paging.total)<0||Number(page.paging.offset)!==offset)throw new HttpsError("unavailable","Faturas não confirmadas.");
  for(const i of page.results){
   const due=Date.parse(i.debit_date);
   if(i.preapproval_id!==cfg.subscriptionId||i.payment?.status!=="approved"||!/^\d+$/.test(String(i.payment?.id))||!Number.isFinite(due)||due>now||addMonth(due)<=now)continue;
   pairs.push({invoice:i,payment:await mp("/v1/payments/"+encodeURIComponent(i.payment.id))});
   if(pairs.length>5)throw new HttpsError("failed-precondition","Faturas duplicadas; confira administrativamente.");
  }
  if(offset+page.results.length>=Number(page.paging.total))return pairs;
  if(page.results.length!==50)throw new HttpsError("unavailable","Paginação de faturas incompleta.");
 }
 throw new HttpsError("unavailable","Histórico de faturas requer conferência.");
}
function protect(snap){
 const d=snap.data();
 if(snap.exists&&(d?.source!=="mercadopago-test"||["owner","collaborator"].includes(d?.role)))throw new HttpsError("failed-precondition","Uma autorização de outro tipo está protegida.");
}
exports.betTestSubscription=onCall({region:"us-central1",secrets:[token,config],maxInstances:1,minInstances:0,concurrency:1,memory:"256MiB",timeoutSeconds:90,cors:[/^https:\/\/bet-hebraico--[a-z0-9-]+\.web\.app$/]},async req=>{
 if(!req.auth)throw new HttpsError("unauthenticated","Entre no BET.");
 const cfg=configuration();
 if(req.auth.uid!==cfg.uid)throw new HttpsError("permission-denied","Conta não autorizada para este teste.");
 const action=req.data?.action??(req.data?.activate===true?"sync":"check");
 if(!["check","sync","cancel"].includes(action))throw new HttpsError("invalid-argument","Ação inválida.");
 if(action==="cancel"&&req.data?.confirm!==true)throw new HttpsError("invalid-argument","Confirme o cancelamento do teste.");
 const db=getFirestore(),ref=db.collection("betEntitlements").doc(cfg.uid);
 if(action!=="check")protect(await ref.get());
 await checkProvider(cfg);
 let sub=await getSubscription(cfg);
 if(action==="cancel"&&!["cancelled","canceled"].includes(sub.status)){
  await mp("/preapproval/"+encodeURIComponent(cfg.subscriptionId),{status:"canceled"});
  sub=await getSubscription(cfg);
  if(!["cancelled","canceled"].includes(sub.status))throw new HttpsError("unavailable","Cancelamento ainda não confirmado. Consulte novamente.");
 }
 const now=Date.now(),initial=evaluateAccess(sub,cfg,now);
 let result=initial;
 // No paid time is granted solely because the recurring subscription is authorized.
 if(initial.reason!=="trial"&&["authorized","cancelled","canceled","paused"].includes(sub.status)&&now>=Date.parse(sub.date_created)+7*86400000-86400000){
  result=evaluateAccess(sub,cfg,now,await invoices(cfg,now));
 }
 if(action!=="check"){
  await db.runTransaction(async tx=>{
   protect(await tx.get(ref));
   tx.set(ref,{role:"subscriber",active:result.active,validUntil:Timestamp.fromMillis(result.until),source:"mercadopago-test",subscriptionStatus:sub.status,accessReason:result.reason,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
 }
 return {status:sub.status,active:result.active,reason:result.reason,trialActive:result.active,validUntil:new Date(result.until).toISOString(),applied:action!=="check",cancelled:["cancelled","canceled"].includes(sub.status)};
});
