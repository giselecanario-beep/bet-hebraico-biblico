"use strict";
// Adapter for future production integration. No network call occurs on construction.
const {validateOffer}=require("./bet-commercial-core");
const {listInvoices}=require("./bet-invoice-pages");
function createCommercialProvider({token,offer,fetchImpl=fetch}){
 const o=validateOffer(offer);
 if(typeof token!=="string"||!token.startsWith("APP_USR-")||token.length<30)throw Error("invalid-production-credential");
 async function request(method,path,body){
  const r=await fetchImpl("https://api.mercadopago.com"+path,{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:"error",signal:AbortSignal.timeout(10000)});
  if(!r.ok){const e=Error("provider-request-failed");e.http=r.status;throw e;}
  return r.json();
 }
 const get=id=>{if(!/^[a-f0-9]{32}$/i.test(id))throw Error("invalid-subscription-id");return request("GET","/preapproval/"+id);};
 async function verifySeller(){
  const me=await request("GET","/users/me");
  if(String(me.id)!==o.sellerId||typeof me.nickname!=="string"||!me.nickname||/^TESTUSER/i.test(me.nickname))throw Error("not-commercial-seller");
 }
 async function verifyOffer(candidate){
  const c=validateOffer(candidate);
  if(c.sellerId!==o.sellerId||c.planId!==o.planId||c.applicationId!==o.applicationId)throw Error("offer-mismatch");
  await verifySeller();
  const p=await request("GET","/preapproval_plan/"+o.planId),r=p.auto_recurring||{};
  if(p.id!==o.planId||String(p.collector_id)!==o.sellerId||String(p.application_id)!==o.applicationId||p.status!=="active"||r.frequency!==1||r.frequency_type!=="months"||r.currency_id!=="BRL"||Math.round(Number(r.transaction_amount)*100)!==1990||r.free_trial?.frequency!==7||r.free_trial?.frequency_type!=="days")throw Error("plan-mismatch");
 }
 async function findByEmail(email,candidate){
  if(candidate.planId!==o.planId||candidate.sellerId!==o.sellerId||typeof email!=="string"||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("invalid-search");
  const rows=[],seen=new Set(),limit=12;
  for(let offset=0;offset<limit*25;offset+=limit){
   const page=await request("GET","/preapproval/search?payer_email="+encodeURIComponent(email)+"&preapproval_plan_id="+o.planId+"&limit="+limit+"&offset="+offset);
   const p=page?.paging,total=Number(p?.total);
   if(!Array.isArray(page?.results)||p?.total==null||p?.offset==null||p?.limit==null||!Number.isSafeInteger(total)||total<0||Number(p.offset)!==offset||Number(p.limit)!==limit||page.results.length>limit)throw Error("invalid-search-page");
   for(const x of page.results){
    if(!/^[a-f0-9]{32}$/i.test(x?.id||"")||seen.has(x.id)||x.preapproval_plan_id!==o.planId||String(x.collector_id)!==o.sellerId||String(x.application_id)!==o.applicationId||(x.payer_email!=null&&String(x.payer_email).toLowerCase()!==email))throw Error("invalid-search-row");
    seen.add(x.id);rows.push(x);
   }
   if(offset+page.results.length>=total)return rows;
   if(page.results.length!==limit)throw Error("incomplete-search");
  }
  throw Error("search-limit");
 }
 async function create(payload){
  if(o.salesEnabled!==true||payload?.preapproval_plan_id!==o.planId||!/^bet_live_[a-f0-9]{48}$/.test(payload.external_reference||"")||payload.status!=="authorized"||payload.back_url!=="https://bet-hebraico.web.app/"||typeof payload.card_token_id!=="string")throw Error("sales-disabled-or-invalid-payload");
  // No automatic retry of POST. Recovery uses the original reference.
  return request("POST","/preapproval",payload);
 }
 async function cancel(id){
  if(!/^[a-f0-9]{32}$/i.test(id))throw Error("invalid-subscription-id");
  return request("PUT","/preapproval/"+id,{status:"cancelled"});
 }
 async function invoices(id){
  if(!/^[a-f0-9]{32}$/i.test(id))throw Error("invalid-subscription-id");
  return listInvoices(path=>request("GET",path),id);
 }
 async function payment(id){
  if(!/^\d{1,25}$/.test(String(id)))throw Error("invalid-payment-id");
  return request("GET","/v1/payments/"+encodeURIComponent(String(id)));
 }
 return {verifySeller,verifyOffer,findByEmail,create,get,cancel,invoices,payment};
}
module.exports={createCommercialProvider};
