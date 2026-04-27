# Improvements

Issues and action items identified during code review. Items are ordered by
impact; address the highest-priority items first.

---

## Checks before every commit

Per `AGENTS.md`:

```sh
bun test              # all 182 tests must pass
bun run typecheck     # tsc --noEmit must pass
bun run build         # tsup → dist/ must succeed
```

---

## 🔴 High priority

### 1. ~~`canFulfillAsBasicOrder` and `detectBasicOrderRouteType` duplicate logic~~ ✅ Fixed

**File:** `src/order.ts`

**Fix:** Extracted structural checks into a shared private `isBasicOrderEligible()`
helper, removing the old `getBasicOrderItems()`. Both `canFulfillAsBasicOrder` and
`detectBasicOrderRouteType` now call `isBasicOrderEligible()` instead of
duplicating the CONTRACT order type check, non-zero zone check, criteria item
checks, and primary recipient check.

`detectBasicOrderRouteType` now only classifies the route; the redundant
`return null` at the end is documented as a fallback for structurally eligible
but unrecognized combos (addressing issue #13 as well).

---

### 2. ~~`computeHeight` can return values exceeding `BULK_ORDER_HEIGHT_MAX`~~ ✅ Fixed

**File:** `src/bulk_listings.ts`

**Fix:** Added a max-height guard in `computeHeight` that throws when the
computed height exceeds `BULK_ORDER_HEIGHT_MAX` (24) with a clear error message
indicating the order count and maximum capacity. Also added tests for the
boundary (2^24 orders succeeds, 2^24+1 throws).

---

### 3. ~~`verifyOrderSignature` error-handling regex is too broad~~ ✅ Fixed

**File:** `src/signature.ts`

**Fix:** Narrowed the regex from `/signature/i` to
`/signature (invalid|mismatch)|unrecoverable signature/i`, matching only
known signature-recovery failure messages from `@noble/curves`. This avoids
swallowing infrastructure errors that happen to contain the word "signature"
(e.g., invalid curve points, malformed R/S values).

---

### 4. ~~Duplicated ABI component definitions between `constants.ts` and `signature.ts`~~ ✅ Fixed

**File:** `src/constants.ts`, `src/signature.ts`

**Fix:** Exported `OFFER_ITEM_COMPONENTS` and `CONSIDERATION_ITEM_COMPONENTS`
from `constants.ts` (derived from `EIP712_TYPES`). Updated
`hashOrderComponentsStruct` in `signature.ts` and the independent computation
tests in `signature.test.ts` to use these shared constants instead of inline
ABI component definitions. If a field is added or reordered in `EIP712_TYPES`,
the ABI encoding now stays in sync automatically.

---

## 🟡 Medium priority

### 5. ~~`FulfillmentComponent.orderIndex` / `itemIndex` accept `number | bigint`~~ ✅ Fixed

**File:** `src/types.ts`, `src/encode.ts`

**Fix:** Narrowed the type from `number | bigint` to `bigint` only in
`FulfillmentComponent`. Removed the now-unnecessary `as { orderIndex: bigint;
itemIndex: bigint }[][]` type assertions from `encodeFulfillAvailableOrders`
and `encodeFulfillAvailableAdvancedOrders`. A JSDoc comment on the type notes
that callers must convert via `BigInt()`. This is a minor breaking change for
anyone passing raw `number` values — they must now explicitly convert.

---

### 6. ~~No validation for `SeaportContext`~~ ✅ Fixed

**File:** `src/validate.ts`

**Fix:** Added `validateSeaportContext(ctx)` in `src/validate.ts` that
checks:
- `ctx.address` is a valid 20-byte hex address (using viem's `isAddress`).
- `ctx.domain.verifyingContract` is present, non-empty, and a valid address.
- `ctx.domain.chainId` is a positive integer if provided.

The function is called at the entry of all 8 public functions that accept
`SeaportContext`: `buildBasicOrderFulfillment`, `buildFulfillOrder`,
`buildFulfillAdvancedOrder`, `buildFulfillAvailableOrders`,
`buildFulfillAvailableAdvancedOrders` (in `order.ts`),
`verifyOrderSignature`, `hashOrderComponents` (in `signature.ts`),
and `getCounter` (in `counter.ts`).

Exported from `src/index.ts` for standalone use. 12 unit tests cover
valid context, missing/invalid address, missing/empty/invalid
verifyingContract, chainId as number/bigint/undefined, and
non-positive/non-integer chainId values.

---

### 7. ~~`NATIVE_TOKEN` / `ZERO_ADDRESS` inconsistency in value computation~~ ✅ Fixed

**File:** `src/order.ts`

**Fix:** `buildBasicOrderFulfillment()` now checks `primaryConsideration.itemType ===
ItemType.NATIVE` instead of comparing `considerationToken` against `ZERO_ADDRESS`
or `NATIVE_TOKEN`. This matches how `computeNativeValue()` (used by all other
builders) identifies ETH transfers. The `NATIVE_TOKEN` import was removed from
`order.ts` since it's no longer needed there (still re-exported from `index.ts`).

---

### 8. `validateOrderComponents` doesn't check itemType range

**File:** `src/validate.ts`

The function validates amounts and timing but never checks that `itemType`
values are within the valid range (0–5). An order with `itemType: 99` would
pass validation and fail only at the contract level.

**Recommendation:** Add a check like:
```ts
const VALID_ITEM_TYPES = new Set([0, 1, 2, 3, 4, 5]);
if (!VALID_ITEM_TYPES.has(item.itemType)) {
  return { valid: false, reason: `Invalid item type: ${item.itemType}` };
}
```

---

### 9. `encodeGetCounter` / `encodeGetOrderHash` tests are shallow

**File:** `src/encode.test.ts`

These tests only check that output starts with `0x` and has reasonable length.
They don't verify the encoding is correct. While the correctness of
`encodeFunctionData` is viem's responsibility, the tests provide false
confidence — a wrong function name or ABI mismatch would still pass.

**Recommendation:** Either:
- Add snapshot tests of the encoded calldata against known-good values from
  a real Seaport interaction.
- At minimum, decode the output with `decodeFunctionData` and round-trip
  verify the arguments.

---

### 10. No helpers for constructing fulfillment components

**File:** `src/order.ts`, `src/types.ts`

`buildFulfillAvailableOrders` and `buildFulfillAvailableAdvancedOrders`
require `FulfillmentComponent[][]` arguments that are non-trivial to
construct correctly. The library provides the data structures but no helpers
for building them from multiple orders.

**Recommendation:** Add a helper like `aggregateOfferItems(orders)` and
`aggregateConsiderationItems(orders)` that produce default one-to-one
fulfillment components for independent order fulfillment (the most common case).

---

### 11. `basicOrderType` encoding lacks documentation of the formula

**File:** `src/order.ts` (line: `const basicOrderType = order.parameters.orderType + routeType * 4`)

The formula `orderType + routeType * 4` is Seaport's internal encoding. The
code documents it once in the `toBasicOrderParameters` JSDoc but not inline.
A developer unfamiliar with Seaport internals may not understand why `* 4`
is used.

**Recommendation:** Add an inline comment explaining that Seaport packs
`basicOrderType` as `(routeType << 2) | orderType` (or equivalently
`orderType + routeType * 4`), and that the 4 comes from having 4 order types
(0–3, with CONTRACT excluded from basic orders).

---

### 12. `signature.test.ts` reimplements production logic for verification

**File:** `src/signature.test.ts`

Two tests ("produces correct struct hash demonstrably" and "independent
computation with multiple items per array") duplicate the entire body of
`hashOrderComponentsStruct` to verify it. If the production code has a bug
that's also in the test, the test won't catch it.

**Recommendation:** Replace one of the duplicate tests with a known-good
reference value (a manually-computed hash for a fixed input) or cross-reference
against a live Seaport contract's `getOrderHash` via a forked test.

---

## 🟢 Low priority / nice-to-have

### 13. ~~`detectBasicOrderRouteType` has a dead code path~~ ✅ Fixed

**File:** `src/order.ts`

**Fix:** After the refactor in #1, `detectBasicOrderRouteType` no longer
duplicates `canFulfillAsBasicOrder`. The trailing `return null` is now a
genunie fallback for structurally eligible orders with unrecognized
offer/consideration combinations (e.g., NATIVE offer items), and is
documented as such inline.

---

### 14. `getEmptyOrderComponents` timestamp is invalid

**File:** `src/order.ts`

Returns `startTime: 0n, endTime: 0n`, which fails `validateOrderComponents`
(startTime >= endTime). This is intentional (the struct is only used as a
padding leaf hash), but it's surprising. Document this in the JSDoc or use
sentinel values like `startTime: 1n, endTime: 2n` that pass validation while
still being obviously padding.

---

### 15. `computeNativeValue` could be exported

**File:** `src/order.ts`

This private helper sums NATIVE consideration amounts. Callers who build
their own transaction objects may want to compute the correct `value` field
without using the full builder. Consider exporting it.

---

### 16. Missing `cancel`, `incrementCounter`, `getOrderStatus`, `matchOrders`

**File:** `src/index.ts`

These are documented as out of scope. Track them here so new contributors
know they're intentionally absent, not overlooked:

- `cancel(OrderComponents[])` — Seaport's `cancel()` function.
- `incrementCounter()` — Bump the offerer's nonce.
- `getOrderStatus(orderHash)` — On-chain order status lookup.
- `matchOrders(orders[], fulfillments[])` — Two-sided order matching.
- `matchAdvancedOrders(advancedOrders[], criteriaResolvers[], fulfillments[])`
- Event ABI and typed event parsing utilities.

---

### 17. Script files are untested

**Files:** `scripts/list-and-buy.ts`, `scripts/bulk-list-and-buy.ts`,
`scripts/collection-offer-erc20.ts`

These require a running Anvil fork and are not part of the test suite. They
serve as integration examples but may rot as the API evolves. Consider adding
a CI step that runs them against `anvil --fork-url` if a reliable RPC is
available, or at minimum document how to run them manually.

---

### 18. `packBulkSignature` / `unpackBulkSignature` height validation mismatch

**File:** `src/bulk_listings.ts`

`packBulkSignature` throws for `proof.length < 1` but does not check against
`BULK_ORDER_HEIGHT_MAX` (24). `unpackBulkSignature` computes `height` from
the signature length but doesn't validate against `BULK_ORDER_HEIGHT_MAX`
either. A packed signature with 25 proof elements would be unpacked
successfully but would then fail in `hashBulkOrder` / Seaport's on-chain
verifier.

**Recommendation:** Validate height <= 24 in both pack and unpack functions.

---

### 19. TypeScript `verbatimModuleSyntax` causes import noise

**File:** All source files

`tsconfig.json` enables `verbatimModuleSyntax: true`, requiring `import type`
for type-only imports. This is good practice but adds verbosity. No action
needed — just noting for contributors.

---

### 20. `"splitting: false"` in tsup config

**File:** `tsup.config.ts`

Code splitting is disabled. For a library with 9 entry points, enabling
splitting could reduce bundle size for consumers that import multiple
subpath exports. Test this before enabling — it can produce broken output
with some dependency patterns.

---

## Summary

| # | Priority | Area | Issue |
|---|----------|------|-------|
| 1 | 🔴 | `order.ts` | Duplicated validation logic |
| 2 | 🔴 | `bulk_listings.ts` | Missing max-height guard |
| 3 | 🔴 | `signature.ts` | ~~Overly broad error regex~~ ✅ Fixed |
| 4 | 🔴 | `constants.ts`/`signature.ts` | ~~Duplicated ABI component definitions~~ ✅ Fixed |
| 5 | 🟡 | `types.ts`/`encode.ts` | ~~`number \| bigint` precision risk~~ ✅ Fixed |
| 6 | 🟡 | `validate.ts` | ~~No `SeaportContext` validation~~ ✅ Fixed |
| 7 | 🟡 | `order.ts` | ~~Inconsistent ETH detection~~ ✅ Fixed |
| 8 | 🟡 | `validate.ts` | Missing itemType range check |
| 9 | 🟡 | `encode.test.ts` | Shallow encoder tests |
| 10 | 🟡 | `order.ts` | No fulfillment-component helpers |
| 11 | 🟡 | `order.ts` | Underdocumented formula |
| 12 | 🟡 | `signature.test.ts` | Test duplicates production logic |
| 13 | 🟢 | `order.ts` | Dead code path |
| 14 | 🟢 | `order.ts` | Invalid timestamps on padding struct |
| 15 | 🟢 | `order.ts` | `computeNativeValue` not exported |
| 16 | 🟢 | Scope | Missing functions (cancel, matchOrders, etc.) |
| 17 | 🟢 | `scripts/` | Untested integration scripts |
| 18 | 🟢 | `bulk_listings.ts` | Missing max-height in pack/unpack |
| 19 | 🟢 | All | `verbatimModuleSyntax` verbosity |
| 20 | 🟢 | `tsup.config.ts` | Code splitting disabled |
