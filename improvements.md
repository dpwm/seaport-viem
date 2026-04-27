# Improvements

Issues and action items identified during code review. Items are ordered by
impact; address the highest-priority items first.

---

## Priority 0 (critical — fix before any on-chain use)

### 0.4 `fulfillAvailableOrders` in `scripts/bulk-list-and-buy.ts` — grouped consideration items with different recipients together ✅ FIXED

**File:** `scripts/bulk-list-and-buy.ts` — Phase 7, `considerationFulfillments` construction.

**What was wrong:** Each order has 2 consideration items (price to seller, fee to fee recipient) with different recipients. They were grouped together in a single fulfillment group:

```ts
// BAD: groups price (seller) + fee (fee recipient) together
considerationFulfillments = orders.map((_, i) => [
  { orderIndex: i, itemIndex: 0n },  // price → seller
  { orderIndex: i, itemIndex: 1n },  // fee → fee recipient
]);
```

In `fulfillAvailableOrders`, each fulfillment group aggregates items that must share the same `(itemType, token, identifier, recipient)` tuple. Since price and fee have different recipients, Seaport reverts with `InvalidFulfillmentComponentData` (0x7fda7279).

**Fix applied:** Each consideration item gets its own group via `flatMap`:

```ts
// FIXED: separate groups for different recipients
considerationFulfillments = orders.flatMap((_, i) => [
  [{ orderIndex: i, itemIndex: 0n }],  // price to seller
  [{ orderIndex: i, itemIndex: 1n }],  // fee to fee recipient
]);
```

This matches Seaport's `_executeAvailableFulfillments` design where offer and consideration fulfillments are processed independently (not paired), and items aggregated within a group must have matching token/recipient.

**Why tests didn't catch it:** Unit tests for `buildFulfillAvailableOrders` don't exercise fulfillment components against a live contract — they only verify data structure and value computation. The integration script is the only test that calls the real Seaport contract.

---

### 0.1 `hashOrderComponentsStruct` uses wrong last field (consideration.length instead of counter) ✅ FIXED

### 0.1 `hashOrderComponentsStruct` uses wrong last field (consideration.length instead of counter) ✅ FIXED

**File:** `src/signature.ts` — inside `hashOrderComponentsStruct`, final
`encodeAbiParameters` call, last value.

