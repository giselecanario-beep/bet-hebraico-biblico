# Testes do nucleo comercial: somente local, sem deploy nem chamadas ao Mercado Pago.
$ErrorActionPreference='Stop'
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/eaf8add3d57bb902b1d9171951d5d652959ce6b5'
$stage=Join-Path ([IO.Path]::GetTempPath()) ('bet-commercial-tests-'+[guid]::NewGuid().ToString('N'))
$names=@('bet-commercial-core.js','bet-commercial-store.js','bet-commercial-provider.js','bet-commercial.test.js','bet-access-policy.js','bet-invoice-pages.js')
try{
 New-Item -ItemType Directory -Path $stage | Out-Null
 foreach($name in $names){
  Invoke-WebRequest "$base/functions/$name" -UseBasicParsing -TimeoutSec 30 -OutFile (Join-Path $stage $name)
  node --check (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw "Sintaxe invalida: $name"}
 }
 node (Join-Path $stage 'bet-commercial.test.js')
 if($LASTEXITCODE -ne 0){throw 'Teste comercial falhou'}
 Write-Host 'VALIDACAO LOCAL CONCLUIDA - nenhuma publicacao ou cobranca realizada.' -ForegroundColor Green
}finally{
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
}
