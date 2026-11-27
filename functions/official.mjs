import {getAuth} from 'firebase-admin/auth';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {defineSecret} from 'firebase-functions/params';
import {randomUUID} from 'node:crypto';
import {PLAN,CHECKOUT,verifyPlan,verifySub,accessFor,choose,closed} from './official-core.mjs';
const secret=defineSecret('BET_MP_PROD_TOKEN');
const options={region:'us-central1',secrets:[secret],maxInstances:3,timeoutSeconds:120};
const db=()=>getFirestore();
const link=u=>db().collection('betOfficialLinks').doc(u);
const ent=u=>db().collection('betEntitlements').doc(u);
const claim=id=>db().collection('betOfficialClaims').doc(id);
const now=()=>Date.now();
const norm=e=>e.trim().toLowerCase();
const managed=x=>!x||(x.source==='mercado-pago-oficial'&&!['owner','collaborator'].includes(x.role));
const err=(code,msg)=>new HttpsError(code,msg);
async function mp(path,method='GET',body){
 const r=await fetch('https://api.mercadopago.com'+path,{method,headers:{Authorization:'Bearer '+secret.value(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw err('unavailable','Mercado Pago não confirmou a consulta (HTTP '+r.status+').');
 return r.json();
}
async function plan(){return verifyPlan(await mp('/preapproval_plan/'+PLAN));}
async function user(uid){
 const u=await getAuth().getUser(uid);
 if(u.disabled||!u.emailVerified||!u.email)throw err('failed-precondition','Confirme o e-mail da conta BET antes de continuar.');
 return u;
}
async function all(path,max=5){
 const items=[];let offset=0;
 for(let page=0;page<max;page++){
  const data=await mp(path+'&limit=20&offset='+offset);
  if(!Array.isArray(data.results)||!Number.isFinite(data.paging?.total))throw err('unavailable','Resposta incompleta do Mercado Pago.');
  items.push(...data.results);offset+=data.results.length;
  if(offset>=data.paging.total)return items;
  if(!data.results.length)break;
 }
 throw err('resource-exhausted','Muitas assinaturas ou faturas; é necessária conferência.');
}
async function invoices(s,collector){
 const found=await all('/authorized_payments/search?preapproval_id='+encodeURIComponent(s.id),10);
 const verified=[];
 for(const i of found){
  if(i.preapproval_id!==s.id||i.payment?.status!=='approved'||!i.payment.id||!Number.isFinite(Date.parse(i.debit_date))||Date.parse(i.debit_date)<now()-40*86400000)continue;
  const p=await mp('/v1/payments/'+encodeURIComponent(String(i.payment.id)));
  verified.push({...i,verified:p.status==='approved'&&p.status_detail==='accredited'&&p.live_mode===true&&String(p.collector_id)===String(collector)&&p.currency_id==='BRL'&&Number(p.transaction_amount)===19.9&&Number(p.transaction_amount_refunded)===0});
 }
 return verified;
}
async function work(uid,mode){
 const u=await user(uid),email=norm(u.email),ref=link(uid),key=randomUUID(),t=now();
 const prev=await db().runTransaction(async tx=>{
  const [l,e]=await Promise.all([tx.get(ref),tx.get(ent(uid))]),v=l.data()||{};
  if(!managed(e.data()))return {protected:true,active:e.data()?.active===true};
  if(v.lockUntil>t)throw err('aborted','Outra consulta está em andamento. Tente novamente.');
  if(mode==='sync'&&v.checkedAt>t-45000&&v.email===email)return {cached:true,result:v.result||{active:false}};
  if(mode==='start'&&v.checkoutAt>t-120000)throw err('failed-precondition','Checkout já aberto recentemente. Retorne à aba de pagamento ou consulte a assinatura.');
  tx.set(ref,{lock:key,lockUntil:t+125000},{merge:true});
  return v;
 });
 if(prev.protected)return {protected:true,active:prev.active,canCheckout:false};
 if(prev.cached)return prev.result;
 try{
  const collector=await plan();
  const list=await all('/preapproval/search?preapproval_plan_id='+PLAN+'&payer_email='+encodeURIComponent(email));
  // The official API's payer_email filter is the identity proof in addition to Firebase email verification.
  const chosen=choose(list,email,collector);
  let s=chosen?verifySub(await mp('/preapproval/'+encodeURIComponent(chosen.id)),collector):null;
  if(s&&s.id!==chosen.id)throw err('failed-precondition','Identificador divergente.');
  if(s?.payer_email&&norm(s.payer_email)!==email)throw err('permission-denied','E-mail divergente.');
  if(s){
   const claimRef=claim(s.id);
   await db().runTransaction(async tx=>{
    const [l,c,e]=await Promise.all([tx.get(ref),tx.get(claimRef),tx.get(ent(uid))]);
    if(l.data()?.lock!==key||!managed(e.data()))throw err('aborted','Conta alterada.');
    if(c.exists&&(c.data().uid!==uid||c.data().email!==email))throw err('permission-denied','Assinatura já vinculada a outra conta.');
    if(!c.exists)tx.create(claimRef,{uid,email,createdAt:Timestamp.now()});
   });
  }
  if(mode==='cancel'){
   if(!s||closed(s.status)||prev.subscriptionId!==s.id||prev.email!==email)throw err('failed-precondition','Consulte sua assinatura antes de cancelar.');
   await mp('/preapproval/'+encodeURIComponent(s.id),'PUT',{status:'canceled'});
   s=verifySub(await mp('/preapproval/'+encodeURIComponent(s.id)),collector);
   if(!closed(s.status))throw err('unavailable','O cancelamento ainda não foi confirmado.');
  }
  const previous=prev.subscriptionId===s?.id&&prev.email===email?prev:null;
  const initial=s?accessFor(s,previous,[],now()):{active:false,validUntil:0,trialEnd:0};
  // During the confirmed free period no paid invoice is needed; afterwards require a verified real payment.
  const bills=s&&(s.status==='authorized'||closed(s.status))&&!initial.active?await invoices(s,collector):[];
  const d=s?accessFor(s,previous,bills,now()):initial;
  const canCheckout=!d.active&&(!s||closed(s.status));
  const result={active:d.active,validUntil:d.validUntil,status:s?.status||'none',canCheckout,canCancel:!!s&&!closed(s.status),...(mode==='cancel'?{cancelConfirmed:true}:{}),...(mode==='start'&&canCheckout?{url:CHECKOUT}:{})};
  const schedule=mode==='start'||(!!s&&(!closed(s.status)||d.active))||prev.checkoutAt>now()-86400000;
  await db().runTransaction(async tx=>{
   const [l,e]=await Promise.all([tx.get(ref),tx.get(ent(uid))]);
   if(l.data()?.lock!==key||!managed(e.data()))throw err('aborted','Conta alterada.');
   if(s||e.exists)tx.set(ent(uid),{role:'subscriber',source:'mercado-pago-oficial',active:d.active,validUntil:Timestamp.fromMillis(d.validUntil),subscriptionId:s?.id||null});
   tx.set(ref,{email,subscriptionId:s?.id||null,trialEnd:d.trialEnd,result,checkedAt:now(),lockUntil:0,checkoutAt:mode==='start'&&canCheckout?now():prev.checkoutAt||0,nextCheck:schedule?now()+15*60000:0},{merge:true});
  });
  return result;
 }catch(e){
  await db().runTransaction(async tx=>{
   const l=await tx.get(ref);
   if(l.data()?.lock===key)tx.set(ref,{lockUntil:0,nextCheck:prev.nextCheck?now()+15*60000:0},{merge:true});
  }).catch(()=>{});
  if(e instanceof HttpsError)throw e;
  throw err('failed-precondition','Não foi possível confirmar a assinatura com segurança. Consulte novamente.');
 }
}
function uid(req){if(!req.auth?.uid)throw err('unauthenticated','Entre na sua conta BET.');return req.auth.uid;}
export const betOfficialSync=onCall(options,r=>work(uid(r),'sync'));
export const betOfficialStart=onCall(options,r=>work(uid(r),'start'));
export const betOfficialCancel=onCall(options,r=>{
 if(r.data?.confirm!==true)throw err('invalid-argument','Confirme o cancelamento.');
 return work(uid(r),'cancel');
});
export const betOfficialReconcile=onSchedule({...options,schedule:'every 15 minutes',timeZone:'America/Sao_Paulo',maxInstances:1,timeoutSeconds:540},async()=>{
 const due=await db().collection('betOfficialLinks').where('nextCheck','>',0).where('nextCheck','<=',now()).orderBy('nextCheck').limit(30).get();
 for(let i=0;i<due.docs.length;i+=3)await Promise.allSettled(due.docs.slice(i,i+3).map(async doc=>{
  try{await work(doc.id,'sync');}catch(e){
   if(e.code==='failed-precondition'||e.code==='auth/user-not-found'){
    await db().runTransaction(async tx=>{
     const [l,x]=await Promise.all([tx.get(doc.ref),tx.get(ent(doc.id))]);
     if(l.data()?.lockUntil>now())return;
     tx.update(doc.ref,{nextCheck:now()+3600000});
     // Do not revoke on ambiguous provider errors; current authorization expires naturally.
    });
   }
  }
 }));
});
