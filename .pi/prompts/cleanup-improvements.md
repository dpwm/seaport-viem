---
description: Remove all resolved issues from improvements.md, renumber remaining items, and update the summary table.
argument-hint: "[section or 'all']"
---
Read `improvements.md` fully. Strip every issue entry that contains
"**Resolved**" (anywhere in the body), then renumber the remaining items
sequentially and update the summary table at the bottom.

## Process

1. **Read `improvements.md`** — understand its full structure: the four
   sections (Bugs, Should fix, Nice to have, Simplification opportunities),
   the per-item format, and the summary table.

2. **Identify resolved items** — scan for all `### N.` headings where the
   entry body contains the string `**Resolved**`. If an argument is given
   (e.g., `all`, `bugs`, `simplification`), scope the operation:
   - `all` (default) — clean up every section.
   - `bugs` — only the "## Bugs" section.
   - `should-fix` — only the "## Should fix" section.
   - `nice-to-have` — only the "## Nice to have" section.
   - `simplification` — only the "## Simplification opportunities" section.

3. **Remove the resolved entries** from each section. Preserve everything
   else — section headers, the intro text, the checks block, non-resolved
   entries — exactly as-is.

4. **Renumber** the remaining entries in each section sequentially, starting
   from 1 in the first section and continuing across all sections (e.g.,
   the first remaining entry is `### 1.`, the next `### 2.`, etc.).

5. **Update the summary table** at the bottom of the file. Recalculate:
   - How many items remain in each row.
   - The "Total potential" line (remove the old count; leave just the
     header or delete the row if it no longer applies since all resolved
     items are gone).

   If no unresolved items remain in a given row, either leave an empty row
   or remove that row entirely — use your judgment to keep the table tidy.

6. **Run `bun test`** — confirm all tests still pass (removing doc entries
   must not break code).

7. **Run `bun run typecheck`** — confirm types are clean.

8. **Commit** with a descriptive message:
   ```
   docs(improvements): remove resolved entries and renumber
   ```

## Example

Before — a section with mixed entries:

```markdown
### 18. tsup `splitting: true` — moot

**Resolved**: ...

### 20. hashBulkOrder skips validation

**Resolved**: ...

### 36. encodeDomainSeparator defaults inconsistent

[no Resolved marker]
```

After cleanup:

```markdown
### 1. encodeDomainSeparator defaults inconsistent

[no Resolved marker]
```

## Guidelines

- **Preserve formatting.** Do not alter indentation, spacing, or markdown
  conventions used in the file.
- **One cleanup per invocation.** If you want to clean only one section,
  pass it as the argument (e.g., `/cleanup-improvements simplification`).
  Default is `all`.
- **Only remove entries explicitly marked Resolved.** If an entry has a fix
  described but no "**Resolved**" marker, leave it alone.
- **Update the section count** (if any) in section headers or nearby text
  that references the number of items.
- **Do not rewrite history.** This is a cleanup of *documentation state*,
  not a re-evaluation of priorities. Leave non-resolved entries completely
  untouched.
