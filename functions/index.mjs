import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret,defineString} from 'firebase-functions/params';
import {randomUUID} from 'node:crypto';
import {entitlement} from './core.mjs';
initializeApp();
const db=getFirestore(), token=defineSecret('BET_MP_TEST_TOKEN'), tester=defineString('BET_TEST_UID');
const opts={region:'us-central1',secrets:[token],maxInstances:2};
const back='https://bet-hebraico.web.app/';
function uid(req){
 if(!req.auth||req.auth.uid!==tester.value()||!req.auth.token.email)throw new HttpsError('permission-denied','Acesso restrito ao teste BET.');
 if(!token.value().startsWith('TEST-'))throw new HttpsError('failed-precondition','Somente credencial de teste nesta versão.');
 return req.auth.uid;
}
async function mp(path,method='GET',body){
 const r=await fetch('https://api.mercadopago.com'+path,{method,headers:{Authorization:'Bearer '+token.value(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new HttpsError('unavailable','Mercado Pago retornou HTTP '+r.status);
 return r.json();
}
const linkRef=u=>db.collection('betSubscriptionLinksTest').doc(u);
const accessRef=u=>db.collection('betEntitlements').doc(u);
function checkOwner(data){if(data&&(['owner','collaborator'].includes(data.role)||data.source!=='mercado-pago-test'))throw new HttpsError('failed-precondition','Acesso existente protegido; use conta de teste nova.');}
function hosted(url,id){
 const u=new URL(url);
 if(u.protocol!=='https:'||u.hostname!=='www.mercadopago.com.br'||u.pathname!=='/subscriptions/checkout'||u.searchParams.get('preapproval_id')!==id)throw Error('unexpected checkout URL');
 return u.href;
}
export const betStartTest=onCall(opts,async req=>{
 const u=uid(req), ref=linkRef(u), reference='bet-test-'+randomUUID();
 const existing=await db.runTransaction(async tx=>{
  const [l,e]=await Promise.all([tx.get(ref),tx.get(accessRef(u))]);checkOwner(e.data());
  if(l.exists)return l.data();
  tx.create(ref,{reference,state:'creating',createdAt:FieldValue.serverTimestamp()});
  return null;
 });
 if(existing){
  if(existing.state==='pending'&&existing.id&&existing.url)return {url:existing.url};
  throw new HttpsError('failed-precondition','Já existe tentativa; confira no painel antes de repetir.');
 }
 // Independent pending subscription: linked-plan creation requires card token.
 // Do not return a checkout that does not preserve the requested free trial.
 const sub=await mp('/preapproval','POST',{reason:'BET | Hebraico Bíblico',external_reference:reference,payer_email:req.auth.token.email,auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:19.9,currency_id:'BRL',free_trial:{frequency:7,frequency_type:'days'}},back_url:back,status:'pending'});
 if(typeof sub.id!=='string'||!sub.id)throw new HttpsError('failed-precondition','Sem ID de assinatura.');
 await ref.update({id:sub.id,state:'review'});
 const confirmed=await mp('/preapproval/'+encodeURIComponent(sub.id));
 entitlement(confirmed,{id:sub.id,reference},[],Date.now());
 if(confirmed.status!=='pending')throw new HttpsError('failed-precondition','Estado inicial inesperado.');
 const url=hosted(confirmed.init_point,sub.id);
 await ref.update({url,state:'pending'});
 return {url};
});
async function sync(u){
 const ref=linkRef(u), snap=await ref.get(), link=snap.data();
 if(!link?.id||!['pending','synced'].includes(link.state))return {active:false};
 const sub=await mp('/preapproval/'+encodeURIComponent(link.id));
 const invoices=[];
 if(['authorized','cancelled','canceled'].includes(sub.status)){
  let offset=0;
  for(let page=0;page<10;page++){
   const data=await mp('/authorized_payments/search?preapproval_id='+encodeURIComponent(link.id)+'&limit=20&offset='+offset);
   if(!Array.isArray(data.results)||!Number.isFinite(data.paging?.total))throw Error('invalid invoices');
   for(const i of data.results){
    if(i.preapproval_id!==link.id||i.payment?.status!=='approved'||!i.payment.id)continue;
    if(Date.parse(i.debit_date)<Date.now()-40*86400000)continue;
    const p=await mp('/v1/payments/'+encodeURIComponent(String(i.payment.id)));
    invoices.push({...i,verified:p.status==='approved'&&p.status_detail==='accredited'&&Number(p.transaction_amount)===19.9&&p.currency_id==='BRL'&&Number(p.transaction_amount_refunded)===0});
   }
   offset+=data.results.length;
   if(offset>=data.paging.total)break;
   if(!data.results.length||page===9)throw Error('incomplete invoice list');
  }
 }
 const decision=entitlement(sub,link,invoices,Date.now());
 await db.runTransaction(async tx=>{
  const [l,e]=await Promise.all([tx.get(ref),tx.get(accessRef(u))]);
  checkOwner(e.data());
  if(l.updateTime?.toMillis()!==snap.updateTime?.toMillis())throw new HttpsError('aborted','Atualize novamente.');
  tx.update(ref,{state:'synced',trialEnd:decision.trialEnd,status:sub.status,checkedAt:FieldValue.serverTimestamp()});
  tx.set(accessRef(u),{role:'subscriber',source:'mercado-pago-test',active:decision.active,validUntil:Timestamp.fromMillis(decision.until),subscriptionId:link.id});
 });
 return {active:decision.active,validUntil:decision.until,status:sub.status};
}
export const betSyncTest=onCall(opts,req=>sync(uid(req)));
export const betCancelTest=onCall(opts,async req=>{
 const u=uid(req), l=(await linkRef(u).get()).data();checkOwner((await accessRef(u).get()).data());
 if(!l?.id||!['pending','synced'].includes(l.state))throw new HttpsError('failed-precondition','Sem assinatura vinculada.');
 const s=await mp('/preapproval/'+encodeURIComponent(l.id));
 entitlement(s,l,[],Date.now());
 if(!['cancelled','canceled'].includes(s.status))await mp('/preapproval/'+encodeURIComponent(l.id),'PUT',{status:'canceled'});
 return sync(u);
});
