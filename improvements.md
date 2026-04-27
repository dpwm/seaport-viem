# Improvements

Issues and action items identified during code review. Items are ordered by
impact; address the highest-priority items first.

---

## Priority 1 (should fix)

### 1.1 README scope statement is stale

The README says the library only covers `fulfillBasicOrder`, but it now also
covers `fulfillOrder`, `fulfillAdvancedOrder`, `fulfillAvailableOrders`,
`fulfillAvailableAdvancedOrders`, and bulk listings. Update the scope
paragraph.

### 1.2 `unpackBulkSignature` allows height 0 (no proof)

`packBulkSignature` always packs at least one proof element because
`BULK_ORDER_HEIGHT_MIN = 1`, but `unpackBulkSignature` accepts a 67-byte input
(r||sCompact||orderIndex with no proof elements, height 0). This would return
an empty proof array, which will never verify on-chain. The function should
reject this early.

**File:** `src/bulk_listings.ts` — inside `unpackBulkSignature`, after computing
`height`:

```typescript
if (height < 1) {
  throw new Error(
    "Packed signature must include at least one proof element",
  );
}
```

### 1.3 `getBulkOrderTypeString` — verify casing against Seaport 1.6

The type string uses `tree` (lowercase):

```
BulkOrder(OrderComponents${brackets} tree)
```

Seaport's canonical type hash uses a specific casing. If the canonical string
uses `Tree` (capitalized) or a different whitespace convention, type hashes
won't match and all bulk order signing will fail silently. Cross-check against
the Seaport 1.6 source (`contracts/test/TypehashDirectory.sol` or the
`EIP712MerkleTree` test helper).

### 1.4 `encodeDomainSeparator` — risk of silent divergence from viem

The domain separator is computed manually in `encodeDomainSeparator`
(`src/bulk_listings.ts`) rather than using viem's internal implementation.
There are now **two** implementations of EIP-712 domain separator computation
in the codebase. If they diverge (different encoding, field ordering, etc.),
`hashBulkOrder` will produce digests that don't match what viem's
`verifyTypedData` expects or what Seaport verifies on-chain.

**Fix:** Add a cross-check test that validates the manual domain separator
against a known-good value (e.g., computed by `hashTypedData` with an empty
message and no primary type, or hardcoded against a forge deployment).

---

## Priority 2 (good to fix)

### 2.1 `encodeDomainSeparator` — unsafe cast of optional domain fields

`TypedDataDomain` has `name` and `version` as optional fields. The code uses:

```typescript
keccak256(stringToHex(domain.name as string))
keccak256(stringToHex(domain.version as string))
```

If a caller passes a domain without `name` or `version`, `as string` suppresses
the type error but `stringToHex(undefined)` will throw at runtime.

**Fix:** Use nullish coalescing:

```typescript
keccak256(stringToHex(domain.name ?? ""))
keccak256(stringToHex(domain.version ?? ""))
```

### 2.2 `canFulfillAsBasicOrder` — route type variable names are ambiguous

The route-checking variable names (`isErc721ToErc20`, `isErc20ToErc721`, etc.)
use the **fulfiller's perspective** (matching `BasicOrderRouteType`), but the
checked fields use the **order's perspective** (offer/consideration). This is
correct but takes mental effort to verify. Consider adding a clarifying
doc-comment on the `BasicOrderRouteType` enum in `types.ts`:

```typescript
/** Route type from the fulfiller's perspective (what the fulfiller sends → what they receive). */
```

### 2.3 `verifyOrderSignature` — broad catch may swallow infrastructure errors

The error handling distinguishes viem `BaseError` (rethrown) from plain `Error`
(returns `false`). This assumes all signature/recovery failures produce plain
`Error` instances, which is a viem implementation detail. A slightly more
targeted filter would be safer.

### 2.4 `padLeaves` — no guard against empty input

`padLeaves([])` returns `[]` without error, but `buildBulkOrderTree([])` throws
with "Cannot build a tree from zero leaves". Add an early check in `padLeaves`:

```typescript
if (leaves.length === 0) {
  throw new Error("Cannot pad an empty leaf array");
}
```

### 2.5 `computeHeight` — redundant floor check

```typescript
const height = Math.ceil(Math.log2(orderCount));
return height < BULK_ORDER_HEIGHT_MIN ? BULK_ORDER_HEIGHT_MIN : height;
```

`Math.ceil(Math.log2(1))` returns 0, and `0 < BULK_ORDER_HEIGHT_MIN` (1) so
the ternary catches it. But also `Math.ceil(Math.log2(0))` returns `-Infinity`,
which is < 1 so also caught. Consider a more explicit approach:

```typescript
if (orderCount <= 0) return BULK_ORDER_HEIGHT_MIN;
return Math.max(BULK_ORDER_HEIGHT_MIN, Math.ceil(Math.log2(orderCount)));
```

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

---

## Checks before every commit

Per `AGENTS.md`:

```sh
bun test              # all 136 tests must pass
bun run typecheck     # tsc --noEmit must pass
bun run build         # tsup → dist/ must succeed
```
