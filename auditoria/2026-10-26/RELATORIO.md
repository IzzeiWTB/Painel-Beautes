# Auditoria Beautes — 26/10/2026

**Resultado: parte importante foi aplicada em produção, mas o projeto não atende a todos os requisitos e não está aprovado como integralmente funcional. Há exposição pública de dados e falhas de integração que a suíte existente não detecta.**

Escopo: AGENTS.md, regras Codex/Copilot, nove skills locais, quatro definições de agentes, painel e publicação GitHub Pages, dois workflows principais, testes, scripts auxiliares, assets e histórico de execuções n8n. A revisão foi de leitura em produção; não houve envio de WhatsApp, atualização de agenda, alteração de credenciais, publicação ou commit. Foram atualizados somente documentos e adicionados artefatos de auditoria.

## Evidências e limites

- Bia: workflow `FOmnncnOeXOaj7xd`, ativo, 58 nós, atualizado em **23/10 às 15:42:49, horário de São Paulo**. Versão salva/publicada `37efc50a-d8a8-409e-bfb9-0a02a5c92f4e`.
- API: workflow `Ldox1WUD00OGkgfL`, ativo, 29 nós, atualizado em **23/10 às 15:40:06, horário de São Paulo**. Versão salva/publicada `f1010092-63ea-472d-a890-4cebb0de38f1`.
- Conexões e configurações gerais dos dois workflows coincidem com as locais. Na API, os parâmetros também coincidem. Na Bia, há diferenças em `Enviar Imagem Beautes` (campos extras locais) e `Reivindicar Alerta de Solicitação` (`expire: false` explícito local versus ausente remoto), além das posições no canvas. Não se trata de uma versão antiga inteira esquecida no n8n.
- Painel publicado e local são iguais após normalizar quebras CRLF/LF; as cinco artes de pós-procedimento/checklist coincidem byte a byte. As três URLs de imagens de coworking responderam HTTP 200.
- Suíte original: **45/45 passaram** — 26 agendamento/painel, 13 coworking/pausa, 6 API.
- Casos adicionais selecionados para reproduzir falhas: **13/13 requisitos violados**. São casos direcionados, não uma estimativa percentual de falhas de todo o sistema.
- Amostra inicial: 50 execuções da Bia com status `success`; na API, 5 `success` e 45 `error`. Status `success` não prova passagem por todos os ramos: a execução Bia 7693 terminou em `Responder Evento Ignorado`.
- As três falhas API inspecionadas (7694, 7695, 7696), de 23/10, eram requisições do agente `node`, **sem Authorization**, rejeitadas na validação da sessão. Não demonstram falha de login da atendente. A execução autenticada 7701, de **26/10 às 08:26:54**, veio do painel publicado e retornou 86 linhas.
- Não foram testados novos envios reais, confirmação de cliente real, áudio real, concorrência de mensagens ou falhas de entrega Evolution. O conector administrativo Supabase negou acesso: definição SQL, grants, políticas RLS e advisors não puderam ser inspecionados. Não foi feita validação clínica das recomendações das artes.
- Evidências sanitizadas: [evidencias.json](evidencias.json). Não contém tokens, nomes, números ou mensagens de clientes.

## Falhas prioritárias

### 1. CRÍTICA — view com dados de clientes acessível sem login

Uma chamada **HEAD**, usando apenas a chave publicável disponível no HTML, sem sessão de usuário, a `/rest/v1/view_kanban_beautes?select=*&limit=1` retornou **HTTP 206, `Content-Range: 0-0/86`**. A tabela `channel_events`, na mesma checagem, retornou zero linhas visíveis (`*/0`). Não foi necessário baixar o corpo dos registros.

A view retornada ao painel possui campos de nome, telefone, serviço, última mensagem, data e status. A autenticação do webhook não impede o acesso direto à view. O mecanismo exato da permissão depende da inspeção SQL ainda indisponível; o acesso anônimo, porém, foi comprovado.

