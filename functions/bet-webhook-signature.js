"use strict";
const {createHmac,timingSafeEqual}=require("node:crypto");
function webhookVerdict({id,requestId,signature,secret,now}){
 if(typeof id!=="string"||!/^[a-z0-9-]{1,128}$/i.test(id))return "invalid-id";
 if(typeof requestId!=="string"||!/^[a-z0-9_.:-]{1,200}$/i.test(requestId))return "invalid-request-id";
 if(typeof signature!=="string"||signature.length>512)return "missing-signature";
 if(typeof secret!=="string"||secret.trim().length<16)return "invalid-secret-config";
 const parts=Object.create(null);
 for(const fragment of signature.split(",")){
  const pair=fragment.trim().split("=");
  if(pair.length!==2||parts[pair[0]]!==undefined)return "invalid-header-format";
  parts[pair[0]]=pair[1].trim();
 }
 if(!/^[0-9]{10}([0-9]{3})?$/.test(parts.ts||"")||!/^[a-f0-9]{64}$/i.test(parts.v1||""))return "invalid-signature-format";
 const ts=Number(parts.ts)*(parts.ts.length===10?1000:1);
 if(!Number.isFinite(now)||ts>now+300000||ts<now-86400000)return "timestamp-outside-window";
 const expected=createHmac("sha256",secret.trim()).update("id:"+id.toLowerCase()+";request-id:"+requestId+";ts:"+parts.ts+";").digest();
 return timingSafeEqual(expected,Buffer.from(parts.v1,"hex"))?"ok":"hmac-mismatch";
}
function verifyWebhook(input){return webhookVerdict(input)==="ok";}
module.exports={verifyWebhook,webhookVerdict};
