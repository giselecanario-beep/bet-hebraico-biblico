"use strict";
const {createHmac,timingSafeEqual}=require("node:crypto");
function verifyWebhook({id,requestId,signature,secret,now}){
 if(typeof id!=="string"||!/^[a-z0-9-]{1,128}$/i.test(id)||typeof requestId!=="string"||!/^[a-z0-9_.:-]{1,200}$/i.test(requestId)||typeof signature!=="string"||signature.length>512||typeof secret!=="string"||secret.length<16)return false;
 const parts=Object.create(null);
 for(const fragment of signature.split(",")){
  const pair=fragment.trim().split("=");
  if(pair.length!==2||parts[pair[0]]!==undefined)return false;
  parts[pair[0]]=pair[1].trim();
 }
 if(!/^[0-9]{10}([0-9]{3})?$/.test(parts.ts||"")||!/^[a-f0-9]{64}$/i.test(parts.v1||""))return false;
 const ts=Number(parts.ts)*(parts.ts.length===10?1000:1);
 if(!Number.isFinite(now)||ts>now+300000||ts<now-86400000)return false;
 const expected=createHmac("sha256",secret).update("id:"+id.toLowerCase()+";request-id:"+requestId+";ts:"+parts.ts+";").digest();
 return timingSafeEqual(expected,Buffer.from(parts.v1,"hex"));
}
module.exports={verifyWebhook};
