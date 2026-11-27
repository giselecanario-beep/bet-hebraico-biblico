#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
# Verifica a sintaxe dos scripts sem realizar login ou compra.
python3 - <<'PY'
import pathlib,re,subprocess,tempfile
with tempfile.TemporaryDirectory() as d:
 for filename in ('index.html','conta.html'):
  html=pathlib.Path(filename).read_text(encoding='utf-8')
  for i,(attrs,body) in enumerate(re.findall(r'<script\b([^>]*)>(.*?)</script>',html,flags=re.S|re.I)):
   if 'src=' in attrs: continue
   p=pathlib.Path(d)/f'{filename}-{i}.mjs'
   p.write_text(body,encoding='utf-8')
   subprocess.run(['node','--check',str(p)],check=True)
print('Sintaxe verificada.')
PY
out_file="$(mktemp)"
trap 'rm -f "$out_file"' EXIT
BET_ALLOW_COMMERCIAL=1 BET_HOSTING_OUTPUT_FILE="$out_file" bash scripts/preparar-hosting.sh
cd "$(cat "$out_file")"
npx --yes firebase-tools deploy --only hosting --project bet-hebraico
