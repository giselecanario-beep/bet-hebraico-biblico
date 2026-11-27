$ErrorActionPreference='Stop'
$project='bet-hebraico'
if(!(Test-Path 'functions/bet-test.js') -or !(Test-Path 'firebase.json')){throw 'Abra o PowerShell na pasta BET'}
$tmp=Join-Path ([IO.Path]::GetTempPath()) ('bet-webhook-'+[guid]::NewGuid().ToString('N')+'.cjs')
$ptr=[IntPtr]::Zero
$oldEncoding=$OutputEncoding
try {
 $cfg=((firebase.cmd functions:secrets:access BET_MP_TEST_CONFIG --project $project) -join '') | ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or $cfg.subscriptionId -notmatch '^[a-f0-9]{32}$'){throw 'Configuracao de teste invalida'}
 $env:BET_TEMP_SUB_ID=$cfg.subscriptionId
 Invoke-WebRequest 'https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/ea4d0ee6609e5ec822d2abb1a9ee6717b9d6926f/scripts/diagnosticar-webhook-node.cjs' -UseBasicParsing -OutFile $tmp
 $secure=Read-Host 'Cole a assinatura secreta dos Webhooks do app BET TESTE (nao o Access Token)' -AsSecureString
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 $key=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim()
 if($key -notmatch '^[!-~]{16,256}$' -or $key -match '^(APP_USR|APP-?USR|TEST-)' ){throw 'Chave fora do formato esperado. Confira a assinatura secreta dos Webhooks.'}
 $env:BET_TEMP_WEBHOOK_SECRET=$key
 $first=@(node $tmp)
 if($LASTEXITCODE -ne 0){throw 'Falha no teste de conexao'}
 $first | Write-Host
 if($first -match '^COM ASSINATURA: HTTP 200 \| ok \|'){
  Write-Host 'AUTENTICACAO DO BET OK - nao foi necessario alterar o segredo' -ForegroundColor Green
 }else{
  if(!($first -match '^COM ASSINATURA: HTTP 401 \| hmac-mismatch \|')){throw 'Falha diferente de HMAC; nenhum segredo alterado'}
  $OutputEncoding=New-Object System.Text.UTF8Encoding($false)
  $key | firebase.cmd functions:secrets:set MP_TEST_WEBHOOK_SECRET --data-file - --project $project --non-interactive
  if($LASTEXITCODE -ne 0){throw 'Falha ao atualizar segredo'}
  firebase.cmd deploy --only functions:betTestWebhook --project $project --non-interactive
  if($LASTEXITCODE -ne 0){throw 'Falha ao publicar webhook'}
  $result=@(node $tmp)
  if($LASTEXITCODE -ne 0){throw 'Falha no teste de conexao'}
  $result | Write-Host
  if($result -match '^COM ASSINATURA: HTTP 200 \| ok \|'){Write-Host 'AUTENTICACAO DO BET OK' -ForegroundColor Green}
  else{Write-Host 'AUTENTICACAO AINDA NAO CONFIRMADA' -ForegroundColor Yellow}
 }
}finally{
 $OutputEncoding=$oldEncoding
 if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 if($secure){$secure.Dispose()}
 Remove-Variable key,secure -ErrorAction SilentlyContinue
 Remove-Item Env:BET_TEMP_WEBHOOK_SECRET,Env:BET_TEMP_SUB_ID -ErrorAction SilentlyContinue
 Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
