#!/usr/bin/env python3
"""Exporta somente o material didático das aulas 06 a 10 para revisão local.
Não lê contas, assinaturas ou dados de alunos. Não grava no Firestore."""
import json, pathlib, subprocess, urllib.request, urllib.error
project="bet-hebraico"
root=f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/betPaidLessons/"
token=subprocess.check_output(["gcloud","auth","print-access-token"],text=True).strip()
def decode(v):
    if "mapValue" in v: return {k:decode(x) for k,x in v["mapValue"].get("fields",{}).items()}
    if "arrayValue" in v: return [decode(x) for x in v["arrayValue"].get("values",[])]
    if "integerValue" in v: return int(v["integerValue"])
    if "nullValue" in v: return None
    for key in ("stringValue","booleanValue","doubleValue","timestampValue"):
        if key in v: return v[key]
    raise ValueError("Tipo de campo inesperado")
result={}
for n in range(6,11):
    lesson=f"{n:02d}"
    req=urllib.request.Request(root+lesson,headers={"Authorization":"Bearer "+token})
    try:
        with urllib.request.urlopen(req,timeout=20) as res: doc=json.load(res)
        fields=doc.get("fields",{})
        result[lesson]={k:decode(fields[k]) for k in ("schemaVersion","title","body","sounds","quiz","tutor","words","vocabulary") if k in fields}
        print(f"Aula {lesson}: localizada")
    except urllib.error.HTTPError as e:
        if e.code==404: result[lesson]={"ausente":True};print(f"Aula {lesson}: não encontrada")
        else: raise SystemExit(f"Consulta interrompida: HTTP {e.code}. Nenhuma alteração realizada.")
out=pathlib.Path.home()/"bet-revisao-aulas-06-10.json"
out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
out.chmod(0o600)
print(f"Arquivo local: {out}. Não envie ao GitHub. Nenhuma alteração no banco.")
