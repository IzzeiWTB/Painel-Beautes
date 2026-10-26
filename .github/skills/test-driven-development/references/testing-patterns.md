# Testes do Beautes

Execute os quatro arquivos `tests/*.test.js` explicitamente com `node --test`, conforme `AGENTS.md`. Execute também `node auditoria/2026-10-26/verificar-requisitos.cjs`. Não há pacote npm neste projeto.

Para regressões, execute o código dos nós com entradas sintéticas: Redis GET retorna apenas a propriedade solicitada; INCR retorna chave/contador; Supabase retorna a linha persistida. Nunca simule esses adaptadores repassando todos os campos originais.

Teste troca de serviço, saudação sem intenção, datas em São Paulo, expediente, expiração e confirmação vinculada ao evento. Use nomes com apóstrofos e conteúdo semelhante a HTML como dados de teste do painel.

Testes de conexões são estáticos. Testes de navegador com API simulada validam a interface, não a entrega externa. Para integração real, use workflows temporários e dados isolados, removendo recursos ao terminar. Não acione Evolution para destinatários reais sem autorização específica de teste.
