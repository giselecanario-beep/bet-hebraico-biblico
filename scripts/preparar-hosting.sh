#!/usr/bin/env bash
# Executar de um clone atualizado do BET. Prepara SOMENTE a pasta pública; não publica.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
rev="$(git rev-parse HEAD)"
out="$(mktemp -d "${TMPDIR:-/tmp}/bet-hosting.XXXXXXXX")"
mkdir -p "$out/public"
git show "$rev:index.html" > "$out/public/index.html"
# Os únicos arquivos locais usados pela interface são as gravações. Não copiar .git, docs, scripts ou lições.
git archive "$rev" assets/audio | tar -x -C "$out/public"
# Somente arquivos de áudio e documentos de crédito, sem scripts ou materiais didáticos.
if find "$out/public/assets/audio" -type f ! \( -iname '*.wav' -o -iname '*.ogg' -o -iname '*.mp3' -o -iname '*.md' -o -iname '*.txt' \) -print | grep -q .; then
  echo "Arquivo inesperado na pasta de áudio; revise antes de publicar." >&2; exit 1
fi
test -s "$out/public/index.html"
for f in alef-parada-glotal-peter-isotalo.ogg bet-voz-humana-ijon.ogg vogal-{a,e,i,o,u}.mp3 palavra-{01,02,03,04,05,06}.wav lingualibre/letra-{03,04,05,07,08,09,10,11}.wav; do
  test -s "$out/public/assets/audio/$f" || { echo "Arquivo ausente: $f" >&2; exit 1; }
done
if grep -Eq 'const BET_CHECKOUT_ENABLED[[:space:]]*=[[:space:]]*true' "$out/public/index.html"; then
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
