#!/usr/bin/env python3
"""Select an existing BET test account and deploy only the three test functions."""
import json, os, pathlib, subprocess, urllib.request, urllib.parse, urllib.error
project="bet-hebraico"
root=pathlib.Path(__file__).resolve().parents[1]
token=subprocess.check_output(["gcloud","auth","print-access-token"],text=True).strip()
def get(url,allow_missing=False):
    req=urllib.request.Request(url,headers={"Authorization":"Bearer "+token})
    try:
        with urllib.request.urlopen(req,timeout=30) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        if allow_missing and e.code==404: return None
        raise RuntimeError("Falha na consulta ao Google: HTTP "+str(e.code)) from None
users=[]
cursor=None
while True:
    query={"maxResults":1000}
    if cursor: query["nextPageToken"]=cursor
    data=get("https://identitytoolkit.googleapis.com/v1/projects/"+project+"/accounts:batchGet?"+urllib.parse.urlencode(query))
    users.extend(u for u in data.get("users",[]) if u.get("email") and u.get("localId") and not u.get("disabled"))
    cursor=data.get("nextPageToken")
    if not cursor: break
if not users: raise SystemExit("Nenhuma conta existente disponível.")
users.sort(key=lambda u: ("test" not in u["email"].lower(),u["email"].lower()))
print("Escolha exclusivamente uma conta de teste que você já criou. Nenhum usuário novo será criado.")
for i,u in enumerate(users,1):
    print(str(i)+". "+u["email"])
try: n=int(input("Número da conta de teste: "))
except ValueError: raise SystemExit("Seleção inválida.")
if not 1<=n<=len(users): raise SystemExit("Seleção inválida.")
u=users[n-1]
uid=u["localId"]
if not uid or any(c in uid for c in "\r\n= "): raise SystemExit("UID inválido.")
doc=get("https://firestore.googleapis.com/v1/projects/"+project+"/databases/(default)/documents/betEntitlements/"+urllib.parse.quote(uid,safe=""),True)
if doc:
    f=doc.get("fields",{})
    if f.get("role",{}).get("stringValue") in ("owner","collaborator") or f.get("source",{}).get("stringValue")!="mercado-pago-test":
        raise SystemExit("A conta possui acesso protegido. Nenhuma alteração realizada.")
# Keep other local parameters, do not store any secret.
env=root/"functions"/(".env."+project)
lines=env.read_text().splitlines() if env.exists() else []
lines=[line for line in lines if not line.strip().startswith("BET_TEST_UID=")]
env.write_text("\n".join(lines+["BET_TEST_UID="+uid])+"\n")
print("Conta de teste selecionada. Publicando somente as funções de teste; não altera Hosting nem regras.")
subprocess.run(["npm","test"],cwd=root/"functions",check=True)
subprocess.run(["npx","--yes","firebase-tools","deploy","--only","functions:betStartTest,functions:betSyncTest,functions:betCancelTest","--project",project],cwd=root,check=True)
print("PUBLICAÇÃO DE TESTE CONCLUÍDA. Ainda é necessário validar o checkout.")
