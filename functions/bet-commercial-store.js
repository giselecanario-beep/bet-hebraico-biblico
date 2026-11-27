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
 return {read,reserve,markUncertain,bind};
}
module.exports={createCommercialStore};
