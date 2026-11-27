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
git show "$rev:manifest.webmanifest" > "$out/public/manifest.webmanifest"
# As imagens aprovadas são entregues em pacote separado, com integridade verificada.
brand_archive="${BET_BRAND_ARCHIVE:-$HOME/bet-marca.zip}"
test -f "$brand_archive" || { echo "Envie bet-marca.zip ao diretório inicial do Cloud Shell." >&2; exit 1; }
python3 - "$brand_archive" "$out/public/assets/marca" <<'PY'
import hashlib, pathlib, sys, zipfile
expected={
 "apple-touch-icon.png":"3b5043aacf8d65d226644a67dffe6676212ebf2eaac9f86c826bc5983a977d94",
 "favicon.png":"f3d2026232c938d270eb7d83f0ec866af8dde8bce6d42bb9b71cbd8df75ce0eb",
 "icon-192.png":"6c18f4261288cfd735c13f325a43a84dbb1fc033bd16f96df90d3a0648458f3e",
 "icon-512.png":"f830658fdaf0b92c80606741c14766479d140e941457275888a4139b73d3c9aa",
 "logo.webp":"91f5e388aafead26edee9b0b60c151964ddab1eb7e7a45a159d74d35810886d3"
}
dest=pathlib.Path(sys.argv[2]);dest.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(sys.argv[1]) as z:
 for name,sha in expected.items():
  data=z.read(name)
  if hashlib.sha256(data).hexdigest()!=sha: raise SystemExit("Arquivo da marca divergente: "+name)
  (dest/name).write_bytes(data)
print("Identidade visual verificada.")
PY
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

if [[ -n "${BET_HOSTING_OUTPUT_FILE:-}" ]]; then printf "%s\n" "$out" > "$BET_HOSTING_OUTPUT_FILE"; fi
