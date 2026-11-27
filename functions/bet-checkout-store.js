"use strict";
// Server-side only. The Firestore rules for these collections must deny all client access.
function createCheckoutStore(db,{Timestamp,FieldValue}){
 const uidRef=uid=>db.collection("betCheckoutIntents").doc(uid);
 const payerRef=id=>db.collection("betCheckoutPayerLocks").doc(id);
 const subRef=id=>db.collection("betCheckoutSubscriptionLocks").doc(id);
 const entitlement=uid=>db.collection("betEntitlements").doc(uid);
 function lockKey(i){return "test_"+i.sellerId+"_"+i.payerId;}
 async function reserve(i){
  return db.runTransaction(async tx=>{
   const refs=[uidRef(i.uid),payerRef(lockKey(i)),entitlement(i.uid)];
   const [uid,payer,access]=await Promise.all(refs.map(r=>tx.get(r)));
   if(uid.exists)return {created:false,intent:uid.data()};
   if(payer.exists||access.exists)throw Error("existing-access-or-payer");
   tx.create(refs[0],i);
   tx.create(refs[1],{uid:i.uid,reference:i.reference,state:"reserved"});
   return {created:true,intent:i};
  });
 }
 async function bind(i,b,access){
  return db.runTransaction(async tx=>{
   const refs=[uidRef(i.uid),payerRef(lockKey(i)),subRef(b.subscriptionId),entitlement(i.uid)];
   const [uid,payer,sub,ent]=await Promise.all(refs.map(r=>tx.get(r)));
   if(!uid.exists||uid.data().reference!==i.reference||!["reserved","uncertain"].includes(uid.data().state)||!payer.exists||payer.data().uid!==i.uid||payer.data().reference!==i.reference||sub.exists||ent.exists)throw Error("binding-lock-conflict");
   tx.update(refs[0],{state:"bound",subscriptionId:b.subscriptionId});
   tx.update(refs[1],{state:"bound",subscriptionId:b.subscriptionId});
   tx.create(refs[2],b);
   tx.create(refs[3],{role:"subscriber",active:access.active,validUntil:Timestamp.fromMillis(access.until),accessReason:access.reason,source:"mercadopago-test-individual",updatedAt:FieldValue.serverTimestamp()});
  });
 }
 async function markUncertain(i){
  await db.runTransaction(async tx=>{
   const refs=[uidRef(i.uid),payerRef(lockKey(i))], [uid,payer]=await Promise.all(refs.map(r=>tx.get(r)));
   if(uid.exists&&payer.exists&&uid.data().reference===i.reference&&uid.data().state==="reserved"&&payer.data().reference===i.reference){
    tx.update(refs[0],{state:"uncertain"});tx.update(refs[1],{state:"uncertain"});
   }
  });
 }
 return {reserve,bind,markUncertain};
}
module.exports={createCheckoutStore};
