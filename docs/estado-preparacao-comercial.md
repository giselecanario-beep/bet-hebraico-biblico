# BET | Estado da preparação comercial
27/11/2026 — ramificação isolada, sem deploy.

## Implementado nesta ramificação
- Núcleo de contratação associado ao UID autenticado e e-mail verificado, consentimento versionado, referência aleatória, parâmetros de preço/plano definidos no servidor.
- Reserva transacional do aluno, e-mail e referência antes do POST; vínculo único de pagador e assinatura após confirmação; recuperação de POST incerto sem repetir criação.
- Adaptador Mercado Pago comercial separado do fictício, confirmação de vendedor, aplicação e plano, paginação e conferência das faturas. Nenhuma credencial real foi criada ou lida.
- Status e cancelamento por titular, sem aceitar ID de assinatura do cliente. Cancelamento usa o valor cancelled confirmado no teste individual; acesso pago segue a política de período efetivamente aprovado.
- Ações de gerenciamento continuam disponíveis no núcleo mesmo com novas vendas desativadas.
- Testes de isolamento, consentimento, duplicidade, proteção do proprietário, recuperação, token de cartão não persistido e cancelamento. Executadas 44 asserções em runtime JavaScript com substitutos de assert/crypto e banco/provedor simulados; ainda falta execução Node nativa, emulador Firestore e validação com provedor. O script testar-nucleo-comercial.ps1 executa apenas Node local, sem deploy.

## Antes de exportar Cloud Functions ou publicar
1. Revisar regras efetivamente implantadas no projeto. Negar todo acesso direto de clientes às coleções betCommercialIntents, betCommercialEmailLocks, betCommercialReferenceLocks, betCommercialPayerLocks, betCommercialSubscriptionLocks. Preservar regras existentes de progresso e lições. Em Firestore, permissões de matches sobrepostos são combinadas por OR; uma regra explícita false não anula outro allow amplo. Testar regras no emulador e com contas distintas.
2. Implementar endpoints autenticados, limitação de requisições, webhook comercial separado e assinado, resolução por referência/assinatura, conciliação de cobranças e estornos. Nunca usar segredo de teste para vendas reais. Revisar cancelamentos concorrentes, recuperação e registros de eventos.
3. Conferir formato e campos efetivamente retornados pela busca de assinaturas por e-mail. Adaptador falha de modo seguro se os campos esperados faltarem. A busca e os limites precisam de validação no provedor comercial.
4. Integrar interface real com e-mail verificado, termos, tela de consentimento e gerenciamento. Não permitir que teste fictício apareça na versão pública. Prever acesso de proprietário/colaborador sem cobrança.
5. Definir suporte para nova contratação após cancelamento: núcleo atual bloqueia novo checkout quando já existe histórico/lock. Não liberar vendas até prever retorno de assinantes, bloqueios de recuperação incerta e revisão de casos em que o mesmo pagador aparece com e-mails distintos.
6. Conferir renovação fictícia prevista em 03/12 e manter assinatura original preservada. Renovação não comprovada até o momento.
7. Configurar credenciais e plano reais somente com autorização da proprietária, definir termos e privacidade, executar validação controlada, aprovar lançamento. Nenhuma alteração em main ou no hosting público. Não exportar núcleo nem ativar vendas antes dessas condições.
