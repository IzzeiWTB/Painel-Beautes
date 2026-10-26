# Agent Skills Status

**Workspace:** Amanda n8n

Última conferência: 2026-10-26. Inventário local; presença dos arquivos não significa execução automática ou conformidade do projeto.

## Skills (9)
- code-review-and-quality
- code-simplification
- context-engineering
- debugging-and-error-recovery
- git-workflow-and-versioning
- incremental-implementation
- performance-optimization
- security-and-hardening
- test-driven-development

## Agents (4)
- code-reviewer
- security-auditor
- test-engineer
- web-performance-auditor

## Config files
- Copilot instructions: ✓
- Codex rules: ✓

## Revisão aplicada

- `.github/skills/` passou a acompanhar o Git com as nove skills.
- Referências de segurança, performance e testes foram adicionadas com orientações específicas deste projeto.
- `.github/docs/agents.md` documenta os quatro perfis e esclarece que não são serviços automáticos; comandos `/test` e `/ship` não estão implementados.
- Regras passaram a usar a skill incremental instalada e os comandos Node reais. Não há pacote npm ou lint/typecheck configurado; o CI executa 53 testes e 13 verificações antes de publicar Pages.
- A proibição específica de publicar/commitar workflows sem autorização, no `AGENTS.md`, prevalece sobre recomendações genéricas de commit a cada incremento.
- Resultado inicial: [auditoria de 26/10](auditoria/2026-10-26/RELATORIO.md). Correções e limitações atuais: [correções aplicadas](auditoria/2026-10-26/CORRECOES-APLICADAS.md).

[Setup](command:agent-skills.setup) · [Add](command:agent-skills.add) · [Update](command:agent-skills.update)
