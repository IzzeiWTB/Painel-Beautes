# Contexto do Projeto Beautes

Última atualização: 2026-10-26

## Revisão e correções de 2026-10-26

O usuário autorizou corrigir e aplicar os achados, preservando o acesso atual do site e as credenciais. A diária odontológica permanece em 10h e deve ser encaminhada à atendente até definição comercial.

- [Relatório inicial](auditoria/2026-10-26/RELATORIO.md): histórico dos problemas encontrados, antes das correções.
- [Correções e limites da validação](auditoria/2026-10-26/CORRECOES-APLICADAS.md) e [evidências de aplicação](auditoria/2026-10-26/aplicacao.json).
- 53 testes Node e 13 reproduções da auditoria passam. CI executa ambos antes de publicar Pages.
- Integrações Gemini e Redis verificadas no n8n com dados isolados; nenhum teste enviou WhatsApp a clientes. Todos os cinco endpoints do painel retornam 401 sem sessão.
- Acesso anônimo à view e ausência de autorização por equipe foram mantidos por decisão do usuário; não estão resolvidos. Autenticação da origem Evolution continua pendente de configuração do emissor/proxy.

## Arquitetura

- `Bia Beautes - WhatsApp Evolution V4.5 + Redis Debounce 10s (2).json`: recebe mensagens, mantém estado de conversa no Redis, identifica serviço/data/horário, responde pelo Evolution e grava eventos em `channel_events`.
- `Beautes - API Kanban Dashboard (2).json`: serve `view_kanban_beautes` ao painel e recebe a confirmação manual da atendente para atualizar `channel_events`.
- `Painel_Amanda.html`: lê os webhooks do n8n; o painel usa `service`/tag, `stage` e `data_agendamento`.
- Timezone esperado para agendamentos: `America/Sao_Paulo` (UTC-03:00).
- Estado de seleção entre mensagens é mantido por conversa no Redis. Agendamento só deve ser considerado concluído depois da confirmação manual registrada no sistema.

## Estado do Repositório

- Workflows corrigidos foram publicados no n8n em 26/10, com a versão ativa conferida contra os nós e conexões locais. Consulte IDs e versões em auditoria/2026-10-26/aplicacao.json.
- Painel, workflows, testes, documentação e nove skills acompanham esta revisão no Git. Pages publica apenas HTML e as cinco artes listadas no CI.
- Scripts históricos e backups locais não são um pipeline de migração; não os execute novamente para instalar as correções.
- Cadastro manual, assinatura e coluna do Kanban são persistidos no Redis existente, separados por contato/ação, sem TTL. A configuração de persistência/backup do servidor Redis precisa ser mantida pela operação.

## Aviso à Atendente e Resposta Webhook (concluído)

O aviso para `5522996186798` é enviado pelo workflow WhatsApp, após `Salvar Evento Enviado`, quando a cliente confirma serviço/data/horário (`Cliente confirmou serviço e horário?` → `Reivindicar Alerta de Solicitação` → `Preparar Alerta para Atendente` → `É o primeiro alerta?` → `Avisar Atendente Agendamento`). É deduplicado por Redis `INCR` (conversa + serviço + instante) e diz que é **pedido pendente de conferência**, nunca que já foi agendado. Todas as ramificações finais (`Cliente confirmou: false`, `É o primeiro alerta: false` e `Avisar Atendente Agendamento`) convergem para `Responder Evolution API`, garantindo resposta HTTP 200 síncrona com `delivery_status: 'sent'` para fechar o ciclo do webhook.

## Confirmação Manual (workflow da API)

`POST Confirmar Cliente` → validação da sessão Supabase → `Extrair Dados` → `Buscar Agendamento Pendente` → `Validar Agendamento Salvo` → `Atualizar Banco` → `Preparar Mensagem Confirmação` → `Ler Estado Agendamento (API)` → `Marcar Estado Confirmado` (grava `system_confirmed` no Redis só se o horário da conversa for o mesmo que a atendente validou) → `Salvar Estado Confirmado` → `Avisar Cliente Confirmado` → `Responder ao HTML`. Após salvar o estado, a API verifica recibo por evento e usa trava Redis de 60s antes de enviar. Entrega bem-sucedida gera recibo por 30 dias; falha libera a trava e retorna erro para reenvio no painel. A etapa de envio descrita acima passa por esses nós. Não há aviso à atendente nesse ramo.

## Envio de Recomendações e Orientações (Labial, Botox, Endolaser, Cirurgia & O Que Trazer - API & Painel)

- O painel (`Painel_Amanda.html`) possui os botões:
  - `Enviar Pós-Labial 👄` (preenchimento labial);
  - `Enviar Pós-Botox 💉` (botox);
  - `O Que Trazer 🎒` e `Pós-Endolaser ⚡` (para endolaser);
  - `Enviar Pós-Cirurgia Facial 🌸` (cirurgia estética da face);
  - Todos também disponíveis no modal de agenda.
