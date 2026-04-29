---
description: Pick the first unresolved issue from improvements.md, discuss decisions, fix it, document the fix, and commit.
argument-hint: "[issue-number or 'first']"
---
Read improvements.md. Find the first issue that is NOT marked "**Resolved**" (or a specific issue if one was given). For that issue:

1. Read the relevant source code (and test files if applicable) to understand the gap.
2. Discuss with the user any decisions that need to be made — interface choices, test strategy, edge cases, tradeoffs.
3. Fix the issue by editing the necessary source files.
4. Update the issue entry in improvements.md: add "**Resolved**: ..." at the end with a brief description of what was done.
5. Run `bun test` and `bun run typecheck` to confirm everything passes.
6. Commit with a descriptive message referencing the issue number.
