# Project Coding Standards

These instructions apply to Beautes. Read `AGENTS.md` for business rules, verification commands and publication scope.

## Testing
- Write tests before code (TDD) — follow `test-driven-development` skill
- For bugs: write a failing test first, then fix (Prove-It pattern)
- Test hierarchy: unit > integration > e2e (use the lowest level that captures the behavior)
- Run tests after every change

## Code Quality
- Review across five axes: correctness, readability, architecture, security, performance
- Before committing, run the Node tests and audit probe listed in `AGENTS.md`; no lint/typecheck or npm package is configured here.
- No secrets in code or version control

## Implementation
- Build in small, verifiable increments (incremental-implementation)
- Each increment: implement → test → verify → commit
- Never mix formatting changes with behavior changes
- Feature work: spec → plan → build → verify → review (full lifecycle)

## Security
- Validate and sanitize all user input
- Never trust client-side data
- No secrets, keys, or tokens in source code
- Use parameterized queries — never string-interpolate SQL

## Boundaries
- **Always:** Run tests before commits, validate user input, check for secrets
- **Confirm scope when not already authorized:** Database schema changes, new dependencies, architectural decisions. Authorization already given in the session remains valid.
- **Never:** Commit secrets, remove failing tests, skip verification
