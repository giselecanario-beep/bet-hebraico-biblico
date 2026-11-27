"use strict";
// Restricted integration for the existing fictional seller, buyer and BET test account.
const {onCall,onRequest,HttpsError}=require("firebase-functions/v2/https");
const {defineSecret}=require("firebase-functions/params");
const {initializeApp,getApps}=require("firebase-admin/app");
const {getFirestore,Timestamp,FieldValue}=require("firebase-admin/firestore");
const {addMonth,verifySubscription,evaluateAccess}=require("./bet-access-policy");
const {webhookVerdict}=require("./bet-webhook-signature");
const {eventMatches}=require("./bet-payment-events");
const {listInvoices}=require("./bet-invoice-pages");
const {createCheckoutService,CONSENT_VERSION}=require("./bet-checkout-service");
const {createCheckoutStore}=require("./bet-checkout-store");
const {createTestProvider}=require("./bet-checkout-provider");
const checkoutConfig=defineSecret("BET_MP_CHECKOUT_CONFIG");
const webhookSecret=defineSecret("MP_TEST_WEBHOOK_SECRET");
const token=defineSecret("MP_TEST_ACCESS_TOKEN"), config=defineSecret("BET_MP_TEST_CONFIG");
if(!getApps().length)initializeApp();
async function mp(path,body){
 const response=await fetch("https://api.mercadopago.com"+path,{
  method:body?"PUT":"GET",headers:{Authorization:"Bearer "+token.value(),...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000),redirect:"error"});
 if(!response.ok)throw new HttpsError("unavailable","Não foi possível confirmar os dados no Mercado Pago.",{providerHttp:response.status});
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
 try{verifySubscription(sub,cfg);if(cfg.reference&&(sub.external_reference!==cfg.reference||String(sub.application_id)!==String(cfg.applicationId)))throw Error("binding mismatch");}catch{throw new HttpsError("failed-precondition","Dados da assinatura não conferem com o teste autorizado.");}
 return sub;
}
async function invoices(cfg,now){
 let rows;
 try{rows=await listInvoices(mp,cfg.subscriptionId);}catch{throw new HttpsError("unavailable","Faturas não confirmadas.");}
 const pairs=[];
 for(const i of rows){
  const due=Date.parse(i.debit_date);
  if(i.payment?.status!=="approved"||!/^\d+$/.test(String(i.payment?.id))||!Number.isFinite(due)||due>now||addMonth(due)<=now)continue;
  pairs.push({invoice:i,payment:await mp("/v1/payments/"+encodeURIComponent(i.payment.id))});
  if(pairs.length>5)throw new HttpsError("failed-precondition","Faturas duplicadas; confira administrativamente.");
 }
 return pairs;
}
function protect(snap,source="mercadopago-test"){
 const d=snap.data();
 if(snap.exists&&(d?.source!==source||["owner","collaborator"].includes(d?.role)))throw new HttpsError("failed-precondition","Uma autorização de outro tipo está protegida.");
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
   const snap=await tx.get(ref);protect(snap,cfg.reference?"mercadopago-test-individual":"mercadopago-test");
   const old=snap.data()||{},oldVersion=old.providerVersion;
   if(Number.isSafeInteger(oldVersion)&&Number.isSafeInteger(version)&&oldVersion>version)return;
   if(old.checkedAt?.toMillis()>now&&(!Number.isSafeInteger(version)||!Number.isSafeInteger(oldVersion)||oldVersion>=version))return;
   tx.set(ref,{role:"subscriber",active:result.active,validUntil:Timestamp.fromMillis(result.until),source:cfg.reference?"mercadopago-test-individual":"mercadopago-test",subscriptionStatus:sub.status,accessReason:result.reason,providerVersion:version,checkedAt:Timestamp.fromMillis(now),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
 }
 return {status:sub.status,active:result.active,reason:result.reason,trialActive:result.active,validUntil:new Date(result.until).toISOString(),applied:apply,cancelled:["cancelled","canceled"].includes(sub.status)};
}
exports.betTestWebhook=onRequest({region:"us-central1",secrets:[token,config,webhookSecret,checkoutConfig],maxInstances:1,minInstances:0,concurrency:1,memory:"256MiB",timeoutSeconds:90,cors:false},async(req,res)=>{
 if(req.method!=="POST"){res.status(405).end();return;}
 const ids=new URL(req.originalUrl||req.url,"https://bet.invalid").searchParams.getAll("data.id");
 const id=ids.length===1?ids[0]:undefined,type=req.body?.type;
 res.set("X-BET-Webhook","diagnostic-v3");
 const verdict=webhookVerdict({id,requestId:req.get("x-request-id"),signature:req.get("x-signature"),secret:webhookSecret.value(),now:Date.now()});
 if(req.get("x-bet-diagnostic")==="1"&&type==="bet_diagnostic")res.set("X-BET-Diagnostic",verdict);
 if(verdict!=="ok"){console.warn("BET_WEBHOOK_DIAG "+verdict);res.status(401).end();return;}
 console.info("BET_WEBHOOK_DIAG signature-ok");
 if(String(req.body?.data?.id).toLowerCase()!==id.toLowerCase()){res.status(400).end();return;}
 if(!["subscription_preapproval","subscription_authorized_payment","payment","payments"].includes(type)){res.status(200).end();return;}
 try{
  const cfg=configuration();
  await checkProvider(cfg);
  let matched=await eventMatches(type,id,cfg,mp)?cfg:null;
  if(!matched){
   const individual=await individualBinding(individualOffer(cfg));
   if(individual&&await eventMatches(type,id,individual,mp))matched=individual;
  }
  if(!matched){res.status(200).end();return;}
  const sub=await getSubscription(matched);
  await reconcile(matched,sub,true);
  res.set("X-BET-Result","reconciled");
  res.status(200).end();
 }catch(e){console.error("BET test webhook reconciliation failed",e?.code||"internal");res.status(503).end();}
});

function individualOffer(legacy){
 let o;
 try{o=JSON.parse(checkoutConfig.value());}catch{throw new HttpsError("failed-precondition","Checkout de teste não configurado.");}
 if(o.enabled!==true||o.environment!=="test"||o.allowedUid===legacy.uid||String(o.payerId)===String(legacy.payerId)||String(o.payerId)===String(legacy.sellerId)||String(o.sellerId)!==String(legacy.sellerId)||o.planId!==legacy.planId||!/^\d+$/.test(String(o.applicationId))||!/^\d+$/.test(String(o.payerId))||!/^[-\w]{10,128}$/.test(o.allowedUid||"")||!/^APP_USR-[a-f0-9-]{36}$/i.test(o.publicKey||"")||!/@testuser\.com$/i.test(o.payerEmail||"")||typeof o.betEmail!=="string")throw new HttpsError("failed-precondition","Configuração do comprador fictício inválida.");
 return o;
}
async function individualBinding(offer){
 const db=getFirestore(),intent=await db.collection("betCheckoutIntents").doc(offer.allowedUid).get(),i=intent.data();
 if(!intent.exists||i.state!=="bound")return null;
 const lock=await db.collection("betCheckoutSubscriptionLocks").doc(i.subscriptionId).get(),b=lock.data();
 if(!lock.exists||b.uid!==offer.allowedUid||b.reference!==i.reference||b.subscriptionId!==i.subscriptionId||b.environment!=="test"||String(b.sellerId)!==String(offer.sellerId)||String(b.payerId)!==String(offer.payerId)||String(b.applicationId)!==String(offer.applicationId)||b.planId!==offer.planId)throw Error("binding mismatch");
 return b;
}
exports.betTestCheckout=onCall({region:"us-central1",secrets:[token,config,checkoutConfig],maxInstances:1,minInstances:0,concurrency:1,memory:"256MiB",timeoutSeconds:90,cors:[/^https:\/\/bet-hebraico--[a-z0-9-]+\.web\.app$/]},async req=>{
 if(!req.auth)throw new HttpsError("unauthenticated","Entre no BET.");
 const legacy=configuration(),offer=individualOffer(legacy);
 const auth={uid:req.auth.uid,email:req.auth.token.email,email_verified:req.auth.token.email_verified};
 if(auth.uid!==offer.allowedUid||auth.email?.toLowerCase()!==offer.betEmail.toLowerCase())throw new HttpsError("permission-denied","Conta não autorizada para o checkout fictício.");
 const action=req.data?.action;
 if(action==="setup")return {verified:auth.email_verified===true,publicKey:offer.publicKey,payerEmail:offer.payerEmail,consentVersion:CONSENT_VERSION};
 if(auth.email_verified!==true)throw new HttpsError("failed-precondition","Confirme seu e-mail antes de contratar.");
 const db=getFirestore(),store=createCheckoutStore(db,{Timestamp,FieldValue}),provider=createTestProvider({token:token.value()});
 const service=createCheckoutService({store,provider,offer});
 let phase="binding";
 try{
  if(action==="create")return await service.checkout(auth,{consent:req.data?.consent,consentVersion:req.data?.consentVersion,cardToken:req.data?.cardToken});
  if(action==="recover")return await service.recover(auth);
  if(!["status","cancel"].includes(action))throw new HttpsError("invalid-argument","Ação inválida.");
  const b=await individualBinding(offer);
  if(!b){const i=await store.read(auth.uid);return {state:i?.state||"none"};}
  phase="seller";await checkProvider(b);
  phase="subscription-read";let sub=await getSubscription(b);
  if(action==="cancel"){
   phase="entitlement-protection";protect(await db.collection("betEntitlements").doc(b.uid).get(),"mercadopago-test-individual");
   if(req.data?.confirm!==true)throw new HttpsError("invalid-argument","Confirme o cancelamento.");
   if(!["canceled","cancelled"].includes(sub.status)){
    phase="cancel-request";await mp("/preapproval/"+encodeURIComponent(b.subscriptionId),{status:"canceled"});
    phase="cancel-readback";sub=await getSubscription(b);
    if(!["canceled","cancelled"].includes(sub.status))throw new HttpsError("unavailable","Cancelamento ainda não confirmado.");
   }
  }
  phase="reconcile";return {state:"bound",...await reconcile(b,sub,true)};
 }catch(e){
  if(action==="cancel"||action==="status"){
   const http=e?.details?.providerHttp;
   const details={phase,...(Number.isInteger(http)&&http>=400&&http<=599?{providerHttp:http}:{})};
   console.warn("BET individual operation not confirmed",action,phase,details.providerHttp||"no-http");
   throw new HttpsError(e instanceof HttpsError?e.code:"failed-precondition","Não foi possível confirmar a operação de teste.",details);
  }
  if(e instanceof HttpsError)throw e;console.warn("BET checkout operation not confirmed");throw new HttpsError("failed-precondition","Não foi possível confirmar a operação. Consulte a assinatura antes de tentar novamente.");
 }
});
