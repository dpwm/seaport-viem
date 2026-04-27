# Improvements

Issues and action items identified during code review. Items are ordered by
impact; address the highest-priority items first.

---

## Priority 0 (critical — fix before any on-chain use)

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

**Related:** The `BulkOrder` type string must still be kept in sync with any
changes to the `EIP712_TYPES` constant in `constants.ts` and the hardcoded
sub-type strings in `hashOrderComponentsStruct` in `signature.ts` (see item
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

### 2.4 `toOrderParameters` — rest-spread silently passes through unexpected fields

**File:** `src/order.ts` — inside `toOrderParameters`.

```ts
const { counter: _, ...rest } = components;
return { ...rest, totalOriginalConsiderationItems };
```

If `OrderComponents` ever gains a new field that does not belong in
`OrderParameters` (beyond `counter`), it will be silently included in the
output. Conversely, if `OrderParameters` gains a field not present in
`OrderComponents`, it won't be set. This is fine as long as both structs are
stable, but it's a maintenance trap. Consider an explicit field-by-field
mapping or a dedicated type guard instead of destructure-and-spread.

### 2.5 `padLeaves` — no guard against empty input ✅ FIXED

Added early `leaves.length === 0` throw in `padLeaves` (commit 9db47cf).

### 2.6 `computeHeight` — redundant floor check ✅ FIXED

Replaced ternary with `Math.max(BULK_ORDER_HEIGHT_MIN, ...)` after zero guard
(commit 9db47cf).

### 2.7 `computeHeight` — returns 1 for zero orders instead of throwing

**File:** `src/bulk_listings.ts` — inside `computeHeight`.

```ts
export function computeHeight(orderCount: number): number {
  if (orderCount <= 0) {
    return BULK_ORDER_HEIGHT_MIN;
  }
  return Math.max(BULK_ORDER_HEIGHT_MIN, Math.ceil(Math.log2(orderCount)));
}
```

**Problem:** `computeHeight(0)` returns 1. While this is currently unreachable
in practice (both `padLeaves` and `buildBulkOrderTree` throw on empty input),
it's misleading. A caller using `computeHeight` standalone for introspection
would get a nonsensical result. The function should either throw for `orderCount < 1`
or be documented as only valid for positive inputs.

**Fix options:**
- Throw on `orderCount < 1`
- Or clamp to `BULK_ORDER_HEIGHT_MIN` and document the behavior

Note that if the early return is removed, the `Math.max` guard would still
produce the same value for `orderCount <= 0`, which is harmless but still
misleading.

---

## Priority 3 (minor / nice to have)

### 3.1 `bulk_signing_debug.test.ts` uses a hardcoded private key

The file `src/bulk_signing_debug.test.ts` contains a hardcoded `SELLER_KEY`.
This is acceptable for an integration test but should not be treated as a
secret. Consider documenting that this key is test-only.

### 3.2 No upper-bound validation on `maximumFulfilled`

`buildFulfillAvailableOrders` and `buildFulfillAvailableAdvancedOrders` accept
`maximumFulfilled` as a `bigint` without capping it to the array length.
Seaport caps on-chain, so this is harmless, but an early clamp would fail
faster.

### 3.3 Missing explicit test for `hashOrderComponentsStruct`

The function is tested indirectly via bulk listing tests (tree building uses it
for leaves), but there is no dedicated test that verifies its output against a
known Seaport `getOrderHash` value (e.g., from a cast call against a real
Seaport deployment or a foundry test fixture).

### 3.4 `checkUint120` — validation only in encoders, not in builders

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

### 3.5 Hardcoded type strings in `hashOrderComponentsStruct` can drift from `EIP712_TYPES`

**File:** `src/signature.ts` — the `ORDER_TYPEHASH` constant is built from a
hardcoded string:

```ts
const ORDER_TYPEHASH = keccak256(
  stringToHex(
    "OrderComponents(...)" +
    "ConsiderationItem(...)" +
    "OfferItem(...)",
  ),
);
```

**Problem:** The sub-type field definitions here are duplicated from the
`EIP712_TYPES` constant in `constants.ts`. If those are ever updated (e.g.,
Seaport adds a field to one of the structs), the two definitions can diverge.
There is no cross-check test verifying that the hardcoded type string produces
the same typehash as the structured `EIP712_TYPES` definition.

**Fix:** Add a test that derives a typehash from each `EIP712_TYPES` entry and
compares them against the hardcoded strings, or better, generate the type
strings programmatically from the `EIP712_TYPES` struct.

### 3.6 No test for `NATIVE_TOKEN` payment path in `buildBasicOrderFulfillment`

**File:** `src/order.ts` — the `isNativePayment` check handles both
`ZERO_ADDRESS` and `NATIVE_TOKEN` as sentinels for native ETH:

```ts
const isNativePayment =
  params.considerationToken === ZERO_ADDRESS ||
  params.considerationToken === NATIVE_TOKEN;
```

All existing tests for the native payment path use `ZERO_ADDRESS`. There is no
test that exercises the `NATIVE_TOKEN` sentinel path, leaving it untested.

### 3.7 `encodeDomainSeparator` is private, forcing test duplication

**File:** `src/bulk_listings.ts` — the `encodeDomainSeparator` function is
module-private (not exported). The cross-check tests in `bulk_listings.test.ts`
must replicate its full logic to verify correctness:

```ts
const domainTypeHash = keccak256(
  stringToHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);
// ... 20 more lines duplicating encodeDomainSeparator's internals
```

If `encodeDomainSeparator` ever changes its parameter encoding order or adds
new fields (like `salt`), the tests will silently diverge. Making it an
exported utility and importable by tests would:
- Eliminate duplication
- Allow direct unit testing
- Be useful for consumers who need to compute domain separators manually

### 3.8 `Side` enum has no dedicated tests

**File:** `src/types.ts` — `Side` is defined, exported, and re-exported from
`index.ts`, used in the `CriteriaResolver` type, but never tested. The other
three enums (`ItemType`, `OrderType`, `BasicOrderRouteType`) all have value
checks in `constants.test.ts`. `Side` should have the same treatment.

### 3.9 `FulfillmentComponent` fields typed as `bigint` — ergonomic friction

**File:** `src/types.ts`

```ts
export type FulfillmentComponent = {
  orderIndex: bigint;
  itemIndex: bigint;
};
```

Both fields are typed as `bigint` (matching the Solidity `uint256`). viem's
`encodeFunctionData` accepts `number` for small uints, but the TypeScript
type forces consumers to pass `0n` instead of `0`. Consider accepting
`number | bigint` for these fields, or provide a helper to construct them.

### 3.10 `buildBulkOrderTree` internally calls `computeHeight` redundantly

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

### 3.11 No JSDoc on `Side` enum, `FulfillmentComponent` type, and private helpers

- `Side` enum and `FulfillmentComponent` type in `types.ts` lack JSDoc
- `checkUint120` in `encode.ts` has no JSDoc
- `computeNativeValue` in `order.ts` has no JSDoc
- The private `encodeDomainSeparator` in `bulk_listings.ts` has no JSDoc

All public types and functions should have doc comments for a good DX.
Private helpers are less critical but would aid maintainers.

---

### 3.12 `computeNativeValue` uses loose `{ itemType: number }` instead of `ItemTypeValue`

**File:** `src/order.ts`

```ts
function computeNativeValue(consideration: { itemType: number; endAmount: bigint }[]): bigint {
```

The parameter type uses a loose inline shape with `itemType: number` instead
of the `ConsiderationItem` type or at least `ItemTypeValue`. This bypasses
type checking — any object with a `number` `itemType` would be accepted. Since
this is a private function called only with `ConsiderationItem[]`, it works,
but using the proper type would catch refactoring errors.

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

### 3.14 `packBulkSignature` accepts empty proof (asymmetry with `unpackBulkSignature`)

**File:** `src/bulk_listings.ts`

`packBulkSignature` will produce a 67-byte (height 0) packed signature if
given an empty `proof` array. `unpackBulkSignature` then rejects it with
`"at least one proof element"`. The functions are asymmetric —
`packBulkSignature` should validate `proof.length >= 1` just as
`unpackBulkSignature` validates `height >= 1`.

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

### 3.16 `getCounter` has no error handling for network/contract failures

**File:** `src/counter.ts`

```ts
const result = await client.call({ to: ctx.address, data });
```

If the RPC is unreachable, the contract reverts, or `ctx.address` is not a
deployed Seaport instance, this will throw a raw viem error with no additional
context. Consider wrapping in a try/catch with a descriptive error message,
or at least documenting that callers should handle transport errors themselves.

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
