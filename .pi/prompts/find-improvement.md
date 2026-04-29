---
description: Review the codebase, find an undocumented area for improvement, add it to improvements.md, and commit.
argument-hint: "[focus area or 'auto']"
---
Review the seaport-viem codebase to find one area for improvement that is NOT already documented in `improvements.md`. When a focus area is given (e.g., "tests", "types", "error handling", "docs"), concentrate the review there; otherwise search broadly across the project.

## Process

1. **Read `improvements.md` fully** to understand existing entries, the format (Bugs → Should fix → Nice to have → Simplification opportunities), and what's already been identified.

2. **Survey the codebase** — read across source files, tests, config, and types. Look for:
   - Missing test coverage (functions or branches not tested)
   - Type safety gaps (unsafe casts, missing generics, `any` usage)
   - Error handling that could be clearer or more consistent
   - Code duplication or structural redundancy
   - Documentation gaps (missing JSDoc, stale comments, unclear exports)
   - Fragile patterns (string matching, hardcoded values, implicit assumptions)
   - Edge cases not handled (empty arrays, zero values, extreme inputs)
   - Inconsistencies with the project's established patterns (see `AGENTS.md`)

   Also consult `bug-patterns.md` for the six common bug root causes
   identified in this codebase. Each pattern includes a "How to spot it"
   section that makes searches more targeted.

3. **Verify it's genuinely new** — search `improvements.md` for related keywords to avoid duplicate entries. If the issue overlaps with an existing entry, either pick something else or expand the existing entry.

4. **Run `bun test`** before writing to establish a baseline (all tests must pass).

5. **Add the entry to `improvements.md`** following the existing format strictly:

   ```markdown
   ### N. Short descriptive title

   [Clear explanation of the issue with code snippets, file paths, and line references.]

   **Context**: Why this matters and how it fits into the project's design.
   ```

   Use the next available number (scan the file for the highest issue number). Place the entry in the correct section — "## Bugs" for bugs, "## Should fix" for non-critical gaps, "## Nice to have" for polish, or "## Simplification opportunities" for code reduction.

6. **Run `bun test`** to confirm nothing is broken (documenting an issue should never break tests).

7. **Run `bun run typecheck`** to confirm types are clean.

8. **Commit** with a descriptive message:
   ```
   docs(improvements): document issue N — short description
   ```

## Guidelines

- **One improvement per invocation.** If you spot more than one, pick the most impactful.
- **Be specific.** Include file paths, line numbers, and short code excerpts. Link to the relevant `AGENTS.md` constraints when applicable.
- **No false positives.** If you can't find a genuine improvement after reasonable effort, say so rather than inventing something trivial.
- **Respect the existing order.** New entries go at the end of their section, keeping the existing numbering.
