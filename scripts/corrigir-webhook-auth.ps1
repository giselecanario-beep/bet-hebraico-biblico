$ErrorActionPreference='Stop'
$project='bet-hebraico'
if(!(Test-Path 'functions/index.js') -or !(Test-Path 'firebase.json')){throw 'Abra o PowerShell na pasta BET'}
$root=(Get-Location).Path
$tag=[guid]::NewGuid().ToString('N')
$stage=Join-Path $root "bet-diag-$tag"
$backup=Join-Path $root "bet-diag-backup-$tag"
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/291909651e6839b3997029dd974745549e53dcef'
$files=@('bet-test.js','bet-webhook-signature.js','bet-webhook-signature.test.js')
try{
 New-Item -ItemType Directory -Path $stage | Out-Null
 foreach($name in $files){
  Invoke-WebRequest "$base/functions/$name" -UseBasicParsing -OutFile (Join-Path $stage $name)
  node --check (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw 'Erro de sintaxe'}
 }
 node (Join-Path $stage 'bet-webhook-signature.test.js')
 if($LASTEXITCODE -ne 0){throw 'Testes falharam'}
 New-Item -ItemType Directory -Path $backup | Out-Null
 foreach($name in $files){
  $dest=Join-Path $root "functions/$name"
  if(Test-Path $dest){Copy-Item $dest $backup}
  Copy-Item (Join-Path $stage $name) $dest -Force
 }
 firebase.cmd deploy --only functions:betTestWebhook --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Publicacao do webhook falhou'}
 & ([scriptblock]::Create((Invoke-WebRequest 'https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/f0f79f8d98a1fbcf41613eab9cef2f2b1d4eec3d/scripts/diagnosticar-webhook.ps1' -UseBasicParsing).Content))
 $headers= & curl.exe -sS --connect-timeout 15 --max-time 20 -D - -o NUL -X POST 'https://us-central1-bet-hebraico.cloudfunctions.net/betTestWebhook'
 $headers | Where-Object {$_ -match '^HTTP/|^x-bet-webhook:'}
 Start-Sleep -Seconds 5
 Write-Host 'DIAGNOSTICO DO SERVIDOR:'
 $logs= @(firebase.cmd functions:log --only betTestWebhook --lines 30 --project $project)
 $matchesFound= @($logs | Select-String 'BET_WEBHOOK_DIAG [a-z-]+' -AllMatches | ForEach-Object {$_.Matches.Value})
 if($matchesFound.Count -gt 0){$matchesFound | Select-Object -Last 8}else{Write-Host 'Sem registros de diagnostico disponiveis ainda.'}
 Write-Host 'DIAGNOSTICO CONCLUIDO' -ForegroundColor Green
}finally{if(Test-Path $stage){Remove-Item $stage -Recurse -Force}}
