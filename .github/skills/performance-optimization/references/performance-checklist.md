# Performance no Beautes

Meça o carregamento do painel com um conjunto sintético representativo e registre quantidade de contatos, tempo e erros. O polling ocorre a cada 15 segundos; confira chamadas sobrepostas e custo da renderização antes de propor otimização.

A view deve carregar todos os registros necessários. A leitura Redis das alterações do painel usa prefixo específico e é executada uma vez por requisição. O comando KEYS é aceitável apenas enquanto a instância for pequena; avalie SCAN/índice persistente com métricas se o volume crescer.

Não invente capacidade diária a partir de horários fixos: duração e agenda são regras de negócio. Debounce de 10 segundos é requisito funcional; não o reduza para melhorar uma medição.

Teste em navegador real e informe quando a API estiver simulada. Não declare métricas de produção sem medição. Este projeto não tem bundle npm ou orçamento automático de Web Vitals.
