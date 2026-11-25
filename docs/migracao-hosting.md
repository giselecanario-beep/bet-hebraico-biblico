# Migração BET para Firebase Hosting — operação assistida

A etapa de publicação necessita de sessão Google autorizada no projeto bet-hebraico. O acesso ao GitHub não concede acesso ao Firebase. Não solicitar tokens, senhas ou chaves privadas por chat.

1. Confirmar que o projeto permanece no plano Spark. Usar apenas Firebase Hosting clássico, não App Hosting. Não vincular faturamento.
2. Em Cloud Shell autenticado, clonar a main atual do BET, executar scripts/preparar-hosting.sh e conferir o diretório gerado. O script não publica nada. A exportação inclui index.html, gravações utilizadas e documentação de créditos; não inclui histórico, scripts administrativos ou corpos das aulas pagas.
3. Publicar apenas Hosting com firebase deploy --only hosting --project bet-hebraico, a partir do diretório indicado. Verificar a URL efetivamente retornada pela ferramenta. Não publicar regras de Firestore ou Functions.
4. Conferir domínio autorizado no Firebase Authentication; testar cadastro/login, recuperação de senha, cinco aulas gratuitas, acesso de proprietária/colaborador, retomada entre domínios e áudios.
5. Progresso em nuvem permanece associado ao mesmo UID. Dados exclusivamente locais (ex.: revisão espaçada) não atravessam origens automaticamente. Não prometer migração integral desses dados.
6. Com a nova hospedagem validada, tornar o repositório privado pela administração do GitHub e desativar a hospedagem antiga. Guardar referência do novo endereço. Cópias anteriores do histórico público podem continuar existindo.
7. Checkout permanece desativado até testes de assinante, expiração e revogação, além de definição do atendimento e documentação comercial.

Validação preparatória: metadados do GitHub confirmaram a existência dos arquivos de áudio requeridos, inclusive MANIFEST.json, e checkout desativado no index.html. Não houve publicação nem teste de reprodução nesta etapa.
