# Improvements

Issues and action items identified during code review. Items are ordered by
impact; address the highest-priority items first.

---

## Checks before every commit

Per `AGENTS.md`:

```sh
bun test              # all 150 tests must pass
bun run typecheck     # tsc --noEmit must pass
bun run build         # tsup → dist/ must succeed
```
