"use strict";
// Internal handler only; never mount this module on a public URL before rule validation.
// A notification is not proof of payment. Every recognized resource is read from MP.
const {webhookVerdict}=require("./bet-webhook-signature");
const {validateOffer}=require("./bet-commercial-core");
const hex=v=>typeof v==="string"&&/^[a-f0-9]{32}$/i.test(v);
const digits=v=>/^\d{1,25}$/.test(String(v??""));
function createCommercialEvents({store,provider,service,offer}){
 const o=validateOffer(offer);
 async function dispatch(type,id){
  if(type==="subscription_preapproval"){
   if(!hex(id))throw Error("invalid-subscription-id");
   return service.reconcileEvent(id);
  }
  if(type==="subscription_authorized_payment"){
   if(!digits(id))throw Error("invalid-invoice-id");
   await provider.verifySeller();
   const invoice=await provider.invoice(id);
   if(String(invoice?.id)!==id||!hex(invoice.preapproval_id))throw Error("invoice-mismatch");
   return service.reconcileEvent(invoice.preapproval_id);
  }
  if(type==="payment"||type==="payments"){
   if(!digits(id))throw Error("invalid-payment-id");
   await provider.verifySeller();
   const p=await provider.payment(id);
   if(String(p?.id)!==id)throw Error("payment-mismatch");
   if(String(p.collector_id)!==o.sellerId||!digits(p.payer?.id))return {state:"ignored"};
   const b=await store.payerBinding(o.sellerId,String(p.payer.id));
   if(!b)return {state:"ignored"};
   if(b.sellerId!==o.sellerId||b.planId!==o.planId||b.applicationId!==o.applicationId||!hex(b.subscriptionId))throw Error("binding-mismatch");
   const rows=await provider.invoices(b.subscriptionId);
   const matches=rows.filter(i=>i.preapproval_id===b.subscriptionId&&String(i.payment?.id)===id);
   if(matches.length===0)return {state:"ignored"};
   if(matches.length!==1)throw Error("ambiguous-payment");
   // Re-fetch subscription and approved invoice/payment state rather than trusting the event.
   return service.reconcileEvent(b.subscriptionId);
  }
  return {state:"ignored"};
 }
 return {dispatch};
}
function createCommercialWebhook({events,secret,offer,clock=Date.now,verify=webhookVerdict}){
 const o=validateOffer(offer);
 if(typeof secret!=="string"||secret.trim().length<16)throw Error("missing-webhook-secret");
 return async function receive(req){
  if(req.method!=="POST")return {http:405};
  const ids=new URL(req.url,"https://bet.invalid").searchParams.getAll("data.id");
  const id=ids.length===1?ids[0]:undefined;
  const valid=verify({id,requestId:req.requestId,signature:req.signature,secret,now:clock()});
  if(valid!=="ok")return {http:401};
  if(typeof id!=="string"||String(req.body?.data?.id).toLowerCase()!==id.toLowerCase())return {http:400};
  // Ignore explicitly fictitious notifications; API reads and separate seller/plan remain mandatory.
  if(req.body?.live_mode===false)return {http:200,state:"ignored"};
  if(req.body?.user_id!=null&&String(req.body.user_id)!==o.sellerId)return {http:200,state:"ignored"};
  const type=req.body?.type;
  if(!["subscription_preapproval","subscription_authorized_payment","payment","payments"].includes(type))return {http:200,state:"ignored"};
  try{
   const result=await events.dispatch(type,id.toLowerCase());
   return {http:200,state:result.state==="ignored"?"ignored":"reconciled"};
  }catch{
   // Retry is safe: no creation or cancellation in notification handling.
   return {http:503,state:"retry"};
  }
 };
}
module.exports={createCommercialEvents,createCommercialWebhook};
