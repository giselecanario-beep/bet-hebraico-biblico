// BET: autoriza uma única conta de professora para teste, por 30 dias.
// Executar em Cloud Shell autenticado. Não envia dados a terceiros nem imprime tokens.
import {execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
const project='bet-hebraico';
const rl=createInterface({input:process.stdin,output:process.stdout});
const ask=(s)=>rl.question(s);
try{
 const defaultEmail=execFileSync('gcloud',['config','get-value','account'],{encoding:'utf8'}).trim();
 const email=(await ask('E-mail que você usa para entrar no BET ['+defaultEmail+']: ')).trim()||defaultEmail;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('E-mail inválido.');
 const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim();
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const lookup=await fetch('https://identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:lookup',{method:'POST',headers,body:JSON.stringify({email:[email]})});
 if(!lookup.ok)throw Error('Consulta de conta falhou: HTTP '+lookup.status);
 const result=await lookup.json();
 const users=(result.users||[]).filter(u=>u.email?.toLowerCase()===email.toLowerCase()&&!u.disabled&&typeof u.localId==='string');
 if(users.length!==1)throw Error('Não encontrei uma conta única e ativa com esse e-mail. Entre primeiro no BET e tente novamente.');
 const user=users[0];
 console.log('Projeto: '+project+'. Conta BET: '+user.email+'. Acesso de teste: 30 dias, sem pagamento.');
 if((await ask('Confirma a liberação desta conta? Digite SIM: ')).trim().toUpperCase()!=='SIM'){console.log('Cancelado; nada foi gravado.');process.exitCode=0;}
 else{
  const validUntil=new Date(Date.now()+30*24*60*60*1000).toISOString();
  const base='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/betEntitlements';
  const write=await fetch(base+'?documentId='+encodeURIComponent(user.localId),{method:'POST',headers,body:JSON.stringify({fields:{active:{booleanValue:true},validUntil:{timestampValue:validUntil},subscriptionId:{stringValue:'teste-professora'},source:{stringValue:'manual-test'}}})});
  if(write.status===409){console.log('Já existe uma autorização para esta conta; nada foi alterado.');}
  else if(!write.ok)throw Error('Não foi possível criar a autorização: HTTP '+write.status);
  else console.log('Acesso de teste liberado por 30 dias. Abra o BET, entre na mesma conta e clique em Consultar assinatura.');
 }
}catch(e){console.error(e.message);process.exitCode=1;}finally{rl.close();}
