---
description: Search the codebase for issues matching a specific bug pattern from bug-patterns.md.
argument-hint: "<pattern-number or name>"
---
Read `bug-patterns.md` in the project root. Identify the bug pattern the user
specified (by number, name, or keyword). Then systematically search the
codebase for undiscovered instances of that pattern.

## Process

1. **Read `bug-patterns.md`** — find the pattern the user asked about. If
   `$1` is `list` or empty, list the available patterns and ask which to
   search for.

2. **Search the codebase** using the "How to spot it" section of the pattern:
   - For **Pattern 1 (Duplication)**: compare modules for copy-pasted logic,
     grep for repeated blocks, look for "also update X" comments.
   - For **Pattern 2 (Missing Validation)**: review every `build*` function
     using the query checklist in `bug-patterns.md#7-query-checklist`.
   - For **Pattern 3 (Fragile Error Handling)**: grep `src/*.ts` for
     `error.message`, `.startsWith`, `.includes`, regex patterns in catch
     blocks.
   - For **Pattern 4 (Inconsistent Parallel Functions)**: compare functions
     side-by-side — `buildFulfillOrder` vs `buildFulfillAdvancedOrder` vs
     `buildFulfillAvailableOrders` vs `buildFulfillAvailableAdvancedOrders`,
     etc.
   - For **Pattern 5 (Type-Unsafe Operations)**: grep for `as `0x${string}``,
     `as any`, or unchecked type assertions in source (not test) files.
   - For **Pattern 6 (Test Fixture Gaps)**: compare `@throws` JSDoc tags
     against actual `expect(...).toThrow` tests.

3. **Filter out already-known issues** — check `improvements.md` to see if
   the found instances are already documented there.

4. **Report findings** — list each undiscovered instance with:
   - File path and line number
   - What the issue is
   - Which pattern it matches
   - Whether it's a bug (silent wrong behavior) or a consistency gap
   - Suggested fix

5. **Offer to add to `improvements.md`** — if the user confirms, follow the
   process in `find-improvement.md` to document it.

## Guidelines

- **Be thorough but not noisy.** Only report genuine issues, not stylistic
  preferences.
- **Prefer evidence over speculation.** Show the exact code snippet and
  explain why it's problematic in the context of the pattern.
- **One pattern per invocation.** If the user says "search for all patterns,"
  pick the highest-impact one and suggest re-running for others.
- **Consult `AGENTS.md`** for project conventions when unsure about what
  "correct" looks like.
- **Check `improvements.md` first** to avoid reporting already-documented
  issues.
