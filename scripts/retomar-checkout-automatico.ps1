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

 Write-Host 'Retomando configuracao protegida. Nenhuma cobranca sera criada.' -ForegroundColor Cyan
 $legacy=((firebase.cmd functions:secrets:access BET_MP_TEST_CONFIG --project $project) -join '') | ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or !$legacy.uid -or $legacy.planId -notmatch '^[a-f0-9]{32}$'){throw 'Configuracao original indisponivel'}
 $token=((firebase.cmd functions:secrets:access MP_TEST_ACCESS_TOKEN --project $project) -join '').Trim()
 if($LASTEXITCODE -ne 0 -or !$token){throw 'Credencial ficticia indisponivel'}
 $h=@{Authorization="Bearer $token"}
 try{
  $me=Invoke-RestMethod 'https://api.mercadopago.com/users/me' -Headers $h
  if("$($me.id)" -ne "$($legacy.sellerId)" -or "$($me.nickname)" -notmatch '^TESTUSER'){throw 'O vendedor nao e ficticio'}
  $plan=Invoke-RestMethod "https://api.mercadopago.com/preapproval_plan/$($legacy.planId)" -Headers $h
  $r=$plan.auto_recurring
  if($plan.id -ne $legacy.planId -or "$($plan.collector_id)" -ne "$($legacy.sellerId)" -or "$($plan.application_id)" -notmatch '^[0-9]+$' -or $plan.status -ne 'active' -or $r.currency_id -ne 'BRL' -or [decimal]$r.transaction_amount -ne 19.90 -or $r.frequency -ne 1 -or $r.frequency_type -ne 'months' -or $r.free_trial.frequency -ne 7 -or $r.free_trial.frequency_type -ne 'days'){throw 'Plano de teste nao corresponde ao combinado'}
 }catch{throw 'Pre-validacao do vendedor e plano nao concluida. Nenhuma conta criada.'}
 $stateDir=Join-Path $env:LOCALAPPDATA 'BET-Checkout-Teste'
 New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
 $statePath=Join-Path $stateDir 'contas.xml'
 if(Test-Path $statePath){
  $state=Import-Clixml $statePath
  if($state.sellerId -ne "$($legacy.sellerId)" -or $state.planId -ne $legacy.planId){throw 'Configuracao local pertence a outro plano'}
 }else{
  $publicKey=(Read-Host 'Cole somente a Public Key do VENDEDOR FICTICIO (nao Access Token)').Trim()
  if($publicKey -notmatch '^APP_USR-[a-fA-F0-9-]{36}$'){throw 'Public Key fora do formato esperado. Nenhuma conta criada.'}
  $state=[pscustomobject]@{sellerId="$($legacy.sellerId)";planId=$legacy.planId;publicKey=$publicKey;buyerId='';buyerEmail='';buyerNick='';buyerPassword=$null;buyerAttempted=$false;uid='';email='';password=$null;authAttempted=$false;authConfirmed=$false}
  $state | Export-Clixml $statePath
 }
 $publicKey=$state.publicKey
 if(!$state.buyerId){
  Write-Host 'Use um comprador ficticio SEM assinatura, criado no painel do Mercado Pago. Nao use o comprador original.' -ForegroundColor Cyan
  $manualId=(Read-Host 'User ID do novo comprador ficticio').Trim()
  $manualEmail=(Read-Host 'E-mail do mesmo comprador ficticio').Trim().ToLowerInvariant()
  if($manualId -notmatch '^[0-9]+$' -or $manualId -in @("$($legacy.payerId)","$($legacy.sellerId)") -or $manualEmail -notmatch '^[^@\s]+@testuser\.com$'){throw 'Dados do comprador ficticio invalidos; nenhuma assinatura criada'}
  $state.buyerId=$manualId
  $state.buyerEmail=$manualEmail
  $state | Export-Clixml $statePath
 }
 $buyerId=$state.buyerId;$buyerEmail=$state.buyerEmail
 try{
  $search=Invoke-RestMethod "https://api.mercadopago.com/preapproval/search?payer_id=$buyerId&preapproval_plan_id=$($legacy.planId)&limit=50&offset=0" -Headers $h
  if($null -eq $search.paging.total -or [int]$search.paging.total -ne 0){throw 'Comprador ja possui assinatura'}
 }catch{throw 'Nao foi possivel confirmar comprador sem assinatura; nenhuma assinatura criada.'}
 Write-Host 'Comprador ficticio confirmado.' -ForegroundColor Green
 $apiMatch=[regex]::Match($html,'apiKey\s*:\s*["''](AIza[0-9A-Za-z_-]+)["'']')
 if(!$apiMatch.Success){throw 'Configuracao publica Firebase nao localizada'}
 $apiKey=$apiMatch.Groups[1].Value
 if(!$state.uid){
  $state.uid='bet-test-'+[guid]::NewGuid().ToString('N')
  $state.email=$state.uid+'@example.invalid'
  $pw=(node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))").Trim()
  if($LASTEXITCODE -ne 0 -or $pw -notmatch '^[a-f0-9]{48}$'){throw 'Falha ao gerar senha ficticia'}
  $state.password=ConvertTo-SecureString $pw -AsPlainText -Force
  Remove-Variable pw
  $state | Export-Clixml $statePath
 }
 $uid=$state.uid;$email=$state.email
 if($uid -eq $legacy.uid -or $uid -notmatch '^bet-test-[a-f0-9]{32}$' -or $email -ne "$uid@example.invalid"){throw 'Conta ficticia invalida'}
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($state.password)
 try{$pw=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 $signinUrl="https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$apiKey"
 $loginBody=@{email=$email;password=$pw;returnSecureToken=$true}|ConvertTo-Json -Compress
 $login=$null
 try{$login=Invoke-RestMethod $signinUrl -Method Post -ContentType 'application/json' -Body $loginBody}catch{}
 if(!$login){
  if($state.authAttempted){throw 'Importacao da conta anterior nao confirmada; nao sera repetida automaticamente.'}
  $state.authAttempted=$true
  $state | Export-Clixml $statePath
  $env:BET_TMP_PASSWORD=$pw;$env:BET_TMP_UID=$uid;$env:BET_TMP_EMAIL=$email
  try{
   $accountFile=Join-Path $stage 'usuario-teste.json'
   $accountJson=node -e "const c=require('node:crypto');const salt=c.randomBytes(16);const hash=c.pbkdf2Sync(process.env.BET_TMP_PASSWORD,salt,100000,32,'sha256');console.log(JSON.stringify({users:[{localId:process.env.BET_TMP_UID,email:process.env.BET_TMP_EMAIL,emailVerified:true,displayName:'BET Teste Automatizado',passwordHash:hash.toString('base64'),salt:salt.toString('base64')}] }));"
   if($LASTEXITCODE -ne 0){throw 'Falha na preparacao da conta'}
   [IO.File]::WriteAllText($accountFile,($accountJson -join ''),(New-Object Text.UTF8Encoding($false)))
   firebase.cmd auth:import $accountFile --hash-algo=PBKDF2_SHA256 --rounds=100000 --project $project --non-interactive
   if($LASTEXITCODE -ne 0){throw 'Falha na importacao da conta ficticia'}
   $login=Invoke-RestMethod $signinUrl -Method Post -ContentType 'application/json' -Body $loginBody
  }finally{
   Remove-Item Env:BET_TMP_PASSWORD,Env:BET_TMP_UID,Env:BET_TMP_EMAIL -ErrorAction SilentlyContinue
   if($accountFile -and (Test-Path $accountFile)){Remove-Item $accountFile -Force}
  }
 }
 if($login.localId -ne $uid -or !$login.idToken){throw 'Login ficticio nao confirmado'}
 $lookup=Invoke-RestMethod "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=$apiKey" -Method Post -ContentType 'application/json' -Body (@{idToken=$login.idToken}|ConvertTo-Json -Compress)
 if($lookup.users.Count -ne 1 -or $lookup.users[0].localId -ne $uid -or $lookup.users[0].emailVerified -ne $true){throw 'Conta ficticia nao confirmada'}
 $state.authConfirmed=$true;$state | Export-Clixml $statePath
 Remove-Variable login,lookup,loginBody,pw -ErrorAction SilentlyContinue
 Write-Host 'Conta BET ficticia criada e login validado.' -ForegroundColor Green
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
 Write-Host "E-mail da conta BET de teste: $email"
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($state.password)
 try{
  Set-Clipboard -Value ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr))
  Write-Host 'Senha da conta BET de teste copiada para a area de transferencia. Cole no campo Senha do BET.'
 }finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 Write-Host 'Dados ficticios guardados de forma protegida no perfil local do Windows.'

}finally{
 $OutputEncoding=$oldEncoding
 Remove-Variable token,h,offer,pw,login,lookup,loginBody,accountJson -ErrorAction SilentlyContinue
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
 if(Test-Path $conf){Remove-Item -LiteralPath $conf -Force}
 if(Test-Path $dir){Remove-Item -LiteralPath $dir -Recurse -Force}
}
