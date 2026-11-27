$ErrorActionPreference='Stop'
$project='bet-hebraico'
if(!(Test-Path 'functions/bet-test.js') -or !(Test-Path 'firebase.json')){throw 'Abra o PowerShell na pasta BET'}
$root=(Get-Location).Path
$tag=[guid]::NewGuid().ToString('N')
$stage=Join-Path $root "bet-diag-$tag"
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/861c7194e27d7ceb209f514810d90fe59882ba15'
try{
 New-Item -ItemType Directory -Path $stage | Out-Null
 Invoke-WebRequest "$base/functions/bet-test.js" -UseBasicParsing -OutFile (Join-Path $stage 'bet-test.js')
 node --check (Join-Path $stage 'bet-test.js')
 if($LASTEXITCODE -ne 0){throw 'Sintaxe invalida'}
 Copy-Item 'functions/bet-test.js' "bet-test-backup-$tag.js"
 Copy-Item (Join-Path $stage 'bet-test.js') 'functions/bet-test.js' -Force
 firebase.cmd deploy --only functions:betTestWebhook --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Publicacao do webhook falhou'}
 $env:BET_TEMP_WEBHOOK_SECRET=((firebase.cmd functions:secrets:access MP_TEST_WEBHOOK_SECRET --project $project) -join [Environment]::NewLine).Trim()
 if($LASTEXITCODE -ne 0){throw 'Falha ao consultar segredo'}
 $cfg=((firebase.cmd functions:secrets:access BET_MP_TEST_CONFIG --project $project) -join '') | ConvertFrom-Json
 if($LASTEXITCODE -ne 0){throw 'Falha ao consultar configuracao'}
 $env:BET_TEMP_SUB_ID=$cfg.subscriptionId
 Invoke-WebRequest 'https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/integracao-assinaturas-teste/scripts/diagnosticar-webhook-node.cjs' -UseBasicParsing -OutFile (Join-Path $stage 'diagnostico.cjs')
 node (Join-Path $stage 'diagnostico.cjs')
 if($LASTEXITCODE -ne 0){throw 'Diagnostico falhou'}
 Write-Host 'DIAGNOSTICO DIRETO CONCLUIDO'
}finally{
 Remove-Item Env:BET_TEMP_WEBHOOK_SECRET,Env:BET_TEMP_SUB_ID -ErrorAction SilentlyContinue
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
}
