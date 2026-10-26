# Correções autorizadas em 26/10/2026

O usuário autorizou corrigir e aplicar os demais achados, mantendo o acesso atual do site. Não alterar credenciais ou permissões do Supabase.

1. Corrigir e testar contexto Redis, parser/expediente, alertas, assinatura, TTL e debounce.
2. Corrigir fluxo da API: erros explícitos, confirmação/reenvio idempotente, persistência de contatos e assinaturas no Redis existente, leitura completa do painel.
3. Corrigir painel: eventos DOM seguros, persistência, confirmação real ao mover para Fechado, agenda por data, tratamento de erros.
4. Reconciliar prompt, atualizar testes de fronteira e CI/documentação.
5. Salvar versões remotas para rollback, aplicar/publicar os workflows, publicar o painel e verificar versões/HTTP/execuções sem enviar mensagens a clientes.

O acesso anônimo à view e o modelo atual de autorização do site permanecem fora desta alteração por orientação do usuário. Decisão do usuário: manter diária de 10h e encaminhar a contratação à atendente até definição.
