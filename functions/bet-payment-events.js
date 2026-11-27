"use strict";
const {listInvoices}=require("./bet-invoice-pages");
function invoiceMatches(i,cfg,paymentId){return i?.preapproval_id===cfg.subscriptionId&&String(i?.payment?.id)===String(paymentId);}
async function eventMatches(type,id,cfg,mp){
 if(type==="subscription_preapproval")return id.toLowerCase()===cfg.subscriptionId.toLowerCase();
 if(!/^[0-9]{1,25}$/.test(id))return false;
 if(type==="subscription_authorized_payment"){
  const invoice=await mp("/authorized_payments/"+encodeURIComponent(id));
  return String(invoice.id)===id&&invoice.preapproval_id===cfg.subscriptionId;
 }
 if(type==="payment"||type==="payments"){
  const payment=await mp("/v1/payments/"+encodeURIComponent(id));
  if(String(payment.id)!==id||String(payment.collector_id)!==String(cfg.sellerId))return false;
  return (await listInvoices(mp,cfg.subscriptionId)).some(i=>invoiceMatches(i,cfg,id));
 }
 return false;
}
module.exports={eventMatches};
