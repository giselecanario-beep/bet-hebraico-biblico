"use strict";
const assert=require("node:assert/strict");
const {createHmac}=require("node:crypto");
const {verifyWebhook}=require("./bet-webhook-signature");
const now=1795785600000,secret="fake-unit-test-secret-not-a-real-key",id="AbC123",requestId="request-1",ts=String(now/1000);
function sign(t=ts){return "ts="+t+",v1="+createHmac("sha256",secret).update("id:"+id.toLowerCase()+";request-id:"+requestId+";ts:"+t+";").digest("hex");}
const base={id,requestId,signature:sign(),secret,now};
assert.equal(verifyWebhook(base),true);
assert.equal(verifyWebhook({...base,id:"different"}),false);
assert.equal(verifyWebhook({...base,requestId:"other"}),false);
assert.equal(verifyWebhook({...base,secret:"another-test-secret"}),false);
assert.equal(verifyWebhook({...base,signature:"ts="+ts+",v1=0"}),false);
assert.equal(verifyWebhook({...base,signature:base.signature+",ts="+ts}),false);
assert.equal(verifyWebhook({...base,now:now+86400001}),false);
assert.equal(verifyWebhook({...base,now:now-300001}),false);
assert.equal(verifyWebhook({...base,signature:sign(String(now))}),true);
assert.equal(verifyWebhook({...base,secret:" "+secret+"\r\n"}),true);
assert.equal(verifyWebhook({...base,signature:base.signature.replace(/v1=./,"v1=z")}),false);
console.log("11 testes de assinatura webhook aprovados");
