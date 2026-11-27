"use strict";
// A dedicated test seller token only. Never log request or response bodies.
function createTestProvider({token,fetchImpl=fetch}){
 if(typeof token!=="string"||token.length<20)throw Error("missing-test-token");
 async function request(path,body){
  const r=await fetchImpl("https://api.mercadopago.com"+path,{method:body?"POST":"GET",headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:"error",signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error("provider-request-failed");
  return r.json();
 }
 async function verifyOffer(o){
  const me=await request("/users/me");
  if(o.environment!=="test"||String(me.id)!==String(o.sellerId)||!/^TESTUSER/i.test(me.nickname||""))throw Error("not-test-seller");
  const p=await request("/preapproval_plan/"+encodeURIComponent(o.planId)),r=p.auto_recurring||{};
  if(p.id!==o.planId||String(p.collector_id)!==String(o.sellerId)||String(p.application_id)!==String(o.applicationId)||p.status!=="active"||r.frequency!==1||r.frequency_type!=="months"||r.currency_id!=="BRL"||Math.round(Number(r.transaction_amount)*100)!==1990||r.free_trial?.frequency!==7||r.free_trial?.frequency_type!=="days")throw Error("offer-mismatch");
 }
 // Offer verification must be invoked by the service before creation.
 return {verifyOffer,create:payload=>request("/preapproval",payload),get:id=>request("/preapproval/"+encodeURIComponent(id))};
}
module.exports={createTestProvider};
