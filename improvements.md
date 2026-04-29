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

## Bugs

### 18. tsup `splitting: true` — rendered moot by bundler switch

**Resolved**: We replaced tsup with tsdown (Rolldown-based), which does not
produce shared chunk files. Each entry point bundles its dependencies
independently, producing a simpler `dist/` structure. The code-splitting
concern that motivated this item is no longer applicable.

See `tsdown.config.ts` and `package.json` for the current build setup.

### 20. `hashBulkOrder` skips context validation (inconsistency)

**Resolved**: Added `requireValidContext(ctx)` at the top of `hashBulkOrder`.
Imported from `./validate`. All 319 tests pass; `tsc --noEmit` passes.

`hashOrderComponents()` in `signature.ts` calls `requireValidContext(ctx)`,
but `hashBulkOrder()` in `bulk_listings.ts` did not — it silently accepted
an invalid context. While `hashBulkOrder` only uses `ctx.domain` (not
`ctx.address`), a garbage domain produces an undetectably wrong hash.

**Fix**: Added `requireValidContext(ctx)` at the top of `hashBulkOrder` for
consistency with every other function that accepts a `SeaportContext`.

---

## Should fix

### 21. `encodeDomainSeparator` has no validation and uses a type assertion

`src/bulk_listings.ts`:
```ts
domain.verifyingContract as `0x${string}`
```
- `verifyingContract` is type-asserted without validation. If it is
  `undefined`, the function silently produces the hash of `"undefined"`
  cast as an address.
- Missing `name` / `version` / `chainId` default to empty/zero strings or
  `0n`, producing a domain separator that will not match any real deployment.

**Resolved**: Replaced the hand-rolled `encodeDomainSeparator` with a
wrapper around viem's `hashDomain` (public export in viem 2.48.4). The
wrapper provides explicit defaults for `name`/`version`/`chainId` before
passing to `hashDomain`. The remaining type assertion on `verifyingContract`
is backed by the `requireValidContext` check already called in `hashBulkOrder`.
All 319 tests pass; `tsc --noEmit` passes.

### 23. `buildFulfillAvailableOrders` / `buildFulfillAvailableAdvancedOrders` untested

**Resolved**: Tests were already present in `src/order.test.ts` covering all
key paths listed — `maximumFulfilled` validation, ETH value computation across
multiple orders, happy-path with defaults, and `checkUint120` propagation for
advanced orders. All 8 tests pass. The issue entry was simply never marked
"Resolved" when the tests were added.

`src/order.ts` exports `buildFulfillAvailableOrders` and
`buildFulfillAvailableAdvancedOrders` but `src/order.test.ts` has no
test cases for them. They are the only two public fulfillment builders
without dedicated tests. Key paths uncovered:
- `maximumFulfilled` validation (exceeds orders length)
- ETH value computation across multiple orders
- Happy-path with default parameter values
- Propagation of `checkUint120` errors for advanced orders

### 24. Missing standalone tests for several functions

**Resolved**: Added standalone `describe("computeNativeValue", ...)` block with 6 edge cases (empty, single, multiple, mixed NATIVE/ERC20, all-ERC20, single-ERC20). Added `getProof` proof-content verification for height-2 (4-leaf) trees, confirming correct sibling hashes at each layer. The other gaps listed below were already addressed in earlier commits (error-path tests for `getProof` and `unpackBulkSignature`, standalone tests for `aggregateOfferItems`/`aggregateConsiderationItems`, and `basicOrderType`/`totalOriginalAdditionalRecipients` tests for `toBasicOrderParameters`) but the entry was never marked Resolved. All 326 tests pass.

| Function | Gap |
|---|---|
| `getProof()` | No error-path test (`index out of range`). No verification for a tree with height > 1. |
| `unpackBulkSignature()` | No test for `too short`, `invalid proof length`, or `height exceeds max` error paths. |
| `aggregateOfferItems()` / `aggregateConsiderationItems()` | No standalone tests for multiple orders, empty order array, or type narrowing. |
| `toBasicOrderParameters()` | No test explicitly verifying the `basicOrderType` packing formula (`orderType + routeType * 4`) or the `totalOriginalAdditionalRecipients` calculation. |
| `computeNativeValue()` | No standalone test for mixed NATIVE/ERC20 arrays, zero-NATIVE orders, or empty arrays. |

