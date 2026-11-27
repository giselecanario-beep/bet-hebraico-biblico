// BET_COMMERCIAL_UI_V1 — inserted inside existing Firebase module.
function betInitCommercialUI(){
 const $=id=>document.getElementById(id),panel=$('bet-profile-subscription-title')?.closest('section');
 if(!panel||$('bet-live-panel'))return;
 const section=document.createElement('div');section.id='bet-live-panel';
 section.innerHTML=`<h3>BET completo</h3>
 <p><strong>R$ 19,90 por mês · 7 dias grátis</strong></p>
 <p class="small">Após o teste gratuito, a cobrança será mensal e automática até o cancelamento. As cinco primeiras aulas continuam gratuitas.</p>
 <p id="bet-live-status" role="status" aria-live="polite">Consulte sua assinatura para começar.</p>
 <button class="secondary" type="button" id="bet-live-refresh">Consultar assinatura</button>
 <button class="secondary" type="button" id="bet-live-verify" hidden>Confirmar e-mail</button>
 <button class="secondary" type="button" id="bet-live-recover" hidden>Recuperar contratação pendente</button>
 <button class="secondary" type="button" id="bet-live-cancel" hidden>Cancelar renovação</button>
 <button class="secondary" type="button" id="bet-live-pilot-id" hidden>Copiar identificação da conta piloto</button>
 <form id="bet-live-form" hidden>
 <p class="small">Os dados do cartão são processados pelo Mercado Pago.</p>
 <label for="bet-live-number">Número do cartão</label><div id="bet-live-number" style="height:44px;border:1px solid #777;border-radius:6px"></div>
 <label for="bet-live-expiration">Validade</label><div id="bet-live-expiration" style="height:44px;border:1px solid #777;border-radius:6px"></div>
 <label for="bet-live-security">Código de segurança</label><div id="bet-live-security" style="height:44px;border:1px solid #777;border-radius:6px"></div>
 <label for="bet-live-name">Titular do cartão</label><input id="bet-live-name" type="text" autocomplete="cc-name" required>
 <label for="bet-live-issuer">Emissor</label><select id="bet-live-issuer"></select>
 <label for="bet-live-installments">Parcelas</label><select id="bet-live-installments"></select>
 <label for="bet-live-doc-type">Tipo de documento</label><select id="bet-live-doc-type"></select>
 <label for="bet-live-doc">Documento</label><input id="bet-live-doc" type="text" autocomplete="off">
 <label for="bet-live-email">E-mail da conta BET</label><input id="bet-live-email" type="email" readonly>
 <label style="display:flex;align-items:flex-start;gap:10px;margin:16px 0"><input id="bet-live-consent" type="checkbox" style="width:20px;height:20px;flex:none"><span>Autorizo a assinatura com sete dias gratuitos e, após esse período, a cobrança automática de R$ 19,90 por mês. Posso cancelar a renovação em Meu perfil. O cancelamento durante o teste encerra o acesso exclusivo; após cobrança aprovada, o período pago permanece disponível até o vencimento.</span></label>
 <button id="bet-live-submit" type="submit" class="primary" disabled>Iniciar 7 dias grátis</button>
 </form>`;
 panel.appendChild(section);
 const pilot=location.hostname==='bet-hebraico.web.app'||/^bet-hebraico--comercial-piloto-[a-z0-9-]+\.web\.app$/.test(location.hostname);
 const form=$('bet-live-form'),msg=$('bet-live-status'),consent=$('bet-live-consent'),submit=$('bet-live-submit');
 let epoch=0,uid=null,setup=null,card=null,ready=false,busy=false,sdkPromise=null;
 const isCurrent=(e,u)=>epoch===e&&auth.currentUser?.uid===u;
 const call=async(action,extra={})=>{
  const {getFunctions,httpsCallable}=await import('https://www.gstatic.com/firebasejs/13.4.0/firebase-functions.js');
  return (await httpsCallable(getFunctions(app,'us-central1'),'betCommercialCheckout',{timeout:125000})({action,...extra})).data;
 };
 function clear(){try{card?.unmount?.();}catch{}card=null;ready=false;consent.checked=false;submit.disabled=true;form.hidden=true;for(const id of ['bet-live-name','bet-live-doc','bet-live-email'])$(id).value='';}
 function buttons(data){$('bet-live-recover').hidden=!['reserved','uncertain'].includes(data.state);$('bet-live-cancel').hidden=data.state!=='bound'||data.cancelled===true;}
 function state(data){
  buttons(data);
  if(data.state==='bound'){
   clear();msg.textContent=data.cancelled?(data.reconciliationPending?'Renovação cancelada. Atualização do acesso pendente; consulte novamente.':'Renovação cancelada. '+(data.active?'Acesso pago até '+new Date(data.validUntil).toLocaleDateString('pt-BR')+'.':'Acesso exclusivo encerrado.')):data.active?'Acesso exclusivo válido até '+new Date(data.validUntil).toLocaleDateString('pt-BR')+'.':'Assinatura vinculada; consulte o status.';
   void window.betConsultarAssinatura?.(auth.currentUser);
  }else if(['reserved','uncertain'].includes(data.state)){clear();msg.textContent='Contratação em confirmação. Use Recuperar contratação pendente. Não contrate novamente.';}
  else if(data.state==='protected'){clear();msg.textContent='Seu acesso já é administrado pelo BET; não é necessário assinar.';}
 }
 function loadSDK(){return sdkPromise||(sdkPromise=new Promise((resolve,reject)=>{if(window.MercadoPago){resolve();return;}const s=document.createElement('script');s.src='https://sdk.mercadopago.com/js/v2';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);}).catch(e=>{sdkPromise=null;throw e;}));}
 async function mount(e,u){
  clear();await loadSDK();if(!isCurrent(e,u)||!setup?.enabled||!setup.verified)return;
  form.hidden=false;$('bet-live-email').value=setup.payerEmail;
  const mp=new window.MercadoPago(setup.publicKey,{locale:'pt-BR'});
  card=mp.cardForm({amount:'19.90',iframe:true,form:{id:'bet-live-form',cardNumber:{id:'bet-live-number',placeholder:'Número do cartão'},expirationDate:{id:'bet-live-expiration',placeholder:'MM/AA'},securityCode:{id:'bet-live-security',placeholder:'CVV'},cardholderName:{id:'bet-live-name'},issuer:{id:'bet-live-issuer'},installments:{id:'bet-live-installments'},identificationType:{id:'bet-live-doc-type'},identificationNumber:{id:'bet-live-doc'},cardholderEmail:{id:'bet-live-email'}},callbacks:{
   onFormMounted:error=>{if(!isCurrent(e,u))return;ready=!error;submit.disabled=!ready||!consent.checked;if(error)msg.textContent='Não foi possível carregar o formulário.';},
   onSubmit:async event=>{
    event.preventDefault();if(!isCurrent(e,u)||busy||!ready||!consent.checked)return;
    busy=true;submit.disabled=true;msg.textContent='Confirmando assinatura…';
    try{const d=card.getCardFormData();if(!d?.token||String(d.cardholderEmail).toLowerCase()!==setup.payerEmail.toLowerCase())throw Error('invalid token');
     const result=await call('create',{cardToken:d.token,consent:true,consentVersion:setup.consentVersion});
     if(!isCurrent(e,u))return;clear();state(result);
     if(result.state==='bound'){const latest=await call('status');if(isCurrent(e,u))state(latest);}
    }catch{if(isCurrent(e,u)){clear();msg.textContent='Operação não confirmada. Consulte a assinatura antes de tentar novamente.';}}
    finally{if(isCurrent(e,u))busy=false;}
   }
  }});
 }
 async function refresh(){
  if(busy)return;
  const user=auth.currentUser;if(!user){msg.textContent='Entre na sua conta BET primeiro.';return;}
  const e=++epoch,u=user.uid;uid=u;busy=true;clear();setup=null;buttons({});$('bet-live-verify').hidden=true;$('bet-live-pilot-id').hidden=true;
  msg.textContent='Consultando assinatura…';
  try{
   await user.reload();await user.getIdToken(true);if(!isCurrent(e,u))return;
   const data=await call('setup');if(!isCurrent(e,u))return;setup=data;
   if(data.protectedAccess){state({state:'protected'});return;}
   $('bet-live-pilot-id').hidden=!(pilot&&data.verified&&!data.enabled);
   if(!data.verified){$('bet-live-verify').hidden=false;msg.textContent='Confirme seu e-mail e depois consulte a assinatura novamente.';return;}
   const result=await call('status');if(!isCurrent(e,u))return;
   if(result.state==='none'){if(!data.enabled){msg.textContent='Contratações ainda fechadas.';return;}msg.textContent='Preencha o formulário para começar os sete dias gratuitos.';await mount(e,u);}
   else state(result);
  }catch{if(isCurrent(e,u))msg.textContent='Não foi possível consultar a assinatura. Tente novamente.';}
  finally{if(isCurrent(e,u))busy=false;}
 }
 async function manage(action){
  const u=uid,e=epoch;if(busy||!isCurrent(e,u))return;
  if(action==='cancel'&&!confirm('Cancelar a renovação? Seu progresso não será apagado.'))return;
  busy=true;try{const result=await call(action,{confirm:action==='cancel'});if(!isCurrent(e,u))return;state(result);if(action==='recover'&&result.state==='bound'){const latest=await call('status');if(isCurrent(e,u))state(latest);}}
  catch{if(isCurrent(e,u))msg.textContent='Operação não confirmada. Consulte novamente.';}finally{if(isCurrent(e,u))busy=false;}
 }
 consent.addEventListener('change',()=>submit.disabled=!ready||!consent.checked||busy);
 form.addEventListener('submit',e=>e.preventDefault());
 $('bet-live-refresh').addEventListener('click',refresh);
 $('bet-live-recover').addEventListener('click',()=>manage('recover'));
 $('bet-live-cancel').addEventListener('click',()=>manage('cancel'));
 $('bet-live-verify').addEventListener('click',async()=>{const user=auth.currentUser,e=epoch;if(!user)return;try{const {sendEmailVerification}=await import('https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js');await sendEmailVerification(user);if(isCurrent(e,user.uid))msg.textContent='Confirmação enviada. Confira sua caixa de entrada e spam.';}catch{if(isCurrent(e,user.uid))msg.textContent='Não foi possível enviar a confirmação.';}});
 $('bet-live-pilot-id').addEventListener('click',async()=>{if(!pilot||!auth.currentUser?.emailVerified||setup?.enabled||setup?.protectedAccess)return;try{await navigator.clipboard.writeText(auth.currentUser.uid);msg.textContent='Identificação da sua conta copiada. Não é uma senha.';}catch{msg.textContent='Não foi possível copiar a identificação.';}});
 onAuthStateChanged(auth,user=>{epoch++;uid=user?.uid||null;busy=false;setup=null;clear();buttons({});$('bet-live-verify').hidden=true;$('bet-live-pilot-id').hidden=true;msg.textContent=user?'Clique em Consultar assinatura.':'Entre na sua conta BET.';});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',betInitCommercialUI,{once:true});else betInitCommercialUI();
