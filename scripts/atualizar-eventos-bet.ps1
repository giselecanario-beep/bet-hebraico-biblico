$ErrorActionPreference='Stop'
$project='bet-hebraico'
if(!(Test-Path 'functions/index.js') -or !(Test-Path 'firebase.json')){throw 'Abra o PowerShell na pasta BET'}
$root=(Get-Location).Path
$tag=[guid]::NewGuid().ToString('N')
$stage=Join-Path $root "bet-stage-$tag"
$backup=Join-Path $root "bet-backup-$tag"
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/98dcc95aecb32a976b9d5fb57e4c2504093c92f3'
$names=@('bet-test.js','bet-access-policy.js','bet-access-policy.test.js','bet-webhook-signature.js','bet-webhook-signature.test.js','bet-payment-events.js','bet-payment-events.test.js','bet-checkout-binding.js','bet-checkout-binding.test.js')
try{
 New-Item -ItemType Directory -Path $stage | Out-Null
 foreach($name in $names){
  Invoke-WebRequest "$base/functions/$name" -UseBasicParsing -OutFile (Join-Path $stage $name)
  node --check (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw 'Sintaxe invalida'}
 }
 foreach($name in ($names | Where-Object {$_ -like '*.test.js'})){
  node (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw "Teste falhou: $name"}
 }
 $env:BET_TEMP_WEBHOOK_SECRET=((firebase.cmd functions:secrets:access MP_TEST_WEBHOOK_SECRET --project $project) -join [Environment]::NewLine).Trim()
 if($LASTEXITCODE -ne 0 -or $env:BET_TEMP_WEBHOOK_SECRET.Length -lt 16){throw 'Segredo de webhook indisponivel'}
 $cfg=((firebase.cmd functions:secrets:access BET_MP_TEST_CONFIG --project $project) -join '') | ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or $cfg.subscriptionId -notmatch '^[a-f0-9]{32}$'){throw 'Configuracao de teste invalida'}
 $env:BET_TEMP_SUB_ID=$cfg.subscriptionId
 New-Item -ItemType Directory -Path $backup | Out-Null
 foreach($name in @('bet-test.js','bet-payment-events.js')){
  $dest=Join-Path $root "functions/$name"
  if(Test-Path $dest){Copy-Item $dest $backup}
  Copy-Item (Join-Path $stage $name) $dest -Force
 }
 node -e "require('./functions/index.js'); console.log('Servidor carregado')"
 if($LASTEXITCODE -ne 0){throw 'Falha no carregamento'}
 firebase.cmd deploy --only functions:betTestWebhook --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Publicacao do webhook falhou'}
 Invoke-WebRequest "$base/scripts/testar-reconciliacao-webhook.cjs" -UseBasicParsing -OutFile (Join-Path $stage 'reconciliar.cjs')
 node (Join-Path $stage 'reconciliar.cjs')
 if($LASTEXITCODE -ne 0){throw 'Webhook publicado, mas teste interno nao confirmado'}
 Write-Host 'BET ATUALIZADO - TESTES INTERNOS CONCLUIDOS' -ForegroundColor Green
}finally{
 Remove-Item Env:BET_TEMP_WEBHOOK_SECRET,Env:BET_TEMP_SUB_ID -ErrorAction SilentlyContinue
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
}
