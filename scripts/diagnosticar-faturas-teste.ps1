# Diagnostico de faturas - somente GET, sem modificar assinaturas.
$ErrorActionPreference='Stop'
$project='bet-hebraico'
try{
 $cfg=((firebase.cmd functions:secrets:access BET_MP_TEST_CONFIG --project $project) -join '')|ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or $cfg.subscriptionId -notmatch '^[a-f0-9]{32}$' -or "$($cfg.sellerId)" -notmatch '^\d+$'){throw 'Configuracao invalida'}
 $token=((firebase.cmd functions:secrets:access MP_TEST_ACCESS_TOKEN --project $project) -join '').Trim()
 if($LASTEXITCODE -ne 0 -or !$token){throw 'Credencial indisponivel'}
 $h=@{Authorization="Bearer $token";'Content-Type'='application/json'}
 $me=Invoke-RestMethod 'https://api.mercadopago.com/users/me' -Headers $h -TimeoutSec 20
 if("$($me.id)" -ne "$($cfg.sellerId)" -or "$($me.nickname)" -notmatch '^TESTUSER'){throw 'Vendedor nao ficticio'}
 $id=$cfg.subscriptionId
 $base="https://api.mercadopago.com/authorized_payments/search?preapproval_id=$id"
 $variants=@(
  @{name='limite 20';url="$base&limit=20&offset=0"},
  @{name='sem paginacao explicita';url=$base},
  @{name='limite 1';url="$base&limit=1&offset=0"}
 )
 foreach($v in $variants){
  try{
   $p=Invoke-RestMethod $v.url -Method Get -Headers $h -TimeoutSec 20
   if(!$p.PSObject.Properties['results'] -or $null -eq $p.paging.total -or $null -eq $p.paging.offset -or $null -eq $p.paging.limit){Write-Host "$($v.name): HTTP 200, formato inesperado";continue}
   $rows=@($p.results|Where-Object {$null -ne $_})
   if(@($rows|Where-Object {$_.preapproval_id -ne $id}).Count -gt 0){Write-Host "$($v.name): HTTP 200, faturas de outra assinatura; rejeitado";continue}
   Write-Host "$($v.name): HTTP 200; total=$($p.paging.total); limite=$($p.paging.limit); offset=$($p.paging.offset); resultados=$($rows.Count)" -ForegroundColor Green
  }catch{
   $e=$_
   $status=$null
   try{$status=[int]$e.Exception.Response.StatusCode}catch{}
   $raw=$e.ErrorDetails.Message
   if(!$raw){try{$reader=New-Object IO.StreamReader($e.Exception.Response.GetResponseStream());try{$raw=$reader.ReadToEnd()}finally{$reader.Dispose()}}catch{}}
   $reason='nao identificado'
   if($raw -match '(?i)limit|pagination|offset|paginac'){$reason='paginacao'}
   elseif($raw -match '(?i)preapproval_id|preapproval id'){$reason='filtro de assinatura'}
   elseif($raw -match '(?i)test.user|sandbox|test account|test mode'){$reason='ambiente de teste'}
   elseif($raw -match '(?i)unauthoriz|forbidden|permission|access denied'){$reason='permissao'}
   elseif($raw -match '(?i)not found|no results'){$reason='registro nao encontrado'}
   Write-Host "$($v.name): HTTP $status; categoria=$reason" -ForegroundColor Yellow
  }
 }
 Write-Host 'DIAGNOSTICO FINALIZADO - nenhuma assinatura alterada.'
}catch{Write-Host 'DIAGNOSTICO INCONCLUSIVO - configuracao ou vendedor nao confirmado.'}
finally{Remove-Variable token,h,cfg,me,raw,e,reader,p -ErrorAction SilentlyContinue}
