#!/usr/bin/env python3
"""Read-only verification of the official BET plan; never creates a subscription."""
import json, subprocess, urllib.request, urllib.error, sys
project="bet-hebraico"
plan_id="417a60404e374b1d935b238e20090873"
def call(url, token):
    try:
        req=urllib.request.Request(url,headers={"Authorization":"Bearer "+token})
        with urllib.request.urlopen(req,timeout=20) as res: return json.load(res)
    except urllib.error.HTTPError as e:
        sys.exit("Mercado Pago recusou a consulta oficial: HTTP "+str(e.code))
try:
    token=subprocess.check_output(["gcloud","secrets","versions","access","latest","--secret=BET_MP_PROD_TOKEN","--project="+project],text=True).strip()
except subprocess.CalledProcessError:
    sys.exit("Credencial de produção ainda não disponível no projeto.")
if not token.startswith("APP_USR-"):
    sys.exit("Formato de credencial de produção não reconhecido.")
who=call("https://api.mercadolibre.com/users/me",token)
if not isinstance(who.get("tags"),list) or "test_user" in who["tags"] or not who.get("id"):
    sys.exit("Conta de produção não confirmada.")
p=call("https://api.mercadopago.com/preapproval_plan/"+plan_id,token)
a=p.get("auto_recurring",{})
t=a.get("free_trial",{})
if p.get("id")!=plan_id or str(p.get("collector_id"))!=str(who["id"]) or p.get("status")!="active" or a.get("currency_id")!="BRL" or float(a.get("transaction_amount",0))!=19.90 or a.get("frequency")!=1 or a.get("frequency_type")!="months" or t.get("frequency")!=7 or t.get("frequency_type")!="days":
    sys.exit("Plano não corresponde às condições do BET. Nenhuma cobrança ou alteração realizada.")
print("PLANO OFICIAL CONFIRMADO: BET | R$ 19,90/mês | 7 dias gratuitos")
print("Credencial de produção e titularidade verificadas. Nenhuma assinatura criada.")