- O endpoint `POST /webhook/beautes-pos-preenchimento` suporta:
  - `tipo: 'botox'` (`pos_botox.jpg`);
  - `tipo: 'labial'` (`pos_preenchimento_labial.jpg`);
  - `tipo: 'endolaser'` (`pos_endolaser.jpg`);
  - `tipo: 'cirurgia_face'` (`pos_cirurgia_face.jpg`);
  - `tipo: 'o_que_trazer_endolaser'` (`o_que_trazer_endolaser.jpg`).
  Valida a sessão Supabase, prepara a mensagem, envia a arte via Evolution API com legenda inicial, envia o texto completo com as recomendações/checklist e responde com sucesso. Ambas as mensagens levam a assinatura `\u200B`.
- O prompt do Gemini (`Assistente Bia`) possui o checklist do que trazer no Endolaser Pro (enviado assim que a paciente fechar a data do procedimento) e todo o conhecimento clínico das quatro artes de pós-procedimento.

## Regras Críticas de Implementação

- **Assinatura do bot:** toda mensagem enviada pelo workflow via Evolution (texto, legenda de imagem, confirmação da API) deve terminar com `\u200B`. O webhook devolve essas mensagens como `fromMe`; sem a assinatura `Normalizar Entrada WhatsApp` as lê como humano e pausa a Bia por 24h.
- **Pausa por humano:** `Mensagem valida?` é IF v2.2; a checagem de `bot_paused` precisa estar em `conditions.conditions[]` (o bloco legado `conditions.string` é ignorado nessa versão). O nó `Restaurar Contexto apos Pausa` recompõe os campos originais de `Normalizar Entrada WhatsApp` após a leitura do Redis para garantir que `shouldProcess` e `tenant_slug` não sejam descartados.
- **Contexto após imagem:** o nó de imagem devolve a resposta da API, então `Restaurar Contexto apos Imagem` recompõe o contexto antes de `Enviar Resposta pela Evolution` (que lê `$json.remoteJid` e `$json.responseText`).
- **Identidade e Operação:** a IA se apresenta estritamente como "Bia, assistente virtual do Beautes Coworking". Horário de funcionamento no geral: de 9h às 18h (para todos os serviços, recepção, estética e coworking). Consultas avaliativas e procedimentos seguem preenchimento sequencial de dias (iniciando pela segunda-feira, das 9h às 18h). Todos os nomes próprios (Dr. Cristiano, Amanda, Beleza Beautes) foram removidos dos prompts voltados ao cliente; consultas de odontologia/cirurgia são direcionadas a consulta avaliativa.
- **Mensagem de Pré-reserva e Confirmação da Atendente:** ao pré-reservar ou quando o cliente confirma dia/horário, a Bia informa explicitamente que uma atendente irá verificar e confirmar o horário na agenda, e que uma mensagem de confirmação será enviada pelo WhatsApp assim que for validado. Quando a atendente clica em Confirmar no painel, o workflow da API (`Beautes - API Kanban Dashboard (2).json` via nó `Avisar Cliente Confirmado`) envia automaticamente a mensagem no WhatsApp confirmando o agendamento (`✅ Olá! Passando para avisar que o seu agendamento de ... foi confirmado... Te esperamos na clínica! 💖\u200B`).
- **Preenchimento Labial vs Full Face e Regras de Preço:** Preenchimento Labial é focado exclusivamente nos lábios; Preenchimento Facial se chama Full Face. Quando o cliente perguntar valores, a IA nunca deve ignorar ou desviar da pergunta: deve explicar que o valor só é passado mediante consulta avaliativa (segundas-feiras, 9h às 18h) para avaliar a necessidade e definir a quantidade de ML proporcional ao lábio (ou rosto), convidando a agendar na segunda-feira.
- **Preservação da Resposta da IA (`Preparar Resposta Beautes`):** o nó nunca sobrescreve o texto gerado pelo Gemini se ele estiver preenchido, garantindo que dúvidas e perguntas sobre valores sejam respondidas normalmente em vez de prender o cliente em loops repetitivos de confirmação de agendamento.
- **Gestão da Agenda Sequencial (Painel & API):**
  - O painel (`Painel_Amanda.html`) possui uma barra de controle da agenda com seletor `selectDiaAtivo` (segunda a sexta), badge de vagas em tempo real (`badgeVagasDia`) e botão `Avançar Dia (Lotou) ⏩`.
  - A API (`Beautes - API Kanban Dashboard (2).json`) possui o endpoint webhook `beautes-agenda-dia` (POST) que valida a sessão Supabase e gerencia a chave Redis `beautes:agenda:dia_aberto` (ações `get` e `set`).
  - O workflow do WhatsApp (`Bia Beautes...`) possui o nó Redis `Ler Dia Aberto Agenda` entre `Preparar Contexto Beautes` e `Ler Estado Agendamento`, permitindo que `Unificar Estado Agendamento` injete dinamicamente o dia aberto no prompt do Gemini a cada mensagem.
