"use strict";
// Offline commercial core. NOT exported as a Cloud Function. No production secrets.
// Never trust UID, email, price, plan, seller or reference from browser input.
const {randomBytes,createHash}=require("node:crypto");
const {evaluateAccess}=require("./bet-access-policy");
const CONSENT_VERSION="bet-brl1990-monthly-trial7-v1";
const idOK=v=>typeof v==="string"&&/^[a-f0-9]{32}$/i.test(v);
const numeric=v=>/^\d{1,25}$/.test(String(v??""));
const emailOK=v=>typeof v==="string"&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const emailKey=email=>createHash("sha256").update(email).digest("hex");
const normal=email=>email.trim().toLowerCase();
function userIdentity(auth){
 if(!auth||typeof auth.uid!=="string"||!/^[\w-]{10,128}$/.test(auth.uid)||auth.uid.startsWith("bet-test-")||auth.email_verified!==true||!emailOK(auth.email))throw Error("verified-auth-required");
 const email=normal(auth.email);
 if(/@(?:testuser\.com|example\.invalid)$/.test(email)||email.endsWith(".invalid"))throw Error("fictional-account");
 return {uid:auth.uid,email,emailKey:emailKey(email)};
}
function validateOffer(o){
 if(o?.environment!=="production"||!numeric(o.sellerId)||!numeric(o.applicationId)||!idOK(o.planId)||o.priceCents!==1990||o.currency!=="BRL"||o.trialDays!==7||o.interval!=="monthly")throw Error("invalid-commercial-offer");
 return {...o,sellerId:String(o.sellerId),applicationId:String(o.applicationId)};
}
function makeIntent(auth,o,reference,now){
 const u=userIdentity(auth),offer=validateOffer(o);
 if(offer.salesEnabled!==true)throw Error("sales-disabled");
 if(!/^bet_live_[a-f0-9]{48}$/.test(reference)||!Number.isSafeInteger(now))throw Error("invalid-intent");
 return {...u,reference,createdAt:now,consentVersion:CONSENT_VERSION,environment:"production",state:"reserved",sellerId:offer.sellerId,applicationId:offer.applicationId,planId:offer.planId,priceCents:1990,currency:"BRL",trialDays:7};
}
function sameIntent(intent,u,o){
 if(!intent||intent.uid!==u.uid||intent.email!==u.email||intent.emailKey!==u.emailKey||intent.environment!=="production"||intent.planId!==o.planId||intent.sellerId!==o.sellerId||intent.applicationId!==o.applicationId||!/^bet_live_[a-f0-9]{48}$/.test(intent.reference)||intent.consentVersion!==CONSENT_VERSION)throw Error("intent-mismatch");
}
function confirmSubscription(i,s,now){
 const r=s?.auto_recurring||{},created=Date.parse(s?.date_created);
 if(!idOK(s?.id)||s.external_reference!==i.reference||String(s.collector_id)!==i.sellerId||String(s.application_id)!==i.applicationId||!numeric(s.payer_id)||String(s.payer_id)===i.sellerId||s.preapproval_plan_id!==i.planId||!Number.isFinite(created)||created<i.createdAt-60000||created>now)throw Error("subscription-mismatch");
 if(s.payer_email!=null&&(!emailOK(s.payer_email)||normal(s.payer_email)!==i.email))throw Error("payer-email-mismatch");
 if(r.currency_id!==i.currency||Math.round(Number(r.transaction_amount)*100)!==i.priceCents||r.frequency!==1||r.frequency_type!=="months"||r.free_trial?.frequency!==i.trialDays||r.free_trial?.frequency_type!=="days")throw Error("plan-mismatch");
 if(i.subscriptionId&&i.subscriptionId!==s.id)throw Error("already-bound");
 return {uid:i.uid,emailKey:i.emailKey,reference:i.reference,environment:"production",sellerId:i.sellerId,applicationId:i.applicationId,planId:i.planId,payerId:String(s.payer_id),subscriptionId:s.id,state:"bound"};
}
function payload(i,cardToken){
 if(typeof cardToken!=="string"||!/^[A-Za-z0-9_-]{16,256}$/.test(cardToken))throw Error("invalid-card-token");
 return {preapproval_plan_id:i.planId,reason:"BET | Hebraico Bíblico",external_reference:i.reference,payer_email:i.email,card_token_id:cardToken,back_url:"https://bet-hebraico.web.app/",status:"authorized"};
}
function createCommercialService({store,provider,offer,clock=Date.now,reference=()=>("bet_live_"+randomBytes(24).toString("hex"))}){
 const o=validateOffer(offer);
 async function bind(i,sub){
  // The email-filtered search must independently corroborate the exact provider ID.
  const matches=await provider.findByEmail(i.email,o);
  if(!Array.isArray(matches)||matches.filter(x=>x?.id===sub.id&&x.external_reference===i.reference).length!==1||matches.some(x=>x?.external_reference===i.reference&&x.id!==sub.id))throw Error("email-search-mismatch");
  const b=confirmSubscription(i,sub,clock());
  if(sub.status!=="authorized")throw Error("not-authorized");
  await store.bind(i,b,evaluateAccess(sub,b,clock()));
  return {state:"bound"};
 }
 async function checkout(auth,input){
  const u=userIdentity(auth);
  if(o.salesEnabled!==true)throw Error("sales-disabled");
  if(input?.consent!==true||input?.consentVersion!==CONSENT_VERSION)throw Error("consent-required");
  const i=makeIntent(auth,o,reference(),clock()),p=payload(i,input.cardToken);
  const old=await store.read(u.uid);
  if(old){sameIntent(old,u,o);return {state:old.state};}
  await provider.verifyOffer(o);
  const existing=await provider.findByEmail(u.email,o);
  // Never create a second subscription if provider history already exists.
  if(!Array.isArray(existing)||existing.length!==0)throw Error("existing-provider-subscription");
  const reserved=await store.reserve(i);
  if(!reserved.created){sameIntent(reserved.intent,u,o);return {state:reserved.intent.state};}
  try{
   const created=await provider.create(p);
   if(!idOK(created?.id))throw Error("missing-provider-id");
   const sub=await provider.get(created.id);
   if(sub.id!==created.id)throw Error("provider-id-mismatch");
   return await bind(i,sub);
  }catch{
   await store.markUncertain(i);
   return {state:"uncertain"};
  }
 }
 async function recover(auth){
  const u=userIdentity(auth),i=await store.read(u.uid);
  if(!i)return {state:"none"};
  sameIntent(i,u,o);
  if(i.state==="bound")return {state:"bound"};
  if(!["reserved","uncertain"].includes(i.state))throw Error("invalid-state");
  await provider.verifyOffer(o);
  const rows=await provider.findByEmail(i.email,o);
  if(!Array.isArray(rows))throw Error("invalid-search");
  const matches=rows.filter(x=>x?.external_reference===i.reference);
  if(matches.length!==1||!idOK(matches[0].id))return {state:"uncertain"};
  const sub=await provider.get(matches[0].id);
  if(sub.id!==matches[0].id)throw Error("provider-id-mismatch");
  return bind(i,sub);
 }
 return {checkout,recover};
}
module.exports={CONSENT_VERSION,userIdentity,validateOffer,makeIntent,sameIntent,confirmSubscription,payload,createCommercialService};
