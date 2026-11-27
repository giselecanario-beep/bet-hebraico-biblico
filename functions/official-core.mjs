export const PLAN='417a60404e374b1d935b238e20090873';
export const CHECKOUT='https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id='+PLAN;
export const closed=s=>['canceled','cancelled','expired'].includes(s);
export function verifyPlan(p){
 const a=p?.auto_recurring,t=a?.free_trial;
 if(p?.id!==PLAN||!p.collector_id||p.status!=='active'||a?.currency_id!=='BRL'||Number(a.transaction_amount)!==19.9||a.frequency!==1||a.frequency_type!=='months'||t?.frequency!==7||t.frequency_type!=='days')throw Error('Plano oficial divergente');
 return p.collector_id;
}
export function verifySub(s,collector){
 const a=s?.auto_recurring;
 if(!/^[a-zA-Z0-9_-]{6,128}$/.test(s?.id||'')||s.preapproval_plan_id!==PLAN||String(s.collector_id)!==String(collector)||a?.currency_id!=='BRL'||Number(a.transaction_amount)!==19.9||a.frequency!==1||a.frequency_type!=='months'||!['authorized','pending','paused','cancelled','canceled','expired'].includes(s.status))throw Error('Assinatura divergente');
 return s;
}
const day=86400000;
export function monthAfter(ms){
 const d=new Date(ms),dom=d.getUTCDate();
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);
 d.setUTCDate(Math.min(dom,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));
 return d.getTime();
}
export function accessFor(s,previous,verifiedInvoices,now){
 const created=Date.parse(s.date_created),next=Date.parse(s.next_payment_date);
 let trialEnd=previous?.trialEnd||0;
 // Only an authorized subscription with a bounded first charge can grant a new trial.
 if(!trialEnd&&s.status==='authorized'&&Number.isFinite(created)&&Number.isFinite(next)&&created<=now&&now<next&&next<=created+7*day+3600000)trialEnd=next;
 let until=trialEnd;
 for(const i of verifiedInvoices){
  const debit=Date.parse(i.debit_date);
  if(i.preapproval_id!==s.id||i.currency_id!=='BRL'||Number(i.transaction_amount)!==19.9||i.verified!==true||!Number.isFinite(debit)||debit>now)continue;
  until=Math.max(until,monthAfter(debit));
 }
 const active=(s.status==='authorized'||closed(s.status))&&until>now;
 return {active,validUntil:active?until:0,trialEnd};
}
export function choose(results,email,collector){
 const subs=results.map(s=>verifySub(s,collector));
 for(const s of subs)if(s.payer_email&&s.payer_email.trim().toLowerCase()!==email.toLowerCase())throw Error('E-mail divergente');
 const open=subs.filter(s=>!closed(s.status));
 if(open.length>1)throw Error('Mais de uma assinatura não encerrada');
 if(open.length===1)return open[0];
 return subs.sort((a,b)=>Date.parse(b.date_created)-Date.parse(a.date_created))[0]||null;
}
