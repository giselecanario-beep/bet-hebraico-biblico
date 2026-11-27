$ErrorActionPreference='Stop'
& {
 $secretLines= @(firebase.cmd functions:secrets:access MP_TEST_WEBHOOK_SECRET --project bet-hebraico)
 if($LASTEXITCODE -ne 0){throw 'Falha na leitura do segredo'}
 $secret=($secretLines -join [Environment]::NewLine).Trim()
 if($secret.Length -lt 16){throw 'Segredo ausente ou incompleto'}
 $cfgRaw=(firebase.cmd functions:secrets:access BET_MP_TEST_CONFIG --project bet-hebraico) -join ''
 if($LASTEXITCODE -ne 0){throw 'Falha na leitura da configuracao'}
 $cfg=$cfgRaw | ConvertFrom-Json
 $id=$cfg.subscriptionId.ToLowerInvariant()
 if($id -notmatch '^[a-f0-9]{32}$'){throw 'ID incorreto'}
 $rid=[guid]::NewGuid().ToString()
 $ts=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
 $h=New-Object System.Security.Cryptography.HMACSHA256
 try{
  $h.Key=[Text.Encoding]::UTF8.GetBytes($secret)
  $msg="id:$($id);request-id:$($rid);ts:$($ts);"
  $sig=[BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($msg))).Replace('-','').ToLowerInvariant()
  $url="https://us-central1-bet-hebraico.cloudfunctions.net/betTestWebhook?data.id=$id"
  $tmp=[IO.Path]::GetTempFileName()
  try{
   # Unknown event type: authenticated endpoint must respond 200 without updating any data.
   [IO.File]::WriteAllText($tmp,('{"type":"bet_diagnostic","data":{"id":"'+$id+'"}}'),(New-Object Text.UTF8Encoding($false)))
   $unsigned= & curl.exe -sS --connect-timeout 15 --max-time 30 -o NUL -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" $url
   Write-Host "SEM ASSINATURA: HTTP $unsigned"
   $signed= & curl.exe -sS --connect-timeout 15 --max-time 30 -o NUL -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "x-request-id: $rid" -H "x-signature: ts=$ts,v1=$sig" --data-binary "@$tmp" $url
   Write-Host "COM ASSINATURA: HTTP $signed"
   if($unsigned -eq '401' -and $signed -eq '200'){Write-Host 'AUTENTICACAO DO BET OK' -ForegroundColor Green}
   else{Write-Host 'AUTENTICACAO AINDA NAO CONFIRMADA' -ForegroundColor Yellow}
  }finally{Remove-Item $tmp -Force -ErrorAction SilentlyContinue}
 }finally{
  $h.Dispose()
  Remove-Variable secret,secretLines,cfgRaw,sig -ErrorAction SilentlyContinue
 }
}
