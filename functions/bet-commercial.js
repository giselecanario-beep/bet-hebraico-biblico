"use strict";
// Production endpoints. Explicit server-side launch switch; default off.
const {onCall,onRequest,HttpsError}=require("firebase-functions/v2/https");
const {defineSecret}=require("firebase-functions/params");
const {initializeApp,getApps}=require("firebase-admin/app");
const {getFirestore,Timestamp,FieldValue}=require("firebase-admin/firestore");
const {createCommercialService,validateOffer,userIdentity,CONSENT_VERSION}=require("./bet-commercial-core");
const {createCommercialStore}=require("./bet-commercial-store");
const {createCommercialProvider}=require("./bet-commercial-provider");
const {createCommercialEvents,createCommercialWebhook}=require("./bet-commercial-events");
const token=defineSecret("MP_LIVE_ACCESS_TOKEN"),config=defineSecret("BET_MP_LIVE_CONFIG"),signature=defineSecret("MP_LIVE_WEBHOOK_SECRET");
if(!getApps().length)initializeApp();
function context(){
 const o=validateOffer(JSON.parse(config.value()));
 if(!/^APP_USR-[a-f0-9-]{36}$/i.test(o.publicKey||"")||!["closed","pilot","open"].includes(o.launchMode))throw Error("invalid-configuration");
 const db=getFirestore(),store=createCommercialStore(db,{Timestamp,FieldValue});
 const offer={...o,salesEnabled:o.launchMode==="open"||o.launchMode==="pilot"};
 const provider=createCommercialProvider({token:token.value().trim(),offer});
 return {db,store,provider,offer,service:createCommercialService({store,provider,offer})};
}
const cors=["https://bet-hebraico.web.app",/^https:\/\/bet-hebraico--[a-z0-9-]+\.web\.app$/];
exports.betCommercialCheckout=onCall({region:"us-central1",secrets:[token,config],maxInstances:2,minInstances:0,concurrency:4,memory:"256MiB",timeoutSeconds:120,cors},async req=>{
 if(!req.auth)throw new HttpsError("unauthenticated","Entre no BET.");
 const auth={uid:req.auth.uid,email:req.auth.token.email,email_verified:req.auth.token.email_verified};
 const action=req.data?.action;
 if(!["setup","status","create","recover","cancel"].includes(action))throw new HttpsError("invalid-argument","Ação inválida.");
 try{
  const {db,store,offer,service}=context();
  const permitted=offer.launchMode==="open"||offer.launchMode==="pilot"&&auth.uid===offer.pilotUid;
  const ent=await db.collection("betEntitlements").doc(auth.uid).get(),e=ent.data();
  const protectedAccess=ent.exists&&e?.source!=="mercadopago-commercial";
  if(action==="setup")return {verified:auth.email_verified===true,enabled:permitted&&!protectedAccess,publicKey:permitted&&!protectedAccess?offer.publicKey:null,payerEmail:auth.email||null,consentVersion:CONSENT_VERSION,protectedAccess};
  userIdentity(auth);
  const i=await store.read(auth.uid);
  if(protectedAccess){if(action==="status")return {state:"protected"};throw Error("protected-access");}
  if(action==="status"){if(!i||i.state!=="bound")return {state:i?.state||"none"};}
  if(action==="create"&&!permitted)throw Error("sales-disabled");
  if(!permitted&&!i)throw Error("sales-disabled");
  // Per-account throttling for network-intensive actions; no card information is stored.
  const rate=db.collection("betCommercialRateLimits").doc(auth.uid+"_"+action),now=Date.now();
  await db.runTransaction(async tx=>{
   const snap=await tx.get(rate),last=snap.data()?.last||0;
   if(now-last<1500)throw new HttpsError("resource-exhausted","Aguarde um instante e consulte novamente.");
   tx.set(rate,{last:now});
  });
  if(action==="create")return await service.checkout(auth,{cardToken:req.data?.cardToken,consent:req.data?.consent,consentVersion:req.data?.consentVersion});
  if(action==="status")return await service.status(auth);
  if(action==="recover")return await service.recover(auth);
  return await service.cancel(auth,{confirm:req.data?.confirm});
 }catch(e){
  if(e instanceof HttpsError)throw e;
  const safe=["sales-disabled","verified-auth-required","protected-access","fictional-account","existing-provider-subscription","confirmation-required","invalid-commercial-offer"].includes(e?.message)?e.message:"operation-not-confirmed";
  console.warn("BET commercial action",action,safe);
  throw new HttpsError("failed-precondition","Operação não confirmada. Consulte sua assinatura antes de tentar novamente.",{reason:safe});
 }
});
exports.betCommercialWebhook=onRequest({region:"us-central1",secrets:[token,config,signature],maxInstances:2,minInstances:0,concurrency:4,memory:"256MiB",timeoutSeconds:120,cors:false},async(req,res)=>{
 try{
  const {offer,store,provider,service}=context();
  const events=createCommercialEvents({offer,store,provider,service});
  const receive=createCommercialWebhook({events,offer,secret:signature.value()});
  const r=await receive({method:req.method,url:req.originalUrl||req.url,requestId:req.get("x-request-id"),signature:req.get("x-signature"),body:req.body});
  res.status(r.http).end();
 }catch{res.status(503).end();}
});
