# Revisão didática, visual e de áudio — 25/11/2026

## Diretrizes
Público: iniciantes de língua portuguesa, sem conhecimento do alfabeto hebraico. Manter o visual editorial vinho/creme, letras hebraicas destacadas e informação adicional sob demanda. Não introduzir pressão por pontuação, cronômetros obrigatórios ou excesso de elementos visuais.

Referências de design consultadas:
- Duolingo: percurso linear, pequenas unidades e prática de revisão (https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo/ e https://blog.duolingo.com/new-duolingo-home-screen-design/).
- Drops: sessões breves e repetição visual de vocabulário (https://languagedrops.com/language/learn-hebrew).
Aplicar princípios, sem copiar telas, marca ou transformar o curso de leitura bíblica em um curso de conversação.

## Revisão editorial
Lidas as cinco aulas gratuitas na main e as cinco aulas da revisão fixa usada na importação Firestore (66b99165aad2bf05cf86954cbaebddc00ebb2cc9). Não houve leitura direta do Firestore nesta revisão. Os 22 grafemas e cinco formas finais estão distribuídos de modo progressivo; a aula 4 é revisão. Aulas 6–10 apresentam 4/4/4/4/6 questões. Manter a pronúncia israelense contemporânea identificada como convenção de leitura, distinta das reconstruções históricas; revisar transliteração para português consistentemente em edição futura. Não alterar documentos pagos sem revisão da administração.

## Implementado em main
- Tutoria guiada recolhida em um painel expansível; fontes e observações de áudio também recolhidas. Marcadores de retomada dentro de detalhes são reabertos ao restaurar.
- Quatro novas referências de áudio humano: yad, mélekh, sus, torá. Arquivos Wikimedia originais por URL direta com créditos e licenças. Playback real ainda não verificado. Para mélekh, yad e sus, Buffer / Lingua Libre CC BY-SA 4.0; torá, YaronSh / Lingua Libre CC0 1.0.
- Reutilização das gravações locais no exercício de escuta; controle de velocidade estendido às gravações; tratamento de falhas e cancelamento concorrente; alternativa apenas por voz hebraica identificada, nunca voz portuguesa. Álef mantém sua demonstração específica.
- Remoção de cartões de áudio duplicados sem alterar índices dos botões das lições.
- Sintaxe JavaScript e rotas representativas de áudio testadas isoladamente. Não equivalem a teste auditivo nem a teste integral no navegador.

## Pendências
As seguintes dez palavras/expressões da etapa 2 ainda não têm gravação independente do aparelho: tov, ki tov, lev, am, ben, ets, kol, pe, rosh, shemá Yisrael. Encontrar gravações com licença comercial apropriada e confirmar a pronúncia, ou produzir gravações próprias. Também conferir nomes de vogais e fontes externas das letras. Preferir arquivos locais devidamente licenciados para reduzir dependência de terceiros. Não afirmar que todos os áudios funcionam em todos os aparelhos.
- Melhorias futuras: revisão espaçada voluntária, guia de objetivos curtos, cartões de leitura com revelação opcional da transliteração e significado (já presente em parte do módulo 2), revisão de erros sem penalidade, e testes de legibilidade com iniciantes. Priorizar os recursos realmente úteis.
- Verificar funcionamento de áudio, navegação e retomada após publicação em Android, Windows e iOS, inclusive quando não houver voz hebraica instalada.
- Checkout permanece desativado. A autorização comercial ainda necessita de testes de assinante comum, expiração e revogação; colaborador permanente não substitui esses testes. Conteúdo antigo exposto no histórico público exige plano de proteção antes das vendas.
