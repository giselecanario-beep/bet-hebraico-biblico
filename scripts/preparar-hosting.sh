#!/usr/bin/env bash
# Executar de um clone atualizado do BET. Prepara SOMENTE a pasta pública; não publica.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
rev="$(git rev-parse HEAD)"
out="$(mktemp -d "${TMPDIR:-/tmp}/bet-hosting.XXXXXXXX")"
mkdir -p "$out/public"
git show "$rev:index.html" > "$out/public/index.html"
git show "$rev:conta.html" > "$out/public/conta.html"
test -s "$out/public/conta.html"
# Lista explícita: publicar apenas gravações utilizadas e respectivos créditos.
files=(assets/audio/{alef-parada-glotal-peter-isotalo.ogg,bet-voz-humana-ijon.ogg,README_ALEF_BET.md} assets/audio/vogal-{a,e,i,o,u}.mp3 assets/audio/palavra-{01,02,03,04,05,06}.wav assets/audio/lingualibre/letra-{03,04,05,07,08,09,10,11}.wav assets/audio/lingualibre/MANIFEST.json)
for f in "${files[@]}"; do
  git cat-file -e "$rev:$f" || { echo "Arquivo ausente: $f" >&2; exit 1; }
done
git archive "$rev" "${files[@]}" | tar -x -C "$out/public"
test -s "$out/public/index.html"
for f in "${files[@]}"; do test -s "$out/public/$f"; done
if grep -Eq 'const BET_CHECKOUT_ENABLED[[:space:]]*=[[:space:]]*true' "$out/public/index.html" && [[ "${BET_ALLOW_COMMERCIAL:-0}" != 1 ]]; then
  echo 'Checkout ativo: esta preparação exige revisão comercial.' >&2; exit 1
fi
cat > "$out/firebase.json" <<'JSON'
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "headers": [
      {"source":"**","headers":[{"key":"X-Content-Type-Options","value":"nosniff"},{"key":"Referrer-Policy","value":"strict-origin-when-cross-origin"}]},
      {"source":"/index.html","headers":[{"key":"Cache-Control","value":"no-cache"}]},
      {"source":"/conta.html","headers":[{"key":"Cache-Control","value":"no-store"},{"key":"Referrer-Policy","value":"no-referrer"}]},
      {"source":"/","headers":[{"key":"Cache-Control","value":"no-cache"}]}
    ]
  }
}
JSON
printf '\nPreparação concluída: %s\nVersão: %s\n' "$out" "$rev"
du -sh "$out/public"
printf '\nNenhuma publicação, regra ou cobrança alterada.\n'
printf 'Depois da autorização, revise a pasta e execute no diretório indicado:\n'
printf 'cd %q\n' "$out"
printf 'firebase deploy --only hosting --project bet-hebraico\n'
