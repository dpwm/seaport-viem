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

### 1. `encodeDomainSeparator` defaults create inconsistent domain separator with `hashOrderComponents`

`encodeDomainSeparator` in `src/bulk_listings.ts` (lines 307–323) wraps viem's
`hashDomain` but provides explicit defaults for undefined domain fields before
passing them along:

```ts
export function encodeDomainSeparator(domain: TypedDataDomain): `0x${string}` {
  return hashDomain({
    domain: {
      name: domain.name ?? "",
      version: domain.version ?? "",
      chainId: BigInt(domain.chainId ?? 0),
      verifyingContract: domain.verifyingContract as `0x${string}`,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
    },
  });
}
```

Meanwhile, `hashOrderComponents` in `src/signature.ts` (line 65) passes
`ctx.domain` directly to viem's `hashTypedData`, which internally calls
`getTypesForEIP712Domain({ domain })` to dynamically generate only the
EIP-712 domain types for fields that are actually present
(`node_modules/viem/_esm/utils/typedData.js`, line 84–95):

```ts
export function getTypesForEIP712Domain({ domain }) {
  return [
    typeof domain?.name === 'string' && { name: 'name', type: 'string' },
    domain?.version && { name: 'version', type: 'string' },
    (typeof domain?.chainId === 'number' ||
      typeof domain?.chainId === 'bigint') && { name: 'chainId', type: 'uint256' },
    domain?.verifyingContract && { name: 'verifyingContract', type: 'address' },
    domain?.salt && { name: 'salt', type: 'bytes32' },
  ].filter(Boolean);
}
```

This creates an **inconsistency** when any optional domain field is `undefined`:

| Domain field | `hashOrderComponents` (via `hashTypedData`) | `hashBulkOrder` (via `encodeDomainSeparator`) |
|---|---|---|
| `name: undefined` | Domain sep **omits** `name` | Domain sep includes `name = ""` |
| `version: undefined` | Domain sep **omits** `version` | Domain sep includes `version = ""` |
| `chainId: undefined` | Domain sep **omits** `chainId` | Domain sep includes `chainId = 0n` |

Since both functions share the same `ctx.domain`, a consumer with a
`SeaportContext` where `name`, `version`, or `chainId` is omitted would get
different domain separators — and therefore different EIP-712 digests —
depending on which function they call.

`validateSeaportContext` in `src/validate.ts` (line 21) does not check for
`name` or `version`, and treats `chainId` as optional (it only validates it
when present). So `requireValidContext` does not catch this.

**Fix**: Remove the defaults from `encodeDomainSeparator` and pass domain
fields through as-is. Let `hashDomain` handle undefined fields the same way
`hashTypedData` does — by omitting the corresponding type from the EIP-712
domain type array based on whether the field is present. This can be done by
using a dynamic type array (mirroring `getTypesForEIP712Domain`) instead of
the current hardcoded one.

**Context**: The issue only manifests with contexts that omit one or more
optional fields (`name`, `version`, `chainId`). The provided `SEAPORT_CTX`
populates all three, so standard usage is unaffected. But the library should
produce consistent results for any valid `SeaportContext` regardless of
which hash function is called.

### 2. `computeNativeValue` uses `endAmount` only, undercomputing `msg.value` for Dutch auction orders

`computeNativeValue` in `src/order.ts` (lines 406–415) sums `endAmount` for
all NATIVE consideration items to compute the `msg.value` sent with a
fulfillment transaction:

```ts
export function computeNativeValue(consideration: readonly { itemType: ItemTypeValue; endAmount: bigint }[]): bigint {
  let value = 0n;
  for (const item of consideration) {
    if (item.itemType === ItemType.NATIVE) {
      value += item.endAmount;
    }
  }
  return value;
}
```

The function type signature does not include `startAmount`. For Dutch auction
orders where the price descends over time (`startAmount > endAmount`), the
contract transfers the **current** consideration amount — which is between
`startAmount` and `endAmount`, interpolated from `block.timestamp`. The
maximum possible consideration is `startAmount` (at the beginning of the
time window).

By only summing `endAmount`, `computateNativeValue` undercomputes the
required `msg.value` whenever `startAmount > endAmount` and the order is
fulfilled before the price has fully decayed. The Seaport contract checks
`msg.value >= totalNativeConsideration` and reverts if insufficient, so
this causes a hard failure for Dutch auction listings.

This affects all fulfillment paths, since every `build*` function delegates
to `computeNativeValue` (directly or via `computeTotalNativeValue`):

