$ErrorActionPreference='Stop'
$project='bet-hebraico'
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/c445ac00f1df424f506a072da2b36f077f36ac27'
if(!(Test-Path 'functions/index.js') -or !(Test-Path 'firebase.json')){throw 'Abra o PowerShell na pasta BET'}
$root=(Get-Location).Path
$tag=[guid]::NewGuid().ToString('N')
$stage=Join-Path $root "bet-invoices-stage-$tag"
$backup=Join-Path $root "bet-invoices-backup-$tag"
$files=@('bet-test.js','bet-payment-events.js','bet-invoice-pages.js')
$deps=@('bet-access-policy.js','bet-webhook-signature.js','bet-checkout-binding.js','bet-checkout-service.js','bet-checkout-store.js','bet-checkout-provider.js')
$tests=@('bet-access-policy.test.js','bet-webhook-signature.test.js','bet-payment-events.test.js','bet-checkout-binding.test.js','bet-checkout-service.test.js','bet-invoice-pages.test.js')
try{
 $cfg=((firebase.cmd functions:secrets:access BET_MP_TEST_CONFIG --project $project) -join '')|ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or $cfg.subscriptionId -notmatch '^[a-f0-9]{32}$'){throw 'Configuracao de teste invalida'}
 $token=((firebase.cmd functions:secrets:access MP_TEST_ACCESS_TOKEN --project $project) -join '').Trim()
 if($LASTEXITCODE -ne 0 -or !$token){throw 'Credencial indisponivel'}
 $h=@{Authorization="Bearer $token"}
 try{
  $me=Invoke-RestMethod 'https://api.mercadopago.com/users/me' -Headers $h -TimeoutSec 20
  if("$($me.id)" -ne "$($cfg.sellerId)" -or "$($me.nickname)" -notmatch '^TESTUSER'){throw 'Vendedor invalido'}
  $p=Invoke-RestMethod "https://api.mercadopago.com/authorized_payments/search?preapproval_id=$($cfg.subscriptionId)&limit=12&offset=0" -Headers $h -TimeoutSec 20
  if(!$p.PSObject.Properties['results'] -or $null -eq $p.paging.total -or [int]$p.paging.limit -ne 12 -or $null -eq $p.paging.offset -or [int]$p.paging.offset -ne 0){throw 'Paginacao invalida'}
 }catch{throw 'Limite 12 nao confirmado pelo Mercado Pago; nada publicado.'}
 Write-Host 'PAGINACAO CONFIRMADA NO MERCADO PAGO' -ForegroundColor Green
 New-Item -ItemType Directory -Path $stage | Out-Null
 foreach($name in ($files+$deps+$tests)){
  Invoke-WebRequest "$base/functions/$name" -UseBasicParsing -OutFile (Join-Path $stage $name)
  node --check (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw "Sintaxe invalida: $name"}
 }
 foreach($name in $tests){
  node (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw "Teste falhou: $name"}
 }
 New-Item -ItemType Directory -Path $backup | Out-Null
 foreach($name in $files){
  $dest=Join-Path $root "functions/$name"
  if(Test-Path $dest){Copy-Item $dest $backup}
  Copy-Item (Join-Path $stage $name) $dest -Force
 }
 node -e "require('./functions/index.js'); console.log('Servidor carregado')"
 if($LASTEXITCODE -ne 0){throw 'Falha no carregamento; nada publicado'}
 firebase.cmd deploy --only 'functions:betTestSubscription,functions:betTestCheckout,functions:betTestWebhook' --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Publicacao nao confirmada'}
 Write-Host 'CORRECAO DE FATURAS PUBLICADA - vendas reais continuam desativadas' -ForegroundColor Green
 & ([scriptblock]::Create((Invoke-WebRequest "$base/scripts/auditar-assinaturas-teste.ps1" -UseBasicParsing).Content))
}finally{
 Remove-Variable token,h,cfg,me,p -ErrorAction SilentlyContinue
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
}
