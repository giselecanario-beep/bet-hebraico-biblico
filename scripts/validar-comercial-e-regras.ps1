# Validacao local do BET comercial. Nao publica e nao acessa credenciais.
$ErrorActionPreference='Stop'
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/5e24249c60b53950b89b2adbd3cf0fa546f12fac'
$stage=Join-Path ([IO.Path]::GetTempPath()) ('bet-commercial-check-'+[guid]::NewGuid().ToString('N'))
$names=@('bet-commercial-core.js','bet-commercial-store.js','bet-commercial-provider.js','bet-commercial-events.js','bet-commercial.test.js','bet-commercial-events.test.js','bet-access-policy.js','bet-invoice-pages.js','bet-webhook-signature.js','bet-access-policy.test.js','bet-invoice-pages.test.js','bet-webhook-signature.test.js')
try{
 Write-Host '1/3 - Validando codigo comercial em pasta temporaria...'
 New-Item -ItemType Directory -Path $stage | Out-Null
 foreach($name in $names){
  Invoke-WebRequest "$base/functions/$name" -UseBasicParsing -TimeoutSec 30 -OutFile (Join-Path $stage $name)
  node --check (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw "Sintaxe invalida: $name"}
 }
 Write-Host '2/3 - Executando testes locais sem rede de pagamentos...'
 foreach($name in ($names | Where-Object {$_ -like '*.test.js'})){
  node (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw "Teste falhou: $name"}
 }
 Write-Host '3/3 - Identificando regras locais para revisao, sem alteracao...'
 if(Test-Path 'firebase.json'){
  $cfg=Get-Content 'firebase.json' -Raw | ConvertFrom-Json
  $fs=@($cfg.firestore | Where-Object {$null -ne $_})
  if($fs.Count -eq 0){Write-Host 'Firestore: nenhuma configuracao local encontrada.'}
  foreach($f in $fs){
   if($f.rules -and (Test-Path -LiteralPath $f.rules -PathType Leaf)){
    Write-Host "Arquivo de regras localizado: $($f.rules)"
   }else{Write-Host 'Arquivo de regras nao localizado; revisar regras implantadas no console.'}
  }
 }else{Write-Host 'firebase.json nao encontrado na pasta atual.'}
 Write-Host 'VALIDACAO LOCAL CONCLUIDA - nenhuma publicacao, cobranca ou alteracao de regras.' -ForegroundColor Green
}finally{
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
}
