$ErrorActionPreference='Stop'
$project='bet-hebraico'
if (!(Test-Path 'functions/index.js') -or !(Test-Path 'firebase.json')) { throw 'Abra o PowerShell na pasta do BET' }
$root=(Get-Location).Path
$tag=[guid]::NewGuid().ToString('N')
$stage=Join-Path $root "bet-webhook-stage-$tag"
$backup=Join-Path $root "bet-webhook-backup-$tag"
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/ab09357d74a0c60f79abbb26a2f94cdee98b30ab/functions'
$names=@('index.js','bet-test.js','bet-access-policy.js','bet-access-policy.test.js','bet-webhook-signature.js','bet-webhook-signature.test.js')
try {
 New-Item -ItemType Directory -Path $stage | Out-Null
 foreach($name in $names){
  Invoke-WebRequest "$base/$name" -UseBasicParsing -OutFile (Join-Path $stage $name)
  node --check (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw 'Sintaxe invalida'}
 }
 node (Join-Path $stage 'bet-access-policy.test.js')
 if($LASTEXITCODE -ne 0){throw 'Teste de acesso falhou'}
 node (Join-Path $stage 'bet-webhook-signature.test.js')
 if($LASTEXITCODE -ne 0){throw 'Teste de notificacao falhou'}
 Write-Host 'Cole somente a assinatura secreta dos Webhooks do vendedor FICTICIO quando o Firebase pedir.' -ForegroundColor Cyan
 firebase.cmd functions:secrets:set MP_TEST_WEBHOOK_SECRET --project $project
 if($LASTEXITCODE -ne 0){throw 'Segredo nao configurado'}
 New-Item -ItemType Directory -Path $backup | Out-Null
 foreach($name in $names){
  $dest=Join-Path $root "functions/$name"
  if(Test-Path $dest){Copy-Item $dest $backup}
  Copy-Item (Join-Path $stage $name) $dest -Force
 }
 node -e "require('./functions/index.js'); console.log('Servidor carregado')"
 if($LASTEXITCODE -ne 0){throw 'Falha no carregamento'}
 firebase.cmd deploy --only 'functions:betTestSubscription,functions:betTestWebhook' --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Publicacao nao concluida'}
 Write-Host 'WEBHOOK BET PUBLICADO - confira a Function URL acima.' -ForegroundColor Green
} finally {
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
}