**What was wrong:** `BigInt(orderComponents.consideration.length)` — the
`OrderComponents` struct ends with `counter`, not
`totalOriginalConsiderationItems` (that's `OrderParameters`). The EIP-712
struct hash must match Seaport's `_deriveOrderHash`, which uses `counter` as
the last component.

**Impact if unfixed:** All bulk order Merkle tree leaf hashes are wrong for
any order where `counter !== consideration.length` (i.e., every real order).
The Merkle root won't match what Seaport verifies on-chain, so all bulk order
signatures would be rejected by the contract.

**Fix applied:** Changed to `orderComponents.counter` (commit 9db47cf).

**Why tests didn't catch it:** The debug test
(`bulk_signing_debug.test.ts`) is self-referential — it uses the same buggy
function to both build and verify the tree. The integration script
(`scripts/bulk-list-and-buy.ts`) bypasses `hashOrderComponentsStruct`
entirely by calling on-chain `getOrderHash` for leaf computation.

---

## Priority 1 (should fix)

### 1.1 README scope statement is stale ✅ FIXED

The README scope paragraph now lists all covered fulfillment pathways
(commit 9db47cf).

### 1.2 `unpackBulkSignature` allows height 0 (no proof) ✅ FIXED

Added the height < 1 check inside `unpackBulkSignature` (commit 9db47cf).

### 1.3 `getBulkOrderTypeString` — verify casing against Seaport 1.6 ✅ FIXED

The type string uses `tree` (lowercase):

```
BulkOrder(OrderComponents${brackets} tree)
```

Cross-checked against the Seaport 1.6 canonical source
(`contracts/test/TypehashDirectory.sol`). The format matches:
- `tree` is lowercase in both (matches Seaport's canonical `" tree)"`)
- Sub-type field definitions are identical (`ConsiderationItem`, `OfferItem`,
  `OrderComponents` with the same field types and commas)
- Sub-type order matches (ConsiderationItem → OfferItem → OrderComponents)
- Brackets format matches (`[2]` repeated `height` times)

**Verification:** Added 10 cross-check tests in `bulk_listings.test.ts` that
reconstruct the canonical type string from its components and compare directly
against `getBulkOrderTypeString` output for heights 1, 2, 3, and 24, and
verify each sub-type independently (this commit).

**Related:** The `BulkOrder` type string is now automatically kept in sync
with `EIP712_TYPES` via `eip712TypeString()` in `constants.ts` (see item
3.5).

### 1.4 `encodeDomainSeparator` — risk of silent divergence from viem ✅ FIXED

Added two cross-check tests in `src/bulk_listings.test.ts`:
- "manual domain separator produces same EIP-712 digest as viem" — recomputes
  the full EIP-712 digest using the manual domain separator and a known empty
  struct, then compares against viem's `hashTypedData` output
- "hashBulkOrder uses same domain separator as hashTypedData" — reconstructs
  the `hashBulkOrder` digest from its components using the manual domain
  separator and verifies it matches `hashBulkOrder`'s output

Both pass (commit 9db47cf).

---

## Priority 2 (good to fix)

### 2.1 `encodeDomainSeparator` — unsafe cast of optional domain fields ✅ FIXED

Changed to `domain.name ?? ""` / `domain.version ?? ""` (commit 9db47cf).

### 2.2 `canFulfillAsBasicOrder` — route type variable names are ambiguous ✅ FIXED

Added fulfiller-perspective doc-comment to `BasicOrderRouteType` in
`src/types.ts` (commit 9db47cf).

### 2.3 `verifyOrderSignature` — broad catch may swallow infrastructure errors ✅ FIXED

**File:** `src/signature.ts` — inside `verifyOrderSignature`, catch block.

**What was wrong:** The catch block returned `false` for *all* non-`BaseError`
errors. Infrastructure errors that don't extend `BaseError` (e.g., `TypeError`,
`RangeError`, or future viem error types) would be silently swallowed and
reported as invalid signatures, masking the real problem.

**Fix applied:** Made the catch filter more targeted — only return `false` for
`Error` instances whose message contains `"signature"` (case-insensitive),
matching the error pattern from `@noble/curves` during signature recovery.
All other errors are rethrown, ensuring unexpected failures propagate.

**Impact if unfixed:** A transport error or programming mistake that produces
a non-`BaseError` would be indistinguishable from a bad signature, making
debugging extremely difficult.

### 2.4 `toOrderParameters` — rest-spread silently passes through unexpected fields ✅ FIXED

**File:** `src/order.ts` — inside `toOrderParameters`.

**What was wrong:** The destructure-and-spread pattern silently passed through
any unexpected fields from `OrderComponents` into `OrderParameters`. If either
struct ever gained a field that wasn't supposed to cross over, the bug would
be silent.

**Fix applied:** Replaced the rest-spread with an explicit field-by-field
mapping. Each common field is listed individually, and
`totalOriginalConsiderationItems` is set explicitly. This is more verbose but
makes the conversion contract explicit at the type level (this commit).

### 2.5 `padLeaves` — no guard against empty input ✅ FIXED

Added early `leaves.length === 0` throw in `padLeaves` (commit 9db47cf).

### 2.6 `computeHeight` — redundant floor check ✅ FIXED

Replaced ternary with `Math.max(BULK_ORDER_HEIGHT_MIN, ...)` after zero guard
(commit 9db47cf).

### 2.7 `computeHeight` — returns 1 for zero orders instead of throwing ✅ FIXED

**File:** `src/bulk_listings.ts` — inside `computeHeight`.

**What was wrong:** `computeHeight(0)` returned `BULK_ORDER_HEIGHT_MIN` (1)
instead of throwing. While not reachable in practice (both `padLeaves` and
`buildBulkOrderTree` guard against empty input), it was misleading for
standalone callers.

**Fix applied:** Changed to throw on `orderCount < 1` (this commit).

---

## Priority 3 (minor / nice to have)

### 3.1 `bulk_signing_debug.test.ts` uses a hardcoded private key ✅ FIXED

The file `src/bulk_signing_debug.test.ts` contains a hardcoded `SELLER_KEY`.
This is acceptable for an integration test but should not be treated as a
secret. Consider documenting that this key is test-only.

**Fix applied:** Added doc comment above the key stating it is test-only (this
commit).

### 3.2 No upper-bound validation on `maximumFulfilled` ✅ FIXED

`buildFulfillAvailableOrders` and `buildFulfillAvailableAdvancedOrders` now
throw if `maximumFulfilled` exceeds the array length (this commit).

### 3.3 Missing explicit test for `hashOrderComponentsStruct` ✅ FIXED

**File:** `src/signature.test.ts` — new `describe("hashOrderComponentsStruct")` block.

**What was wrong:** The function was tested only indirectly via bulk listing
tests (tree building uses it for leaves). There was no dedicated test block
that exercised it directly.

**Fix applied:** Added 7 tests in `signature.test.ts` (this commit):
- Returns a bytes32 hash
- Same inputs produce same hash (determinism)
- Different salt → different hash
- Different offerer → different hash
- Different counter → different hash
- Independent computation cross-check (recomputes the expected value step
  by step using `keccak256` + `encodeAbiParameters`)
- Multi-element arrays (2 offer items + 2 consideration items) cross-check

Note: A cross-check against `hashOrderComponents` (viem's `hashTypedData`)
is not possible because viem uses EIP-712 encoding for arrays of structs
(struct-hashing each element) while Seaport uses raw `abi.encode` for the
intermediate offer/consideration hashes. The two approaches produce
different struct hashes for the same data. The independent computation
test validates the function against its own spec using the same encoding
primitives.

### 3.4 `checkUint120` — validation only in encoders, not in builders ✅ FIXED

**File:** `src/encode.ts` — `checkUint120` is called inside
`encodeFulfillAdvancedOrder` and `encodeFulfillAvailableAdvancedOrders`, but
NOT inside the corresponding builders in `order.ts`
(`buildFulfillAdvancedOrder`, `buildFulfillAvailableAdvancedOrders`).

The builders accept `numerator` and `denominator` as `bigint` and pass them
straight to the encoders, so validation does fire before the data is encoded.
However, if a consumer uses the encoders directly (bypassing the builders),
they get validation; if they use the builders, they do too (via the encoder).
No bug today, but the pattern should be documented or moved to a common
validation layer so both paths are equally protected. If someone ever adds a
new builder that calls the encoder indirectly, they might forget to validate.

**Fix applied:** Exported `checkUint120` from `encode.ts` and added explicit
validation calls at the top of `buildFulfillAdvancedOrder` and
`buildFulfillAvailableAdvancedOrders` in `order.ts`. Added 4 tests in
`order.test.ts` verifying that both builders throw when `numerator` or
`denominator` exceed uint120 range. The encoder-level validation is preserved
as defense-in-depth (this commit).

### 3.5 Hardcoded type strings in `hashOrderComponentsStruct` can drift from `EIP712_TYPES` ✅ FIXED

**Files:** `src/signature.ts` (`ORDER_TYPEHASH`), `src/bulk_listings.ts`
(`getBulkOrderTypeString`), `src/constants.ts` (new `eip712TypeString` helper).

**What was wrong:** The `ORDER_TYPEHASH` constant in `signature.ts` was built
from a hardcoded type string that duplicated the field definitions in
`EIP712_TYPES`. If `EIP712_TYPES` were ever updated (e.g., Seaport adds a field
to one of the structs), the two definitions could diverge, causing all order
hashing to silently produce wrong results.

**Fix applied:** Added `eip712TypeString()` in `constants.ts` that converts an
EIP-712 type definition to its canonical type string programmatically. The
three sub-type strings (`ORDER_COMPONENTS_TYPE_STRING`,
`CONSIDERATION_ITEM_TYPE_STRING`, `OFFER_ITEM_TYPE_STRING`) are now computed
from `EIP712_TYPES` at module load time. Both `ORDER_TYPEHASH` in
`signature.ts` and `getBulkOrderTypeString` in `bulk_listings.ts` use these
computed strings instead of hardcoded ones.

**Impact if unfixed:** If `EIP712_TYPES` were updated without updating the
hardcoded strings, all order hashing (both single-order signatures and bulk
order Merkle tree construction) would produce incorrect hashes, breaking all
signature verification.

**Verification:** All 150 existing tests pass, including the 10 cross-check
tests in `bulk_listings.test.ts` that compare the output against the known
Seaport 1.6 canonical format. The type string generation is now derived from
the same source as the signing types, so they can't diverge.

**Related:** The cross-check tests in `bulk_listings.test.ts` still use
hardcoded canonical strings as the reference — if `EIP712_TYPES` ever changes,
these tests will fail and alert the developer.

### 3.6 No test for `NATIVE_TOKEN` payment path in `buildBasicOrderFulfillment` ✅ FIXED

**File:** `src/order.ts` — the `isNativePayment` check handles both
`ZERO_ADDRESS` and `NATIVE_TOKEN` as sentinels for native ETH:

```ts
const isNativePayment =
  params.considerationToken === ZERO_ADDRESS ||
  params.considerationToken === NATIVE_TOKEN;
```

All existing tests for the native payment path use `ZERO_ADDRESS`. There is no
test that exercises the `NATIVE_TOKEN` sentinel path, leaving it untested.

**Fix applied:** Added two tests in `order.test.ts` (`buildBasicOrderFulfillment`
block): one verifying that `NATIVE_TOKEN` as the consideration token produces
the correct ETH value, and one verifying that tips are correctly included when
using `NATIVE_TOKEN` (this commit).

### 3.7 `encodeDomainSeparator` is private, forcing test duplication ✅ FIXED

**File:** `src/bulk_listings.ts` — the `encodeDomainSeparator` function is
now exported and re-exported from `index.ts`. The cross-check tests in
`bulk_listings.test.ts` import and use it directly instead of duplicating
its logic.

**Fix applied:** Added `export` keyword to `encodeDomainSeparator` in
`bulk_listings.ts`, added to the barrel re-export in `index.ts`, and
replaced the duplicated domain separator construction in both cross-check
tests with calls to `encodeDomainSeparator(ctx.domain)` (this commit).

### 3.8 `Side` enum has no dedicated tests ✅ FIXED

**File:** `src/types.ts` — `Side` is defined, exported, and re-exported from
`index.ts`, used in the `CriteriaResolver` type, but never tested. The other
three enums (`ItemType`, `OrderType`, `BasicOrderRouteType`) all have value
checks in `constants.test.ts`. `Side` should have the same treatment.

**Fix applied:** Added `Side` import and two value tests (`Side.OFFER` is 0,
`Side.CONSIDERATION` is 1) in `constants.test.ts` (this commit).

### 3.9 `FulfillmentComponent` fields typed as `bigint` — ergonomic friction ✅ FIXED

**File:** `src/types.ts`

**What was wrong:** Both fields were typed as `bigint` (matching Solidity's
`uint256`). viem's `encodeFunctionData` accepts `number` for small uints,
but the TypeScript type forced consumers to pass `0n` instead of `0`.

**Fix applied:** Changed both fields to `number | bigint` so consumers can
pass either plain numbers (e.g., `0`, `1`) or `bigint` literals (e.g., `0n`,
`1n`). Added JSDoc noting the ergonomic convenience and that Seaport's ABI
encodes them as uint256 (this commit).

### 3.10 `buildBulkOrderTree` internally calls `computeHeight` redundantly ✅ FIXED

**File:** `src/bulk_listings.ts`

```ts
export function buildBulkOrderTree(leaves: `0x${string}`[]): `0x${string}`[][] {
  const height = computeHeight(leaves.length);
  const capacity = 2 ** height;
  if (leaves.length !== capacity) {
    throw new Error(
      `Leaves must be padded to a power of 2. Expected ${capacity}, got ${leaves.length}.`,
    );
  }
  // ...
```

The `computeHeight` call computes `Math.ceil(Math.log2(length))`, and then
the next line computes `2 ** height` to check against the actual length. This
is equivalent to checking `(leaves.length & (leaves.length - 1)) !== 0`
(i.e., is it a power of 2?). The current approach is perfectly correct but
slightly roundabout. Consider a direct power-of-2 check for clarity.

**Fix applied:** Replaced the roundabout check with a direct bitwise power-of-2
test. `computeHeight` is now only called in the error path to produce the error
message with the expected capacity (this commit).

### 3.11 No JSDoc on `Side` enum, `FulfillmentComponent` type, and private helpers ✅ FIXED

All items now have JSDoc:
- `Side` enum in `types.ts` — documents that it applies to the offer (0) or consideration (1) side
- `FulfillmentComponent` type in `types.ts` — documents ergonomic `number | bigint` fields
- `checkUint120` in `encode.ts` — documents uint120 range with `@param` / `@throws`
- `computeNativeValue` in `order.ts` — brief description of purpose
- `encodeDomainSeparator` in `bulk_listings.ts` — documents domain encoding with `@param` / `@returns`

---

### 3.12 `computeNativeValue` uses loose `{ itemType: number }` instead of `ItemTypeValue` ✅ FIXED

**File:** `src/order.ts` — within `computeNativeValue`.

**What was wrong:** The parameter type used `itemType: number` instead of the
`ItemTypeValue` type (`0 | 1 | 2 | 3 | 4 | 5`). This bypassed type checking —
any object with a `number` `itemType` would be accepted. While the function
was only called internally with `ConsiderationItem[]`, the loose type could
hide refactoring errors.

**Fix applied:** Changed to `itemType: ItemTypeValue` and added `ItemTypeValue`
to the type imports in `order.ts`.

**Impact:** The function now rejects any item whose `itemType` is not a valid
Seaport item type value, catching mismatches at compile time.

### 3.13 `BulkOrder` type string brackets — repeated literal `[2]` could be confusing

**File:** `src/bulk_listings.ts`

```ts
const brackets = "[2]".repeat(height);
return (
  `BulkOrder(OrderComponents${brackets} tree)` +
  ...
```

The `[2]` literal assumes a binary tree with exactly 2 children per node.
This is correct for Seaport's bulk order scheme, but the magic number `2`
appears nowhere in the function signature or nearby. Consider extracting a
constant (`BULK_ORDER_BRANCH_FACTOR = 2`) or at least adding a doc comment
that this matches Seaport's binary Merkle tree structure.

### 3.14 `packBulkSignature` accepts empty proof (asymmetry with `unpackBulkSignature`) ✅ FIXED

**File:** `src/bulk_listings.ts`

**What was wrong:** `packBulkSignature` silently produced a 67-byte (height 0)
packed signature if given an empty `proof` array, but `unpackBulkSignature`
rejected it with `"at least one proof element"`. The functions were asymmetric
— `packBulkSignature` could produce output that `unpackBulkSignature` would
reject.

**Fix applied:** Added `proof.length < 1` validation at the top of
`packBulkSignature` (this commit).

### 3.15 `canFulfillAsBasicOrder` and `detectBasicOrderRouteType` recompute items

**File:** `src/order.ts`

`canFulfillAsBasicOrder` accesses `order.parameters.offer[0]` and
`order.parameters.consideration[0]` to check criteria types and the primary
recipient. `detectBasicOrderRouteType` then calls `canFulfillAsBasicOrder`
and immediately accesses `order.parameters.offer[0]!` and
`order.parameters.consideration[0]!` again with non-null assertions.

This works correctly but duplicates the array indexing and assertions.
Consider having `canFulfillAsBasicOrder` return the qualifying items, or
extract a shared private helper that returns `{ offerItem, primaryConsideration }`
so both functions reuse the same extraction logic.

### 3.16 `getCounter` — error handling for network/contract failures ✅ FIXED

**File:** `src/counter.ts`

**What was wrong:** If the RPC was unreachable, the contract reverted, or
`ctx.address` was not a deployed Seaport instance, `client.call` would throw
a raw viem error with no additional context, making debugging difficult.

**Fix applied:** Wrapped the `client.call` in a try/catch. viem `BaseError`
instances (RPC errors, contract reverts) are rethrown with a descriptive
message including the offerer address and Seaport contract address.
Non-`BaseError` exceptions (infrastructure errors like `TypeError`,
`RangeError`) are also wrapped with the same context. The existing
"no data" error path is preserved with enhanced messaging (this commit).

### 3.17 `test-fixtures.ts` imports from barrel creates latent circular dependency

**File:** `src/test-fixtures.ts`

Test fixtures import from `./index` (the barrel), which in turn imports from
all other source modules. If any source module ever imports `test-fixtures`
(e.g., to use a shared constant in a default parameter), a circular dependency
will result. Currently safe because no source module imports `test-fixtures`,
but it's a latent risk. Consider having `test-fixtures.ts` import directly
from the individual source modules instead of the barrel.

---

## Checks before every commit

Per `AGENTS.md`:

```sh
bun test              # all 150 tests must pass
bun run typecheck     # tsc --noEmit must pass
bun run build         # tsup → dist/ must succeed
```
