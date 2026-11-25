// BET: importação administrativa das aulas 06–10. Node.js 18+.
// Executar no Cloud Shell autenticado como administrador do projeto bet-hebraico.
// Sem --apply, apenas verifica a estrutura e informa o que seria importado.
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const project='bet-hebraico';
const url='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/66b99165aad2bf05cf86954cbaebddc00ebb2cc9/index.html';
const res=await fetch(url);
if(!res.ok)throw Error('Não foi possível ler a revisão fixa: '+res.status);
const html=await res.text();
const slice=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);if(i<0||j<0)throw Error('Revisão incompatível: '+a);return html.slice(i,j);};
const lessonData=slice('const lessons=','/* Pronúncia de referência:');
const soundData=slice('const lessonSounds=','function lessonAudioPanel');
const tutorData=slice('const tutorLessons=','let currentTutorLesson');
const quizLine=html.split('\n').find(x=>x.startsWith('const m2QuizData='));
if(!quizLine)throw Error('Exercícios ausentes');
const data=vm.runInNewContext(lessonData+'\n'+soundData+'\n'+tutorData+'\n'+quizLine+'\n({lessons,lessonSounds,tutorLessons,m2QuizData})',Object.create(null),{timeout:1500,codeGeneration:{strings:false,wasm:false}});
if(data.lessons.length!==10||data.lessonSounds.length!==10||data.tutorLessons.length!==10||data.m2QuizData.length!==5)throw Error('Contagem inesperada');
const docs=data.lessons.slice(5).map((lesson,n)=>{
 const i=n+5,id=String(i+1).padStart(2,'0');
 const doc={schemaVersion:1,title:lesson.title,subtitle:lesson.subtitle,body:lesson.body,sounds:data.lessonSounds[i],tutor:data.tutorLessons[i],quiz:data.m2QuizData[n]};
 if(typeof doc.body!=='string'||!doc.sounds.length||!doc.quiz.length||!doc.tutor.questions.length)throw Error('Aula inválida '+id);
 if((doc.body.match(/data-m2-question=/g)||[]).length!==doc.quiz.length)throw Error('Exercícios inconsistentes '+id);
 return {id,doc};
});
const val=v=>{
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='boolean')return {booleanValue:v};
 if(Number.isSafeInteger(v))return {integerValue:String(v)};
 if(Array.isArray(v))return {arrayValue:{values:v.map(val)}};
 if(v&&typeof v==='object')return {mapValue:{fields:fields(v)}};
 throw Error('Tipo não suportado');
};
const fields=obj=>Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,val(v)]));
console.log('Projeto:',project);
for(const {id,doc} of docs)console.log(id,doc.title,'—',doc.quiz.length,'exercícios');
if(!process.argv.includes('--apply')){
 console.log('Simulação concluída. Nenhum dado foi gravado. Use --apply somente após conferir o projeto.');
 process.exit(0);
}
const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim();
const base='projects/'+project+'/databases/(default)/documents';
const writes=docs.map(({id,doc})=>({update:{name:base+'/betPaidLessons/'+id,fields:fields(doc)},currentDocument:{exists:false}}));
const result=await fetch('https://firestore.googleapis.com/v1/'+base+':commit',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({writes})});
if(!result.ok){const error=await result.json().catch(()=>({}));throw Error('Importação não aplicada: '+result.status+' '+(error.error?.message||''));}
const confirmation=await result.json();
console.log('Importação concluída:',confirmation.writeResults?.length||0,'documentos. Nenhuma aula existente foi sobrescrita.');