---

## Nice to have

### 25. `encodeDomainSeparator` duplicates viem's built-in

viem provides `hashDomain` (`import { hashDomain } from "viem"`) which does
the same thing. Replacing the hand-rolled implementation with `hashDomain`
would eliminate untested, manually crafted encoding:
```ts
import { hashDomain } from "viem";
export function encodeDomainSeparator(domain: TypedDataDomain): `0x${string}` {
  return hashDomain(domain);
}
```

**Resolved**: `hashDomain` is a public export from viem 2.48.4
(confirmed in `viem/index.ts` and `viem/_types/index.d.ts`). The
replacement was applied as part of item 21/30 — `encodeDomainSeparator`
now delegates to `hashDomain`.

### 26. `ORDER_COMPONENTS_STRUCT_ABI_TYPES` barrel omission undocumented

`ORDER_COMPONENTS_STRUCT_ABI_TYPES` is exported from `src/constants.ts` with
an `@internal` annotation but is intentionally excluded from the barrel in
`src/index.ts`. A consumer importing `seaport-viem/constants` directly will
see it in IDE autocomplete. Consider adding a `@private` note or excluding
it from the constants subpath module entirely.

**Resolved**: Added `@private` JSDoc tag with an explicit note that the
barrel exclusion is intentional. Consumers are warned the export may change
without notice.

### 28. Minor quality-of-life items

- **Source maps**: tsdown config sets `sourcemap: true` and `package.json`
  `files` includes `dist` (which contains `.mjs.map` files). Source maps
  are intentionally shipped — they help consumers debug issues in their
  own code that uses the library.
- **`seaportCall` re-throw guard**: The catch block checked
  `error.message.startsWith(...)` with an interpolated `fnLabel` string.
  A sentinel property (e.g., a error code or `cause` field) would be more
  robust than `message` prefix matching.

**Resolved**: Replaced the string-prefix check with `error instanceof
SeaportCallError`. Since `SeaportCallError` is already a custom error
class used by `seaportCall`, this is type-safe and not brittle against
message format changes. Updated the re-throw test to throw
`SeaportCallError` instead of a plain `Error`. Source maps confirmed as
intentionally shipped — no change needed.

---

## Simplification opportunities

Opportunities for reducing code size and complexity. Ordered by impact
(lines saved / maintenance burden removed).

---

### 30. `encodeDomainSeparator` duplicates viem's `hashDomain`

`src/bulk_listings.ts` contains a 33-line hand-rolled `encodeDomainSeparator`
that does the same thing as viem's `hashDomain`. It also uses an unsafe type
assertion (`domain.verifyingContract as \`0x${string}\``) without validation
(previously noted as item 21).

**Resolved**: Replaced the hand-rolled encoding with a wrapper around
viem's `hashDomain`. The function is kept (it's exported from the barrel)
but now delegates to viem. This removes ~30 lines of manually crafted
encoding and relies on viem's battle-tested implementation. Applied
together with item 21.

### 31. Event definitions live in three places (drift risk)

Event information exists in three separate sources:

1. **`seaportEventAbi`** — JSON ABI in `constants.ts`
2. **`parseAbiItem(...)` strings** — five `*Event` constants in `events.ts`
3. **Hardcoded topic hashes** — five `*_TOPIC` constants in `events.ts`

Topic matching in `decodeSeaportEvent` uses the hardcoded hashes. These could
instead be derived at module init from the `parseAbiItem` constants or from
`seaportEventAbi`, eliminating 5 hand-maintained hex literals. There are
already cross-check tests that catch drift, but reducing to one source of
truth is better.

**Fix**: In `decodeSeaportEvent`, iterate over the `parseAbiItem` results or
`seaportEventAbi` entries to match topics, rather than hardcoding five
`if (topic === ...)` branches. Remove the `*_TOPIC` constants (or compute
them from the ABI items).

