# Common Bug Patterns — seaport-viem

This documents the recurring root causes of bugs discovered in the codebase.
When reviewing code or looking for undiscovered issues, check against these
patterns.

Compiled from git history analysis of all `fix:` commits and the documented
issues in `improvements.md`.

---

## 1. Structural Duplication / Copy-Paste Drift

The single highest-volume source of bugs. The same definition, logic, or
validation is copied to multiple locations and then falls out of sync.

**Historical examples:**

| What was duplicated | How many copies | Fix |
|---------------------|----------------|-----|
| ABI component definitions (OfferItem, ConsiderationItem, OrderParameters) | 13 ABI items + 2 events = 15 copies | Extracted 6 shared constants |
| Event definitions | 3 forms (JSON ABI, `parseAbiItem` strings, hardcoded topic hashes) × 5 events = 15 copies | Single source of truth (`seaportEventAbi`) |
| `encodeFunctionData({ abi: [item], functionName, args })` | 13 encoder functions | Extracted `encodeCall` helper |
| `computeNativeValue` summing logic | 7 builders | Extracted `computeTotalNativeValue` |
| Error handling in `counter.ts` / `order_status.ts` / `order_hash.ts` | 3 files | Extracted `seaportCall` |
| `requireValidContext(ctx)` call pattern | 14 inline copies | Extracted helper, unified call sites |

**How to spot it:**
- Two or more files/modules containing structurally-identical blocks of >5
  lines.
- A code change that requires coordinated edits in multiple files.
- "Also update X when you change Y" comments in the code or AGENTS.md.

**Where to look:**
- Any `checkUint120` call that appears both in a builder and its encoder
  (validation should live in one place — prefer the builder).
- Any place where the same literal values, error messages, or ABI component
  arrays appear in multiple files.

**Fix strategy:** Extract the shared logic into a single function, constant,
or helper. Reference it everywhere. The cost of a function call is negligible;
the cost of drift is a production bug.

---

## 2. Missing / Incomplete Input Validation

Functions that accept user-supplied data and encode it as on-chain calldata
without checking semantic validity. These bugs are hard to detect because:

1. Test fixtures only exercise happy paths (`startAmount === endAmount`,
   `numerator = 1n, denominator = 1n`).
2. On-chain reverts give cryptic errors (`NoSpecifiedOrdersAvailable`,
   `BadFraction`, Solidity panic) with no indication of what the caller
   did wrong.

**Checklist for every builder function:**

| Validation | Example check |
|-----------|---------------|
| Context validity | `requireValidContext(ctx)` as first statement |
| Array non-empty | `orders.length === 0` → throw `SeaportValidationError` |
| Structural completeness | Order has ≥1 offer and ≥1 consideration item |
| Numeric ranges | `numerator`/`denominator` in uint120 range, `denominator ≠ 0`, `numerator ≤ denominator` |
| Fraction correctness | `numerator > denominator` → throw |
| Fulfillment non-empty | At least one offer or consideration fulfillment |
| Value computation | Use `max(startAmount, endAmount)` for Dutch auctions, not just `endAmount` |
| Parameter sanity | `startTime < endTime`, `salt ≠ 0`, `counter ≥ 0` |
| Type consistency | All consideration items same `itemType` for basic order path |

