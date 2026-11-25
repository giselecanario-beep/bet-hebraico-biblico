// Teste manual de assinatura, exclusivo de uma conta descartável. Não cria cobranças.
// node scripts/testar-assinante.mjs
import {execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
const rl=createInterface({input:process.stdin,output:process.stdout});
const ask=async q=>(await rl.question(q)).trim();
try{
 const uid=await ask('UID da conta descartável (NÃO use a proprietária ou colaborador): ');
 if(!/^[A-Za-z0-9_-]{20,128}$/.test(uid))throw Error('UID inválido');
 const mode=await ask('Operação: liberar, expirar, revogar ou remover? ');
 if(!['liberar','expirar','revogar','remover'].includes(mode))throw Error('Operação inválida');
 const project='bet-hebraico',name='projects/'+project+'/databases/(default)/documents/betEntitlements/'+uid;
 const root='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents';
 const headers={Authorization:'Bearer '+execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim(),'Content-Type':'application/json'};
 const res=await fetch(root+'/betEntitlements/'+encodeURIComponent(uid),{headers});
 if(!res.ok&&res.status!==404)throw Error('Consulta falhou: HTTP '+res.status);
 const old=res.ok?await res.json():null;
 if(old&&(old.fields?.source?.stringValue!=='bet-launch-test'||old.fields?.role?.stringValue!=='subscriber'))throw Error('Registro não é de teste. Protegido contra alterações.');
 if(!old&&mode!=='liberar')throw Error('Registro de teste não existe.');
 if(await ask('Confirme que esta conta é descartável. Digite TESTE: ')!=='TESTE')throw Error('Cancelado.');
 const precondition=old?{updateTime:old.updateTime}:{exists:false};
 const fields={active:{booleanValue:mode!=='revogar'},role:{stringValue:'subscriber'},source:{stringValue:'bet-launch-test'},validUntil:{timestampValue:new Date(Date.now()+(mode==='expirar'?-60000:3600000)).toISOString()}};
 const write=mode==='remover'?{delete:name,currentDocument:precondition}:{update:{name,fields},currentDocument:precondition};
 const commit=await fetch(root+':commit',{method:'POST',headers,body:JSON.stringify({writes:[write]})});
 if(!commit.ok)throw Error('Operação não confirmada: HTTP '+commit.status);
 console.log('Teste atualizado: '+mode+'. Nenhuma cobrança criada.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{rl.close();}
