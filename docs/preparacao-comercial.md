# BET — preparação comercial (rascunho interno, não publicar como contrato)

## Critérios de lançamento
- Oferta inicial: cinco aulas gratuitas e BET Completo com cinco aulas exclusivas disponíveis; futuras aulas incluídas enquanto vigente. R$ 19,90/mês após sete dias de teste gratuito, conforme plano confirmado pela titular. Não prometer número de futuras aulas ou frequência ainda não definida.
- Confirmar identificação legal do fornecedor (nome empresarial/nome, CPF/CNPJ conforme aplicável, endereço físico e eletrônico), canal de atendimento, condições de ativação, cancelamento, reembolso, emissão fiscal e prazo de suporte. Não publicar dados pessoais no repositório. Revisar com profissional jurídico/contábil.
- Definir prazo de ativação manual e garantir que o período de experiência não seja consumido por atraso na liberação. Não abrir vendas até decidir entre integração automática validada e operação manual com atendimento efetivo. O link de checkout está preparado, mas desativado.
- Testes: conta gratuita, assinante temporário válido, vencimento, revogação durante uma aula e revisão, renovação, associação inequívoca de conta e assinatura, cancelamento, direito de arrependimento, retorno do checkout sem pagamento. Testar em Android, Windows e iOS. Os perfis permanentes já foram testados pela titular; não substituem os testes de assinante comum.
- Resolver publicação de conteúdo pago anteriormente presente no histórico público. Mover desenvolvimento com conteúdo exclusivo para repositório privado e manter apenas a casca pública, ou escolher hospedagem adequada. Remover referências antigas não garante recolhimento de cópias já feitas.
- Áudio: confirmar reprodução, pronúncia e licenças de cada arquivo; ainda há dependências de voz instalada. Não anunciar áudio universal antes disso.
- Revisão de vocabulário: intervalos locais por conta; não anunciar sincronização desses intervalos antes de implementar e validar.

## Minuta de termos de uso — completar antes de publicar
BET é uma plataforma de aprendizagem de hebraico bíblico, inicialmente voltada a iniciantes. O curso utiliza pronúncia israelense contemporânea como convenção de leitura, sem afirmar que ela reproduz integralmente a pronúncia histórica. A tutora oferece explicações guiadas e não é atendimento humano em tempo real. Não há promessa de certificação ou fluência em prazo determinado.
A oferta gratuita permite acesso às cinco primeiras aulas. O BET Completo inclui o catálogo exclusivo disponível durante o acesso vigente. A assinatura tem renovação mensal e o preço e período experimental devem aparecer claramente antes da contratação. O processamento da cobrança ocorre no Mercado Pago. Informar o prazo real de liberação e a forma de confirmar a conta. A pessoa pode solicitar cancelamento e exercer o direito de arrependimento nos termos do CDC, sem prejuízo de outros direitos legais. Disponibilizar meio eficaz de solicitação e confirmação de recebimento.
Conta pessoal, sem compartilhamento indevido de credenciais; direitos autorais sobre conteúdos próprios e créditos/licenças dos materiais de terceiros preservados. Nenhuma cláusula afasta direitos do consumidor.
Pendente: identificação e contatos do fornecedor; política de renovação, cancelamento, reembolso, atendimento, emissão fiscal, tratamento de menores e prazo de ativação. Não usar como versão final.

## Minuta de aviso de privacidade — completar antes de publicar
A conta BET usa Firebase Authentication para cadastro e autenticação; Firestore registra identificador da conta, aulas concluídas, posição de estudo, desafios resolvidos e, quando aplicável, autorização de assinatura e validade. Preferências e intervalos de vocabulário podem ficar no navegador, separados por conta. O Mercado Pago trata dados de pagamento em sua própria plataforma; o BET não solicita cartão dentro da página de estudos. O serviço de hospedagem e fontes externas de áudio podem processar dados técnicos de conexão. Métricas opcionais de Analytics foram desativadas nesta versão; revisar demais recursos e cookies antes de afirmar ausência de rastreamento.
Finalidades: prestação do serviço, registro e recuperação do progresso, controle de acesso, segurança, atendimento e cumprimento de obrigações legais. Determinar e documentar bases legais, prazos de retenção e descarte, fornecedores, transferências internacionais e procedimentos para incidentes.
Titulares podem solicitar confirmação de tratamento, acesso, correção, informação sobre compartilhamento, eliminação quando cabível e demais direitos previstos na LGPD. Definir canal de contato e procedimento de verificação de identidade e atendimento. Não coletar dados sobre crença religiosa nem usar desempenho para inferir crenças. Avaliar proteção de crianças/adolescentes antes de ofertar para esse público.
Pendente: controlador e contatos; inventário efetivo, prazos, bases legais, transferências, segurança, direitos, política para menores. Revisar juridicamente antes de publicar.

## Referências oficiais
- CDC: https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- Decreto de comércio eletrônico: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm
- LGPD: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD: https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares

## Mudanças técnicas de 25/11
Desativada inicialização opcional de Analytics, representação segura do e-mail no DOM e observação de alterações de autorização pelo Firestore. Sintaxe validada; comportamento real ainda precisa ser testado. Sem alteração de regras, plano de nuvem, cobrança ou preço.
