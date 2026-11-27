"use strict";
// Offline commercial core. NOT exported as a Cloud Function. No production secrets.
// Never trust UID, email, price, plan, seller or reference from browser input.
const {randomBytes,createHash}=require("node:crypto");
const {evaluateAccess,addMonth}=require("./bet-access-policy");
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
 if(!idOK(s?.id)||(i.mode!=="hosted"&&s.external_reference!==i.reference)||(i.mode==="hosted"&&typeof s.external_reference==="string"&&s.external_reference.startsWith("bet_live_")&&s.external_reference!==i.reference)||String(s.collector_id)!==i.sellerId||String(s.application_id)!==i.applicationId||!numeric(s.payer_id)||String(s.payer_id)===i.sellerId||s.preapproval_plan_id!==i.planId||!Number.isFinite(created)||created<i.createdAt-60000||created>now)throw Error("subscription-mismatch");
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
  if(i.mode==="hosted"){
   // Hosted checkout has no BET external_reference. Require a unique, independently
   // email-filtered record and matching payer, created after reservation.
   if(!Array.isArray(matches)||matches.length!==1||matches[0].id!==sub.id||String(matches[0].payer_id)!==String(sub.payer_id))throw Error("email-search-mismatch");
  }else if(!Array.isArray(matches)||matches.filter(x=>x?.id===sub.id&&x.external_reference===i.reference).length!==1||matches.some(x=>x?.external_reference===i.reference&&x.id!==sub.id))throw Error("email-search-mismatch");
  const b=confirmSubscription(i,sub,clock());
  if(sub.status!=="authorized")throw Error("not-authorized");
  await store.bind(i,b,evaluateAccess(sub,b,clock()));
  return {state:"bound"};
 }
 async function beginHosted(auth,input){
  const u=userIdentity(auth);
  if(o.salesEnabled!==true)throw Error("sales-disabled");
  if(o.planId!=="417a60404e374b1d935b238e20090873")throw Error("hosted-plan-mismatch");
  if(input?.consent!==true||input?.consentVersion!==CONSENT_VERSION)throw Error("consent-required");
  const old=await store.read(u.uid);
  if(old){sameIntent(old,u,o);return {state:old.state};}
  await provider.verifyOffer(o);
  const existing=await provider.findByEmail(u.email,o);
  if(!Array.isArray(existing)||existing.length!==0)throw Error("existing-provider-subscription");
  const i={...makeIntent(auth,o,reference(),clock()),mode:"hosted"};
  const reserved=await store.reserve(i);
  if(!reserved.created){sameIntent(reserved.intent,u,o);return {state:reserved.intent.state};}
  return {state:"hosted-ready",url:"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id="+o.planId};
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
  const matches=i.mode==="hosted"?rows:rows.filter(x=>x?.external_reference===i.reference);
  if(matches.length!==1||!idOK(matches[0].id))return {state:"uncertain"};
  const sub=await provider.get(matches[0].id);
  if(sub.id!==matches[0].id)throw Error("provider-id-mismatch");
  if(i.mode==="hosted"&&sub.status!=="authorized")return {state:"uncertain"};
  return bind(i,sub);
 }
 async function managementContext(auth){
  const u=userIdentity(auth),i=await store.read(u.uid);
  if(!i)return null;
  sameIntent(i,u,o);
  if(i.state!=="bound")throw Error("subscription-not-bound");
  const b=await store.readBinding(i);
  await provider.verifySeller();
  const sub=await provider.get(b.subscriptionId);
  const checked=confirmSubscription(i,sub,clock());
  if(checked.subscriptionId!==b.subscriptionId||checked.payerId!==b.payerId)throw Error("binding-mismatch");
  return {i,b,sub};
 }
 async function reconcileAccess(i,b,sub){
  const now=clock();
  let access=evaluateAccess(sub,b,now);
  if(access.reason!=="trial"&&["authorized","paused","cancelled","canceled"].includes(sub.status)&&now>=Date.parse(sub.date_created)+6*86400000){
   const rows=await provider.invoices(b.subscriptionId),pairs=[];
   for(const row of rows){
    const due=Date.parse(row.debit_date);
    if(row.payment?.status!=="approved"||!/^\d+$/.test(String(row.payment?.id))||!Number.isFinite(due)||due>now||addMonth(due)<=now)continue;
    pairs.push({invoice:row,payment:await provider.payment(row.payment.id)});
    if(pairs.length>5)throw Error("ambiguous-invoices");
   }
   access=evaluateAccess(sub,b,now,pairs);
  }
  const result=await store.reconcile(i,b,access,sub,now);
  if(result.stale)throw Error("stale-provider-result");
  return {state:"bound",status:sub.status,active:result.active,reason:result.reason,validUntil:new Date(result.until).toISOString(),cancelled:["cancelled","canceled"].includes(sub.status)};
 }
 async function status(auth){
  const c=await managementContext(auth);
  if(!c)return {state:"none"};
  return reconcileAccess(c.i,c.b,c.sub);
 }
 async function cancel(auth,input){
  if(input?.confirm!==true)throw Error("confirmation-required");
  const c=await managementContext(auth);
  if(!c)throw Error("subscription-not-found");
  await store.assertManagement(c.i,c.b);
  if(["cancelled","canceled"].includes(c.sub.status)){
   try{return await reconcileAccess(c.i,c.b,c.sub);}catch{return {state:"bound",status:c.sub.status,cancelled:true,reconciliationPending:true};}
  }
  if(!["authorized","paused","pending"].includes(c.sub.status))throw Error("invalid-cancellation-state");
  // No client-chosen subscription ID. One PUT, then independent GET. No automatic retry.
  await provider.cancel(c.b.subscriptionId);
  const sub=await provider.get(c.b.subscriptionId),checked=confirmSubscription(c.i,sub,clock());
  if(checked.payerId!==c.b.payerId||checked.subscriptionId!==c.b.subscriptionId||!["cancelled","canceled"].includes(sub.status))throw Error("cancellation-unconfirmed");
  try{return await reconcileAccess(c.i,c.b,sub);}catch{return {state:"bound",status:sub.status,cancelled:true,reconciliationPending:true};}
 }
 // Internal entry point only. Never expose this function as a client action.
 async function reconcileEvent(subscriptionId){
  if(!idOK(subscriptionId))throw Error("invalid-subscription-id");
  await provider.verifySeller();
  const sub=await provider.get(subscriptionId);
  if(sub.id!==subscriptionId)throw Error("provider-id-mismatch");
  if(String(sub.collector_id)!==o.sellerId||String(sub.application_id)!==o.applicationId||sub.preapproval_plan_id!==o.planId)return {state:"ignored"};
  let b=await store.eventBinding(subscriptionId);
  if(!b){
   const i=await store.referenceIntent(sub.external_reference);
   if(!i)return {state:"ignored"};
   sameIntent(i,userIdentity({uid:i.uid,email:i.email,email_verified:true}),o);
   if(!["reserved","uncertain"].includes(i.state)||sub.status!=="authorized")throw Error("event-binding-pending");
   await bind(i,sub);
   b=await store.eventBinding(subscriptionId);
   if(!b)throw Error("event-binding-pending");
  }
  const i=await store.read(b.uid);
  if(!i)throw Error("intent-missing");
  sameIntent(i,userIdentity({uid:i.uid,email:i.email,email_verified:true}),o);
  const checked=confirmSubscription(i,sub,clock());
  const locked=await store.readBinding(i);
  if(locked.subscriptionId!==subscriptionId||checked.payerId!==b.payerId||locked.payerId!==b.payerId)throw Error("binding-mismatch");
  return reconcileAccess(i,b,sub);
 }
 return {checkout,beginHosted,recover,status,cancel,reconcileEvent};
}
module.exports={CONSENT_VERSION,userIdentity,validateOffer,makeIntent,sameIntent,confirmSubscription,payload,createCommercialService};
