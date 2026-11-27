# Chamada direta da funcao BET, sem deploy, sem nova conta, sem alterar a assinatura original.
$ErrorActionPreference='Stop'
$phase='login ficticio'
try{
 Write-Host '1/3 - Autenticando a segunda conta ficticia...'
 $s=Import-Clixml "$env:LOCALAPPDATA\BET-Checkout-Teste\contas.xml"
 if($s.uid -notmatch '^bet-test-[a-f0-9]{32}$' -or $s.email -ne "$($s.uid)@example.invalid" -or !$s.authConfirmed){throw 'Conta invalida'}
 $html=[IO.File]::ReadAllText((Join-Path (Get-Location).Path 'public/index.html'))
 $m=[regex]::Match($html,'apiKey\s*:\s*["''](AIza[0-9A-Za-z_-]+)["'']')
 if(!$m.Success -or $html -notmatch 'projectId\s*:\s*["'']bet-hebraico["'']'){throw 'Projeto invalido'}
 $pw=[System.Net.NetworkCredential]::new('', $s.password).Password
 $login=Invoke-RestMethod "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$($m.Groups[1].Value)" -Method Post -ContentType 'application/json' -Body (@{email=$s.email;password=$pw;returnSecureToken=$true}|ConvertTo-Json -Compress) -TimeoutSec 25
 Remove-Variable pw
 if($login.localId -ne $s.uid -or !$login.idToken){throw 'Login invalido'}
 function Invoke-Bet([string]$action){
  try{
   $r=Invoke-RestMethod 'https://us-central1-bet-hebraico.cloudfunctions.net/betTestCheckout' -Method Post -ContentType 'application/json' -Headers @{Authorization=("Bearer "+$login.idToken)} -Body (@{data=@{action=$action;confirm=($action -eq 'cancel')}}|ConvertTo-Json -Compress) -TimeoutSec 105
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
   if($step -notin @('binding','seller','subscription-read','entitlement-protection','cancel-request','cancel-readback','reconcile')){$step='nao informada'}
   if("$mp" -notmatch '^[45][0-9]{2}$'){$mp='nao informado'}
   Write-Host "BET $action : HTTP $http; codigo=$code; etapa=$step; Mercado Pago HTTP=$mp" -ForegroundColor Yellow
   return $null
  }
 }
 $phase='consulta do vinculo'
 Write-Host '2/3 - Consultando assinatura individual pelo servidor BET...'
 $before=Invoke-Bet 'status'
 if(!$before -or $before.state -ne 'bound'){Write-Host 'Consulta nao confirmada. Nenhum cancelamento solicitado.';return}
 Write-Host "ANTES: status=$($before.status); acesso=$($before.active); motivo=$($before.reason)"
 if($before.cancelled -eq $true){Write-Host 'CANCELAMENTO JA CONFIRMADO. Nenhuma nova solicitacao.';return}
 if($before.status -ne 'authorized' -or $before.reason -ne 'trial' -or $before.active -ne $true){Write-Host 'Estado inesperado; nenhum cancelamento solicitado.';return}
 $phase='cancelamento da segunda conta'
 Write-Host '3/3 - Solicitando uma unica vez o cancelamento ficticio pelo BET...'
 $after=Invoke-Bet 'cancel'
 if($after -and $after.state -eq 'bound'){
  Write-Host "DEPOIS: status=$($after.status); acesso=$($after.active); motivo=$($after.reason)"
  if($after.cancelled -eq $true -and $after.active -eq $false){Write-Host 'CANCELAMENTO CONFIRMADO PELO BET' -ForegroundColor Green}
  else{Write-Host 'Resultado inconclusivo. Nao repita.'}
 }else{Write-Host 'Operacao nao confirmada. Nao repita.'}
}catch{Write-Host "Falha na etapa $phase. Nao repita automaticamente." -ForegroundColor Yellow}
finally{Remove-Variable s,login,pw -ErrorAction SilentlyContinue}
