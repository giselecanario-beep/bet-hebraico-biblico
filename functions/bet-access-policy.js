"use strict";
function addMonth(ms){
 const d=new Date(ms),day=d.getUTCDate();
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);
 const last=new Date(d.getTime());last.setUTCMonth(last.getUTCMonth()+1,0);
 d.setUTCDate(Math.min(day,last.getUTCDate()));return d.getTime();
}

function verifySubscription(sub,cfg){
 const r=sub.auto_recurring||{};
 if(sub.id!==cfg.subscriptionId||String(sub.collector_id)!==String(cfg.sellerId)||String(sub.payer_id)!==String(cfg.payerId)||sub.preapproval_plan_id!==cfg.planId)throw Error("identity");
 if(r.currency_id!=="BRL"||Math.round(Number(r.transaction_amount)*100)!==1990||r.frequency!==1||r.frequency_type!=="months"||r.free_trial?.frequency!==7||r.free_trial?.frequency_type!=="days")throw Error("plan");
 const start=Date.parse(sub.date_created);
 if(!Number.isFinite(start))throw Error("date");
 return start;
}

function evaluateAccess(sub,cfg,now,pairs=[]){
 const start=verifySubscription(sub,cfg);
 if(start>now)throw Error("future start");
 const trialEnd=start+7*86400000,next=Date.parse(sub.next_payment_date);
 if(sub.status==="authorized"&&now<trialEnd&&Number.isFinite(next)&&next>now&&next>start)return {active:true,reason:"trial",until:Math.min(next,trialEnd)};
 if(!["authorized","cancelled","canceled","paused"].includes(sub.status))return {active:false,reason:"pending",until:now};
 let until=0;
 for(const {invoice:i,payment:p} of pairs){
  const due=Date.parse(i.debit_date),approved=Date.parse(p.date_approved);
  if(i.preapproval_id!==cfg.subscriptionId||i.currency_id!=="BRL"||Math.round(Number(i.transaction_amount)*100)!==1990||String(i.payment?.id)!==String(p.id)||i.payment?.status!=="approved"||p.status!=="approved"||p.status_detail!=="accredited"||p.currency_id!=="BRL"||Math.round(Number(p.transaction_amount)*100)!==1990||Number(p.transaction_amount_refunded??0)!==0||String(p.collector_id)!==String(cfg.sellerId)||String(p.payer?.id)!==String(cfg.payerId)||!Number.isFinite(due)||!Number.isFinite(approved)||due<trialEnd-86400000||due>now||approved>now)continue;
  until=Math.max(until,addMonth(due));
 }
 if(until>now)return {active:true,reason:"paid",until};
 return {active:false,reason:["cancelled","canceled"].includes(sub.status)?"cancelled":"expired",until:now};
}
module.exports={addMonth,verifySubscription,evaluateAccess};
