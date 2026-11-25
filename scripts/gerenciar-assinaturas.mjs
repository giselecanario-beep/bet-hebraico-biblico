// Administração manual do BET. Não cria cobranças nem consulta cartões.
// Rode no Cloud Shell do projeto bet-hebraico. Confira o pagamento no painel Mercado Pago antes.
import {execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
const project='bet-hebraico';
const rl=createInterface({input:process.stdin,output:process.stdout});
const ask=async s=>(await rl.question(s)).trim();
try{
 const mode=(await ask('Operação: liberar, renovar ou revogar? ')).toLowerCase();
 if(!['liberar','renovar','revogar'].includes(mode))throw Error('Operação inválida.');
 const uid=await ask('UID do aluno, copiado da conta correta no Firebase Authentication: ');
 if(!/^[A-Za-z0-9_-]{20,128}$/.test(uid))throw Error('UID inválido.');
 const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim();
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const root='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents';
 const name='projects/'+project+'/databases/(default)/documents/betEntitlements/'+uid;
 const response=await fetch(root+'/betEntitlements/'+encodeURIComponent(uid),{headers});
 if(!response.ok&&response.status!==404)throw Error('Falha ao consultar autorização: HTTP '+response.status);
 const old=response.ok?await response.json():null;
 if(['owner','collaborator'].includes(old?.fields?.role?.stringValue))throw Error('O acesso permanente está protegido; nenhuma alteração foi feita.');
 if(mode==='liberar'&&old)throw Error('Já existe uma autorização. Use renovar após verificar os dados.');
 if(mode!=='liberar'&&!old)throw Error('Nenhuma autorização encontrada.');
 let fields;
 if(mode==='revogar'){
  fields={...old.fields,active:{booleanValue:false}};
 }else{
  const subscription=await ask('ID da assinatura confirmada no Mercado Pago: ');
  if(!/^[A-Za-z0-9_-]{6,128}$/.test(subscription))throw Error('ID inválido.');
  const previous=old?.fields?.subscriptionId?.stringValue;
  if(previous&&previous!==subscription)throw Error('O ID difere do registro anterior; revise manualmente.');
  const date=await ask('Fim do período confirmado (AAAA-MM-DDTHH:MM:SS-03:00, horário de Brasília): ');
  const millis=Date.parse(date);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/.test(date)||!Number.isFinite(millis)||millis<=Date.now()||millis>Date.now()+62*86400000)throw Error('Validade inválida ou superior a 62 dias.');
  if(new Date(millis-3*3600000).toISOString().slice(0,19)!==date.slice(0,19))throw Error('Data inválida.');
  fields={active:{booleanValue:true},role:{stringValue:'subscriber'},subscriptionId:{stringValue:subscription},validUntil:{timestampValue:new Date(millis).toISOString()},source:{stringValue:'mercado-pago-manual'}};
 }
 console.log('Projeto:',project,'| Operação:',mode,'| UID:',uid,'| Validade:',fields.validUntil?.timestampValue||'sem validade informada');
 if(await ask('Conferiu a identidade, o plano e a situação no Mercado Pago? Digite SIM para gravar: ')!=='SIM'){console.log('Cancelado, nada alterado.');}
 else {
  const write={update:{name,fields},currentDocument:old?{updateTime:old.updateTime}:{exists:false}};
  const result=await fetch(root+':commit',{method:'POST',headers,body:JSON.stringify({writes:[write]})});
  if(!result.ok)throw Error('Nenhuma alteração confirmada: HTTP '+result.status);
  console.log('Autorização atualizada. Nenhuma cobrança foi criada. O aluno pode consultar a assinatura no BET.');
 }
}catch(e){console.error(e.message);process.exitCode=1;}finally{rl.close();}
