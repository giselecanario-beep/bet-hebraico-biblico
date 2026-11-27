#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
node --check functions/official.mjs
node --check functions/official-core.mjs
(cd functions && node --test core.test.mjs official.test.mjs)
python3 scripts/conferir-plano-oficial.py
npx --yes firebase-tools deploy --only functions:betOfficialStart,functions:betOfficialSync,functions:betOfficialCancel,functions:betOfficialReconcile --project bet-hebraico
echo "FUNÇÕES OFICIAIS PUBLICADAS. O site atual ainda não foi alterado."