| Builder | Value source |
|---------|-------------|
| `buildBasicOrderFulfillment` | `computeNativeValue(order.parameters.consideration)` |
| `buildFulfillOrder` | `computeNativeValue(order.parameters.consideration)` |
| `buildFulfillAdvancedOrder` | `computeNativeValue(advancedOrder.parameters.consideration)` |
| `buildFulfillAvailableOrders` | `computeTotalNativeValue(ctx, orders)` → `computeNativeValue` |
| `buildFulfillAvailableAdvancedOrders` | `computeTotalNativeValue(ctx, advancedOrders)` → `computeNativeValue` |
| `buildMatchOrders` | `computeTotalNativeValue(ctx, orders)` → `computeNativeValue` |
| `buildMatchAdvancedOrders` | `computeTotalNativeValue(ctx, advancedOrders)` → `computeNativeValue` |

All test fixtures use `startAmount === endAmount`, so this is never exposed
in the existing test suite (`src/order.test.ts` lines 646–694).

**Fix**: Change `computeNativeValue` to use `max(startAmount, endAmount)`
instead of just `endAmount`. This requires adding `startAmount` to the
function's parameter type:

```ts
export function computeNativeValue(
  consideration: readonly { itemType: ItemTypeValue; startAmount: bigint; endAmount: bigint }[],
): bigint {
  let value = 0n;
  for (const item of consideration) {
    if (item.itemType === ItemType.NATIVE) {
      value += item.startAmount > item.endAmount ? item.startAmount : item.endAmount;
    }
  }
  return value;
}
```

Since `startAmount >= endAmount` for descending auctions (the common case),
this is equivalent to using `startAmount`. Using `max` also handles the
unusual ascending case (`endAmount > startAmount`) correctly. For the
constant-price case (`startAmount === endAmount`), behaviour is unchanged.

**Context**: This only affects orders with different `startAmount` and
`endAmount` values — i.e., Dutch auction pricing. Constant-price orders
(by far the most common on OpenSea/Seaport) are unaffected. The fix is
a one-line change with no breaking API impact (all callers already have
access to `startAmount` on their consideration items).

### 3. `buildMatchOrders` and `buildMatchAdvancedOrders` lack input validation for empty arrays

`buildMatchOrders` in `src/match.ts` (lines 22–31) and
`buildMatchAdvancedOrders` (lines 43–67) accept orders and fulfillments
arrays but do not validate that they are non-empty before encoding the
calldata:

```ts
// buildMatchOrders — no validation for orders.length or fulfillments.length
export function buildMatchOrders(
  ctx: SeaportContext,
  orders: { parameters: OrderParameters; signature: `0x${string}` }[],
  fulfillments: Fulfillment[],
): FulfillmentData {
  const value = computeTotalNativeValue(ctx, orders);
  return {
    to: ctx.address,
    data: encodeMatchOrders(orders, fulfillments),
    value,
  };
}
```

Other build functions in the same codebase **do** validate their array
arguments:

| Function | Validation |
|----------|-----------|
| `buildCancel` (`src/cancel.ts:20`) | `orders.length === 0` → throws `SeaportValidationError` |
| `buildValidate` (`src/validate.ts:194`) | `orders.length === 0` → throws `SeaportValidationError` |
| `buildFulfillAvailableOrders` (`src/order.ts:529`) | `maximumFulfilled > orders.length` → throws `SeaportValidationError` |
| `buildFulfillAvailableAdvancedOrders` (`src/order.ts:568`) | `maximumFulfilled > orders.length` → throws `SeaportValidationError` |

Both `buildMatchOrders` and `buildMatchAdvancedOrders` silently encode
and return calldata for empty arrays. The Seaport contract will revert
with `NoSpecifiedOrdersAvailable` or
`OfferAndConsiderationRequiredOnFulfillment` — cryptic errors that give
the consumer no indication of what went wrong. A `SeaportValidationError`
with a descriptive message (e.g. `"At least one order must be provided"`)
would be immediately clear.

**Fix**: Add validation at the top of both functions:

- `buildMatchOrders`: throw if `orders.length === 0` or
  `fulfillments.length === 0`.
- `buildMatchAdvancedOrders`: throw if `advancedOrders.length === 0`.

**Context**: This is a consistency and UX polish issue. The functions
work correctly when given valid inputs. The gap only affects callers who
pass empty arrays — which is unlikely in production but happens during
development and integration testing. The fix aligns these builders with
the validation patterns already established by `buildCancel` and
`buildValidate`.

