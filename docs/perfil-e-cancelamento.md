# BET — área do aluno e cancelamento de assinatura

Registro de requisitos para implementação, 26/11/2026. Não representa funcionalidades já disponíveis.

## Requisitos solicitados
- Aba Meu perfil, facilmente localizável no celular e computador.
- Cancelamento da assinatura dentro do BET, sem precisar falar com suporte, justificar a saída ou atravessar ofertas de retenção.
- O cancelamento precisa interromper de fato a renovação no provedor de pagamento, não apenas ocultar aulas ou mudar um indicador local.
- Manter este documento como lista evolutiva das melhorias.

## Proposta de fluxo
1. Meu perfil > Minha assinatura > Cancelar assinatura.
2. Exibir uma confirmação clara com a data de término do acesso, quando aplicável.
3. Após confirmação, solicitar o cancelamento individual por integração autenticada no servidor com o Mercado Pago; conferir a titularidade da assinatura.
4. Só mostrar sucesso quando houver confirmação do provedor. Mostrar estado de processamento ou erro quando necessário, com possibilidade de tentar novamente sem duplicação.
5. Registrar data, status, referência da operação e enviar/disponibilizar comprovante ao aluno. Não apagar a conta nem o progresso por cancelar a assinatura.
6. Proposta a validar: preservar acesso pelo período já pago, sem novas renovações; permitir cancelamento durante o teste sem cobrança futura. Tratar reembolsos e cobranças em processamento separadamente.

## Segurança e dependências
- Vincular a assinatura do provedor ao UID autenticado por meio seguro; não depender só de e-mail.
- Credenciais do Mercado Pago exclusivamente no servidor; nunca no HTML público ou no repositório.
- Atualizar status e permissões a partir do provedor; validar notificações e reconciliar divergências.
- Avaliar infraestrutura e custos antes da implantação; não habilitar cobrança ou plano pago de infraestrutura sem aprovação.
- Manter vendas desativadas até testar contratação, renovação, cancelamento, erros de rede, autorização entre contas, cancelamento repetido e comprovante.

## Melhorias propostas para Meu perfil
- Dados da conta, recuperação/alteração de senha, progresso e histórico de aulas.
- Estado da assinatura, preço, próxima cobrança, histórico de pagamentos e comprovantes.
- Suporte, privacidade, saída da conta e solicitação de exclusão de conta/dados, distinta do cancelamento da assinatura.
- Conta gratuita: mostrar estado gratuito e ausência de cobrança.

Referência técnica: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management