- Não commitar nem publicar os workflows sem autorização explícita; não alterar credenciais. A autorização para as correções desta revisão foi concedida em 26/10/2026 e não exige nova confirmação para o mesmo escopo.


## Arquitetura do Coworking (Atualizado)

O Coworking possui duas modalidades distintas de locação, ambas com **reserva mínima de 3 horas** e **sinal obrigatório de 50% via PIX** (CNPJ `54747955000136` - Sicoob / BeautesCoworking), operando das 9h às 18h:
1. **Consultório Odontológico**:
   - Tabela: `https://foxsxchuwguyahimkxfd.supabase.co/storage/v1/object/public/assets-beautes/imagem%20beautes.jpeg`
   - Preço avulso: R$ 70,00/hora (mínimo R$ 210,00).
   - Pacotes: Meia diária (5h) R$ 220,00 / Diária (10h) R$ 350,00. Manter a oferta de 10h e encaminhar à atendente; não prometer encaixar 10h no expediente 9h–18h nem inventar divisão entre dias.
   - Planos Mensais: 4 meias diárias (20h) R$ 1.120,00 / 4 diárias (40h) R$ 1.500,00.
2. **Sala para Procedimentos (Saúde e Estética)**:
   - Tabela: `https://foxsxchuwguyahimkxfd.supabase.co/storage/v1/object/public/assets-beautes/Beautes_coworking_corrigido.jpeg`
   - Preço avulso: R$ 55,00/hora (mínimo R$ 165,00).
   - Pacote: 10 horas por R$ 500,00.
   - Plano Mensal: R$ 1.800,00.
3. **Fluxo de Imagens**:
   - `Unificar Estado Agendamento` decide quais imagens enviar e expõe `send_coworking_image` (booleano) e `coworking_images` no nível raiz do item. Cada imagem é enviada **uma única vez por conversa** (flags `coworking_odonto_sent`, `coworking_procedimento_sent`, `coworking_rules_sent` no estado Redis).
   - Primeiro contato genérico (ex.: "Vcs alugam sala?"): envia as **Regras** (`Regras_Coworking.jpeg`); a Bia responde com o vídeo do Instagram (`https://www.instagram.com/reel/DbdUm2DxAGu/?stkn=MWd5NTZ3NGV2bWJ5`) e pergunta a especialidade e as horas.
   - Especialidade identificada (dentista → tabela Odonto; estética/saúde → tabela Procedimentos): envia a tabela correspondente; se for a primeira mensagem, envia tabela e depois as regras.
   - Ramo no n8n: `Detectar Sublocação para Imagem` → `Montar Imagens Coworking` → `Enviar Imagem Beautes` → `Restaurar Contexto apos Imagem` → `Salvar Estado apos Imagens` → `Enviar Resposta pela Evolution`. A conversa só sai do coworking se o cliente pedir outro serviço sem citar profissão/aluguel.
   - Detecção de aluguel: `alug*`, `locac*`, `subloc*`, `cowork*`, `sala por hora`, `meia diaria`. "odontologia", "clareamento" ou "Medical Center" sozinhos **não** são coworking.

## Roteamento de atendimento e painel

- Saudação genérica não inicia oferta de coworking. Endolaser/procedimentos e locação recebem blocos de prompt distintos, conforme intenção detectada.
- Memória usa `beautes:chat:v2:<tenant>:<conversa>:coworking|procedimentos`. Histórico anterior não foi apagado; o novo prefixo evita reaproveitar respostas contaminadas.
- Contexto é recuperado por referência explícita ao atravessar Redis GET/INCR ou Supabase. Flags de imagem só ficam persistidas após envio.
- Botão de reenvio usa o evento salvo. Arrastar para Fechado exige confirmação; mudanças locais não fingem sucesso do banco.
- POST beautes-painel-contato autentica sessão e grava cadastro/status/assinatura. GET beautes-dashboard combina view completa com metadados Redis.
- A badge informa agendamentos confirmados na data selecionada, sem presumir capacidade de nove vagas. A capacidade continua sob conferência da atendente.

## Testes

Comandos locais e de CI (Node 24, sem dependências npm):

```powershell
node --test tests/scheduling-flow.test.js tests/coworking-flow.test.js tests/api-confirmation.test.js tests/integration-boundaries.test.js
node auditoria/2026-10-26/verificar-requisitos.cjs
```

53 testes e 13 verificações passam. Testes de grafo não equivalem a entrega real; navegador foi verificado com API simulada, e Gemini/Redis foram exercitados separadamente no n8n. TTL de agendamento: 86400s; recibo de envio é dado distinto e dura 30 dias.
