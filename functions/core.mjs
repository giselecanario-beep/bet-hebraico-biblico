export function entitlement(sub, link, invoices, now) {
  const a=sub.auto_recurring||{};
  if(sub.id!==link.id||sub.external_reference!==link.reference||a.currency_id!=="BRL"||Number(a.transaction_amount)!==19.9||a.frequency!==1||a.frequency_type!=="months"||a.free_trial?.frequency!==7||a.free_trial?.frequency_type!=="days") throw Error("subscription mismatch");
  if(!["authorized","cancelled","canceled","paused","pending"].includes(sub.status))throw Error("unknown status");
  const day=86400000, next=Date.parse(sub.next_payment_date), created=Date.parse(sub.date_created);
  let trialEnd=link.trialEnd||0;
  if(!trialEnd&&sub.status==="authorized"&&Number.isFinite(next)&&Number.isFinite(created)&&next>now&&next<=created+7*day+3600000)trialEnd=next;
  let until=trialEnd;
  for(const i of invoices){
    if(i.preapproval_id!==link.id||i.currency_id!=="BRL"||Number(i.transaction_amount)!==19.9||i.payment?.status!=="approved"||i.payment?.status_detail!=="accredited"||i.verified!==true)continue;
    const debit=Date.parse(i.debit_date);
    if(!Number.isFinite(debit)||debit>now)continue;
    const d=new Date(debit), target=d.getUTCMonth()+1, dom=d.getUTCDate();
    d.setUTCDate(1);d.setUTCMonth(target);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(dom,last));
    until=Math.max(until,d.getTime());
  }
  const active=["authorized","cancelled","canceled"].includes(sub.status)&&until>now;
  return {active,until:active?until:0,trialEnd};
}
