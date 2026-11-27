$ErrorActionPreference='Stop'
$project='bet-hebraico'
if(!(Test-Path 'public/index.html') -or !(Test-Path 'functions/index.js') -or !(Test-Path 'firebase.json')){throw 'Abra o PowerShell na pasta BET'}
$root=(Get-Location).Path
$tag=[guid]::NewGuid().ToString('N')
$stage=Join-Path $root "bet-checkout-stage-$tag"
$backup=Join-Path $root "bet-checkout-backup-$tag"
$dir="bet-preview-$tag"
$conf="firebase-preview-$tag.json"
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/3a7e817617f6f3af7aac31d7464a565255c9f755'
$oldEncoding=$OutputEncoding
try{
 New-Item -ItemType Directory -Path $stage | Out-Null
 $names=@('index.js','bet-test.js','bet-access-policy.js','bet-access-policy.test.js','bet-webhook-signature.js','bet-webhook-signature.test.js','bet-payment-events.js','bet-payment-events.test.js','bet-checkout-binding.js','bet-checkout-binding.test.js','bet-checkout-service.js','bet-checkout-store.js','bet-checkout-provider.js','bet-checkout-service.test.js')
 foreach($name in $names){
  Invoke-WebRequest "$base/functions/$name" -UseBasicParsing -OutFile (Join-Path $stage $name)
  node --check (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw "Sintaxe invalida: $name"}
 }
 foreach($name in ($names | Where-Object {$_ -like '*.test.js'})){
  node (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw "Teste falhou: $name"}
 }
 $remote=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$base/index.html" -UseBasicParsing).RawContentStream.ToArray())
 $html=[IO.File]::ReadAllText((Join-Path $root 'public/index.html'))
 $js=[regex]::Match($remote,'(?s)const betTestPreview=.*?(?=const progressoRef)')
 $panel=[regex]::Match($remote,'(?s)<div id="bet-test-panel" hidden>.*?<!-- BET_TEST_PANEL_END -->')
 $marker=[regex]::Match($remote,'<p class="small">As vendas ainda n[^<]+nesta vers[^<]+beta\.</p>')
 $anchor='const db = getFirestore(app);'
 if(!$js.Success -or !$panel.Success -or !$marker.Success -or !$panel.Value.Contains('bet-card-form')){throw 'Formulario integrado nao encontrado'}
 if($html.Contains('bet-test-panel') -or [regex]::Matches($html,[regex]::Escape($anchor)).Count -ne 1 -or [regex]::Matches($html,[regex]::Escape($marker.Value)).Count -ne 1){throw 'HTML local diferente do esperado; nenhuma publicacao realizada'}
 [IO.File]::WriteAllText((Join-Path $stage 'frontend.mjs'),$js.Value,(New-Object Text.UTF8Encoding($false)))
 node --check (Join-Path $stage 'frontend.mjs')
 if($LASTEXITCODE -ne 0){throw 'Sintaxe do formulario invalida'}
 $html=$html.Replace($anchor,$anchor+[Environment]::NewLine+$js.Value).Replace($marker.Value,$marker.Value+$panel.Value)
 Copy-Item -LiteralPath 'public' -Destination $dir -Recurse
 [IO.File]::WriteAllText((Join-Path $root "$dir/index.html"),$html,(New-Object Text.UTF8Encoding($false)))
 $firebaseJson=Get-Content firebase.json -Raw | ConvertFrom-Json
 $hosting=$firebaseJson.hosting
 if(!$hosting -or $hosting -is [array] -or $hosting.public -ne 'public'){throw 'Configuracao de hospedagem inesperada'}
 $hosting.public=$dir
 foreach($p in @('predeploy','postdeploy')){$hosting.PSObject.Properties.Remove($p)}
 [IO.File]::WriteAllText((Join-Path $root $conf),(@{hosting=$hosting}|ConvertTo-Json -Depth 50),(New-Object Text.UTF8Encoding($false)))
 Write-Host 'Informe apenas os dados do SEGUNDO comprador ficticio e da segunda conta BET.' -ForegroundColor Cyan
 $buyerId=(Read-Host 'User ID do novo comprador ficticio').Trim()
 $buyerEmail=(Read-Host 'E-mail do novo comprador ficticio').Trim().ToLowerInvariant()
 $uid=(Read-Host 'UID da segunda conta BET no Firebase Authentication').Trim()
 $email=(Read-Host 'E-mail da segunda conta BET').Trim().ToLowerInvariant()
 $publicKey=(Read-Host 'Public Key do VENDEDOR FICTICIO (nao Access Token)').Trim()
 if($buyerId -notmatch '^[0-9]+$' -or $buyerEmail -notmatch '^[^@\s]+@testuser\.com$' -or $uid -notmatch '^[-\w]{10,128}$' -or $email -notmatch '^[^@\s]+@[^@\s]+$' -or $publicKey -notmatch '^APP_USR-[a-fA-F0-9-]{36}$'){throw 'Dados fora do formato esperado'}
 $legacy=((firebase.cmd functions:secrets:access BET_MP_TEST_CONFIG --project $project) -join '') | ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or !$legacy.uid -or $legacy.planId -notmatch '^[a-f0-9]{32}$'){throw 'Configuracao original indisponivel'}
 if($uid -eq $legacy.uid -or $buyerId -eq "$($legacy.payerId)" -or $buyerId -eq "$($legacy.sellerId)"){throw 'Use outro comprador ficticio e outra conta BET para preservar o teste de renovacao'}
 $token=((firebase.cmd functions:secrets:access MP_TEST_ACCESS_TOKEN --project $project) -join '').Trim()
 if($LASTEXITCODE -ne 0 -or !$token){throw 'Credencial ficticia indisponivel'}
 $h=@{Authorization="Bearer $token"}
 try{
  $me=Invoke-RestMethod 'https://api.mercadopago.com/users/me' -Headers $h
  if("$($me.id)" -ne "$($legacy.sellerId)" -or "$($me.nickname)" -notmatch '^TESTUSER'){throw 'O vendedor nao e ficticio'}
  $plan=Invoke-RestMethod "https://api.mercadopago.com/preapproval_plan/$($legacy.planId)" -Headers $h
  $r=$plan.auto_recurring
  if($plan.id -ne $legacy.planId -or "$($plan.collector_id)" -ne "$($legacy.sellerId)" -or "$($plan.application_id)" -notmatch '^[0-9]+$' -or $plan.status -ne 'active' -or $r.currency_id -ne 'BRL' -or [decimal]$r.transaction_amount -ne 19.90 -or $r.frequency -ne 1 -or $r.frequency_type -ne 'months' -or $r.free_trial.frequency -ne 7 -or $r.free_trial.frequency_type -ne 'days'){throw 'Plano de teste nao corresponde ao combinado'}
  $search=Invoke-RestMethod "https://api.mercadopago.com/preapproval/search?payer_id=$buyerId&preapproval_plan_id=$($legacy.planId)&limit=50&offset=0" -Headers $h
  if($null -eq $search.paging.total -or [int]$search.paging.total -ne 0){throw 'O novo comprador ja possui assinatura ou nao foi possivel confirmar ausencia de assinatura'}
 }catch{throw 'Pre-validacao do Mercado Pago nao concluida. Nenhuma assinatura criada.'}
 $offer=@{enabled=$true;environment='test';allowedUid=$uid;betEmail=$email;payerId=$buyerId;payerEmail=$buyerEmail;sellerId="$($legacy.sellerId)";planId=$legacy.planId;applicationId="$($plan.application_id)";publicKey=$publicKey}
 $OutputEncoding=New-Object Text.UTF8Encoding($false)
 ($offer | ConvertTo-Json -Compress) | firebase.cmd functions:secrets:set BET_MP_CHECKOUT_CONFIG --data-file - --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Configuracao protegida nao gravada'}
 New-Item -ItemType Directory -Path $backup | Out-Null
 foreach($name in ($names | Where-Object {$_ -notlike '*.test.js'})){
  $dest=Join-Path $root "functions/$name"
  if(Test-Path $dest){Copy-Item $dest $backup}
  Copy-Item (Join-Path $stage $name) $dest -Force
 }
 node -e "require('./functions/index.js'); console.log('Servidor carregado')"
 if($LASTEXITCODE -ne 0){throw 'Falha no carregamento'}
 firebase.cmd deploy --only 'functions:betTestCheckout,functions:betTestWebhook' --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Publicacao do checkout falhou'}
 firebase.cmd hosting:channel:deploy assinaturas-teste --expires 2d --project $project --config $conf --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Servidor publicado, mas interface de teste nao publicada'}
 Write-Host 'CHECKOUT INTEGRADO BET PUBLICADO - ABRA O CHANNEL URL ACIMA' -ForegroundColor Green
}finally{
 $OutputEncoding=$oldEncoding
 Remove-Variable token,h,offer -ErrorAction SilentlyContinue
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
 if(Test-Path $conf){Remove-Item -LiteralPath $conf -Force}
 if(Test-Path $dir){Remove-Item -LiteralPath $dir -Recurse -Force}
}
