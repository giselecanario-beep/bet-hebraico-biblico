"use strict";
// Internal building block only; not an exported Firebase endpoint.
function makeIntent(auth,offer,reference,now){
 if(typeof auth?.uid!=="string"||!/^[A-Za-z0-9_-]{10,128}$/.test(auth.uid)||auth.email_verified!==true||typeof auth.email!=="string"||!auth.email.includes("@"))throw Error("verified-auth-required");
 if(offer?.environment!=="test"||!offer.enabled||!/^[a-f0-9]{32}$/i.test(offer.planId)||!/^[0-9]+$/.test(String(offer.sellerId))||!/^[0-9]+$/.test(String(offer.applicationId))||!/^[0-9]+$/.test(String(offer.payerId)))throw Error("test-offer-required");
 if(!/^bet_[a-f0-9]{48}$/.test(reference)||!Number.isSafeInteger(now))throw Error("invalid-intent");
 return {uid:auth.uid,email:auth.email.trim().toLowerCase(),reference,environment:"test",planId:offer.planId,sellerId:String(offer.sellerId),applicationId:String(offer.applicationId),payerId:String(offer.payerId),createdAt:now,state:"reserved",priceCents:1990,currency:"BRL",trialDays:7};
}
function confirmBinding(intent,sub,now){
 if(!intent||intent.environment!=="test"||!["reserved","uncertain","bound"].includes(intent.state)||!/^bet_[a-f0-9]{48}$/.test(intent.reference)||!Number.isSafeInteger(now))throw Error("invalid-intent");
 const r=sub?.auto_recurring||{},created=Date.parse(sub?.date_created);
 if(!/^[a-f0-9]{32}$/i.test(sub?.id||"")||sub.external_reference!==intent.reference||String(sub.collector_id)!==intent.sellerId||String(sub.application_id)!==intent.applicationId||String(sub.payer_id)!==intent.payerId||sub.preapproval_plan_id!==intent.planId)throw Error("binding-mismatch");
 if(intent.subscriptionId&&intent.subscriptionId!==sub.id)throw Error("already-bound");
 if(!Number.isFinite(created)||created<intent.createdAt-60000||created>now||sub.status!=="authorized")throw Error("unconfirmed-subscription");
 if(r.currency_id!==intent.currency||Math.round(Number(r.transaction_amount)*100)!==intent.priceCents||r.frequency!==1||r.frequency_type!=="months"||r.free_trial?.frequency!==intent.trialDays||r.free_trial?.frequency_type!=="days")throw Error("plan-mismatch");
 return {uid:intent.uid,reference:intent.reference,subscriptionId:sub.id,environment:"test",payerId:intent.payerId,planId:intent.planId,sellerId:intent.sellerId,applicationId:intent.applicationId,state:"bound"};
}
module.exports={makeIntent,confirmBinding};
