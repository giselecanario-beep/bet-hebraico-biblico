$ErrorActionPreference='Stop'
$project='bet-hebraico'
if (!(Test-Path 'public/index.html') -or !(Test-Path 'functions/index.js') -or !(Test-Path 'firebase.json')) { throw 'Abra na pasta do BET' }
Write-Host '1/4 - Verificando configuracao e assinatura' -ForegroundColor Cyan
$key=((firebase.cmd functions:secrets:access MP_TEST_ACCESS_TOKEN@2 --project $project) -join '').Trim()
if ($LASTEXITCODE -ne 0 -or !$key) { throw 'Falha ao ler token' }
try {
 $cfgRaw=(firebase.cmd functions:secrets:access BET_MP_TEST_CONFIG --project $project) -join ''
 if ($LASTEXITCODE -ne 0) { throw 'Configuracao de teste indisponivel' }
 $cfg=$cfgRaw | ConvertFrom-Json
 if (!$cfg.uid -or $cfg.subscriptionId -notmatch '^[a-f0-9]{32}$' -or "$($cfg.sellerId)" -ne '3875619579' -or "$($cfg.payerId)" -ne '3880684960' -or $cfg.planId -ne 'fa09aa144b7f44fd9f26188b1a06c6bb') { throw 'Configuracao de teste nao confere' }
 $h=@{Authorization="Bearer $key"}
 $me=Invoke-RestMethod 'https://api.mercadopago.com/users/me' -Headers $h
 if ("$($me.id)" -ne "$($cfg.sellerId)" -or $me.nickname -notmatch '^TESTUSER') { throw 'Vendedor incorreto' }
 $sub=Invoke-RestMethod "https://api.mercadopago.com/preapproval/$($cfg.subscriptionId)" -Headers $h
 if ($sub.id -ne $cfg.subscriptionId -or "$($sub.collector_id)" -ne "$($cfg.sellerId)" -or "$($sub.payer_id)" -ne "$($cfg.payerId)" -or $sub.preapproval_plan_id -ne $cfg.planId) { throw 'Identidade da assinatura nao confere' }
 if ($sub.auto_recurring.currency_id -ne 'BRL' -or [decimal]$sub.auto_recurring.transaction_amount -ne 19.90 -or $sub.auto_recurring.frequency -ne 1 -or $sub.auto_recurring.frequency_type -ne 'months' -or $sub.auto_recurring.free_trial.frequency -ne 7 -or $sub.auto_recurring.free_trial.frequency_type -ne 'days') { throw 'Assinatura nao corresponde ao teste esperado' }
} finally { Remove-Variable key,h,cfgRaw -ErrorAction SilentlyContinue }
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/9008d30e67e0f29057eb6d29dea6bb084174a5b7'
Write-Host '2/4 - Preparando previa sem alterar arquivos publicos' -ForegroundColor Cyan
$root=(Get-Location).Path
$tag=[guid]::NewGuid().ToString('N')
$dir="bet-preview-$tag"
$conf="firebase-preview-$tag.json"
try {
 $remote=[System.Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$base/index.html" -UseBasicParsing).RawContentStream.ToArray())
 $html=[IO.File]::ReadAllText((Join-Path $root 'public/index.html'))
 $anchor='const db = getFirestore(app);'
 $marker='<p class="small">As vendas ainda nao estao abertas nesta versao beta.</p>'
 # Match the actual UTF-8 text from the repository without embedding accents in this script.
 $jsMatch=[regex]::Match($remote,'(?s)const betTestPreview=.*?(?=const progressoRef)')
 $uiMatch=[regex]::Match($remote,'(?s)<div id="bet-test-panel" hidden>.*?</div>')
 $markMatch=[regex]::Match($remote,'<p class="small">As vendas ainda n[^<]+nesta vers[^<]+beta\.</p>')
 if (!$jsMatch.Success -or !$uiMatch.Success -or !$markMatch.Success) { throw 'Painel de teste nao encontrado no GitHub' }
 $marker=$markMatch.Value
 if (!$html.Contains($anchor) -or !$html.Contains($marker) -or $html.Contains('bet-test-panel')) { throw 'HTML local difere do esperado; nenhuma publicacao realizada' }
 if ([regex]::Matches($html,[regex]::Escape($anchor)).Count -ne 1 -or [regex]::Matches($html,[regex]::Escape($marker)).Count -ne 1) { throw 'HTML local ambiguo' }
 $html=$html.Replace($anchor,$anchor+[Environment]::NewLine+$jsMatch.Value).Replace($marker,$marker+$uiMatch.Value)
 Copy-Item -LiteralPath 'public' -Destination $dir -Recurse
 [IO.File]::WriteAllText((Join-Path $root "$dir/index.html"),$html,(New-Object System.Text.UTF8Encoding($false)))
 $hosting=(Get-Content firebase.json -Raw | ConvertFrom-Json).hosting
 if (!$hosting -or $hosting -is [array] -or $hosting.public -ne 'public') { throw 'Configuracao de hospedagem inesperada' }
 $hosting.public=$dir
 # No hooks or other deployments from the preview configuration.
 foreach($p in @('predeploy','postdeploy')) { $hosting.PSObject.Properties.Remove($p) }
 [IO.File]::WriteAllText((Join-Path $root $conf),(@{hosting=$hosting}|ConvertTo-Json -Depth 50),(New-Object System.Text.UTF8Encoding($false)))

 $stage=Join-Path $root "$dir-backend"
 New-Item -ItemType Directory -Path $stage | Out-Null
 $names=@('bet-test.js','bet-access-policy.js','bet-access-policy.test.js')
 foreach($name in $names){
  Invoke-WebRequest "$base/functions/$name" -UseBasicParsing -OutFile (Join-Path $stage $name)
  node --check (Join-Path $stage $name)
  if ($LASTEXITCODE -ne 0) { throw 'Erro de sintaxe; nenhuma publicacao realizada' }
 }
 node (Join-Path $stage 'bet-access-policy.test.js')
 if ($LASTEXITCODE -ne 0) { throw 'Testes falharam; nenhuma publicacao realizada' }
 $backup=Join-Path $root "bet-functions-backup-$tag"
 New-Item -ItemType Directory -Path $backup | Out-Null
 foreach($name in $names){
  $dest=Join-Path $root "functions/$name"
  if(Test-Path $dest){Copy-Item $dest $backup}
  Copy-Item (Join-Path $stage $name) $dest -Force
 }
 node --check functions/bet-test.js
 if ($LASTEXITCODE -ne 0) { throw 'Codigo do servidor invalido' }
 node -e "require('./functions/index.js'); console.log('Servidor carregado')"
 if ($LASTEXITCODE -ne 0) { throw 'Falha nas dependencias do servidor' }
 Write-Host '3/4 - Publicando somente funcao de teste' -ForegroundColor Cyan
 firebase.cmd deploy --only functions:betTestSubscription --project $project --non-interactive
 if ($LASTEXITCODE -ne 0) { throw 'Publicacao da funcao falhou' }
 Write-Host '4/4 - Publicando somente previa temporaria' -ForegroundColor Cyan
 firebase.cmd hosting:channel:deploy assinaturas-teste --expires 2d --project $project --config $conf --non-interactive
 if ($LASTEXITCODE -ne 0) { throw 'Funcao publicada, mas previa falhou' }
 Write-Host 'BET ATUALIZADO PARA TESTE - ABRA O CHANNEL URL ACIMA' -ForegroundColor Green
} finally {
 if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force }
 if (Test-Path -LiteralPath $conf) { Remove-Item -LiteralPath $conf -Force }
 if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
}
