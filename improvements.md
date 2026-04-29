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

### 18. tsup `splitting: true` may cause issues with CJS consumers

The build uses `splitting: true` which emits shared chunks. Some bundlers
struggle with code-split ESM when imported from CJS contexts. Since the
library targets ESM-only (`"type": "module"`), this is low risk but worth
noting if consumers report issues.

### 20. `hashBulkOrder` skips context validation (inconsistency)

`hashOrderComponents()` in `signature.ts` calls `requireValidContext(ctx)`,
but `hashBulkOrder()` in `bulk_listings.ts` does not — it silently accepts
an invalid context. While `hashBulkOrder` only uses `ctx.domain` (not
`ctx.address`), a garbage domain produces an undetectably wrong hash.

**Fix**: Add `requireValidContext(ctx)` at the top of `hashBulkOrder` for
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

**Fix**: Add validation before encoding (or rely on `requireValidContext`
added per item 20). Consider replacing with viem's `hashDomain` utility.

### 23. `buildFulfillAvailableOrders` / `buildFulfillAvailableAdvancedOrders` untested

`src/order.ts` exports `buildFulfillAvailableOrders` and
`buildFulfillAvailableAdvancedOrders` but `src/order.test.ts` has no
test cases for them. They are the only two public fulfillment builders
without dedicated tests. Key paths uncovered:
- `maximumFulfilled` validation (exceeds orders length)
- ETH value computation across multiple orders
- Happy-path with default parameter values
- Propagation of `checkUint120` errors for advanced orders

### 24. Missing standalone tests for several functions

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
(Note: `hashDomain` is not part of viem's documented public API — it lives
in `viem/utils`. Verify it is available in the minimum supported viem
version before switching.)

### 26. `ORDER_COMPONENTS_STRUCT_ABI_TYPES` barrel omission undocumented

`ORDER_COMPONENTS_STRUCT_ABI_TYPES` is exported from `src/constants.ts` with
an `@internal` annotation but is intentionally excluded from the barrel in
`src/index.ts`. A consumer importing `seaport-viem/constants` directly will
see it in IDE autocomplete. Consider adding a `@private` note or excluding
it from the constants subpath module entirely.

### 28. Minor quality-of-life items

- **Source maps**: tsup config sets `sourcemap: true` but `package.json`
  `files` only includes `dist` (which would contain `.js.map` files).
  Confirm source maps are intentionally shipped.
- **`seaportCall` re-throw guard**: The catch block checks
  `error.message.startsWith(...)` with an interpolated `fnLabel` string.
  A sentinel property (e.g., a error code or `cause` field) would be more
  robust than `message` prefix matching.

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

**Fix**: Replace with `import { hashDomain } from "viem"` and delete
`encodeDomainSeparator`. This removes the unsafe type assertion and ~30 lines
of hand-rolled encoding. (Verify `hashDomain` is available in the minimum
supported viem version before switching, per item 25.)

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

This would reduce `encode.ts` from ~280 to ~100 lines. Tradeoff: the current
explicit-export-per-function approach aids discoverability and tree-shaking.

### 33. `hashBulkOrder` lacks `requireValidContext`

Every function accepting `SeaportContext` calls `requireValidContext(ctx)`
except `hashBulkOrder` in `bulk_listings.ts` (previously noted as item 20).
One-line fix: add `requireValidContext(ctx)` at the top of the function.

### 34. Structural duplication in `order.ts` fulfillment builders

`buildFulfillAvailableOrders` and `buildFulfillAvailableAdvancedOrders` share
~90% of their structure (validate context, validate maximumFulfilled, sum
native value across orders, build return object). `buildMatchOrders` and
`buildMatchAdvancedOrders` follow the same pattern. A private helper could
reduce ~40 lines.

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
| 30 — Replace encodeDomainSeparator | ~30 | Medium — removes unsafe type assertion |
| 31 — Single source of event definitions | ~20 | Medium — eliminates drift risk |
| 32 — Encoder factory | ~180 | Medium — discoverability tradeoff |
| 33 — hashBulkOrder validation | 0 (add 1) | Small — consistency |
| 34 — order.ts deduplication | ~40 | Small — structural cleanup |
| 35 — seaportCall string-matching guard | ~3 | Small — robustness |

Total potential: ~273 lines eliminated.
