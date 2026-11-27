# Corrige apenas as funcoes de cancelamento do ambiente ficticio.
$ErrorActionPreference='Stop'
$project='bet-hebraico'
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/653ae5ea33c6369f55f2b549e6c2045cc87fdf3f'
if(!(Test-Path 'functions/index.js') -or !(Test-Path 'public/index.html') -or !(Test-Path 'firebase.json')){throw 'Abra o PowerShell na pasta BET'}
$stage=Join-Path ([IO.Path]::GetTempPath()) ('bet-cancel-fix-'+[guid]::NewGuid().ToString('N')+'.js')
$backup=Join-Path ([IO.Path]::GetTempPath()) ('bet-cancel-backup-'+[guid]::NewGuid().ToString('N')+'.js')
try{
 Write-Host '1/3 - Baixando correcao do status cancelled...'
 Invoke-WebRequest "$base/functions/bet-test.js" -UseBasicParsing -TimeoutSec 30 -OutFile $stage
 node --check $stage
 if($LASTEXITCODE -ne 0){throw 'Sintaxe invalida; nada publicado'}
 $src=[IO.File]::ReadAllText($stage)
 if(([regex]::Matches($src,'\{status:"cancelled"\}')).Count -ne 2 -or $src.Contains('{status:"canceled"}')){throw 'Correcao nao confirmada'}
 if(!(Test-Path 'functions/bet-invoice-pages.js')){throw 'Correcao de faturas local indisponivel'}
 Copy-Item 'functions/bet-test.js' $backup
 Copy-Item $stage 'functions/bet-test.js' -Force
 node -e "require('./functions/index.js');console.log('Servidor carregado')"
 if($LASTEXITCODE -ne 0){Copy-Item $backup 'functions/bet-test.js' -Force;throw 'Falha no carregamento; nada publicado'}
 Write-Host '2/3 - Publicando somente as duas funcoes de teste...'
 firebase.cmd deploy --only 'functions:betTestCheckout,functions:betTestSubscription' --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Publicacao nao confirmada; nenhum teste de cancelamento enviado'}
 Write-Host 'CORRECAO DO CANCELAMENTO PUBLICADA' -ForegroundColor Green
 Write-Host '3/3 - Testando apenas a segunda conta ficticia; original preservada...'
 & ([scriptblock]::Create((Invoke-WebRequest "$base/scripts/testar-cancelamento-sem-deploy.ps1" -UseBasicParsing -TimeoutSec 30).Content))
}finally{
 if(Test-Path $stage){Remove-Item $stage -Force}
}
