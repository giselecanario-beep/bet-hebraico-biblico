param([Parameter(Mandatory=$true)][string]$Uid)
$ErrorActionPreference='Stop'
if ($Uid -notmatch '^[A-Za-z0-9_-]{10,128}$') { throw 'UID invalido' }
if (!(Test-Path 'functions/package.json') -or !(Test-Path 'firebase.json')) { throw 'Abra o PowerShell na pasta do BET' }
$project='bet-hebraico'
$plan='fa09aa144b7f44fd9f26188b1a06c6bb'
$key=((firebase.cmd functions:secrets:access MP_TEST_ACCESS_TOKEN@2 --project $project) -join '').Trim()
if ($LASTEXITCODE -ne 0 -or !$key) { throw 'Nao foi possivel ler a credencial' }
try {
 $headers=@{Authorization="Bearer $key"}
 $me=Invoke-RestMethod 'https://api.mercadopago.com/users/me' -Headers $headers
 if ("$($me.id)" -ne '3875619579' -or $me.nickname -notmatch '^TESTUSER') { throw 'Vendedor de teste incorreto' }
 $r=Invoke-RestMethod "https://api.mercadopago.com/preapproval/search?preapproval_plan_id=$plan&payer_id=3880684960" -Headers $headers
 $s=@($r.results | Where-Object { $_.status -eq 'authorized' -and $_.preapproval_plan_id -eq $plan -and "$($_.payer_id)" -eq '3880684960' })
 if ($s.Count -ne 1 -or $r.paging.total -gt @($r.results).Count) { throw 'Assinatura autorizada nao identificada de forma unica' }
 if ($s[0].id -notmatch '^[a-fA-F0-9]{32}$') { throw 'ID de assinatura invalido' }
 $cfg=@{uid=$Uid; sellerId="$($me.id)"; payerId="$($s[0].payer_id)"; planId=$plan; subscriptionId=$s[0].id} | ConvertTo-Json -Compress
} finally { Remove-Variable key,headers -ErrorAction SilentlyContinue }
$tmp=New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ("bet-"+[guid]::NewGuid().ToString('N')))
try {
 $base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/d0e02be46484c70907e85b7abd44ba52288ae5cf'
 foreach ($name in @('bet-test.js','index.js')) {
  $file=Join-Path $tmp.FullName $name
  Invoke-WebRequest "$base/functions/$name" -UseBasicParsing -OutFile $file
  node --check $file
  if ($LASTEXITCODE -ne 0) { throw 'Erro de sintaxe no codigo' }
 }
 $configPath=Join-Path $tmp.FullName 'config.json'
 [IO.File]::WriteAllText($configPath,$cfg,(New-Object System.Text.UTF8Encoding($false)))
 firebase.cmd functions:secrets:set BET_MP_TEST_CONFIG --data-file $configPath --project $project
 if ($LASTEXITCODE -ne 0) { throw 'Falha ao salvar configuracao' }
 $backup=Join-Path (Get-Location).Path ("bet-functions-backup-"+[guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $backup | Out-Null
 foreach ($name in @('bet-test.js','index.js')) {
  $dest=Join-Path 'functions' $name
  if (Test-Path $dest) { Copy-Item $dest $backup }
  Copy-Item (Join-Path $tmp.FullName $name) $dest -Force
 }
 node -e "require('./functions/index.js'); console.log('Modulos carregados')"
 if ($LASTEXITCODE -ne 0) { throw 'Falha ao carregar os modulos; nenhum deploy foi realizado' }
 Write-Host 'BET CONFIGURADO PARA TESTE' -ForegroundColor Green
} finally { Remove-Item -LiteralPath $tmp.FullName -Recurse -Force }
