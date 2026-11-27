# BET - Auditoria de assinaturas ficticias, somente leitura.
# Nao cria, cancela, renova, publica ou altera assinaturas/entitlements.
$ErrorActionPreference='Stop'
$project='bet-hebraico'
$phase='configuracao'
function Read-Secret([string]$name){
 $v=((firebase.cmd functions:secrets:access $name --project $project) -join '').Trim()
 if($LASTEXITCODE -ne 0 -or !$v){throw 'Secret unavailable'}
 return $v
}
function MP-Get([string]$path){
 Invoke-RestMethod ('https://api.mercadopago.com'+$path) -Method Get -Headers $headers -TimeoutSec 25
}
function Read-Pages([string]$path){
 $all=@()
 for($offset=0;$offset -lt 250;$offset+=50){
  $page=MP-Get "$path&limit=50&offset=$offset"
  if($null -eq $page.paging.total -or $null -eq $page.paging.offset -or [int]$page.paging.offset -ne $offset -or [int]$page.paging.total -lt 0 -or !$page.PSObject.Properties['results']){throw 'Invalid pagination'}
  $rows=@($page.results | Where-Object {$null -ne $_})
  $all+= $rows
  if(($offset+$rows.Count) -ge [int]$page.paging.total){return $all}
  if($rows.Count -ne 50){throw 'Incomplete pagination'}
 }
 throw 'Search limit'
}
function Confirm-Subscription($sub,$id,$payer){
 $r=$sub.auto_recurring
 if($sub.id -ne $id -or "$($sub.collector_id)" -ne "$($legacy.sellerId)" -or "$($sub.payer_id)" -ne "$payer" -or $sub.preapproval_plan_id -ne $legacy.planId -or $r.currency_id -ne 'BRL' -or [decimal]$r.transaction_amount -ne 19.90 -or $r.frequency -ne 1 -or $r.frequency_type -ne 'months' -or $r.free_trial.frequency -ne 7 -or $r.free_trial.frequency_type -ne 'days'){throw 'Subscription mismatch'}
}
function Show-Subscription([string]$label,$sub,[string]$payer){
 Confirm-Subscription $sub $sub.id $payer
 $created=[DateTimeOffset]::Parse($sub.date_created)
 $trialEnd=$created.AddDays(7)
 Write-Host "$label : $($sub.status)"
 Write-Host "  Criada (UTC): $($created.UtcDateTime.ToString('u'))"
 Write-Host "  Fim maximo do teste (UTC): $($trialEnd.UtcDateTime.ToString('u'))"
 if($sub.next_payment_date){Write-Host "  Proximo pagamento informado (UTC): $(([DateTimeOffset]::Parse($sub.next_payment_date)).UtcDateTime.ToString('u'))"}
 $rows=@(Read-Pages "/authorized_payments/search?preapproval_id=$($sub.id)")
 $approved=0
 $now=[DateTimeOffset]::UtcNow
 $lastDue=$null
 foreach($i in $rows){
  if($i.preapproval_id -ne $sub.id){throw 'Invoice mismatch'}
  if($i.payment.status -ne 'approved' -or "$($i.payment.id)" -notmatch '^[0-9]+$'){continue}
  $p=MP-Get "/v1/payments/$($i.payment.id)"
  $due=[DateTimeOffset]::Parse($i.debit_date)
  if("$($p.id)" -eq "$($i.payment.id)" -and $p.status -eq 'approved' -and $p.status_detail -eq 'accredited' -and "$($p.collector_id)" -eq "$($legacy.sellerId)" -and "$($p.payer.id)" -eq "$payer" -and $p.currency_id -eq 'BRL' -and $i.currency_id -eq 'BRL' -and [decimal]$p.transaction_amount -eq 19.90 -and [decimal]$i.transaction_amount -eq 19.90 -and [decimal]$p.transaction_amount_refunded -eq 0 -and $due -ge $trialEnd.AddDays(-1) -and $due -le $now -and [DateTimeOffset]::Parse($p.date_approved) -le $now){
   $approved++
   if(!$lastDue -or $due -gt $lastDue){$lastDue=$due}
  }
 }
 Write-Host "  Faturas encontradas: $($rows.Count)"
 Write-Host "  Pagamentos aprovados e conferidos: $approved"
 if($lastDue){Write-Host "  Ultimo vencimento confirmado (UTC): $($lastDue.UtcDateTime.ToString('u'))"}
 if($approved -eq 0){Write-Host '  Renovacao paga: ainda nao comprovada.'}
}
try{
 $legacy=Read-Secret 'BET_MP_TEST_CONFIG' | ConvertFrom-Json
 $offer=Read-Secret 'BET_MP_CHECKOUT_CONFIG' | ConvertFrom-Json
 if($legacy.planId -notmatch '^[a-f0-9]{32}$' -or $legacy.subscriptionId -notmatch '^[a-f0-9]{32}$' -or "$($legacy.sellerId)" -notmatch '^\d+$' -or "$($legacy.payerId)" -notmatch '^\d+$' -or $offer.environment -ne 'test' -or $offer.enabled -ne $true -or $offer.planId -ne $legacy.planId -or "$($offer.sellerId)" -ne "$($legacy.sellerId)" -or "$($offer.payerId)" -notmatch '^\d+$' -or "$($offer.payerId)" -in @("$($legacy.payerId)","$($legacy.sellerId)") -or $offer.allowedUid -eq $legacy.uid -or $offer.betEmail -ne "$($offer.allowedUid)@example.invalid" -or $offer.allowedUid -notmatch '^bet-test-[a-f0-9]{32}$' -or "$($offer.applicationId)" -notmatch '^\d+$'){throw 'Test configuration mismatch'}
 $phase='vendedor ficticio'
 $headers=@{Authorization=('Bearer '+(Read-Secret 'MP_TEST_ACCESS_TOKEN'))}
 $me=MP-Get '/users/me'
 if("$($me.id)" -ne "$($legacy.sellerId)" -or "$($me.nickname)" -notmatch '^TESTUSER'){throw 'Not fictional seller'}
 Write-Host 'VENDEDOR FICTICIO CONFIRMADO' -ForegroundColor Green
 $phase='assinatura original'
 $original=MP-Get "/preapproval/$($legacy.subscriptionId)"
 Confirm-Subscription $original $legacy.subscriptionId $legacy.payerId
 Show-Subscription 'ASSINATURA ORIGINAL (preservar para renovacao)' $original $legacy.payerId
 $phase='assinatura individual'
 $matches=@(Read-Pages "/preapproval/search?payer_id=$($offer.payerId)&preapproval_plan_id=$($offer.planId)")
 Write-Host "ASSINATURAS DO NOVO COMPRADOR: $($matches.Count)"
 if($matches.Count -ne 1){throw 'Subscription absent or ambiguous'}
 $id=$matches[0].id
 if($id -notmatch '^[a-f0-9]{32}$' -or $id -eq $legacy.subscriptionId){throw 'Invalid subscription id'}
 $sub=MP-Get "/preapproval/$id"
 Confirm-Subscription $sub $id $offer.payerId
 if($sub.external_reference -notmatch '^bet_[a-f0-9]{48}$' -or "$($sub.application_id)" -ne "$($offer.applicationId)"){throw 'Binding mismatch'}
 Show-Subscription 'ASSINATURA INDIVIDUAL (teste de checkout)' $sub $offer.payerId
 $phase='entitlement da conta individual'
 $state=Import-Clixml "$env:LOCALAPPDATA\BET-Checkout-Teste\contas.xml"
 if($state.uid -ne $offer.allowedUid -or $state.email -ne $offer.betEmail -or "$($state.buyerId)" -ne "$($offer.payerId)"){throw 'Local account mismatch'}
 $html=[IO.File]::ReadAllText((Join-Path (Get-Location).Path 'public/index.html'))
 $apiMatch=[regex]::Match($html,'apiKey\s*:\s*["''](AIza[0-9A-Za-z_-]+)["'']')
 if(!$apiMatch.Success -or $html -notmatch 'projectId\s*:\s*["'']bet-hebraico["'']'){throw 'Firebase project mismatch'}
 $apiKey=$apiMatch.Groups[1].Value
 $pw=[System.Net.NetworkCredential]::new('', $state.password).Password
 # Authentication is the only POST here; no payment or database mutation.
 $login=Invoke-RestMethod "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$apiKey" -Method Post -ContentType 'application/json' -Body (@{email=$state.email;password=$pw;returnSecureToken=$true}|ConvertTo-Json -Compress) -TimeoutSec 25
 Remove-Variable pw
 if($login.localId -ne $offer.allowedUid -or !$login.idToken){throw 'Login mismatch'}
 $access=Invoke-RestMethod "https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents/betEntitlements/$($offer.allowedUid)" -Method Get -Headers @{Authorization=("Bearer "+$login.idToken)} -TimeoutSec 25
 $f=$access.fields
 if($f.source.stringValue -ne 'mercadopago-test-individual' -or $f.role.stringValue -ne 'subscriber'){throw 'Entitlement source mismatch'}
 $until=[DateTimeOffset]::Parse($f.validUntil.timestampValue)
 $active=$f.active.booleanValue -eq $true -and $until -gt [DateTimeOffset]::UtcNow
 Write-Host "FIREBASE: origem confirmada, acesso vigente=$active; motivo=$($f.accessReason.stringValue); ate (UTC)=$($until.UtcDateTime.ToString('u'))"
 Write-Host 'AUDITORIA CONCLUIDA - nenhuma assinatura alterada.' -ForegroundColor Green
 Write-Host 'O cancelamento e a renovacao real devem ser comprovados separadamente. Nao abra vendas com base apenas nesta auditoria.'
}catch{
 Write-Host "AUDITORIA INCONCLUSIVA: etapa $phase. Nenhuma assinatura alterada. Nao repita contratacao." -ForegroundColor Yellow
 # Never print exception bodies or credentials.
}finally{
 Remove-Variable legacy,offer,headers,state,login,pw,access -ErrorAction SilentlyContinue
}
