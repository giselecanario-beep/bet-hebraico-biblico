# Publica a interface comercial no endereco oficial, sem abrir vendas.
$ErrorActionPreference='Stop'
$root=(Get-Location).Path
$project='bet-hebraico'
$base='https://raw.githubusercontent.com/giselecanario-beep/bet-hebraico-biblico/375422f4e17cc819aa1e6ae436928de608c6f09b'
if(!(Test-Path 'public/index.html') -or !(Test-Path 'firebase.json')){throw 'Abra o PowerShell na pasta BET'}
$tag=[guid]::NewGuid().ToString('N')
$stage="bet-commercial-stage-$tag"
$conf="firebase-commercial-$tag.json"
$tmp=Join-Path ([IO.Path]::GetTempPath()) ("bet-ui-"+$tag)
$utf8=New-Object Text.UTF8Encoding($false)
function Replace-Exactly([string]$source,[string]$pattern,[string]$replacement){
 $rx=[regex]::new($pattern)
 if($rx.Matches($source).Count -ne 1){throw 'Estrutura local diferente da esperada; nada publicado'}
 return $rx.Replace($source,[System.Text.RegularExpressions.MatchEvaluator]{param($m) $replacement},1)
}
try{
 Write-Host '1/3 - Preparando a interface no endereco oficial...'
 $cfg=Get-Content 'firebase.json' -Raw|ConvertFrom-Json
 $hosting=$cfg.hosting
 if(!$hosting -or $hosting -is [array] -or $hosting.public -ne 'public'){throw 'Hospedagem local inesperada'}
 New-Item -ItemType Directory -Path $tmp|Out-Null
 Invoke-WebRequest "$base/web/bet-commercial-ui.js" -UseBasicParsing -TimeoutSec 30 -OutFile (Join-Path $tmp 'interface.js')
 $ui=[IO.File]::ReadAllText((Join-Path $tmp 'interface.js'))
 $html=[IO.File]::ReadAllText((Join-Path $root 'public/index.html'))
 if($html.Contains('BET_COMMERCIAL_UI_V1') -or $html.Contains('bet-test-panel')){throw 'Pagina ja modificada; nao publique novamente sem revisar'}
 $anchor='const db = getFirestore(app);'
 $html=Replace-Exactly $html ([regex]::Escape($anchor)) ($anchor+[Environment]::NewLine+$ui)
 $html=Replace-Exactly $html '(?m)^\s*button\.hidden=active;button\.disabled=.*?;\s*button\.textContent=.*?;\s*note\.textContent=.*?;\s*(?=\})' " button.hidden=active;button.disabled=false;button.textContent='Meu plano BET';note.textContent=active?'Seu acesso exclusivo esta ativo.':'Consulte disponibilidade e contratacao em Meu perfil.';"
 $html=Replace-Exactly $html '(?s)window\.betOpenCheckout=\(\)=>\{.*?\n\};' "window.betOpenCheckout=()=>{go('perfil');};"
 $html=Replace-Exactly $html '<p class="small">As vendas ainda n[^<]+nesta vers[^<]+beta\.</p>' '<p class="small">Consulte abaixo a disponibilidade da assinatura e gerencie sua renovacao.</p>'
 $html=Replace-Exactly $html '(?s)<p>O hist[^<]+Nenhuma assinatura comercial[^<]+</p>\s*<button type="button" class="bet-profile-cancel" disabled>[^<]+</button>\s*<p class="small">Antes da abertura[^<]+</p>' '<p>Use Minha assinatura para consultar seu acesso e cancelar a renovacao. O cancelamento nao exclui sua conta nem o progresso.</p>'
 $html=$html.Replace('Sem cobrança nesta versão.','As cinco aulas permanecem gratuitas.').Replace('Sem cobran'+[char]231+'a nesta vers'+[char]227+'o.','As cinco aulas permanecem gratuitas.')
 $html=$html.Replace('const BET_CHECKOUT_URL=''https://mpago.la/1D3vZWm'';','')
 $module=[regex]::Match($html,'(?s)<script type="module">(.*?)</script>')
 if(!$module.Success){throw 'Modulo Firebase nao localizado'}
 [IO.File]::WriteAllText((Join-Path $tmp 'frontend.mjs'),$module.Groups[1].Value,$utf8)
 node --check (Join-Path $tmp 'frontend.mjs')
 if($LASTEXITCODE -ne 0){throw 'Sintaxe invalida; nada publicado'}
 if(!$html.Contains('betCommercialCheckout') -or $html.Contains('window.location.assign(BET_CHECKOUT_URL)')){throw 'Interface incompleta'}
 Copy-Item -LiteralPath 'public' -Destination $stage -Recurse
 [IO.File]::WriteAllText((Join-Path $root "$stage/index.html"),$html,$utf8)
 $hosting.public=$stage
 foreach($p in @('predeploy','postdeploy')){$hosting.PSObject.Properties.Remove($p)}
 [IO.File]::WriteAllText((Join-Path $root $conf),(@{hosting=$hosting}|ConvertTo-Json -Depth 50),$utf8)
 Write-Host '2/3 - Publicando somente a hospedagem oficial...'
 firebase.cmd deploy --only hosting --project $project --config $conf --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Publicacao nao confirmada; arquivo local preservado'}
 Write-Host '3/3 - Salvando copia local da pagina publicada...'
 $backup=Join-Path $root ("bet-index-antes-comercial-"+$tag+".html")
 Copy-Item 'public/index.html' $backup
 [IO.File]::WriteAllText((Join-Path $root 'public/index.html'),$html,$utf8)
 Write-Host 'INTERFACE COMERCIAL PUBLICADA - CONTRATACOES AINDA FECHADAS.' -ForegroundColor Green
 Write-Host 'https://bet-hebraico.web.app'
}finally{
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
 if(Test-Path $conf){Remove-Item $conf -Force}
 if(Test-Path $tmp){Remove-Item $tmp -Recurse -Force}
}