### 4. Fulfillment builders lack structural input validation consistent with other builders

Four fulfillment builders in `src/order.ts` accept orders without validating
that the order structures are semantically valid before encoding:

| Builder | What it doesn't validate | Line |
|---------|-------------------------|------|
| `buildFulfillOrder` | Order has at least one offer and one consideration item | 424 |
| `buildFulfillAdvancedOrder` | Order has at least one offer and one consideration item | 459 |
| `buildFulfillAvailableOrders` | Orders array is non-empty | 487 |
| `buildFulfillAvailableAdvancedOrders` | Advanced orders array is non-empty | 530 |

For example, `buildFulfillOrder` (lines 424–440) accepts a single order but
never checks that `order.parameters.offer.length > 0` or
`order.parameters.consideration.length > 0`:

```ts
export function buildFulfillOrder(
  ctx: SeaportContext,
  order: { parameters: OrderParameters; signature: `0x${string}` },
  fulfillerConduitKey: `0x${string}` = ZERO_BYTES32,
): FulfillmentData {
  requireValidContext(ctx);

  return {
    to: ctx.address,
    data: encodeFulfillOrder(order, fulfillerConduitKey),
    value: computeNativeValue(order.parameters.consideration),
  };
}
```

And `buildFulfillAvailableOrders` (lines 487–513) validates
`maximumFulfilled > orders.length` but not that `orders` is non-empty:

```ts
export function buildFulfillAvailableOrders(
  ctx: SeaportContext,
  orders: { parameters: OrderParameters; signature: `0x${string}` }[],
  ...
  maximumFulfilled: bigint = BigInt(orders.length),
): FulfillmentData {
  if (maximumFulfilled > BigInt(orders.length)) {
    throw new SeaportValidationError(
      `maximumFulfilled (${maximumFulfilled}) exceeds orders length (${orders.length})`,
    );
  }
  // ... no check for orders.length === 0
```

When `orders` is `[]`, `maximumFulfilled` defaults to `0n` and the check
`0n > 0n` passes silently. The function encodes and returns calldata for
an empty orders array, which the Seaport contract processes as a no-op.

The other builders in the same module establish a contrasting pattern:

| Function | Offer/array validation |
|----------|----------------------|
| `buildBasicOrderFulfillment` (`order.ts:104–112`) | `offer.length !== 1` → throws, `consideration.length < 1` → throws |
| `buildCancel` (`cancel.ts:20`) | `orders.length === 0` → throws |
| `buildValidate` (`validate.ts:194–198`) | `orders.length === 0` → throws |

**Fix**: Add the following validations before encoding:

- `buildFulfillOrder`: check `order.parameters.offer.length === 0` or
  `order.parameters.consideration.length === 0` and throw
  `SeaportValidationError`.
- `buildFulfillAdvancedOrder`: same structural checks on the order's
  `parameters.offer` and `parameters.consideration`.
- `buildFulfillAvailableOrders`: check `orders.length === 0` and throw
  `SeaportValidationError` (matching `buildValidate`).
- `buildFulfillAvailableAdvancedOrders`: same check for
  `advancedOrders.length === 0`.

**Context**: All test fixtures in `src/test-fixtures.ts` use orders with
single offer and consideration items (`makeOfferItem`, `makeConsiderationItem`
with defaults), so this gap is never exercised. The fix aligns the fulfill
builders with the validation conventions already established by
`buildCancel`, `buildValidate`, and `buildBasicOrderFulfillment` in the same
codebase.

### 5. `requireValidContext(ctx)` is not called at the top of four builder functions

Six out of ten builder functions explicitly call `requireValidContext(ctx)` as
the first statement in their function body, establishing a clear pattern:

| Builder | File | Line | `requireValidContext` at top? |
|---------|------|------|------------------------------|
| `buildBasicOrderFulfillment` | `src/order.ts` | 122 | ✅ First statement |
| `buildFulfillOrder` | `src/order.ts` | 451 | ✅ First statement |
| `buildFulfillAdvancedOrder` | `src/order.ts` | 477 | ✅ First statement |
| `buildCancel` | `src/cancel.ts` | 18 | ✅ First statement |
| `buildValidate` | `src/validate.ts` | 192 | ✅ First statement |
| `buildIncrementCounter` | `src/increment_counter.ts` | 15 | ✅ First statement |
| `buildFulfillAvailableOrders` | `src/order.ts` | 505 | ❌ Validates `maximumFulfilled` first |
| `buildFulfillAvailableAdvancedOrders` | `src/order.ts` | 547 | ❌ Validates uint120/`maximumFulfilled` first |
| `buildMatchOrders` | `src/match.ts` | 27 | ❌ Relies on `computeTotalNativeValue` |
| `buildMatchAdvancedOrders` | `src/match.ts` | 52 | ❌ Validates uint120 first |

