"use strict";
const {createHmac,randomUUID}=require("node:crypto");
(async()=>{
 const secret=(process.env.BET_TEMP_WEBHOOK_SECRET||"").trim(),id=(process.env.BET_TEMP_SUB_ID||"").trim().toLowerCase();
 if(secret.length<16||!(/^[a-f0-9]{32}$/.test(id)))throw Error("Configuracao local invalida");
 const url=new URL("https://us-central1-bet-hebraico.cloudfunctions.net/betTestWebhook");
 url.searchParams.set("data.id",id);
 const body=JSON.stringify({type:"bet_diagnostic",data:{id}});
 for(const signed of [false,true]){
  const rid=randomUUID(),ts=String(Math.floor(Date.now()/1000));
  const sig=createHmac("sha256",secret).update("id:"+id+";request-id:"+rid+";ts:"+ts+";").digest("hex");
  const headers={"content-type":"application/json","x-bet-diagnostic":"1","x-request-id":rid};
  if(signed)headers["x-signature"]="ts="+ts+",v1="+sig;
  const res=await fetch(url,{method:"POST",headers,body,redirect:"error",signal:AbortSignal.timeout(30000)});
  console.log((signed?"COM ASSINATURA":"SEM ASSINATURA")+": HTTP "+res.status+" | "+(res.headers.get("x-bet-diagnostic")||"sem-diagnostico")+" | "+(res.headers.get("x-bet-webhook")||"sem-versao"));
  await res.arrayBuffer();
 }
})().catch(e=>{console.error("Diagnostico falhou:",e.name);process.exitCode=1;});
