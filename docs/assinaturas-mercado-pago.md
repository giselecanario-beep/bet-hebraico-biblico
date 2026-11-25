# BET — preparação de assinaturas Mercado Pago (não implantada)

Plano comercial recuperado: BET Completo Mensal, R$ 19,90/mês, 7 dias de teste grátis, link existente https://mpago.la/1D3vZWm. Conferir o plano no painel do titular antes de reabrir o checkout. As aulas 1–5 seguem gratuitas. Não solicitar pagamento enquanto o módulo 2 não estiver protegido e testado.

## Firestore (Spark): fase manual

- Authentication já utiliza e-mail e senha. Identificar o UID do aluno após confirmar o e-mail da conta.
- Criar coleção `betEntitlements`, documento com ID igual ao UID do aluno. Campos: `active` (boolean), `validUntil` (timestamp), `subscriptionId` (string, ID da assinatura verificada). Não armazenar números de cartão ou segredos.
- Autorizar somente depois de conferir diretamente no painel Mercado Pago o plano, a identidade do assinante, a condição do teste ou do pagamento e a data de validade. Não confiar em capturas de tela, parâmetros da URL ou declarações do cliente. Não criar permissões com validade ilimitada.
- Renovar a validade após confirmar cada período. Revogar quando necessário por cancelamento, estorno, fraude ou término, de acordo com as condições do plano.
- Mover os conteúdos para coleção privada `betPaidLessons`, documentos 06–10; nunca incorporar o corpo pago no HTML público. O histórico do repositório público já contém uma prévia e não pode ser considerado confidencial. Planejar retirada da referência pública e proteção do conteúdo futuro.
- Os exemplos de regras em `docs/firestore-assinaturas-exemplo.rules` são um **trecho** para revisão e integração nas regras existentes; não substituir o arquivo inteiro. Regras permissivas sobrepostas também precisam ser removidas. Não publicar antes de testar: anônimo negado, usuário sem autorização negado, autorizado válido permitido, expirado negado, tentativa de gravar autorização negada, progresso gratuito preservado.

## Automação posterior

Mercado Pago Webhooks: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
Criar backend com credenciais em variáveis secretas e identificação inequívoca da assinatura/UID. Validar notificação, consultar API oficial, checar plano e status, atualizar autorizações idempotentemente. Não colocar Access Token nem assinatura secreta no repositório, HTML ou chat. A infraestrutura Firebase Cloud Functions requer Blaze; não ativar sem aprovação.

A versão desta branch consulta o estado de autorização no servidor; ainda não carrega o conteúdo pago nem ativa checkout. A publicação depende de regras, migração dos documentos, testes e autorização.
