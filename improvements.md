# Improvements

Issues and action items identified during code review. Items are ordered by
impact; address the highest-priority items first.

---

## Checks before every commit

Per `AGENTS.md`:

```sh
bun test              # all tests must pass
bun run typecheck     # tsc --noEmit must pass
```

---

## Should fix

No unresolved issues.

---

## Uncovered lines (coverage gaps)

These lines are reported as uncovered by `bun test --coverage` (100% funcs,
99.23% lines). Each entry explains why the line is uncovered and how to
cover it.

No unresolved issues.

---

## Taste and consistency gaps

These are not bugs or missing validation — the library works correctly in
all cases. But each represents a place where the implementation is
inconsistent with the library's stated architectural values: pure functions,
typed errors, input validation, clean TypeScript, and symmetric API design.
Addressing them would make the codebase more uniform and predictable.

No unresolved issues.