**Correção:** inspecionar proprietário, `security_invoker`, grants e políticas das tabelas subjacentes; retirar leitura anônima e limitar acesso às atendentes autorizadas. Revalidar tanto o acesso negado anônimo quanto o carregamento autorizado do painel. Views podem contornar RLS quando executadas com privilégios do proprietário; a documentação oficial explica as opções de proteção: [Supabase — RLS em views](https://supabase.com/docs/guides/database/postgres/row-level-security#views).

### 2. ALTA — autenticação sem autorização de atendente

Os quatro caminhos da API validam o token em `/auth/v1/user`, mas não verificam se o usuário pertence à equipe/tenant. Depois, seguem para banco, Redis ou Evolution com credenciais do workflow. A configuração pública de Auth retornou `disable_signup: false` e `mailer_autoconfirm: false`.

O código permite que qualquer usuário com sessão válida desse projeto atravesse a mesma validação; cadastro confirmado não equivale a autorização de atendente. Não foi criada conta nem executada alteração para explorar esse cenário.

**Correção:** verificar uma associação de equipe/tenant controlada no servidor antes de cada ação. Revisar também o cadastro público. A chave publicável no HTML, por si só, não é segredo nem constitui a falha.

### 3. ALTA — estado da conversa e dia aberto perdidos após Redis

Na execução 7374, `Ler Dia Aberto Agenda` devolveu somente `dia_aberto_raw`; `Ler Estado Agendamento` devolveu somente `booking_state_raw`. A chave do segundo nó usa `$json.tenant_slug` e `$json.remoteJid`, que já não estão presentes. A reprodução F01 produz **`beautes:whatsapp:booking:undefined:undefined`**.

`Unificar Estado Agendamento` recupera o contexto de `Preparar Contexto Beautes`, mas não o dia de `Ler Dia Aberto Agenda`; a reprodução F02 perde terça e usa segunda. Isso compromete o estado entre mensagens e a agenda sequencial, mesmo com ambos os nós presentes no canvas.

**Correção:** usar referências explícitas ao contexto original na chave de leitura e recuperar o dia diretamente do nó correspondente, ou restaurar o contexto nas fronteiras. Testar duas conversas intercaladas e duas mensagens separadas, simulando exatamente a saída dos nós Redis.

### 4. ALTA — aviso à atendente quebrado em duas fronteiras e sem assinatura

`Salvar Evento Enviado` retorna uma linha de `channel_events`; a execução inspecionada confirma que não há `booking_state`, `remoteJid` nem `service_tag` nessa saída. O IF seguinte tenta ler `booking_state.customer_confirmed`. A expressão JavaScript equivalente falha no caso F03; no avaliador do n8n, o campo ausente não satisfaz a condição necessária para o aviso.

Mesmo se essa primeira fronteira for corrigida, o INCR devolve um objeto contendo a chave e o contador. `Preparar Alerta para Atendente` espera novamente contexto completo em `$json`; F04 reproduz `RangeError: Invalid time value`. Além disso, a mensagem produzida não termina com `\u200B` (F05), podendo ser interpretada como resposta humana no retorno da conversa da atendente.

**Correção:** recompor o contexto usando `Preparar Evento Enviado`/`Preparar Resposta Beautes`, extrair separadamente o contador do INCR e acrescentar a assinatura ao aviso. Testar o caminho completo com respostas realistas dos adaptadores. As conexões finais para `Responder Evolution API` existem na versão atual, mas não resolvem esses erros anteriores.

### 5. ALTA — nome do contato pode executar JavaScript no painel

`gerarHTMLCard` e o modal de agenda colocam `c.nome` em strings JavaScript dentro de `onclick`. `escaparHtml` transforma apóstrofos em entidades, mas o navegador as decodifica antes de compilar o handler. Em F12, um nome sintético altera uma variável no ambiente isolado quando o handler é avaliado. Nenhum payload foi salvo no banco ou enviado a clientes.

Impacto: execução na sessão da atendente ao clicar no botão afetado. Nomes comuns com apóstrofo também podem quebrar o clique.

**Correção:** remover interpolação de dados em handlers JavaScript; usar `addEventListener` e valores tratados como dados (`dataset`/propriedades). Referências: `Painel_Amanda.html`, linhas 595–610 e 661–665.

### 6. ALTA — horário solicitado pode ser alterado ou aceito fora do expediente

Os casos F06–F08 executam os nós reais de transformação:

| Entrada | Resultado observado | Esperado |
| --- | --- | --- |
| `27/10/2026 às 19h` | grava `19:00` | rejeitar fora de 9h–18h |
| `27/10/2026 14:30` | horário vazio | preservar `14:30` |
| `27/10/2026 às 8 da noite` | grava `08:00` | reconhecer 20h e rejeitar |

O parser reaproveita índices de grupos diferentes entre regexes e não trata corretamente “da noite”. O expediente está no prompt, mas não é imposto pelo código que grava o estado.

**Correção:** separar formatos de parsing, tratar AM/PM/períodos explicitamente e validar expediente no código antes da pré-reserva. Incluir também `14h30`, meia-noite/meio-dia e limites de duração do coworking.

### 7. ALTA — webhook WhatsApp sem autenticação de origem no workflow

`Webhook WhatsApp Evolution` não configura autenticação, e `Normalizar Entrada WhatsApp` confia no corpo recebido para determinar remetente, instância e `fromMe`. Não há validação de segredo/assinatura no caminho analisado. Uma execução legítima inspecionada também chegou sem cabeçalho Authorization.

Impacto potencial: solicitações forjadas podem gerar processamento, eventos ou pausa do bot se não houver proteção externa. Não foram enviados payloads de exploração nem verificada configuração privada do proxy.

**Correção:** verificar o mecanismo de autenticação suportado pelo Evolution instalado e configurar validação de origem no webhook/proxy. Testar rejeição de evento forjado sem produzir mensagens.

## Outros requisitos não atendidos ou parcialmente atendidos

| Item | Evidência | Ajuste necessário |
| --- | --- | --- |
| Preservar toda resposta da IA | F09: após `system_confirmed`, `Preparar Resposta Beautes` substitui a resposta por confirmação fixa, mesmo quando há pergunta sobre valor | preservar resposta útil também após confirmação; restringir template a casos específicos |
| TTL de 24h | F10: API usa `2592000` segundos (30 dias); Bia usa `86400` | alinhar expiração e testar ambos os gravadores |
| Debounce de 10s | F11: nó `Aguardar 10s` tem `amount: 3` | alinhar configuração e documentação; lock tem `expire: true` sem TTL explícito, exigindo revisão da recuperação após falha |
| Vagas reais por data | F13: badge conta segunda-feira de outro ano; usa `getDay()` no fuso do navegador e capacidade fixa 9 | contar a data efetivamente aberta em São Paulo, com capacidade/duração definidas; o seletor atual guarda apenas dia da semana |
| Cadastro, assinatura e movimentação do Kanban | `salvarNovoCliente`, `salvarAssinaturaLead` e `Sortable.onEnd` só alteram `clientesGlobais` | persistir ações no backend; a atualização automática de 15s pode desfazer esses dados, e arrastar para Fechado não confirma no sistema |
| Dia sequencial e identidade no prompt | ainda há quatro referências a “Dra. Amanda Barreto” e instruções de avaliações “exclusivamente” às segundas, concorrendo com o dia dinâmico | reconciliar texto com os requisitos; não considerar nomes totalmente removidos |
| Regras comerciais consistentes | expediente 9h–18h equivale a 9 horas, enquanto diária odontológica anuncia 10h | definir se 10h são crédito repartível ou se há exceção de expediente; não inventar uma regra |
| Resposta HTTP de erro | GET sem sessão retornou 500 `Error in workflow`; nós HTTP interrompem antes de resposta controlada | retornar 401/403 para autenticação/autorização e mensagens úteis no painel |
| Confirmação sem registro pendente | busca Supabase pode retornar zero itens; painel considera apenas HTTP 2xx, não valida `sucesso` | responder erro explícito quando não houver correspondência e exigir sucesso de negócio no frontend |
| Imagens uma vez por conversa | flags são gravadas antes do envio Evolution; erro de envio pode deixar imagem marcada como enviada | confirmar flags após entrega bem-sucedida ou prever retry idempotente |
| Paginação e dependências | API limita view a 100; painel usa Sortable `@latest` e Supabase `@2` | paginar antes de ultrapassar 100 e fixar versões testadas; não foi medida performance de navegador |

O código confirma o banco antes do envio de WhatsApp na confirmação manual. Uma falha do Evolution pode deixar o banco confirmado sem mensagem entregue. É necessário testar retry/idempotência e representar o estado de entrega; não houve reprodução com dados reais.

## O que está implementado e foi comprovado

- Identidade inicial da Bia, catálogo, distinção labial/Full Face, preços/regras de coworking, vídeo e checklist estão presentes no prompt publicado, com as ressalvas acima.
- Pausa de 24h por humano e condição `bot_paused` estão na estrutura correta do IF; restauração de contexto da pausa existe. Os testes correspondentes passam.
- Seleção de imagens de coworking por especialidade, flags de envio e restauração após imagem passam nos testes de lógica. Assets estão acessíveis; entrega real não foi disparada nesta revisão.
- Todos os cinco tipos de recomendações são preparados pelos nós da API; arte/texto levam assinatura nos testes existentes. A assinatura da confirmação manual também foi avaliada e termina no caractere U+200B real.
- API consulta o agendamento persistido, valida serviço/instante e atualiza por `external_message_id`; existe guarda para não marcar como confirmado um horário Redis diferente. Não é uma prova de retry/concorrência ou entrega real.
- Painel usa sessão Supabase, acompanha renovação do token e formata datas principais em São Paulo. O modal de confirmação mantém o horário salvo sem campo editável.
- GitHub Pages publica somente os arquivos públicos selecionados, sem copiar os JSONs dos workflows para `_site`.

## Skills, agentes e organização

Foram encontrados **9 SKILL.md**, não os 5 indicados no inventário antigo: revisão, simplificação, contexto, depuração, Git, implementação incremental, performance, segurança e TDD. Há quatro definições de agentes. Arquivos de instrução não são agentes continuamente ativos nem comprovação de que as regras foram aplicadas.

- `.github/skills/` está no `.gitignore`; skills não são reproduzidas por um clone do Git.
- Faltam referências auxiliares de revisão/segurança/performance/testes. As definições de agentes apontam para `.github/docs/agents.md`, também ausente.
- `.codex/rules.md` menciona `spec-driven-development` e `planning-and-task-breakdown`, ausentes do inventário local.
- Não existe `package.json`, lockfile ou configuração de lint/typecheck. Isso não impede os testes Node atuais, mas torna inaplicáveis vários comandos genéricos das skills.
- O CI só publica Pages; não roda os testes. Os três arquivos da suíte ainda estão fora do Git.
- O teste chamado “manual confirmation runs end to end” verifica a sequência de nomes de nós, não executa banco/Redis/Evolution. Os mocks de agendamento preservam campos que os nós reais descartam. Essa é uma razão objetiva para os 45 testes verdes coexistirem com falhas de produção.
- Scripts `fix*.js`, `update*.js`, `add*.js`, `remove_odontology.js` e similares alteram diretamente os JSONs; são ferramentas históricas, sem pipeline ordenado/idempotente. Não foram executados. Backups e arquivos temporários existentes foram preservados.
- Não houve achado de JWT literal no scan dos arquivos de texto inventariados; isso não substitui auditoria integral de segredos no histórico Git/credenciais do n8n.

## Reprodução e ordem de correção

```powershell
node --test tests/scheduling-flow.test.js tests/coworking-flow.test.js tests/api-confirmation.test.js
node auditoria/2026-10-26/verificar-requisitos.cjs
```

O primeiro comando passa 45 testes. O segundo não acessa rede nem altera arquivos de negócio e sai com código 1 enquanto houver requisito violado. A saída desta auditoria está em [requisitos-resultado.json](requisitos-resultado.json).

1. Fechar exposição anônima da view e implementar autorização da equipe.
2. Corrigir contexto nas leituras Redis e no ramo de alerta, incluindo assinatura.
3. Corrigir handlers do painel e parser/validação de horários.
4. Ajustar confirmação/entrega/retry, resposta após confirmação, TTL e agenda por data.
5. Persistir ações hoje apenas visuais e reconciliar prompt/regras comerciais.
6. Transformar reproduções em testes de regressão, adicionar testes das fronteiras com saídas reais e integrar ao CI.
7. Publicar somente após autorização explícita e validar com conversa de teste autorizada. Esta auditoria não publicou nem corrigiu workflows ou banco.

Para respostas de webhook, erro antes do nó de resposta retorna 500; terminar sem passar pelo nó de resposta pode produzir HTTP 200 padrão. Isso reforça a necessidade de validar sucesso de negócio, não apenas HTTP: [documentação n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/#workflow-behavior).
