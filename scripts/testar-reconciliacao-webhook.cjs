"use strict";
const {createHmac,randomUUID}=require("node:crypto");
(async()=>{
 const secret=(process.env.BET_TEMP_WEBHOOK_SECRET||"").trim(),id=(process.env.BET_TEMP_SUB_ID||"").trim().toLowerCase();
 if(secret.length<16||!(/^[a-f0-9]{32}$/.test(id)))throw Error("Configuracao local invalida");
 const url=new URL("https://us-central1-bet-hebraico.cloudfunctions.net/betTestWebhook");
 url.searchParams.set("data.id",id);
 for(const [type,signed,expected] of [["bet_diagnostic",false,401],["bet_diagnostic",true,200],["subscription_preapproval",true,200]]){
  const rid=randomUUID(),ts=String(Math.floor(Date.now()/1000));
  const sig=createHmac("sha256",secret).update("id:"+id+";request-id:"+rid+";ts:"+ts+";").digest("hex");
  const headers={"content-type":"application/json","x-bet-diagnostic":"1","x-request-id":rid};
  if(signed)headers["x-signature"]="ts="+ts+",v1="+sig;
  const res=await fetch(url,{method:"POST",headers,body:JSON.stringify({type,data:{id}}),redirect:"error",signal:AbortSignal.timeout(95000)});
  const result=res.headers.get("x-bet-result");
  console.log(type+" "+(signed?"ASSINADO":"SEM ASSINATURA")+": HTTP "+res.status+(result?" | "+result:""));
  await res.arrayBuffer();
  if(res.status!==expected||(type==="subscription_preapproval"&&result!=="reconciled"))throw Error("Teste do webhook nao confirmado");
 }
 console.log("BET: WEBHOOK E RECONCILIACAO INTERNA CONFIRMADOS");
})().catch(e=>{console.error("Teste interrompido:",e.message);process.exitCode=1;});
