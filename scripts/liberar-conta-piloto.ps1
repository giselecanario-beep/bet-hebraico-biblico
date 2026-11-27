# BET: habilita somente uma conta piloto. Nao cria assinatura nem realiza cobranca.
$ErrorActionPreference='Stop'
$project='bet-hebraico'
if(!(Test-Path 'firebase.json') -or !(Test-Path 'functions/bet-commercial.js') -or !(Test-Path 'functions/index.js')){throw 'Abra o PowerShell na pasta BET'}
try{
 Write-Host '1/3 - Identificacao da conta piloto'
 Write-Host 'Volte ao BET, clique novamente em Copiar identificacao da conta piloto e retorne ao PowerShell.'
 $uid=(Read-Host 'Cole aqui a identificacao copiada e pressione ENTER').Trim()
 if($uid -notmatch '^[A-Za-z0-9_-]{10,128}$' -or $uid.StartsWith('bet-test-')){throw 'Identificacao invalida ou ficticia'}
 Write-Host '2/3 - Conferindo configuracao comercial existente...'
 $raw=(firebase.cmd functions:secrets:access BET_MP_LIVE_CONFIG --project $project) -join ''
 if($LASTEXITCODE -ne 0 -or !$raw){throw 'Configuracao comercial indisponivel'}
 $cfg=$raw|ConvertFrom-Json
 if($cfg.environment -ne 'production' -or $cfg.launchMode -notin @('closed','pilot') -or $cfg.planId -notmatch '^[a-f0-9]{32}$' -or $cfg.priceCents -ne 1990 -or $cfg.trialDays -ne 7 -or "$($cfg.applicationId)" -ne '721604867410616'){throw 'Configuracao inesperada; nenhuma alteracao realizada'}
 if($cfg.launchMode -eq 'pilot' -and $cfg.pilotUid -ne $uid){throw 'Ja existe outra conta piloto; nenhuma alteracao realizada'}
 if($cfg.launchMode -eq 'closed'){
  $cfg.launchMode='pilot'
  $cfg.salesEnabled=$false
  $cfg|Add-Member -NotePropertyName pilotUid -NotePropertyValue $uid -Force
  ($cfg|ConvertTo-Json -Depth 10 -Compress)|firebase.cmd functions:secrets:set BET_MP_LIVE_CONFIG --project $project --non-interactive
  if($LASTEXITCODE -ne 0){throw 'Configuracao nao confirmada'}
 }
 Write-Host '3/3 - Publicando autorizacao exclusiva da conta piloto...'
 firebase.cmd deploy --only 'functions:betCommercialCheckout,functions:betCommercialWebhook' --project $project --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Publicacao nao confirmada'}
 Write-Host 'CONTA PILOTO LIBERADA - DEMAIS CONTAS FECHADAS. NENHUMA ASSINATURA CRIADA.' -ForegroundColor Green
}finally{
 Remove-Variable raw,cfg,uid -ErrorAction SilentlyContinue
}
