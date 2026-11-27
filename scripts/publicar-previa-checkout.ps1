$ErrorActionPreference='Stop'
$project='bet-hebraico'
if(!(Test-Path 'public/index.html') -or !(Test-Path 'firebase.json')){throw 'Abra o PowerShell na pasta BET'}
$root=(Get-Location).Path
$tag=[guid]::NewGuid().ToString('N')
$stage=Join-Path $root "bet-checkout-stage-$tag"
$dir="bet-preview-$tag"
$conf="firebase-preview-$tag.json"
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/a2eaed4a4654eaf888308fb38a130bf16769e8e5'
try{
 New-Item -ItemType Directory -Path $stage | Out-Null
 $names=@('bet-access-policy.js','bet-access-policy.test.js','bet-webhook-signature.js','bet-webhook-signature.test.js','bet-payment-events.js','bet-payment-events.test.js','bet-checkout-binding.js','bet-checkout-binding.test.js','bet-checkout-service.js','bet-checkout-store.js','bet-checkout-provider.js','bet-checkout-service.test.js')
 foreach($name in $names){
  Invoke-WebRequest "$base/functions/$name" -UseBasicParsing -OutFile (Join-Path $stage $name)
  node --check (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw "Sintaxe invalida: $name"}
 }
 foreach($name in ($names | Where-Object {$_ -like '*.test.js'})){
  node (Join-Path $stage $name)
  if($LASTEXITCODE -ne 0){throw "Teste falhou: $name"}
 }
 Write-Host 'TESTES DE CODIGO CONCLUIDOS' -ForegroundColor Green
 $remote=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$base/index.html" -UseBasicParsing).RawContentStream.ToArray())
 $html=[IO.File]::ReadAllText((Join-Path $root 'public/index.html'))
 $js=[regex]::Match($remote,'(?s)const betTestPreview=.*?(?=const progressoRef)')
 $panel=[regex]::Match($remote,'(?s)<div id="bet-test-panel" hidden>.*?</div>')
 $marker=[regex]::Match($remote,'<p class="small">As vendas ainda n[^<]+nesta vers[^<]+beta\.</p>')
 $anchor='const db = getFirestore(app);'
 if(!$js.Success -or !$panel.Success -or !$marker.Success -or !$panel.Value.Contains('bet-checkout-demo')){throw 'Painel de previa nao encontrado'}
 if($html.Contains('bet-test-panel') -or [regex]::Matches($html,[regex]::Escape($anchor)).Count -ne 1 -or [regex]::Matches($html,[regex]::Escape($marker.Value)).Count -ne 1){throw 'HTML local diferente do esperado; nenhum arquivo publico alterado'}
 $html=$html.Replace($anchor,$anchor+[Environment]::NewLine+$js.Value).Replace($marker.Value,$marker.Value+$panel.Value)
 Copy-Item -LiteralPath 'public' -Destination $dir -Recurse
 [IO.File]::WriteAllText((Join-Path $root "$dir/index.html"),$html,(New-Object Text.UTF8Encoding($false)))
 $hosting=(Get-Content firebase.json -Raw | ConvertFrom-Json).hosting
 if(!$hosting -or $hosting -is [array] -or $hosting.public -ne 'public'){throw 'Configuracao de hospedagem inesperada'}
 $hosting.public=$dir
 foreach($p in @('predeploy','postdeploy')){$hosting.PSObject.Properties.Remove($p)}
 [IO.File]::WriteAllText((Join-Path $root $conf),(@{hosting=$hosting}|ConvertTo-Json -Depth 50),(New-Object Text.UTF8Encoding($false)))
 firebase.cmd hosting:channel:deploy assinaturas-teste --expires 2d --project $project --config $conf --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Falha na publicacao da previa'}
 Write-Host 'PREVIA DO CHECKOUT BET PRONTA - ABRA O CHANNEL URL ACIMA' -ForegroundColor Green
}finally{
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
 if(Test-Path $conf){Remove-Item -LiteralPath $conf -Force}
 if(Test-Path $dir){Remove-Item -LiteralPath $dir -Recurse -Force}
}
