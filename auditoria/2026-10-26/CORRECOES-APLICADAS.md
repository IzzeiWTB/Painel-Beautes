# Correções de 26/10/2026

As correções foram autorizadas pelo usuário, preservando o acesso atual do site e as credenciais. O relatório inicial registra o estado anterior; os resultados atuais estão em [aplicacao.json](aplicacao.json).

## Endolaser respondendo como coworking

As execuções analisadas mostraram oferta indevida de coworking na resposta à saudação anterior à pergunta sobre Endolaser. A pergunta seguinte identificou Endolaser. Foram separados os blocos de instrução e a memória de procedimentos/locação, além de bloquear a resposta promocional de aluguel fora dessa intenção. O histórico antigo não foi apagado.

A frase exata da captura e uma saudação genérica têm regressões automatizadas. No n8n com Gemini real, saudação, pergunta de valor do Endolaser e aluguel odontológico passaram por testes isolados. O preço do procedimento não é inventado; a avaliação de R$ 50 é preservada conforme regra existente.

## Aplicado nos workflows

- Contexto de conversa e dia aberto preservados nas fronteiras Redis/Supabase; alertas recompostos após INCR e assinados com U+200B.
- Parser de horário corrigido, expediente validado, TTL de agendamento de 24h e debounce de 10s. Resposta útil da IA preservada após confirmação.
- Flags de imagens persistidas após envio. Falha no aviso à atendente libera a reivindicação para tentativa futura.
- Confirmação vinculada ao agendamento salvo, recibo de envio e trava para cliques repetidos. Falha de WhatsApp é informada ao painel, com possibilidade de reenvio. A gravação no banco precede o envio; não há transação distribuída entre Supabase e Evolution.
- Cinco endpoints do painel usam resposta explícita; checagem publicada sem sessão retornou 401 em todos.
- Cadastro, assinatura e coluna manual persistidos no Redis existente por contato/ação; view sem limite fixo de 100 no nó. O backup/durabilidade do Redis depende da configuração do servidor, não alterada nesta tarefa.
- Prompt sem nomes próprios de profissionais, dia aberto dinâmico priorizado. Diária odontológica mantida em 10h, com contratação encaminhada à atendente por decisão do usuário.

## Painel e manutenção

- Dados de contatos saíram dos handlers JavaScript; nomes com apóstrofos ou conteúdo semelhante a código permanecem dados.
- Cadastro, assinatura e movimentação usam API; arrastar para Fechado exige confirmação real. Falhas não são apresentadas como sucesso.
- Agenda conta confirmações na data específica em São Paulo; não presume capacidade diária fixa. Atualização do dia ativo e tratamento da sessão foram ajustados.
- Dependências CDN fixadas nas versões verificadas. CI executa testes antes de publicar os arquivos públicos no Pages.
- Nove skills passaram a acompanhar o Git; referências ausentes foram adicionadas, instruções adaptadas aos comandos do projeto e uso dos quatro perfis de agentes documentado.
- Publicação do commit `7fb1fbc` concluída com [CI aprovado](https://github.com/IzzeiWTB/Painel-Beautes/actions/runs/40387969287); HTML público comparado com o local. A configuração Pages ainda estava em modo legado por branch, disparando publicação concorrente. Foi alterada para `workflow`, conforme a [API oficial do GitHub](https://docs.github.com/en/rest/pages/pages#update-information-about-a-github-pages-site), para usar apenas o fluxo com testes e seleção dos arquivos públicos.

## Evidência e limites

53 testes Node e 13 verificações da auditoria passam. Nós e conexões publicados no n8n foram comparados com os arquivos locais; IDs/versões estão na evidência. Workflows temporários com Gemini e Redis reais foram removidos após validação. Navegador Edge validou renderização, cadastro, assinatura e dia ativo com API e autenticação simuladas, sem erros de página.

Não foram enviados WhatsApps de teste a clientes, nem foi executada confirmação real de agendamento de cliente. A entrega completa de arte/texto e confirmação depende também do Evolution em operação. Recibos evitam repetição normal, mas uma falha de rede após entrega e antes do recibo pode exigir conferência manual.

O acesso anônimo à view Supabase e o modelo atual de autorização foram mantidos por orientação do usuário; isso não equivale à resolução dos riscos descritos na auditoria. A autenticação da origem do webhook Evolution permanece pendente: exige configuração coordenada no emissor/proxy, cujas credenciais/configuração não foram disponibilizadas. Nenhuma credencial foi alterada.