All four non-conforming builders eventually validate the context through
`computeTotalNativeValue` (which calls `requireValidContext` internally), so
this gap does **not** cause incorrect behavior. But the delegation is implicit,
and the validation order differs from the established pattern:

```ts
// Conforming pattern: context first, then params
// src/order.ts:470–478 (buildFulfillAdvancedOrder)
export function buildFulfillAdvancedOrder(...): FulfillmentData {
  requireValidContext(ctx);  // always first
  checkUint120(...);
  ...
}

// Non-conforming: params checked before context
// src/order.ts:547–567 (buildFulfillAvailableAdvancedOrders)
export function buildFulfillAvailableAdvancedOrders(...): FulfillmentData {
  for (const order of advancedOrders) {
    checkUint120(order.numerator, "numerator");  // runs first
    checkUint120(order.denominator, "denominator");
  }
  if (maximumFulfilled > BigInt(advancedOrders.length)) { ... }  // runs second
  const value = computeTotalNativeValue(ctx, advancedOrders);  // context validated here
  ...
}

// Non-conforming: context validation is implicit
// src/match.ts:27–36 (buildMatchOrders)
export function buildMatchOrders(...): FulfillmentData {
  const value = computeTotalNativeValue(ctx, orders);  // context validated inside
  ...
}
```

This creates three concrete concerns:

1. **Error message priority**: In `buildFulfillAvailableAdvancedOrders` and
   `buildMatchAdvancedOrders`, if both the context is invalid AND numeric
   parameters exceed uint120 bounds, the error the caller sees is about
   uint120 overflow rather than the misconfigured context. Following the
   established pattern, context validation should have priority.

2. **Implicit dependency**: `computeTotalNativeValue` acts as a transitive
   context validator, but this dependency is not obvious to readers. A future
   refactor of `computeTotalNativeValue` (or the call order) could silently
   disable context validation in these four functions.

3. **Pattern inconsistency**: New contributors who look at the minority
   pattern (4/10 builders) might conclude context validation is optional,
   leading to new builders that also skip it.

**Fix**: Add `requireValidContext(ctx)` as the first statement in each of the
four non-conforming function bodies:

- `buildFulfillAvailableOrders` (`src/order.ts:505`): insert before the
  `maximumFulfilled` check.
- `buildFulfillAvailableAdvancedOrders` (`src/order.ts:547`): insert before
  the `checkUint120` loop.
- `buildMatchOrders` (`src/match.ts:27`): insert before the
  `computeTotalNativeValue` call. (Note: this makes the existing context
  validation inside `computeTotalNativeValue` redundant but harmless —
  no double-error risk because `requireValidContext` is idempotent at the
  validation level: the second check passes immediately.)
- `buildMatchAdvancedOrders` (`src/match.ts:52`): insert before the
  `checkUint120` loop.

**Context**: The fix is purely about code consistency and maintainability.
No behavior changes because context validation already happens in all cases.
The `requireValidContext` function is lightweight (two `isAddress` calls and
one type check), so adding it to four more call sites has negligible
performance impact.

### 6. Advanced order builders don't validate denominator ≠ 0 or numerator ≤ denominator

Six functions accept numerator/denominator for partial fills but only check
uint120 range bounds — they don't check that the fraction itself is valid:

| Function | File | Lines | Checks `denom ≠ 0`? | Checks `num ≤ denom`? |
|----------|------|-------|---------------------|-----------------------|
| `buildFulfillAdvancedOrder` | `src/order.ts` | 477–481 | ❌ | ❌ |
| `buildFulfillAvailableAdvancedOrders` | `src/order.ts` | 558–560 | ❌ | ❌ |
| `buildMatchAdvancedOrders` | `src/match.ts` | 60–62 | ❌ | ❌ |
| `encodeFulfillAdvancedOrder` | `src/encode.ts` | 108–110 | ❌ | ❌ |
| `encodeFulfillAvailableAdvancedOrders` | `src/encode.ts` | 165–167 | ❌ | ❌ |
| `encodeMatchAdvancedOrders` | `src/encode.ts` | 242–244 | ❌ | ❌ |

