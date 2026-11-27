# Diagnostico direto do Mercado Pago. Somente a segunda assinatura ficticia.
$ErrorActionPreference='Stop'
$project='bet-hebraico'
$phase='configuracao'
function Read-Secret([string]$name){
 $v=((firebase.cmd functions:secrets:access $name --project $project) -join '').Trim()
 if($LASTEXITCODE -ne 0 -or !$v){throw 'Configuracao indisponivel'}
 return $v
}
function MP-Get([string]$path){
 Invoke-RestMethod ("https://api.mercadopago.com"+$path) -Method Get -Headers $h -TimeoutSec 25
}
function Check-Individual($sub,[string]$id){
 $r=$sub.auto_recurring
 if($id -notmatch '^[a-f0-9]{32}$' -or $id -eq $legacy.subscriptionId -or $sub.id -ne $id -or "$($sub.collector_id)" -ne "$($legacy.sellerId)" -or "$($sub.payer_id)" -ne "$($offer.payerId)" -or "$($sub.application_id)" -ne "$($offer.applicationId)" -or $sub.preapproval_plan_id -ne $legacy.planId -or $sub.external_reference -notmatch '^bet_[a-f0-9]{48}$' -or $r.currency_id -ne 'BRL' -or [decimal]$r.transaction_amount -ne 19.90 -or $r.frequency -ne 1 -or $r.frequency_type -ne 'months' -or $r.free_trial.frequency -ne 7 -or $r.free_trial.frequency_type -ne 'days'){throw 'Identidade da assinatura nao confirmada'}
}
function Safe-Message([string]$value){
 if(!$value){return 'nao informado'}
 $value=$value.Replace($token,'[oculto]')
 $value=$value -replace '(?i)(APP_USR|TEST)-[a-z0-9_-]+','[oculto]' -replace '(?i)https?://\S+','[url]' -replace '[^\s@]+@[^\s@]+','[email]' -replace '\b[a-fA-F0-9]{16,}\b','[id]' -replace '\d{5,}','[numero]' -replace '[\r\n\t]',' '
 if($value.Length -gt 240){$value=$value.Substring(0,240)}
 return $value
}
try{
 Write-Host '1/3 - Conferindo contas ficticias...'
 $legacy=Read-Secret 'BET_MP_TEST_CONFIG'|ConvertFrom-Json
 $offer=Read-Secret 'BET_MP_CHECKOUT_CONFIG'|ConvertFrom-Json
 $s=Import-Clixml "$env:LOCALAPPDATA\BET-Checkout-Teste\contas.xml"
 if($legacy.subscriptionId -notmatch '^[a-f0-9]{32}$' -or $legacy.planId -notmatch '^[a-f0-9]{32}$' -or "$($legacy.sellerId)" -notmatch '^\d+$' -or $offer.environment -ne 'test' -or $offer.enabled -ne $true -or $offer.allowedUid -ne $s.uid -or $s.uid -notmatch '^bet-test-[a-f0-9]{32}$' -or $offer.betEmail -ne $s.email -or $offer.allowedUid -eq $legacy.uid -or "$($offer.payerId)" -ne "$($s.buyerId)" -or "$($offer.payerId)" -notmatch '^\d+$' -or "$($offer.payerId)" -in @("$($legacy.sellerId)","$($legacy.payerId)") -or "$($offer.sellerId)" -ne "$($legacy.sellerId)" -or $offer.planId -ne $legacy.planId){throw 'Configuracao ficticia divergente'}
 $token=Read-Secret 'MP_TEST_ACCESS_TOKEN'
 $h=@{Authorization="Bearer $token"}
 $me=MP-Get '/users/me'
 if("$($me.id)" -ne "$($legacy.sellerId)" -or "$($me.nickname)" -notmatch '^TESTUSER'){throw 'Vendedor nao ficticio'}
 $phase='assinatura individual'
 Write-Host '2/3 - Localizando exclusivamente a segunda assinatura...'
 $p=MP-Get "/preapproval/search?payer_id=$($offer.payerId)&preapproval_plan_id=$($offer.planId)&limit=50&offset=0"
 if($null -eq $p.paging.total -or [int]$p.paging.total -ne 1 -or @($p.results).Count -ne 1){throw 'Busca ausente ou ambigua'}
 $id=$p.results[0].id
 if($id -notmatch '^[a-f0-9]{32}$' -or $id -eq $legacy.subscriptionId){throw 'Identificador invalido'}
 $sub=MP-Get "/preapproval/$id"
 Check-Individual $sub $id
 Write-Host "Status antes: $($sub.status)"
 if($sub.status -in @('canceled','cancelled')){Write-Host 'Ja cancelada. Nenhuma solicitacao enviada.';return}
 if($sub.status -ne 'authorized' -or [DateTimeOffset]::UtcNow -ge ([DateTimeOffset]::Parse($sub.date_created)).AddDays(7)){throw 'Estado inesperado; nenhuma solicitacao enviada'}
 $phase='resposta do Mercado Pago'
 Write-Host '3/3 - Enviando uma unica solicitacao direta de cancelamento ficticio...'
 try{
  $r=Invoke-RestMethod "https://api.mercadopago.com/preapproval/$id" -Method Put -Headers $h -ContentType 'application/json' -Body '{"status":"canceled"}' -TimeoutSec 25
 }catch{
  $e=$_
  $status=$null
  try{$status=[int]$e.Exception.Response.StatusCode}catch{}
  $raw=$e.ErrorDetails.Message
  if(!$raw){try{$reader=New-Object IO.StreamReader($e.Exception.Response.GetResponseStream());try{$raw=$reader.ReadToEnd()}finally{$reader.Dispose()}}catch{}}
  $data=$null
  try{$data=$raw|ConvertFrom-Json}catch{}
  Write-Host "MERCADO PAGO HTTP: $status"
  Write-Host "Erro: $(Safe-Message ([string]$data.error))"
  Write-Host "Mensagem: $(Safe-Message ([string]$data.message))"
  foreach($c in @($data.cause)|Select-Object -First 3){if($c){Write-Host "Causa: $(Safe-Message ([string]$c.code)) - $(Safe-Message ([string]$c.description))"}}
  Write-Host 'Cancelamento nao confirmado. Nao repita.'
  return
 }
 $phase='confirmacao independente'
 $after=MP-Get "/preapproval/$id"
 Check-Individual $after $id
 Write-Host "Status depois: $($after.status)"
 if($after.status -in @('canceled','cancelled')){Write-Host 'CANCELAMENTO CONFIRMADO NO MERCADO PAGO. Falta conferir sincronizacao no BET.' -ForegroundColor Green}
 else{Write-Host 'Cancelamento nao confirmado. Nao repita.'}
}catch{Write-Host "DIAGNOSTICO INCONCLUSIVO: $phase. Nao repita automaticamente." -ForegroundColor Yellow}
finally{Remove-Variable token,h,legacy,offer,s,raw,data,e -ErrorAction SilentlyContinue}