**Historical examples:**
- `computeNativeValue` only sums `endAmount` — undercomputes `msg.value` for
  Dutch auctions where `startAmount > endAmount` (still open, issue #2).
- Basic order path accepted mixed-type consideration items, inflating
  `msg.value` with ERC20 amounts (fixed, commit `e6d759a`).
- `computeHeight` silently returned `1` for `orderCount < 1` instead of
  throwing (fixed).
- Empty `offerFulfillments`/`considerationFulfillments` defaults produce
  silent on-chain no-ops that waste gas (still open, issue #8).

**How to spot it:**
- A builder function that accepts user input but has fewer validation lines
  than `buildCancel` or `buildBasicOrderFulfillment`.
- Default parameter values that could mask invalid inputs (e.g., `= []`,
  `= 0n`, `= BigInt(orders.length)` when `orders` could be `[]`).
- A function documented as "builds a transaction" that doesn't `throw` in
  its JSDoc `@throws` tag for any input validation error.

**Fix strategy:** Add validation at the top of the function, before any
encoding. Throw `SeaportValidationError` with a message that tells the
caller exactly what was wrong and what the valid range is.

---

## 3. Fragile Error Classification

Error handling that depends on the exact text of error messages from
dependencies (viem, @noble/curves). These break silently when dependencies
upgrade.

**Pattern to avoid:**
```ts
// ❌ Fragile — breaks if @noble/curves changes its error messages
if (error instanceof Error && /signature (invalid|mismatch)/i.test(error.message)) {
  return false;
}

// ❌ Fragile — breaks if the fnLabel changes or viem changes message format
if (error.message.startsWith(`${fnLabel} returned no data`)) {
  throw error;
}
```

**Pattern to use:**
```ts
// ✅ Type-safe — throw a custom error class and check with instanceof
throw new SeaportCallError(`${fnLabel} returned no data ${details}`);

// In the catch block:
if (error instanceof SeaportCallError) {
  throw error;
}
```

**Historical examples:**
- `seaportCall` re-throw guard used `error.message.startsWith(...)` →
  replaced with `instanceof SeaportCallError` (fixed, commit `c241a94`).
- `verifyOrderSignature` regex depends on `@noble/curves` error message
  text (still open, issue #7).

**How to spot it:**
- Any `catch` block that calls `.startsWith()`, `.includes()`, `.match()`,
  or `/regex/.test()` on `error.message`.
- grep: `error\.message\.` in `src/*.ts` (not test files).

**Fix strategy:** Use custom error classes (`SeaportCallError`,
`SeaportValidationError`, `SeaportEncodingError`) and `instanceof` checks.
For cases where a dependency throws plain `Error` instances that must be
classified, consider parsing the input (e.g., using
`recoverTypedDataAddress` for signature verification) rather than matching
error messages.

---

## 4. Inconsistent Behavior Between Parallel Functions

Functions that serve analogous purposes (e.g., the 10 builder functions
across `order.ts`, `match.ts`, `cancel.ts`, `increment_counter.ts`,
`validate.ts`) having different validation order, different error handling,
or different default behavior.

**Checklist for comparing parallel functions:**

| Aspect | Expected pattern |
|--------|-----------------|
| Validation order | `requireValidContext` always first, then parameter validation |
| Empty-array checks | All functions that accept arrays should validate non-empty |
| Error types | All input validation throws `SeaportValidationError` |
| Domain handling | All functions that compute EIP-712 digests should handle domain fields identically |

**Historical examples:**
- 4 of 10 builders don't call `requireValidContext` at the top — they rely
  on `computeTotalNativeValue` doing it transitively (still open, issue #5).
- `buildCancel` and `buildValidate` validate empty arrays, but
  `buildMatchOrders` and `buildMatchAdvancedOrders` don't (still open,
  issue #3).
- `encodeDomainSeparator` provides defaults for optional domain fields,
  but `hashOrderComponents` (via `hashTypedData`) omits them — different
  domain separators for the same `SeaportContext` (still open, issue #1).

**How to spot it:**
- Select any two builder functions and compare line-by-line. Does one
  validate something the other doesn't?
- Look for functions that delegate validation to helpers rather than doing
  it explicitly (the delegate chain can break if the helper is refactored).

**Fix strategy:** Pick the most thorough function as the reference
implementation. Bring all parallel functions up to the same standard.
Document the canonical validation order in `AGENTS.md`.

---

## 5. Type-Unsafe Operations

TypeScript `as` assertions that assume the caller has already validated,
breaking the type safety chain. These are seductive because they let you
sidestep type errors with one line, but they hide bugs.

**Pattern to avoid:**
```ts
// ❌ Unchecked cast — if caller didn't validate, this is a lie
verifyingContract: domain.verifyingContract as `0x${string}`,
```

**Pattern to use when validation is guaranteed:**
```ts
// ✅ Document the validation dependency in the JSDoc
// Caller (hashBulkOrder) validates via requireValidContext before calling;
// this cast matches the runtime guarantee established by that check.
verifyingContract: domain.verifyingContract as `0x${string}`,
```

**Historical examples:**
- Old hand-rolled `encodeDomainSeparator` used multiple `as` casts without
  validation → replaced with viem's `hashDomain` (fixed).
- `additionalRecipients` built from `consideration.slice(1).map(...)` lost
  the `itemType` field, causing value computation bugs (fixed, commit
  `e6d759a`).

**How to spot it:**
- grep for ` as `0x${string}``, ` as any`, or other type assertions in
  non-test source files.
- Look for functions that accept a generic type parameter but immediately
  narrow it with `as`.

**Fix strategy:** Either validate before casting (add a runtime check), or
restructure the code to avoid the cast entirely. Document any remaining
casts with `// biome-ignore` comments explaining why they're safe.

---

## 6. Test Fixtures Masking Edge Cases

Test fixtures that only exercise the happy path, causing validation gaps
and edge-case bugs to go undiscovered.

**The current fixtures in `src/test-fixtures.ts`:**
- `startAmount === endAmount` → Dutch auction value bug invisible
- `numerator = 1n, denominator = 1n` (implicit in test construction) →
  fraction validation gaps invisible
- Single offer and consideration items → empty-array gaps invisible
- Fulfillments always passed explicitly → empty-default no-op bug invisible

**How to spot it:**
- A function has `@throws` tags but no test case for the throw path.
- Test fixtures provide defaults that never change in any test.
- grep for `expect(...).toThrow` or `expect(...).rejects.toThrow` — if
  there are fewer throw tests than documented error conditions, gaps exist.

**Fix strategy:** For every exported function, add at least one test case
for each documented error condition. Test boundary values (0, empty arrays,
out-of-range numbers). Use partial overrides on the test fixtures rather
than creating entirely new fixtures.

---

## 7. Query Checklist

When reviewing code or looking for bugs, ask these questions about every
exported function:

### Builders (`build*` functions)
- [ ] Is `requireValidContext(ctx)` the first statement?
- [ ] Are arrays checked for non-empty?
- [ ] Are structural requirements checked (≥1 offer, ≥1 consideration)?
- [ ] Are numeric parameters validated against valid ranges?
- [ ] Is `msg.value` computation correct for Dutch auctions (use `max(startAmount, endAmount)`)?
- [ ] Do default parameter values silently mask invalid inputs?
- [ ] Does the function throw `SeaportValidationError` for every validation failure?
- [ ] Is the `@throws` JSDoc tag complete?

### Encoders (`encode*` functions)
- [ ] Does validation live in the builder, not duplicated here?
- [ ] Are `checkUint120` calls in builders, not only in encoders?

### Error handling
- [ ] Are `catch` blocks using `instanceof` checks, not string/regex matching?
- [ ] Are custom error classes (`SeaportCallError`, etc.) used for classification?
- [ ] Are viem `BaseError` instances re-thrown or properly wrapped?

### Type safety
- [ ] Are `as` assertions guarded by runtime validation?
- [ ] Do mapped/generated types lose important fields (like `itemType`)?

### Tests
- [ ] Is every `@throws` condition covered by a test?
- [ ] Are edge cases tested (empty arrays, zero values, boundary values)?
- [ ] Do test fixtures exercise the full range of valid inputs?

---

## Related documents

- [`improvements.md`](./improvements.md) — Current list of known issues and
  action items. Check before reporting a new issue.
- [`AGENTS.md`](./AGENTS.md) — Project conventions, source layout, design
  constraints.
- [`.pi/prompts/find-improvement.md`](.pi/prompts/find-improvement.md) —
  Prompt template for finding new improvements referencing these patterns.
