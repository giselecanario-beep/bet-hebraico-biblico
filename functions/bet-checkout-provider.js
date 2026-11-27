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
 async function findByReference(reference){
  if(!/^bet_[a-f0-9]{48}$/.test(reference))throw Error("invalid-reference");
  const matches=[];
  // Refuse partial or ambiguous results instead of risking duplicate subscriptions.
  for(let offset=0;offset<250;offset+=50){
   const p=await request("/preapproval/search?external_reference="+encodeURIComponent(reference)+"&limit=50&offset="+offset);
   const total=Number(p.paging?.total);
   if(!Array.isArray(p.results)||!Number.isSafeInteger(total)||total<0||Number(p.paging?.offset)!==offset)throw Error("invalid-search");
   for(const row of p.results)if(row.external_reference===reference)matches.push({id:row.id});
   if(offset+p.results.length>=total)return matches;
   if(p.results.length!==50)throw Error("incomplete-search");
  }
  throw Error("search-limit");
 }
 return {verifyOffer,create:payload=>request("/preapproval",payload),get:id=>request("/preapproval/"+encodeURIComponent(id)),findByReference};
}
module.exports={createTestProvider};