**Resolved**: Eliminated all three sources of drift. Removed the five
`*_TOPIC` hardcoded hex constants and the five `*Event` `parseAbiItem`
constants from `events.ts`. Topic hashes are now computed at module scope
from the canonical `seaportEventAbi` (the sole JSON ABI definition in
`constants.ts`) using `encodeEventTopics`. The `decodeSeaportEvent` function
iterates over `seaportEventAbi` entries, matching topics against the
pre-computed map. The barrel (`index.ts`) no longer re-exports the removed
constants. Existing tests were simplified to remove cross-checks (no longer
needed) and updated to reference `seaportEventAbi` directly. All 311 tests
pass; `tsc --noEmit` passes.

### 32. `encode.ts` functions are mechanically repetitive

All 13 encoder functions follow the identical pattern:

```ts
export function encodeSomething(args): `0x${string}` {
  return encodeFunctionData({
    abi: [someAbiItem],
    functionName: "someName",
    args: [args],
  });
}
```

The only variation is the ABI item, function name, and arguments. A generic
factory could replace all 13 functions:

```ts
function makeEncoder<T extends readonly unknown[]>(
  abiItem: object,
  functionName: string,
) {
  return (...args: T) => encodeFunctionData({
    abi: [abiItem],
    functionName,
    args,
  });
}
```

**Resolved**: Added a private `encodeCall(abiItem, functionName, args)` helper
that each exported function delegates to, rather than inverting the call stack
with a factory. Keeps explicit per-function exports, JSDoc, and type safety
while eliminating the repetitive `encodeFunctionData({ abi: [...], functionName:
"...", args: [...] })` pattern. The three functions with uint120 validation
(`encodeFulfillAdvancedOrder`, `encodeFulfillAvailableAdvancedOrders`,
`encodeMatchAdvancedOrders`) use the same helper after their validation logic.
`encode.ts` reduced from 299 to 281 lines. All 311 tests pass; `tsc --noEmit`
passes.

### 33. `hashBulkOrder` lacks `requireValidContext`

**Resolved**: Same fix as item 20. Added `requireValidContext(ctx)` at the
top of `hashBulkOrder` in `bulk_listings.ts`.

### 34. Structural duplication in `order.ts` fulfillment builders

`buildFulfillAvailableOrders` and `buildFulfillAvailableAdvancedOrders` share
~90% of their structure (validate context, validate maximumFulfilled, sum
native value across orders, build return object). `buildMatchOrders` and
`buildMatchAdvancedOrders` follow the same pattern. A private helper could
reduce ~40 lines.

**Resolved**: Extracted the shared `requireValidContext` + value-sum loop
into an exported `computeTotalNativeValue` helper in `order.ts`. The helper
is exported (for use by `match.ts`) but excluded from the barrel — it is
not part of the stable public API. All 4 builders (`buildFulfillAvailableOrders`,
`buildFulfillAvailableAdvancedOrders`, `buildMatchOrders`,
`buildMatchAdvancedOrders`) now delegate to it. ~24 net lines saved across
both files. All tests pass; `tsc --noEmit` passes.

### 35. `seaportCall` re-throw guard uses fragile string matching

The catch block in `src/call.ts` checks
`error.message.startsWith(\`${fnLabel} returned no data\`)` to avoid
re-wrapping already-enriched errors. This breaks if the message format ever
changes (previously noted as item 28). A custom error class or sentinel
property would be more robust. Minimal code change (~3 lines).

---

## Summary of simplification impact

| Item | Lines saved | Complexity reduction |
|------|-------------|---------------------|
| 30 — Replace encodeDomainSeparator | ~30 (delegated to viem) | Medium — removes hand-rolled encoding |
| 31 — Single source of event definitions | ~20 | Medium — eliminates drift risk |
| 32 — `encodeCall` helper | ~18 | Small — preserves discoverability and tree-shaking |
| 33 — hashBulkOrder validation | 0 (add 1) | Small — consistency |
| 34 — order.ts deduplication | ~40 | Small — structural cleanup |
| 35 — seaportCall string-matching guard | ~3 | Small — robustness |

Total potential: ~111 lines eliminated.