All six call `checkUint120(order.numerator, "numerator")` and
`checkUint120(order.denominator, "denominator")`, which only checks that
each value is in the range `[0, 2^120 - 1]`. It does not check:

1. **`denominator === 0`**: The Seaport contract divides by the denominator
   when computing fill amounts. `denominator = 0` causes a Solidity
   division-by-zero panic — a raw EVM revert with no helpful message.

2. **`numerator > denominator`**: The Seaport contract explicitly checks
   this in `_validateOrderAndUpdateStatus` and reverts with `BadFraction()`.
   The library should catch this early with a descriptive error.

Both checks are inexpensive (two bigint comparisons) and prevent the caller
from constructing a transaction that will definitely revert on-chain. The
`checkUint120` function is a range check by design (it's semantically about
uint120 encoding limits, not arithmetic validity), so the fraction validation
should be added in the callers.

**Fix**: Add a new validation function (or inline checks) in the three builder
functions (`buildFulfillAdvancedOrder`, `buildFulfillAvailableAdvancedOrders`,
`buildMatchAdvancedOrders`) that throws `SeaportValidationError` if:
- `denominator === 0n` — message: `"denominator must be non-zero"`
- `numerator > denominator` — message: `"numerator (X) must be ≤ denominator (Y)"`

The encoder functions in `encode.ts` already rely on the builders for
validation (per the established pattern of builders validating before
encoding), so adding checks only in the builders is sufficient. But
belt-and-suspenders checks in the encoders are acceptable too.

**Context**: All test fixtures use `numerator = 1n, denominator = 1n`
(full-fill), so the gap is never exercised. In practice, partial-fill
orders always have valid fractions, but library correctness should not
depend on caller discipline — especially for on-chain transactions where
a bad fraction wastes gas.

### 7. `verifyOrderSignature` error classification depends on fragile `@noble/curves` error message regex

`verifyOrderSignature` in `src/signature.ts` (lines 38–44) catches errors
thrown by viem's `verifyTypedData` and uses a regex to distinguish
signature-verification failures from infrastructure errors:

```ts
} catch (error: unknown) {
  // Re-throw viem infrastructure errors (bad address, bad domain, etc.)
  if (error instanceof BaseError) {
    throw error;
  }
  // Signature recovery failures from @noble/curves produce Error instances
  // with messages indicating an invalid/unrecoverable signature.
  // Only swallow signature-related errors; rethrow everything else.
  // Narrow match to known signature-recovery failure messages from
  // @noble/curves; avoid swallowing infrastructure errors that happen
  // to contain the word "signature" (e.g., invalid curve points).
  if (error instanceof Error && /signature (invalid|mismatch)|unrecoverable signature/i.test(error.message)) {
    return false;
  }
  throw error;
}
```

This regex matches error message text from `@noble/curves`, a transitive
dependency of viem used internally for ECDSA recovery. The approach has
two fragility concerns:

1. **Transitive dependency coupling**: The library's behavior depends on
   the exact phrasing of error messages in `@noble/curves`. If viem
   upgrades to a newer version of noble-curves, switches to a different
   crypto library, or noble changes its error messages, the regex will
   stop matching. In the failure case, `verifyOrderSignature` re-throws
   instead of returning `false` — which is safer than silently swallowing
   a real error, but breaks the expected `Promise<boolean>` contract for
   signature validation.

2. **No positive test for error message patterns**: The test suite
   (`src/signature.test.ts`) tests tampered signatures and mismatched
   offerers, both of which exercise the `return false` path. But these
   tests pass because viem's `verifyTypedData` internally handles the
   failure (returning `false` or throwing). There is no test that
   verifies the specific noble error messages are matched by the regex —
   the thrown-error path is implicitly tested but not explicitly
   validated against known message strings.

A more robust approach would be to validate the signature format
(parsing r, s, v components) before calling `verifyTypedData`, or to
use viem's `recoverTypedDataAddress` and compare addresses, avoiding
the throw/catch control flow entirely.

**Context**: The function works correctly with the current viem and
noble versions. This is a maintenance risk — a dependency upgrade could
silently change behavior. The existing `return false` tests protect
against regressions in the normal case; a noble message format change
would likely cause `verifyOrderSignature` to throw (failing the test
suite), alerting maintainers. But the coupling to internal error text
is an unnecessary fragility that could be eliminated.
