# BET — requisito de lançamento: continuar de onde parou

Solicitação da responsável pelo BET em 25/11/2026. Implementar depois da disponibilização das aulas 06–10 e antes da abertura comercial, salvo decisão posterior.

## Experiência de estudo
- Salvar automaticamente a última aula aberta e o ponto de estudo (identificador estável da seção/atividade, posição de leitura como apoio e respostas/progresso compatíveis).
- Ao retornar, oferecer “Continuar meus estudos” em destaque na página inicial e restaurar a última posição válida da aula, sem obrigar a percorrer aulas já feitas. O aluno pode acessar qualquer aula autorizada ou reiniciar uma atividade.
- Não confundir aula aberta com aula concluída. Salvar conclusão separadamente; não apresentar percentuais inventados.
- Vincular o estado à conta Firebase, permitindo retomar em outro aparelho. Para visitantes, usar armazenamento local separado e oferecer uma transição explícita ao entrar na conta.
- Salvar após interações relevantes e periodicamente durante o estudo, com debounce, sem depender exclusivamente do fechamento da página. Não compartilhar o estado entre contas; limpar estado e conteúdo pago na saída.
- Verificar acesso no servidor antes de retomar uma aula paga. Se a assinatura expirou, mostrar opção de renovação/consulta, mantendo o progresso e as aulas gratuitas. Nunca abrir conteúdo pago a partir de cache de outro usuário.
- Usar identificadores de aula e seção extensíveis, sem limitar a 10 aulas; preservar o andamento após atualização de conteúdo quando possível.

## Implementação e aceitação
O código atual salva conclusão das aulas gratuitas no Firestore e conclusão das aulas exclusivas no navegador; não implementa retomada de posição. As regras existentes do documento users/{uid}/learning/intro restringem os campos a completed e updatedAt. Criar um documento dedicado de retomada com acesso apenas do próprio usuário ou revisar as regras de modo compatível, sem alterar permissões dos conteúdos pagos. Testar retorno após fechar, troca de aparelho, troca de conta, visitante, perda de conexão e assinatura expirada.

Status: requisito registrado; implementação pendente. Não anunciar como funcionalidade disponível antes de testar.
