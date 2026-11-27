# Abre o checkout hospedado do plano comercial existente. Somente consultas GET.
$ErrorActionPreference='Stop'
$project='bet-hebraico'
try{
 Write-Host 'Consultando o plano comercial ja criado...'
 $raw=(firebase.cmd functions:secrets:access BET_MP_LIVE_CONFIG --project $project) -join ''
 if($LASTEXITCODE -ne 0 -or !$raw){throw 'Configuracao indisponivel'}
 $cfg=$raw|ConvertFrom-Json
 if($cfg.environment -ne 'production' -or $cfg.launchMode -notin @('closed','pilot') -or $cfg.planId -notmatch '^[a-f0-9]{32}$' -or "$($cfg.applicationId)" -ne '721604867410616'){throw 'Configuracao inesperada'}
 $token=((firebase.cmd functions:secrets:access MP_LIVE_ACCESS_TOKEN --project $project) -join '').Trim()
 if($LASTEXITCODE -ne 0 -or !$token){throw 'Credencial indisponivel'}
 $headers=@{Authorization="Bearer $token"}
 $me=Invoke-RestMethod 'https://api.mercadopago.com/users/me' -Headers $headers -TimeoutSec 25
 if("$($me.id)" -ne "$($cfg.sellerId)" -or !$me.nickname -or $me.nickname -match '^TESTUSER'){throw 'Vendedor nao confirmado'}
 $p=Invoke-RestMethod "https://api.mercadopago.com/preapproval_plan/$($cfg.planId)" -Headers $headers -TimeoutSec 25
 $r=$p.auto_recurring
 if($p.id -ne $cfg.planId -or "$($p.collector_id)" -ne "$($cfg.sellerId)" -or "$($p.application_id)" -ne "$($cfg.applicationId)" -or $p.status -ne 'active' -or $r.frequency -ne 1 -or $r.frequency_type -ne 'months' -or $r.currency_id -ne 'BRL' -or [decimal]$r.transaction_amount -ne 19.90 -or $r.free_trial.frequency -ne 7 -or $r.free_trial.frequency_type -ne 'days'){throw 'Plano nao corresponde ao combinado'}
 $url=[uri]$p.init_point
 if(!$url.IsAbsoluteUri -or $url.Scheme -ne 'https' -or $url.Host -notin @('www.mercadopago.com.br','mercadopago.com.br') -or !$url.IsDefaultPort -or $url.UserInfo -or $url.Fragment -or $url.AbsolutePath.TrimEnd('/') -ne '/subscriptions/checkout' -or $url.Query -ne "?preapproval_plan_id=$($p.id)"){throw 'Link oficial nao confirmado; nenhuma pagina aberta'}
 Write-Host 'Plano confirmado: R$ 19,90 por mes, 7 dias gratuitos.' -ForegroundColor Green
 Write-Host 'Abrindo checkout oficial apenas para visualizar. NAO confirme assinatura ainda.'
 Start-Process $url.AbsoluteUri
}catch{
 Write-Host 'Nao foi possivel confirmar o link do plano. Nenhuma assinatura ou cobranca criada.' -ForegroundColor Yellow
}finally{
 Remove-Variable token,headers,raw,cfg -ErrorAction SilentlyContinue
}
