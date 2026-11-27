# Diagnostico da segunda assinatura ficticia; nunca cancela a original.
$ErrorActionPreference='Stop'
$project='bet-hebraico'
$phase='preparacao'
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/2d8591d38564b8c2cee4c7588cd2c1e820bee8e4'
if(!(Test-Path 'functions/index.js') -or !(Test-Path 'public/index.html') -or !(Test-Path 'firebase.json')){throw 'Abra o PowerShell na pasta BET'}
$stage=Join-Path ([IO.Path]::GetTempPath()) ('bet-cancel-'+[guid]::NewGuid().ToString('N')+'.js')
function Call-Bet([string]$action){
 try{
  $r=Invoke-RestMethod "https://us-central1-bet-hebraico.cloudfunctions.net/betTestCheckout" -Method Post -ContentType 'application/json' -Headers @{Authorization=("Bearer "+$login.idToken)} -Body (@{data=@{action=$action;confirm=($action -eq 'cancel')}}|ConvertTo-Json -Compress) -TimeoutSec 115
  if(!$r.PSObject.Properties['result']){throw 'Resposta inesperada'}
  return $r.result
 }catch{
  $e=$_
  $http=$null
  try{$http=[int]$e.Exception.Response.StatusCode}catch{}
  $raw=$e.ErrorDetails.Message
  if(!$raw){try{$reader=New-Object IO.StreamReader($e.Exception.Response.GetResponseStream());try{$raw=$reader.ReadToEnd()}finally{$reader.Dispose()}}catch{}}
  $data=$null
  try{$data=$raw|ConvertFrom-Json}catch{}
  $code=$data.error.status
  $step=$data.error.details.phase
  $mp=$data.error.details.providerHttp
  if($code -notmatch '^[A-Z_]{1,40}$'){$code='INDEFINIDO'}
  if($step -notin @('binding','seller','subscription-read','entitlement-protection','cancel-request','cancel-readback','reconcile')){$step='indefinida'}
  if("$mp" -notmatch '^[45][0-9]{2}$'){$mp='nao informado'}
  Write-Host "BET $action : HTTP $http; codigo=$code; etapa=$step; Mercado Pago HTTP=$mp" -ForegroundColor Yellow
  return $null
 }
}
try{
 $state=Import-Clixml "$env:LOCALAPPDATA\BET-Checkout-Teste\contas.xml"
 if($state.uid -notmatch '^bet-test-[a-f0-9]{32}$' -or $state.email -ne "$($state.uid)@example.invalid" -or !$state.authConfirmed){throw 'Conta ficticia nao confirmada'}
 $offer=((firebase.cmd functions:secrets:access BET_MP_CHECKOUT_CONFIG --project $project) -join '')|ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or $offer.environment -ne 'test' -or $offer.enabled -ne $true -or $offer.allowedUid -ne $state.uid -or $offer.betEmail -ne $state.email -or "$($offer.payerId)" -ne "$($state.buyerId)"){throw 'Configuracao ficticia nao confere'}
 $legacy=((firebase.cmd functions:secrets:access BET_MP_TEST_CONFIG --project $project) -join '')|ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or !$legacy.uid -or !$legacy.payerId -or $legacy.uid -eq $state.uid -or "$($legacy.payerId)" -eq "$($offer.payerId)"){throw 'Assinatura original protegida'}
 $html=[IO.File]::ReadAllText((Join-Path (Get-Location).Path 'public/index.html'))
 $m=[regex]::Match($html,'apiKey\s*:\s*["''](AIza[0-9A-Za-z_-]+)["'']')
 if(!$m.Success -or $html -notmatch 'projectId\s*:\s*["'']bet-hebraico["'']'){throw 'Projeto invalido'}
 $pw=[System.Net.NetworkCredential]::new('', $state.password).Password
 $login=Invoke-RestMethod "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$($m.Groups[1].Value)" -Method Post -ContentType 'application/json' -Body (@{email=$state.email;password=$pw;returnSecureToken=$true}|ConvertTo-Json -Compress) -TimeoutSec 25
 Remove-Variable pw
 if($login.localId -ne $state.uid -or !$login.idToken){throw 'Login nao confirmado'}
 $phase='publicacao de diagnostico'
 Invoke-WebRequest "$base/functions/bet-test.js" -UseBasicParsing -OutFile $stage
 node --check $stage
 if($LASTEXITCODE -ne 0){throw 'Sintaxe invalida'}
 $backup=Join-Path ([IO.Path]::GetTempPath()) ('bet-test-backup-'+[guid]::NewGuid().ToString('N')+'.js')
 Copy-Item 'functions/bet-test.js' $backup
 Copy-Item $stage 'functions/bet-test.js' -Force
 node -e "require('./functions/index.js')"
 if($LASTEXITCODE -ne 0){Copy-Item $backup 'functions/bet-test.js' -Force;throw 'Falha no carregamento'}
 firebase.cmd deploy --only functions:betTestCheckout --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Publicacao nao confirmada'}
 Write-Host 'DIAGNOSTICO PUBLICADO. Vendas reais continuam desativadas.'
 $phase='consulta individual'
 # Renovar login apos deploy caso necessario, sem imprimir credenciais.
 $before=Call-Bet 'status'
 if(!$before -or $before.state -ne 'bound'){Write-Host 'Consulta nao confirmada; nenhuma nova solicitacao de cancelamento.';return}
 Write-Host "ANTES: status=$($before.status); acesso=$($before.active); motivo=$($before.reason)"
 if($before.cancelled -eq $true){Write-Host 'CANCELAMENTO JA CONFIRMADO. Nenhuma nova solicitacao.';return}
 if($before.status -ne 'authorized' -or $before.reason -ne 'trial' -or $before.active -ne $true){Write-Host 'Estado inesperado; nenhuma solicitacao enviada.';return}
 $phase='cancelamento individual'
 # A execucao deste programa solicita uma unica vez o cancelamento da segunda conta.
 $after=Call-Bet 'cancel'
 if($after -and $after.state -eq 'bound'){
  Write-Host "DEPOIS: status=$($after.status); acesso=$($after.active); motivo=$($after.reason)"
  if($after.cancelled -eq $true -and $after.active -eq $false){Write-Host 'CANCELAMENTO CONFIRMADO PELO BET - primeira assinatura preservada.' -ForegroundColor Green}
  else{Write-Host 'Cancelamento ou acesso ainda nao confirmado. Nao repita.'}
 }else{Write-Host 'Operacao nao confirmada. Nao repita o cancelamento.'}
}catch{
 Write-Host "DIAGNOSTICO INCONCLUSIVO: $phase. Nao repita automaticamente." -ForegroundColor Yellow
}finally{
 Remove-Variable state,offer,legacy,login,pw -ErrorAction SilentlyContinue
 if(Test-Path $stage){Remove-Item $stage -Force}
}
