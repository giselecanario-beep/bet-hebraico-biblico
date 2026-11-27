"use strict";
// Restricted integration for the existing fictional seller, buyer and BET test account.
const {onCall,onRequest,HttpsError}=require("firebase-functions/v2/https");
const {defineSecret}=require("firebase-functions/params");
const {initializeApp,getApps}=require("firebase-admin/app");
const {getFirestore,Timestamp,FieldValue}=require("firebase-admin/firestore");
const {addMonth,verifySubscription,evaluateAccess}=require("./bet-access-policy");
const {webhookVerdict}=require("./bet-webhook-signature");
const webhookSecret=defineSecret("MP_TEST_WEBHOOK_SECRET");
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
 return reconcile(cfg,sub,action!=="check");
});
async function reconcile(cfg,sub,apply){
 const now=Date.now(),initial=evaluateAccess(sub,cfg,now);
 let result=initial;
 if(initial.reason!=="trial"&&["authorized","cancelled","canceled","paused"].includes(sub.status)&&now>=Date.parse(sub.date_created)+7*86400000-86400000){
  result=evaluateAccess(sub,cfg,now,await invoices(cfg,now));
 }
 if(apply){
  const db=getFirestore(),ref=db.collection("betEntitlements").doc(cfg.uid);
  const version=Number.isSafeInteger(sub.version)?sub.version:null;
  await db.runTransaction(async tx=>{
   const snap=await tx.get(ref);protect(snap);
   const old=snap.data()||{},oldVersion=old.providerVersion;
   if(Number.isSafeInteger(oldVersion)&&Number.isSafeInteger(version)&&oldVersion>version)return;
   if(old.checkedAt?.toMillis()>now&&(!Number.isSafeInteger(version)||!Number.isSafeInteger(oldVersion)||oldVersion>=version))return;
   tx.set(ref,{role:"subscriber",active:result.active,validUntil:Timestamp.fromMillis(result.until),source:"mercadopago-test",subscriptionStatus:sub.status,accessReason:result.reason,providerVersion:version,checkedAt:Timestamp.fromMillis(now),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
 }
 return {status:sub.status,active:result.active,reason:result.reason,trialActive:result.active,validUntil:new Date(result.until).toISOString(),applied:apply,cancelled:["cancelled","canceled"].includes(sub.status)};
}
exports.betTestWebhook=onRequest({region:"us-central1",secrets:[token,config,webhookSecret],maxInstances:1,minInstances:0,concurrency:1,memory:"256MiB",timeoutSeconds:90,cors:false},async(req,res)=>{
 if(req.method!=="POST"){res.status(405).end();return;}
 const ids=new URL(req.originalUrl||req.url,"https://bet.invalid").searchParams.getAll("data.id");
 const id=ids.length===1?ids[0]:undefined,type=req.body?.type;
 res.set("X-BET-Webhook","diagnostic-v2");
 const verdict=webhookVerdict({id,requestId:req.get("x-request-id"),signature:req.get("x-signature"),secret:webhookSecret.value(),now:Date.now()});
 if(verdict!=="ok"){console.warn("BET_WEBHOOK_DIAG "+verdict);res.status(401).end();return;}
 console.info("BET_WEBHOOK_DIAG signature-ok");
 if(String(req.body?.data?.id).toLowerCase()!==id.toLowerCase()){res.status(400).end();return;}
 if(!["subscription_preapproval","subscription_authorized_payment"].includes(type)){res.status(200).end();return;}
 try{
  const cfg=configuration();
  if(type==="subscription_preapproval"&&id.toLowerCase()!==cfg.subscriptionId.toLowerCase()){res.status(200).end();return;}
  if(type==="subscription_authorized_payment"&&!/^[0-9]{1,25}$/.test(id)){res.status(400).end();return;}
  await checkProvider(cfg);
  if(type==="subscription_authorized_payment"){
   const invoice=await mp("/authorized_payments/"+encodeURIComponent(id));
   if(String(invoice.id)!==id||invoice.preapproval_id!==cfg.subscriptionId){res.status(200).end();return;}
  }
  const sub=await getSubscription(cfg);
  await reconcile(cfg,sub,true);
  res.status(200).end();
 }catch(e){console.error("BET test webhook reconciliation failed",e?.code||"internal");res.status(503).end();}
});
