"use strict";
// Production data is isolated from all test locks. Only Admin SDK may use this module.
function createCommercialStore(db,{Timestamp,FieldValue}){
 const uidRef=uid=>db.collection("betCommercialIntents").doc(uid);
 const emailRef=i=>db.collection("betCommercialEmailLocks").doc(i.sellerId+"_"+i.emailKey);
 const refRef=i=>db.collection("betCommercialReferenceLocks").doc(i.reference);
 const payerRef=b=>db.collection("betCommercialPayerLocks").doc(b.sellerId+"_"+b.payerId);
 const subRef=b=>db.collection("betCommercialSubscriptionLocks").doc(b.subscriptionId);
 const entRef=uid=>db.collection("betEntitlements").doc(uid);
 const owns=(s,i)=>s.exists&&s.data().uid===i.uid&&s.data().reference===i.reference;
 async function read(uid){const s=await uidRef(uid).get();return s.exists?s.data():null;}
 async function reserve(i){
  return db.runTransaction(async tx=>{
   const refs=[uidRef(i.uid),emailRef(i),refRef(i),entRef(i.uid)];
   const [u,e,r,a]=await Promise.all(refs.map(x=>tx.get(x)));
   if(u.exists)return {created:false,intent:u.data()};
   if(e.exists||r.exists||a.exists)throw Error("existing-lock-or-access");
   const lock={uid:i.uid,reference:i.reference,state:"reserved"};
   tx.create(refs[0],i);tx.create(refs[1],lock);tx.create(refs[2],lock);
   return {created:true,intent:i};
  });
 }
 async function markUncertain(i){
  await db.runTransaction(async tx=>{
   const refs=[uidRef(i.uid),emailRef(i),refRef(i)];
   const [u,e,r]=await Promise.all(refs.map(x=>tx.get(x)));
   if(owns(u,i)&&owns(e,i)&&owns(r,i)&&u.data().state==="reserved"){
    for(const x of refs)tx.update(x,{state:"uncertain"});
   }
  });
 }
 async function bind(i,b,access){
  if(b.uid!==i.uid||b.reference!==i.reference||b.emailKey!==i.emailKey||b.environment!=="production")throw Error("binding-mismatch");
  await db.runTransaction(async tx=>{
   const refs=[uidRef(i.uid),emailRef(i),refRef(i),payerRef(b),subRef(b),entRef(i.uid)];
   const [u,e,r,p,s,a]=await Promise.all(refs.map(x=>tx.get(x)));
   if(!owns(u,i)||!owns(e,i)||!owns(r,i))throw Error("intent-lock-conflict");
   if(u.data().state==="bound"&&[u,e,r,p,s].every(x=>owns(x,i)&&x.data().subscriptionId===b.subscriptionId)&&a.exists&&a.data().source==="mercadopago-commercial"&&a.data().subscriptionId===b.subscriptionId)return;
   if(!["reserved","uncertain"].includes(u.data().state)||p.exists||s.exists||a.exists)throw Error("binding-lock-conflict");
   for(const x of refs.slice(0,3))tx.update(x,{state:"bound",subscriptionId:b.subscriptionId});
   tx.create(refs[3],b);tx.create(refs[4],b);
   tx.create(refs[5],{role:"subscriber",active:access.active,validUntil:Timestamp.fromMillis(access.until),accessReason:access.reason,source:"mercadopago-commercial",subscriptionId:b.subscriptionId,updatedAt:FieldValue.serverTimestamp()});
  });
 }
 async function readBinding(i){
  if(i.state!=="bound"||!/^[a-f0-9]{32}$/i.test(i.subscriptionId||""))throw Error("unbound");
  const snap=await subRef(i).get(),b=snap.data();
  if(!owns(snap,i)||b.environment!=="production"||b.subscriptionId!==i.subscriptionId||b.emailKey!==i.emailKey||b.planId!==i.planId||b.sellerId!==i.sellerId||b.applicationId!==i.applicationId)throw Error("binding-lock-conflict");
  return b;
 }
 async function assertManagement(i,b){
  await db.runTransaction(async tx=>{
   const refs=[uidRef(i.uid),emailRef(i),refRef(i),payerRef(b),subRef(b),entRef(i.uid)];
   const [u,e,r,p,s,a]=await Promise.all(refs.map(x=>tx.get(x)));
   if(![u,e,r,p,s].every(x=>owns(x,i)&&x.data().subscriptionId===b.subscriptionId)||!a.exists||a.data().source!=="mercadopago-commercial"||a.data().subscriptionId!==b.subscriptionId||a.data().role!=="subscriber")throw Error("protected-entitlement");
  });
 }
 async function reconcile(i,b,access,sub,now){
  return db.runTransaction(async tx=>{
   const refs=[uidRef(i.uid),emailRef(i),refRef(i),payerRef(b),subRef(b),entRef(i.uid)];
   const [u,e,r,p,s,a]=await Promise.all(refs.map(x=>tx.get(x)));
   if(![u,e,r,p,s].every(x=>owns(x,i)&&x.data().subscriptionId===b.subscriptionId)||!a.exists||a.data().source!=="mercadopago-commercial"||a.data().subscriptionId!==b.subscriptionId||a.data().role!=="subscriber")throw Error("protected-entitlement");
   const old=a.data(),version=Number.isSafeInteger(sub.version)?sub.version:null;
   if(Number.isSafeInteger(old.providerVersion)&&(!Number.isSafeInteger(version)||version<old.providerVersion))return {active:old.active,reason:old.accessReason,until:old.validUntil.toMillis(),stale:true};
   if(old.checkedAt?.toMillis()>now)return {active:old.active,reason:old.accessReason,until:old.validUntil.toMillis(),stale:true};
   tx.update(refs[5],{active:access.active,validUntil:Timestamp.fromMillis(access.until),accessReason:access.reason,subscriptionStatus:sub.status,providerVersion:version,checkedAt:Timestamp.fromMillis(now),updatedAt:FieldValue.serverTimestamp()});
   return access;
  });
 }
 async function eventBinding(subscriptionId){
  if(!/^[a-f0-9]{32}$/i.test(subscriptionId))throw Error("invalid-subscription-id");
  const snap=await subRef({subscriptionId}).get();
  if(!snap.exists)return null;
  const b=snap.data();
  if(b.subscriptionId!==subscriptionId||b.environment!=="production")throw Error("binding-lock-conflict");
  return b;
 }
 async function payerBinding(sellerId,payerId){
  if(!/^\d{1,25}$/.test(String(sellerId))||!/^\d{1,25}$/.test(String(payerId)))throw Error("invalid-payer");
  const snap=await payerRef({sellerId,payerId}).get();
  if(!snap.exists)return null;
  const b=snap.data();
  if(b.sellerId!==String(sellerId)||b.payerId!==String(payerId)||b.environment!=="production")throw Error("binding-lock-conflict");
  const checked=await eventBinding(b.subscriptionId);
  if(!checked||checked.uid!==b.uid||checked.reference!==b.reference||checked.payerId!==b.payerId||checked.sellerId!==b.sellerId)throw Error("binding-lock-conflict");
  return checked;
 }
 async function referenceIntent(reference){
  if(!/^bet_live_[a-f0-9]{48}$/.test(reference))return null;
  const snap=await refRef({reference}).get();
  if(!snap.exists)return null;
  const lock=snap.data(),i=await read(lock.uid);
  if(!i||i.reference!==reference||lock.reference!==reference||i.environment!=="production")throw Error("reference-lock-conflict");
  return i;
 }
 return {read,reserve,markUncertain,bind,readBinding,assertManagement,reconcile,eventBinding,payerBinding,referenceIntent};
}
module.exports={createCommercialStore};
