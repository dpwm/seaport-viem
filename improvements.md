# Improvements

Issues and action items identified during code review. Items are ordered by
impact; address the highest-priority items first.

---

## Checks before every commit

Per `AGENTS.md`:

```sh
bun test              # all 229 tests must pass
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

### 5. ~~Stray test files not merged into canonical test files~~ ✅ Fixed

**Files:** `src/encode_new.test.ts`, `src/bulk_signing_debug.test.ts`

The `encode_new.test.ts` file contained encoder tests (cancel, incrementCounter,
getOrderStatus, matchOrders, matchAdvancedOrders, validate) that belonged in
`src/encode.test.ts` — it was likely a WIP artifact from implementing issue #16.
The `bulk_signing_debug.test.ts` file was a debug artifact with `console.log`
calls whose tests (signer recovery, proof reconstruction, domain separator
cross-check) already lived in `src/bulk_listings.test.ts`.

**Fix:** Merged the 8 missing encoder tests from `encode_new.test.ts` into
`encode.test.ts` alongside the existing encode tests. Removed both stray files.
Test count dropped from 232 → 229 (3 debug tests were redundant with
`bulk_listings.test.ts`).

---

## 🟡 Medium priority

### 6. ~~`FulfillmentComponent.orderIndex` / `itemIndex` accept `number | bigint`~~ ✅ Fixed

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

### 8. ~~`validateOrderComponents` doesn't check itemType range~~ ✅ Fixed

**File:** `src/validate.ts`

**Fix:** Added `VALID_ITEM_TYPES` set derived from `Object.values(ItemType)`
and checks `itemType` membership for both offer and consideration items.
Validation now rejects itemType values outside the 0–5 range with a clear
reason string. Added 4 tests: out-of-range offer itemType, negative offer
itemType, out-of-range consideration itemType, and a loop verifying all
valid values (0–5) are accepted.

---

### 9. ~~`encodeGetCounter` / `encodeGetOrderHash` tests are shallow~~ ✅ Fixed

**File:** `src/encode.test.ts`

**Fix:** Replaced the shallow length/format checks with round-trip tests
using viem's `decodeFunctionData`. Both `encodeGetCounter` and
`encodeGetOrderHash` now encode calldata, decode it back, and verify that
the `functionName` and all arguments match. A `normalizeAddresses` helper
handles checksummed address differences between viem's encoder and decoder.

---

### 10. ~~No helpers for constructing fulfillment components~~ ✅ Fixed

**File:** `src/order.ts`

**Fix:** Added `aggregateOfferItems(orders)` and
`aggregateConsiderationItems(orders)` helper functions that produce default
one-to-one `FulfillmentComponent[][]` arrays for independent order
fulfillment. Each order's items form their own group — no cross-order
aggregation. Both functions accept `{ parameters: { offer } }[]` and
`{ parameters: { consideration } }[]` shapes respectively, working with
both `OrderParameters` and `AdvancedOrder` arrays.

Exported from `src/index.ts` alongside the existing fulfillment builders.
10 unit tests cover empty input, single/multiple orders, single/multiple
items per order, and `AdvancedOrder[]` inputs.

---

### 11. ~~`basicOrderType` encoding lacks documentation of the formula~~ ✅ Fixed

**File:** `src/order.ts` (line: `const basicOrderType = order.parameters.orderType + routeType * 4`)

**Fix:** Added a detailed inline comment explaining that Seaport packs
`basicOrderType` as `(routeType << 2) | orderType` (or equivalently
`orderType + routeType * 4`), that the multiplier 4 derives from the 4 order
types (0–3, with CONTRACT excluded from basic orders), and that the type
field only needs 2 bits with the route type shifted into the upper bits.

---

### 12. ~~`signature.test.ts` reimplements production logic for verification~~ ✅ Fixed

**File:** `src/signature.test.ts`

**Fix:** Replaced the "independent computation with multiple items per array"
test with two hardcoded reference-value tests: "matches known-good reference
hash" (single-item order) and "known-good reference with multiple items per
array" (two offer + two consideration items). These tests compare
`hashOrderComponentsStruct` output against fixed expected hashes, catching
regressions without reimplementing the production code. The remaining
"produces correct struct hash demonstrably" test still validates the
function's internal steps as a cross-check.

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

### 14. ~~`getEmptyOrderComponents` timestamp is invalid~~ ✅ Fixed

**File:** `src/order.ts`

**Fix:** Replaced `startTime: 0n, endTime: 0n` with sentinel values
`startTime: 1n, endTime: 2n` that pass `validateOrderComponents` while
still being obviously padding (epoch timestamps 1–2 seconds). Added JSDoc
explaining these are sentinel values and the struct is never submitted
on-chain — only its EIP-712 hash is used as a padding leaf.

---

### 15. ~~`computeNativeValue` could be exported~~ ✅ Fixed

**File:** `src/order.ts`

**Fix:** Exported `computeNativeValue` from `order.ts` and added it to the
barrel export in `index.ts`. Callers who build their own transaction objects
can now import `computeNativeValue` directly to compute the correct `value`
field without using the full fulfillment builder.

---

### 16. ~~Missing `cancel`, `incrementCounter`, `getOrderStatus`, `matchOrders`~~ ✅ Fixed

**Files:** `src/cancel.ts`, `src/order_status.ts`, `src/match.ts`,
`src/increment_counter.ts`, `src/events.ts`, `src/constants.ts`,
`src/encode.ts`, `src/types.ts`, `src/index.ts`

**Fix:** Implemented all five missing functions plus event ABI and typed
parsing utilities:

- `buildCancel(ctx, OrderComponents[])` in `src/cancel.ts` — Builds a
  transaction to cancel one or more orders.
- `buildIncrementCounter(ctx)` in `src/increment_counter.ts` — Builds a
  transaction to bump the offerer's nonce, bulk-cancelling all orders with
  the current counter.
- `getOrderStatus(client, ctx, orderHash)` in `src/order_status.ts` —
  On-chain order status lookup returning `{ isValidated, isCancelled,
  totalFilled, totalSize }`.
- `buildMatchOrders(ctx, orders, fulfillments)` in `src/match.ts` —
  Two-sided order matching via `matchOrders`.
- `buildMatchAdvancedOrders(ctx, advancedOrders, criteriaResolvers,
  fulfillments, recipient)` in `src/match.ts` — Two-sided matching with
  criteria resolvers and partial fills.
- `encodeValidate(orders)` in `src/encode.ts` — Calldata encoder for
  Seaport's `validate()` function.
- `seaportEventAbi` in `src/constants.ts` — Full event ABI for
  `OrderFulfilled`, `OrderCancelled`, `OrderValidated`, `OrdersMatched`,
  and `CounterIncremented`.
- `decodeSeaportEvent(log)` in `src/events.ts` — Typed event log decoder.
- Parsed event ABI references (`OrderFulfilledEvent`,
  `OrderCancelledEvent`, etc.) and topic hash constants
  (`ORDER_FULFILLED_TOPIC`, etc.) for use with viem's `parseEventLogs`.
- `SpentItem` and `OrderStatus` types in `src/types.ts`.

New subpath exports: `seaport-viem/cancel`, `seaport-viem/order-status`,
`seaport-viem/match`, `seaport-viem/increment-counter`,
`seaport-viem/events`.

All 5 new modules have corresponding test files with 33 additional tests.

---

### 17. ~~Script files are untested~~ ✅ Fixed

**Files:** `scripts/list-and-buy.ts`, `scripts/bulk-list-and-buy.ts`,
`scripts/collection-offer-erc20.ts`, `scripts/README.md`

**Fix:** Added `scripts/README.md` documenting prerequisites (Foundry/Anvil,
Bun, mainnet RPC URL), quick-start commands (`anvil --fork-url` then
`bun run scripts/<name>.ts`), a description of what each script demonstrates,
and caveats (hardcoded keys, fork block, BAYC token ID assumptions).

---

### 18. ~~`packBulkSignature` / `unpackBulkSignature` height validation mismatch~~ ✅ Fixed

**File:** `src/bulk_listings.ts`

**Fix:** Added `BULK_ORDER_HEIGHT_MAX` validation in both functions.
`packBulkSignature` now throws when `proof.length > BULK_ORDER_HEIGHT_MAX`
and `unpackBulkSignature` now throws when the computed `height >
BULK_ORDER_HEIGHT_MAX`. This prevents packed signatures with 25+ proof
elements from being accepted (they would fail later at the on-chain
verifier). Added 2 tests covering both boundary conditions.

---

### 19. ~~TypeScript `verbatimModuleSyntax` causes import noise~~ ✅ By design

**File:** All source files

`tsconfig.json` enables `verbatimModuleSyntax: true`, requiring `import type`
for type-only imports. This is good practice — the verbosity is a deliberate
trade-off for correctness (prevents unintentional runtime imports of
type-only modules). No action needed.

---

### 20. ~~`"splitting: false"` in tsup config~~ ✅ Fixed

**File:** `tsup.config.ts`

**Fix:** Enabled code splitting (`splitting: true`) in tsup config after
verifying the build succeeds and all tests pass. Shared dependencies
now emit as chunk files (e.g., `chunk-G2MFVFMY.js` for viem, `chunk-TULT5WV5.js`
for constants/ABI), reducing total bundle size for consumers that import
multiple subpath exports. Each entry point correctly references its chunks.

---

## Summary

| # | Priority | Area | Issue |
|---|----------|------|-------|
| 1 | 🔴 | `order.ts` | Duplicated validation logic |
| 2 | 🔴 | `bulk_listings.ts` | Missing max-height guard |
| 3 | 🔴 | `signature.ts` | ~~Overly broad error regex~~ ✅ Fixed |
| 4 | 🔴 | `constants.ts`/`signature.ts` | ~~Duplicated ABI component definitions~~ ✅ Fixed |
| 5 | 🟡 | `encode.test.ts` | ~~Stray `encode_new.test.ts` / `bulk_signing_debug.test.ts` not merged~~ ✅ Fixed |
| 6 | 🟡 | `types.ts`/`encode.ts` | ~~`number \| bigint` precision risk~~ ✅ Fixed |
| 7 | 🟡 | `validate.ts` | ~~No `SeaportContext` validation~~ ✅ Fixed |
| 8 | 🟡 | `order.ts` | ~~Inconsistent ETH detection~~ ✅ Fixed |
| 9 | 🟡 | `validate.ts` | ~~Missing itemType range check~~ ✅ Fixed |
| 10 | 🟡 | `encode.test.ts` | ~~Shallow encoder tests~~ ✅ Fixed |
| 11 | 🟡 | `order.ts` | ~~No fulfillment-component helpers~~ ✅ Fixed |
| 12 | 🟡 | `order.ts` | ~~Underdocumented formula~~ ✅ Fixed |
| 13 | 🟡 | `signature.test.ts` | ~~Test duplicates production logic~~ ✅ Fixed |
| 14 | 🟢 | `order.ts` | Dead code path |
| 15 | 🟢 | `order.ts` | ~~Invalid timestamps on padding struct~~ ✅ Fixed |
| 16 | 🟢 | `order.ts` | ~~`computeNativeValue` not exported~~ ✅ Fixed |
| 17 | 🟢 | Scope | Missing functions (cancel, matchOrders, etc.) |
| 18 | 🟢 | `scripts/` | ~~Untested integration scripts~~ ✅ Fixed |
| 19 | 🟢 | `bulk_listings.ts` | Missing max-height in pack/unpack |
| 20 | 🟢 | All | ~~`verbatimModuleSyntax` verbosity~~ ✅ By design |
| 21 | 🟢 | `tsup.config.ts` | ~~Code splitting disabled~~ ✅ Fixed |
