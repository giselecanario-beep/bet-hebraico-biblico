# BET comercial: valida credenciais reais, configura plano e publica checkout FECHADO.
$ErrorActionPreference='Stop'
$project='bet-hebraico'
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/b94537262efbf7f620e674807d197cf03f80329f'
if(!(Test-Path 'firebase.json') -or !(Test-Path 'functions/index.js') -or !(Test-Path 'public/index.html')){throw 'Abra o PowerShell na pasta BET'}
function Invoke-BetMercadoPago([string]$path,[string]$method='GET',$body=$null){
 $argsMP=@{Uri=("https://api.mercadopago.com"+$path);Headers=@{Authorization="Bearer $token"};Method=$method;TimeoutSec=25}
 if($null -ne $body){$argsMP.ContentType='application/json';$argsMP.Body=($body|ConvertTo-Json -Depth 8 -Compress)}
 Invoke-RestMethod @argsMP
}
function PlanOK($p){
 $r=$p.auto_recurring
 return ($p.id -match '^[a-f0-9]{32}$' -and "$($p.collector_id)" -eq "$($me.id)" -and "$($p.application_id)" -eq $appId -and $p.status -eq 'active' -and $r.frequency -eq 1 -and $r.frequency_type -eq 'months' -and $r.currency_id -eq 'BRL' -and [decimal]$r.transaction_amount -eq 19.90 -and $r.free_trial.frequency -eq 7 -and $r.free_trial.frequency_type -eq 'days')
}
function Save-BetSecret([string]$name,[string]$value){
 $value | firebase.cmd functions:secrets:set $name --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Falha ao salvar segredo no Firebase'}
}
$stage=Join-Path ([IO.Path]::GetTempPath()) ('bet-live-'+[guid]::NewGuid().ToString('N'))
try{
 Write-Host '1/4 - Credenciais de PRODUCAO da conta real (nao use a conta TESTE).' -ForegroundColor Cyan
 $valid=$false
 for($attempt=1;$attempt -le 3;$attempt++){
  $secure=Read-Host 'Copie especificamente o ACCESS TOKEN de producao (oculto)' -AsSecureString
  $token=[System.Net.NetworkCredential]::new('',$secure).Password.Trim()
  if($token -match '^APP_USR-[a-fA-F0-9-]{36}$'){
   Write-Host 'Essa chave tem o formato de Public Key. Copie o campo Access Token, que e diferente.' -ForegroundColor Yellow
   continue
  }
  if($token -notmatch '^APP_USR-[A-Za-z0-9-]{30,}$'){
   Write-Host 'Formato do Access Token invalido. Copie o campo completo de producao.' -ForegroundColor Yellow
   continue
  }
  try{$me=Invoke-BetMercadoPago '/users/me'}catch{
   $status=0;try{$status=[int]$_.Exception.Response.StatusCode}catch{}
   if($status -in @(401,403)){Write-Host "Access Token nao aceito pelo Mercado Pago (HTTP $status). Confira o campo e tente novamente." -ForegroundColor Yellow;continue}
   if($status){Write-Host "Consulta ao Mercado Pago falhou (HTTP $status)."}else{Write-Host 'Nao foi possivel consultar a API.'}
   return
  }
  if("$($me.id)" -notmatch '^\d+$' -or "$($me.id)" -in @('3875619579','3880684960') -or !$me.nickname -or $me.nickname -match '^TESTUSER'){
   Write-Host 'A API nao confirmou um vendedor real. Confira se voce esta na conta real, e nao TESTE.' -ForegroundColor Yellow
   return
  }
  $valid=$true;break
 }
 if(!$valid){Write-Host 'Access Token nao validado; nenhuma alteracao realizada.';return}
 Write-Host 'Access Token validado no Mercado Pago.' -ForegroundColor Green
 $publicKey=(Read-Host 'Agora cole a Public Key de producao').Trim()
 if($publicKey -notmatch '^APP_USR-[a-fA-F0-9-]{36}$'){Write-Host 'Formato da Public Key invalido.';return}
 $appId=(Read-Host 'Cole o ID numerico da aplicacao real').Trim()
 if($appId -notmatch '^\d{6,25}$' -or $appId -eq '3362162224734954'){Write-Host 'ID da aplicacao invalido ou ficticio.';return}
 Write-Host 'Vendedor real confirmado.'
 Write-Host '2/4 - Localizando plano comercial de R$ 19,90 e 7 dias gratuitos...'
 $matches=@();$limit=12;$done=$false
 for($offset=0;$offset -lt 400;$offset+=$limit){
  $page=Invoke-BetMercadoPago "/preapproval_plan/search?limit=$limit&offset=$offset"
  if($null -eq $page.paging.total -or [int]$page.paging.offset -ne $offset){throw 'Busca de planos incompleta'}
  $rows=@($page.results|Where-Object {$_})
  $matches+=@($rows|Where-Object { $_.reason -match 'BET' -and (PlanOK $_) })
  if($offset+$rows.Count -ge [int]$page.paging.total){$done=$true;break}
  if($rows.Count -ne $limit){throw 'Paginacao incompleta; nenhum plano criado'}
 }
 if(!$done){throw 'Busca incompleta; nenhum plano criado'}
 if($matches.Count -gt 1){throw 'Mais de um plano BET encontrado; selecao manual necessaria'}
 if($matches.Count -eq 1){$p=Invoke-BetMercadoPago "/preapproval_plan/$($matches[0].id)"}
 else{
  Write-Host 'Nenhum plano compativel encontrado. Criar plano BET comercial (nao cobra ninguem e nao cria assinatura)?'
  if((Read-Host 'Digite CRIAR para confirmar') -cne 'CRIAR'){return}
  $p=Invoke-BetMercadoPago '/preapproval_plan' 'POST' @{reason='BET | Hebraico Biblico';back_url='https://bet-hebraico.web.app/';auto_recurring=@{frequency=1;frequency_type='months';transaction_amount=19.90;currency_id='BRL';free_trial=@{frequency=7;frequency_type='days'}}}
  if($p.id -notmatch '^[a-f0-9]{32}$'){throw 'Criacao do plano inconclusiva; nao repita'}
  $p=Invoke-BetMercadoPago "/preapproval_plan/$($p.id)"
 }
 if(!(PlanOK $p)){throw 'Plano nao confirmado; nao abra vendas'}
 Write-Host 'Plano comercial confirmado.'
 Write-Host '3/4 - Salvando configuracao real no Firebase, com vendas FECHADAS...'
 $cfg=@{environment='production';salesEnabled=$false;launchMode='closed';sellerId="$($me.id)";applicationId=$appId;planId=$p.id;priceCents=1990;currency='BRL';trialDays=7;interval='monthly';publicKey=$publicKey}
 Save-BetSecret 'MP_LIVE_ACCESS_TOKEN' $token
 Save-BetSecret 'BET_MP_LIVE_CONFIG' ($cfg|ConvertTo-Json -Compress)
 Write-Host '4/4 - Publicando somente o novo checkout fechado...'
 New-Item -ItemType Directory -Path $stage|Out-Null
 $names=@('bet-commercial-core.js','bet-commercial-store.js','bet-commercial-provider.js','bet-commercial-events.js','bet-commercial.js')
 foreach($name in $names){
  Invoke-WebRequest "$base/functions/$name" -UseBasicParsing -TimeoutSec 30 -OutFile (Join-Path $stage $name)
  node --check (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw 'Sintaxe invalida; nada publicado'}
 }
 foreach($name in $names){Copy-Item (Join-Path $stage $name) (Join-Path 'functions' $name) -Force}
 $index=[IO.File]::ReadAllText((Join-Path (Get-Location).Path 'functions/index.js'))
 if($index -notmatch 'exports\.betCommercialCheckout'){
  Add-Content 'functions/index.js' -Value 'exports.betCommercialCheckout=require("./bet-commercial").betCommercialCheckout;'
 }
 node -e "require('./functions/index.js')"
 if($LASTEXITCODE -ne 0){throw 'Carregamento invalido; nada publicado'}
 firebase.cmd deploy --only 'functions:betCommercialCheckout' --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Publicacao nao confirmada'}
 Write-Host 'CONFIGURACAO COMERCIAL CONCLUIDA - CHECKOUT FECHADO; NENHUMA COBRANCA OU ASSINATURA CRIADA.' -ForegroundColor Green
 }catch{
 $http=$null
 try{$http=[int]$_.Exception.Response.StatusCode}catch{}
 if($http){Write-Host "HTTP do provedor: $http" -ForegroundColor Yellow}
 Write-Host 'Etapa interrompida. Nao repita automaticamente. Envie apenas a ultima etapa exibida, sem credenciais.' -ForegroundColor Yellow
}finally{
 Remove-Variable token,secure,cfg,argsMP -ErrorAction SilentlyContinue
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
}
