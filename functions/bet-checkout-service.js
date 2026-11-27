"use strict";
// Not exported as a Cloud Function. Only an explicitly configured fictional buyer may use this service.
const {randomBytes}=require("node:crypto");
const {makeIntent,confirmBinding}=require("./bet-checkout-binding");
const {evaluateAccess}=require("./bet-access-policy");
const CONSENT_VERSION="bet-test-monthly-1990-trial7-v1";
function makePayload(intent,cardToken){
 if(typeof cardToken!=="string"||!/^[a-zA-Z0-9_-]{16,256}$/.test(cardToken))throw Error("invalid-card-token");
 return {preapproval_plan_id:intent.planId,reason:"BET | Hebraico Bíblico - teste",external_reference:intent.reference,payer_email:intent.payerEmail,card_token_id:cardToken,back_url:"https://bet-hebraico.web.app/",status:"authorized"};
}
function testBuyer(auth,offer){
 if(offer?.environment!=="test"||offer.enabled!==true||auth?.uid!==offer.allowedUid||String(offer.payerId)===String(offer.sellerId)||typeof offer.payerEmail!=="string"||!offer.payerEmail.includes("@")||auth.email?.toLowerCase()!==offer.betEmail?.toLowerCase())throw Error("test-buyer-not-allowed");
 if(offer.existingSubscription===true)throw Error("existing-subscription-protected");
}
function createCheckoutService({store,provider,offer,clock=Date.now,reference=()=>("bet_"+randomBytes(24).toString("hex"))}){
 async function checkout(auth,input){
  testBuyer(auth,offer);
  if(input?.consent!==true||input?.consentVersion!==CONSENT_VERSION)throw Error("consent-required");
  const intent={...makeIntent(auth,offer,reference(),clock()),payerEmail:offer.payerEmail,consentVersion:CONSENT_VERSION,consentAt:clock()};
  const payload=makePayload(intent,input.cardToken);
  // Provider identity and plan are checked before reservation. No payment method data is persisted.
  await provider.verifyOffer(offer);
  const reserved=await store.reserve(intent);
  if(!reserved.created)return {state:reserved.intent.state,reference:reserved.intent.reference,subscriptionId:reserved.intent.subscriptionId||null};
  // Never retry an uncertain POST: external_reference must first be reconciled server-side.
  try{
   const created=await provider.create(payload);
   if(!/^[a-f0-9]{32}$/i.test(created?.id||""))throw Error("missing-provider-id");
   const confirmed=await provider.get(created.id);
   if(confirmed.id!==created.id)throw Error("provider-id-mismatch");
   const bound=confirmBinding(intent,confirmed,clock());
   const access=evaluateAccess(confirmed,bound,clock());
   await store.bind(intent,bound,access);
   return {state:"bound",reference:bound.reference,subscriptionId:bound.subscriptionId};
  }catch{
   await store.markUncertain(intent);
   return {state:"uncertain",reference:intent.reference};
  }
 }
 async function recover(auth){
  testBuyer(auth,offer);
  if(auth.email_verified!==true)throw Error("verified-auth-required");
  const intent=await store.read(auth.uid);
  if(!intent)return {state:"none"};
  if(intent.uid!==auth.uid||intent.email!==auth.email.trim().toLowerCase()||intent.environment!=="test"||intent.planId!==offer.planId||intent.sellerId!==String(offer.sellerId)||intent.payerId!==String(offer.payerId)||intent.applicationId!==String(offer.applicationId)||intent.payerEmail!==offer.payerEmail)throw Error("intent-mismatch");
  if(intent.state==="bound")return {state:"bound",reference:intent.reference,subscriptionId:intent.subscriptionId};
  if(!["reserved","uncertain"].includes(intent.state))throw Error("unknown-intent-state");
  // Recovery never sends a POST, retries a charge or releases an unresolved lock.
  await provider.verifyOffer(offer);
  const candidates=await provider.findByReference(intent.reference,offer);
  if(!Array.isArray(candidates))throw Error("invalid-search-result");
  if(candidates.length!==1)return {state:"uncertain",reference:intent.reference};
  const id=candidates[0]?.id;
  if(!/^[a-f0-9]{32}$/i.test(id||""))throw Error("invalid-provider-id");
  const confirmed=await provider.get(id);
  if(confirmed.id!==id)throw Error("provider-id-mismatch");
  const bound=confirmBinding(intent,confirmed,clock());
  const access=evaluateAccess(confirmed,bound,clock());
  await store.bind(intent,bound,access);
  return {state:"bound",reference:bound.reference,subscriptionId:bound.subscriptionId};
 }
 return {checkout,recover};
}
module.exports={createCheckoutService,makePayload,CONSENT_VERSION};
