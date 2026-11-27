# Checkout individual — contrato técnico, ainda desativado

A integração existente continua vinculada a um único comprador fictício. Não habilitar vendas reais.

## Fluxo proposto
1. Autenticar o aluno (Firebase UID e e-mail verificado). O servidor gera uma referência aleatória opaca, registra uma intenção por UID e impede duas assinaturas concorrentes. Nunca confiar no UID, preço, plano ou status recebidos do cliente.
2. Para o plano associado, a documentação exige card_token_id e status authorized. Usar somente a tokenização oficial Mercado Pago; não transmitir ou armazenar número do cartão, CVV ou validade no BET. Avaliar antes o checkout hospedado sem plano e confirmar suporte aos sete dias gratuitos; não presumir equivalência.
3. O servidor usa credenciais segregadas e o plano aprovado, referência opaca e e-mail do pagador confirmado. Uma resposta incerta bloqueia nova criação até reconciliação da referência. Não vincular assinatura somente com id retornado pelo navegador ou e-mail.
4. Confirmar assinatura por GET autenticado, validar referência, vendedor, plano, pagador, valor, moeda e recorrência; registrar relação exclusiva UID/assinatura em transação. Identidade do pagador Mercado Pago pode ser distinta do e-mail de login; tratar explicitamente.
5. Aplicar acesso somente após confirmação do teste gratuito ou fatura paga válida. Webhooks autenticados consultam a API e localizam a relação exclusiva. Renovação, estorno e cancelamento exigem testes reais no ambiente fictício.
6. Manter chaves de produção separadas, regras Firestore negando gravação dos vínculos ao cliente, limites por usuário, termos e consentimento de cobrança. Oferecer cancelamento claro. Nenhuma venda antes da validação de ponta a ponta.

## Referências oficiais
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-associated-plan
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
