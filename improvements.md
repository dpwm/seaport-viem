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

### 1. `buildMatchAdvancedOrders` — deceptive default parameter for `fulfillments`

**File:** `src/match.ts:72`

```ts
export function buildMatchAdvancedOrders(
  ctx: SeaportContext,
  advancedOrders: AdvancedOrder[],
  criteriaResolvers: CriteriaResolver[] = [],
  fulfillments: Fulfillment[] = [],      // ← defaults to empty, then throws
  recipient: `0x${string}` = ZERO_ADDRESS,
): FulfillmentData
```

Immediately after, it throws if `fulfillments.length === 0`. A default of `[]` that always
throws forces callers to discover this at runtime. Compare with `buildMatchOrders` which has
no default for `fulfillments` — callers must supply one.

**Fix:** Remove the `= []` default to match `buildMatchOrders`.

See also: bug-patterns.md §4 (Inconsistent Behavior Between Parallel Functions).

### 2. `buildMatchOrders` / `buildMatchAdvancedOrders` — missing per-order offer/consideration validation

**Files:** `src/match.ts` — both functions validate order count (`orders.length === 0`) and
fulfillments, but neither checks that individual orders have at least one offer and one
consideration item. Both `buildFulfillOrder` and `buildFulfillAdvancedOrder` in `order.ts`
do validate per-order structural completeness (lines 485, 488, 521, 524).

Without this check, structurally invalid orders are silently encoded and fail with opaque
on-chain reverts.

**Fix:** Add the same per-order offer/consideration validation in both match builders.

### 3. `buildFulfillAvailableOrders` / `buildFulfillAvailableAdvancedOrders` — missing per-order validation

**File:** `src/order.ts` — same pattern as #2. These functions validate the overall array
count and `maximumFulfilled` bounds, but don't validate each order's offer/consideration
non-emptiness as `buildFulfillOrder` does.

**Fix:** Validate each order has ≥1 offer and ≥1 consideration item.

### 4. `buildCancel` — doesn't validate individual `OrderComponents` structure

**File:** `src/cancel.ts` — validates context and non-empty array, but doesn't call
`requireValidOrderComponents` on each entry. The Seaport contract tolerates structurally
broken components (it just emits a hash), but the library's philosophy is to fail fast
with clear errors.

**Fix:** Call `requireValidOrderComponents` on each element, or at minimum check for
offerer presence.

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

### 1. `@internal` JSDoc vs barrel exports mismatch

Seven functions/constants are documented with `@internal` in their JSDoc, but three of
them are exported from the barrel (`src/index.ts`), making them de facto public API:

| Item | JSDoc says `@internal` | Exported from barrel? |
|---|---|---|
| `hashOrderComponentsStruct` | ✅ Yes | ✅ Yes (line 92) |
| `encodeDomainSeparator` | ✅ Yes | ✅ Yes (line 129) |
| `seaportCall` | ✅ Yes | ✅ Yes (line 98) |
| `checkUint120` | ✅ Yes | ❌ No |
| `ORDER_COMPONENTS_STRUCT_ABI_TYPES` | ✅ Yes | ❌ No |
| `getBulkOrderPaddingHash` | ✅ Yes | ❌ No |
| `computeTotalNativeValue` | ✅ Yes | ❌ No |

Decide: either export all `@internal` items consistently, or remove the `@internal` tag
from items that are intentionally public. (If the answer is "export none," then
`hashOrderComponentsStruct`, `encodeDomainSeparator`, and `seaportCall` must be removed
from the barrel.)

### 2. `aggregateOfferItems` / `aggregateConsiderationItems` — unnecessarily wide generic

**File:** `src/order.ts:380,404`

```ts
export function aggregateOfferItems<
  T extends { parameters: { offer: readonly OfferItem[] } }
>(orders: T[]): FulfillmentComponent[][]
```

The generic parameter allows any `T` that matches the shape, but these functions only
iterate over `parameters.offer` / `parameters.consideration`. The type could be tightened
to the actual call sites (plain `Order[]` / `AdvancedOrder[]`), removing the generic
entirely. The generic adds complexity without providing flexibility.

**Fix:** Drop the generic and use a concrete interface or the known order types.

### 3. `toBasicOrderParameters` — undocumented dependency on `isBasicOrderEligible` invariant

**File:** `src/order.ts:94-101`

`toBasicOrderParameters` uses `item.endAmount` for `additionalRecipients` amounts (line
97) and `primaryConsideration.endAmount` (line 92). This is safe only because
`isBasicOrderEligible` rejects orders where `startAmount !== endAmount`. But there is no
comment in `toBasicOrderParameters` documenting this dependency. A reader modifying one
function without knowledge of the other could reintroduce a Dutch auction value bug.

**Fix:** Either:
- Add an inline comment documenting the invariant ("basic order eligibility guarantees
  startAmount === endAmount for all items"), or
- Use `max(startAmount, endAmount)` defensively, matching `computeNativeValue`'s pattern.

### 4. `getProof` — fragile non-null assertion on sibling access

**File:** `src/bulk_listings.ts:304`

```ts
// biome-ignore lint/style/noNonNullAssertion: siblingIndex is always within
// bounds for a complete binary tree
proof.push(layers[layer]![siblingIndex]!);
```

This is safe for a complete binary tree with padded leaves, but the assertion would panic
if `buildBulkOrderTree` ever produced uneven layers (e.g., if an unpadded leaf array were
passed despite the length guard in `buildBulkOrderTree`). Since the validation lives in a
different function, this is a cross-function dependency similar to bug-patterns.md §1.

**Fix:** Add an explicit bounds check before the `!` assertion, or document the dependency
more prominently.

### 5. `buildCriteriaTree` — deduplication via string round-trip

**File:** `src/criteria.ts:65`

```ts
const unique = [...new Set(tokenIds.map((id) => String(id)))]
    .map((s) => BigInt(s))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
```

This converts BigInts to strings for Set deduplication, then back to BigInts. While
functionally correct, it is unconventional and performs an extra pass over the data.

**Suggestion:** Use a Map-based dedup for clarity:
```ts
const unique = [...new Map(tokenIds.map(id => [String(id), id])).values()]
    .sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
```
Or keep the current approach — this is purely cosmetic.
