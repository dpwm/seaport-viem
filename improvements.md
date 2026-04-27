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

### 2.3 `verifyOrderSignature` — broad catch may swallow infrastructure errors

The error handling distinguishes viem `BaseError` (rethrown) from plain `Error`
(returns `false`). This assumes all signature/recovery failures produce plain
`Error` instances, which is a viem implementation detail. A slightly more
targeted filter would be safer.

### 2.4 `padLeaves` — no guard against empty input ✅ FIXED

Added early `leaves.length === 0` throw in `padLeaves` (commit 9db47cf).

### 2.5 `computeHeight` — redundant floor check ✅ FIXED

Replaced ternary with `Math.max(BULK_ORDER_HEIGHT_MIN, ...)` after zero guard
(commit 9db47cf).

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
bun test              # all 140 tests must pass
bun run typecheck     # tsc --noEmit must pass
bun run build         # tsup → dist/ must succeed
```
