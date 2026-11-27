# BET | Validação de assinaturas e lançamento
Data: 27/11/2026. Ambiente fictício; nenhuma autorização de venda comercial.

## Evidências disponíveis
- Instalador informou 88 verificações automatizadas aprovadas e publicação das funções e da prévia.
- Usuária confirmou login da segunda conta, formulário de contratação e acesso à lição 06.
- Isso não é evidência independente de renovação paga ou cancelamento confirmado.
- O webhook já teve teste HMAC e reconciliação simulada; notificação espontânea do provedor ainda deve ser comprovada.

## Sequência de validação
1. Executar scripts/auditar-assinaturas-teste.ps1 no computador autenticado. Conferir vendedor fictício, assinatura original, exatamente uma assinatura do novo comprador, referência e aplicação, faturas e origem do acesso Firebase. Não divulgar segredos, tokens, senhas, dados de cartão nem resposta bruta do provedor.
2. Se a auditoria confirmar a contratação individual, registrar o estado inicial. Usar a opção "Cancelar renovação de teste" da seção BET completo na segunda conta. Não usar o botão de cancelamento da assinatura original. Confirmar estado canceled/cancelled por GET independente, repetir auditoria e testar lição 06 em nova sessão. Durante teste gratuito, a política atual encerra acesso ao cancelar; em ciclo pago, preserva o período confirmado. Verificar que aulas gratuitas e progresso continuam disponíveis.
3. Preservar a assinatura original, criada em 26/11, para avaliar renovação esperada em 03/12/2026. A data é previsão; usar a data fornecida pelo provedor e conferir fatura e pagamento aprovado, valor, moeda, comprador, vendedor e ausência de estorno. Comparar status e validade no Firebase antes/depois da notificação real. Se o provedor não gerar cobrança de teste, registrar como não comprovado e não confundir simulação com evento real.
4. A prévia expira em 29/11/2026; renovar a hospedagem de teste antes da validação de dezembro, sem alterar a URL pública. Não repetir instalador de criação de conta/checkout, pois já existe assinatura.
5. O checkout publicado é restrito a um UID/comprador fictício. Não serve ainda para clientes arbitrários.

## Bloqueios para vendas reais
- Implementar associação de cliente, oferta, UID e assinatura individual no servidor para múltiplos usuários, sem conta fixa nem dependência de segredos de teste.
- Separar credenciais, dados, endpoints e webhook de produção dos fictícios; validar identidade do vendedor e oferta comercial; proteger segredos, evitar duplicidade e recuperar contratação incerta.
- Revisar regras Firestore efetivamente implantadas: negar leituras/escritas dos clientes nas coleções betCheckoutIntents, betCheckoutPayerLocks e betCheckoutSubscriptionLocks, negar escrita em betEntitlements e impedir acesso às lições pagas sem autorização vigente. Testar regras no emulador e com contas sem acesso.
- Validar checkout, autenticação, cancelamento, renovação, recusa, estorno, concorrência e isolamento entre dois alunos; garantir recuperação sem duplicação e registros mínimos de auditoria.
- Definir política de cancelamento, preço, início de cobrança, termos, privacidade, suporte, comprovantes e fluxo de acesso para o aluno; revisar obrigações aplicáveis antes do lançamento.
- Aprovação explícita da proprietária antes de ativar o checkout comercial. Manter BET_CHECKOUT_ENABLED=false até cumprir os critérios.
- Plano de reversão para desativar novas contratações preservando acesso contratado, sem remover progresso nem cancelar assinaturas automaticamente.

## Estado
Auditoria independente preparada, ainda não executada. Nenhuma credencial real configurada nesta etapa. Nenhuma assinatura cancelada. Nenhuma alteração publicada na versão pública por este trabalho.
