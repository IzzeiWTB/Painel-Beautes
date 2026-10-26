# Revisão de segurança do Beautes

O projeto tem painel público, sessão Supabase e webhooks n8n. Confira separadamente autenticação de usuário, autorização aos dados e autenticação de origem Evolution. Login visível não comprova proteção da view.

- Trate nomes, telefones, mensagens e saídas do modelo como dados; não interpole em handlers JavaScript.
- Valide telefone, ação e limites no backend. Confirmação deve corresponder ao evento persistido, serviço e instante.
- Preserve credenciais referenciadas pelo n8n; não publique tokens ou execuções com dados de clientes.
- Verifique erros explícitos, concorrência, recibos de envio e recuperação após falha.
- Diferencie chave pública Supabase de segredo de serviço. Não relaxe políticas por conveniência.
- Registre exclusões solicitadas pelo usuário sem declarar o risco resolvido.

Antes do commit, revise o diff e os arquivos adicionados por segredos e dados pessoais. Execute os testes de fronteira e o probe de auditoria. O projeto usa dependências CDN fixadas, sem manifesto npm; uma execução de `npm audit` em outra pasta não comprova segurança dessas dependências.

A referência de categorias é o [OWASP Top 10 2021](https://owasp.org/Top10/2021/): controle de acesso, criptografia, injeção, desenho inseguro, configuração, componentes, autenticação, integridade, logging e SSRF. Use as categorias para avaliar as fronteiras reais, sem tratar sua mera presença como conformidade.
