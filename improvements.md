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

**Resolved**: Replaced `encodeDomainSeparator`'s hardcoded type array +
default-filled domain with a delegation to viem's exported `domainSeparator`
function. This guarantees the same domain separator as `hashTypedData` and
`recoverTypedDataAddress` for any valid domain (including partial domains
where `name`, `version`, or `chainId` is omitted). Added four cross-check
tests verifying domain separator consistency with partial domains.

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

**Resolved**: Changed `computeNativeValue` to accept `startAmount` in its
parameter type and use `max(startAmount, endAmount)` for each NATIVE
consideration item. This correctly computes the maximum possible `msg.value`
for Dutch auction orders where the price descends from `startAmount` to
`endAmount` over time. Added 3 new tests covering descending Dutch auction,
ascending edge case, and mixed multiple items. Updated 9 existing builder
integration tests to pass explicit `startAmount` alongside `endAmount`,
keeping their constant-price semantics intact.

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

**Resolved**: Added `SeaportValidationError` throws for empty `orders`
and empty `fulfillments` in `buildMatchOrders`, and for empty
`advancedOrders` in `buildMatchAdvancedOrders`. Error messages follow
the `buildCancel`/`buildValidate` convention ("At least one order must be
provided to match", etc.). Extended the test suite with 3 new tests
covering both empty-array cases, and updated 2 existing tests that
passed empty arrays to now provide valid fulfillments/orders.

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

**Resolved**: Added `SeaportValidationError` throws in all four fulfillment
builders: `buildFulfillOrder` and `buildFulfillAdvancedOrder` now validate
non-empty offer and consideration arrays; `buildFulfillAvailableOrders` and
`buildFulfillAvailableAdvancedOrders` now validate non-empty orders arrays.
Added 6 new tests covering all new validation paths (empty offer, empty
consideration, empty orders array, empty advanced orders array). All existing
tests continue to pass unchanged.

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

**Resolved**: Added `requireValidContext(ctx)` as the first statement in
`buildFulfillAvailableOrders`, `buildFulfillAvailableAdvancedOrders`,
`buildMatchOrders`, and `buildMatchAdvancedOrders`. Removed the now-redundant
`requireValidContext` call from `computeTotalNativeValue` and updated its JSDoc
to document that callers are responsible for context validation. All 10 builder
functions now follow the same pattern: context validated first, then params.

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

**Resolved**: Added `SeaportValidationError` validation for `denominator === 0`
and `numerator > denominator` in all three advanced-order builder functions:
`buildFulfillAdvancedOrder`, `buildFulfillAvailableAdvancedOrders`, and
`buildMatchAdvancedOrders`. Added 6 new tests (2 per builder) covering zero
denominator and numerator > denominator cases. All existing tests pass unchanged.

### 7. ~~`verifyOrderSignature` error classification depends on fragile `@noble/curves` error message regex~~ ✅ FIXED

**Resolved in commit `773664b`.**

`verifyOrderSignature` previously used `verifyTypedData` with a try/catch
containing a regex (`/signature (invalid|mismatch)|unrecoverable signature/i`)
to distinguish noble-curves signature failures from infrastructure errors.

The fix replaces `verifyTypedData` (boolean return) with
`recoverTypedDataAddress` (returns the recovered address). The function now:

1. Calls `recoverTypedDataAddress` — any throw means the signature is
   structurally invalid (bad length, bad v, r/s out of range).
2. Compares the recovered address to `order.parameters.offerer` — if
   they differ, returns `offerer-mismatch` with the recovered address.
3. Returns a closed-set discriminated union instead of `boolean`:
   `{ valid: true } | { valid: false; reason: 'invalid-signature' }`
   `| { valid: false; reason: 'offerer-mismatch'; recovered }`

The regex is eliminated entirely. Tests exercise both failure modes
deterministically against real viem (short `"0x00"` signature for structural
failure, bad v byte for recovery failure, mismatched offerer for mismatch).

**What the fix does not change**:
- `requireValidContext(ctx)` still validates the domain before recovery.
- `hashOrderComponents` and `hashOrderComponentsStruct` are unchanged.
- The `OrderVerificationResult` type is exported from `seaport-viem` and
  `seaport-viem/signature`.

### 8. `buildFulfillAvailableOrders` and `buildFulfillAvailableAdvancedOrders` default to empty fulfillments, producing silent no-ops

Both functions accept `offerFulfillments` and `considerationFulfillments`
parameters that default to `[]` (`src/order.ts`, lines 500–501 and 542–543):

```ts
// buildFulfillAvailableOrders (lines 500–501)
export function buildFulfillAvailableOrders(
  ctx: SeaportContext,
  orders: { parameters: OrderParameters; signature: `0x${string}` }[],
  offerFulfillments: FulfillmentComponent[][] = [],           // ❌ defaults to []
  considerationFulfillments: FulfillmentComponent[][] = [],    // ❌ defaults to []
  fulfillerConduitKey: `0x${string}` = ZERO_BYTES32,
  maximumFulfilled: bigint = BigInt(orders.length),
): FulfillmentData {

// buildFulfillAvailableAdvancedOrders (lines 542–543) — same pattern
  offerFulfillments: FulfillmentComponent[][] = [],            // ❌ defaults to []
  considerationFulfillments: FulfillmentComponent[][] = [],    // ❌ defaults to []
```

A caller who writes `buildFulfillAvailableOrders(ctx, orders)` without
explicitly passing fulfillments gets a `FulfillmentData` where the encoded
calldata has zero fulfillment components. The Seaport contract processes
this as a no-op — no items are transferred and no orders are fulfilled.
The transaction succeeds on-chain but accomplishes nothing, silently
wasting gas.

The library provides `aggregateOfferItems()` and `aggregateConsiderationItems()`
helpers that create default 1-to-1 fulfillments, but neither function calls
them automatically. The caller must know to pass them explicitly:

```ts
// What the caller must do (but might not know):
buildFulfillAvailableOrders(
  ctx,
  orders,
  aggregateOfferItems(orders),
  aggregateConsiderationItems(orders),
);

// What silently produces a no-op:
buildFulfillAvailableOrders(ctx, orders);
```

The same gap applies to `buildFulfillAvailableAdvancedOrders`. Both
functions also do not validate that at least one of `offerFulfillments`
or `considerationFulfillments` is non-empty, which would catch the
empty-default case.

Other builders in the same codebase establish a contrasting pattern
of validating their inputs before encoding:

| Function | Input validation |
|----------|-----------------|
| `buildCancel` (`src/cancel.ts:20`) | `orders.length === 0` → throws |
| `buildValidate` (`src/validate.ts:194`) | `orders.length === 0` → throws |
| `buildBasicOrderFulfillment` (`src/order.ts:104`) | `offer.length !== 1` → throws |

**Fix**: One of two approaches:

1. **Validate explicitly**: throw `SeaportValidationError` if both
   `offerFulfillments.length === 0` and `considerationFulfillments.length === 0`
   (at least one side must have fulfillments).

2. **Auto-generate defaults**: compute `offerFulfillments` and
   `considerationFulfillments` from `aggregateOfferItems(orders)` and
   `aggregateConsiderationItems(orders)` when the caller does not
   provide explicit fulfillments. This is the safer DX choice — the
   common case (independent orders with 1-to-1 fulfillments) works
   without ceremony.

Approach (2) is preferred because it matches the intent of a caller who
passes orders without fulfillment components: "just fulfill these orders
independently." The explicit-fulfillment path remains available for callers
who need cross-order aggregation.

**Context**: All existing tests for these functions pass explicit
fulfillments (via `aggregateOfferItems` / `aggregateConsiderationItems` or
manual `FulfillmentComponent[][]` literals), so the empty-default path is
never exercised. The gap only affects callers who rely on the defaults —
which is the natural "first try" for a developer integrating the library.

**Resolved**: Added `SeaportValidationError` validation in both
`buildFulfillAvailableOrders` and `buildFulfillAvailableAdvancedOrders` that
throws when both `offerFulfillments` and `considerationFulfillments` are
empty. Added 6 new tests covering the empty-both error and the
only-offer/only-consideration edge cases. Updated 8 existing tests that
previously relied on empty defaults to pass explicit fulfillments via
`aggregateOfferItems`/`aggregateConsiderationItems`.

---

## Uncovered lines (coverage gaps)

These lines are reported as uncovered by `bun test --coverage` (100% funcs,
99.23% lines). Each entry explains why the line is uncovered and how to
cover it.

### 9. `src/order.ts:269-270, 279-280, 291` — Fallback `return null` in `detectBasicOrderRouteType` when consideration is ERC721/ERC1155/ERC20

Lines 269–270, 279–280, and 291 are the `return null` fallbacks in
`detectBasicOrderRouteType` when:
- `offerItem.itemType === ItemType.ERC721` but `primaryConsideration.itemType`
  is neither `NATIVE` nor `ERC20` (line 269–270).
- `offerItem.itemType === ItemType.ERC1155` but `primaryConsideration.itemType`
  is neither `NATIVE` nor `ERC20` (line 279–280).
- `offerItem.itemType === ItemType.ERC20` but `primaryConsideration.itemType`
  is neither `ERC721` nor `ERC1155` (line 291, e.g. ERC20→ERC20 or ERC20→NATIVE).

`isBasicOrderEligible` does filter out `ERC721_WITH_CRITERIA` and
`ERC1155_WITH_CRITERIA` consideration items, but it does **not** filter out
plain `ERC721`, `ERC1155`, or unmatched `ERC20` considerations. These represent
NFT-to-NFT swaps or ERC20→ERC20 exchanges where the offerer receives a
different token as the primary consideration — a valid Seaport order structure
that is simply not a basic order.

The existing `detectBasicOrderRouteType` tests only use `NATIVE` and `ERC20`
considerations (the six canonical routes). No test constructs an order where
the primary consideration is `ERC721`, `ERC1155`, or unmatched `ERC20`.

**Resolved**: Added four tests to `src/order.test.ts` covering all three
uncovered `return null` fallbacks: ERC721 offer with ERC721 consideration,
ERC1155 offer with ERC1155 consideration, ERC20 offer with NATIVE
consideration, and ERC20 offer with ERC20 consideration. All four validate
that non-basic-order item type combinations correctly return `null`.

### 10. ~~`src/signature.ts:35,37-39,46-48` — Catch block in `verifyOrderSignature` never entered~~ ✅ FIXED

**Resolved alongside item 7 in commit `773664b`.**

The catch block was removed entirely. The new implementation uses
`recoverTypedDataAddress` with a try/catch that returns `invalid-signature`
on any throw — no regex, no `BaseError` classification, no uncovered paths.
Both failure modes (`invalid-signature` and `offerer-mismatch`) are tested
deterministically against real viem.

### 11. `src/validate.ts:56-60` — `chainId` type guard with non-numeric value never exercised

Lines 56–60 are the `return { valid: false }` block when
`ctx.domain.chainId` is provided but is neither `number` nor `bigint`:

```ts
if (
  typeof ctx.domain.chainId !== "number" &&
  typeof ctx.domain.chainId !== "bigint"
) {
  return {
    valid: false,
    reason: `ctx.domain.chainId must be a number or bigint, got ${typeof ctx.domain.chainId}`,
  };
}
```

The type system prevents non-numeric values at compile time (the
`SeaportContext` type declares `chainId` as `number | bigint | undefined`),
so this branch serves as a runtime safety net. Existing tests cover `number`,
`bigint`, `undefined`, non-positive, negative, and non-integer — but not
`string`, `object`, or other non-numeric types.

**Resolved**: Added a test with `chainId` cast to `string` via `as any`:

```ts
test("rejects chainId that is neither number nor bigint", () => {
  const result = validateSeaportContext({
    ...ctx,
    domain: { ...ctx.domain, chainId: "1" as any },
  });
  expect(result.valid).toBe(false);
  if (!result.valid) {
    expect(result.reason).toContain("must be a number or bigint");
  }
});
```

This exercises the runtime type guard. The `as any` cast is intentional —
it simulates a consumer passing an untrusted/deserialized value at runtime
where the compile-time type check was bypassed (e.g. `JSON.parse` without
validation).

### 12. `checkUint120` throws `SeaportEncodingError` from builder functions, violating the error-type convention

`checkUint120` in `src/encode.ts` (lines 262–267) throws
`SeaportEncodingError` when a value exceeds uint120 range:

```ts
export function checkUint120(value: bigint, name: string): void {
  if (value < 0n || value > UINT120_MAX) {
    throw new SeaportEncodingError(
      `${name} must be a uint120 (0 to ${UINT120_MAX}), got ${value}`,
    );
  }
}
```

This function is called directly from three builder functions:

| Builder | File | Line |
|---------|------|------|
| `buildFulfillAdvancedOrder` | `src/order.ts` | 477 |
| `buildFulfillAvailableAdvancedOrders` | `src/order.ts` | 558 |
| `buildMatchAdvancedOrders` | `src/match.ts` | 60 |

All other input validation in these same builder functions throws
`SeaportValidationError`:

| Validation | Error type |
|-----------|-----------|
| `requireValidContext(ctx)` | `SeaportValidationError` |
| `maximumFulfilled > orders.length` | `SeaportValidationError` |
| `checkUint120(order.numerator, ...)` | **`SeaportEncodingError`** ← inconsistent |

This violates the pattern documented in `bug-patterns.md`:

> All input validation throws `SeaportValidationError`

The consequence is that a consumer who catches `SeaportValidationError`
to handle bad builder inputs will **miss** uint120 overflow errors:

```ts
try {
  buildFulfillAdvancedOrder(ctx, {
    ...order,
    numerator: 1n << 120n,  // out of uint120 range
  });
} catch (err) {
  if (err instanceof SeaportValidationError) {
    // This block is NOT entered — SeaportEncodingError is thrown instead
  }
}
```

The error type classification itself is defensible (uint120 range is an
ABI encoding constraint, and `SeaportEncodingError` is documented to cover
"checkUint120 overflow"), but the inconsistency with other builder
validations creates a poor developer experience. A caller who reads the
`@throws` tags and catches the documented error classes will still get
surprised.

**Fix**: Remove `checkUint120` calls from the three builder functions and
replace them with equivalent checks that throw `SeaportValidationError`.
The `checkUint120` calls in encoder functions (`encodeFulfillAdvancedOrder`,
`encodeFulfillAvailableAdvancedOrders`, `encodeMatchAdvancedOrders`) remain
unchanged — they serve as encoding-level guardrails and keep their
`SeaportEncodingError` type.

In each builder, add before the existing `checkUint120` call:

```ts
// In buildFulfillAdvancedOrder (src/order.ts:477):
if (advancedOrder.numerator > UINT120_MAX) {
  throw new SeaportValidationError(`numerator must be ≤ uint120 max (${UINT120_MAX}), got ${advancedOrder.numerator}`);
}
// ...same for denominator
```

And remove the now-redundant `checkUint120` calls from builder bodies
(they remain in `encodeFulfillAdvancedOrder` etc. for defense-in-depth).

**Context**: The existing tests in `src/order.test.ts` only check
`.toThrow("uint120")` — they don't verify the specific error class. So
changing the error type won't break existing tests. The fix aligns these
builders with the convention that all input validation a consumer might
want to catch emits `SeaportValidationError`.

**Resolved**: Removed `checkUint120` calls from the three builder functions
(`buildFulfillAdvancedOrder`, `buildFulfillAvailableAdvancedOrders`,
`buildMatchAdvancedOrders`) and replaced them with inline checks that throw
`SeaportValidationError`. The `checkUint120` calls in the corresponding encoder
functions remain unchanged as encoding-level guardrails (throwing
`SeaportEncodingError`). Exported `UINT120_MAX` from `src/encode.ts` so the
builders can reference the constant directly. All 345 existing tests pass
unchanged — they match on the `"uint120"` message substring, which the new
inline checks preserve.

---

## Taste and consistency gaps

These are not bugs or missing validation — the library works correctly in
all cases. But each represents a place where the implementation is
inconsistent with the library's stated architectural values: pure functions,
typed errors, input validation, clean TypeScript, and symmetric API design.
Addressing them would make the codebase more uniform and predictable.

### 13. `isBasicOrderEligible` doesn't require static amounts — Dutch auction orders can be routed through the basic order path

`isBasicOrderEligible` in `src/order.ts` (lines 167–217) encodes structural
checks for the basic order path: exactly one offer, zone must be zero
address, no criteria-based items, primary consideration recipient must be
the offerer, and all consideration items share the same `itemType`.

But it does **not** check that `startAmount === endAmount` for any item.
This corresponds to seaport-js's `shouldUseBasicFulfill` condition 6, which
correctly excludes time-based amount orders from the basic order pathway.

The basic order path (`fulfillBasicOrder`) uses `endAmount` as a flat scalar
in the encoded calldata — there is no interpolation logic. If a Dutch
descending auction (e.g., `startAmount = 10 ETH`, `endAmount = 5 ETH`) is
routed through `fulfillBasicOrder`, the fulfiller pays `endAmount` (5 ETH)
regardless of when in the auction window the transaction lands. The offerer
loses the auction premium. Worse, if `startAmount < endAmount` (an ascending
action, which the basic path doesn't check for), the fulfiller pays the
higher `endAmount` even at the start of the window — overpaying relative to
the current auction price.

Both scenarios produce valid on-chain transactions that execute — the
contract's `fulfillBasicOrder` accepts whatever `considerationAmount` is
passed. But the economic outcome is wrong.

**Fix**: Add a check at the top of `isBasicOrderEligible` (or in each
item's loop):

```ts
// All items must have startAmount === endAmount for basic order eligibility
for (const item of order.parameters.offer) {
  if (item.startAmount !== item.endAmount) return null;
}
for (const item of order.parameters.consideration) {
  if (item.startAmount !== item.endAmount) return null;
}
```

Alternatively, the check can be placed in `detectBasicOrderRouteType` (the
public-facing entry point) rather than the internal `isBasicOrderEligible`.

**Context**: All test fixtures use `startAmount === endAmount`, so the gap
is never exercised. seaport-js's equivalent function explicitly guards this
case; the omission here is likely an oversight from building at speed.

**Resolved**: Added checks in `isBasicOrderEligible` that reject any order
where `startAmount !== endAmount` for any offer or consideration item. This
prevents Dutch auction orders (descending `startAmount`) and ascending-price
orders from being routed through the basic order path, which encodes
`endAmount` as a flat scalar with no interpolation logic. Such orders now
correctly fall through to the standard `fulfillOrder` path which supports
time-based interpolation. Added 5 new tests covering descending Dutch
auction offer, descending Dutch auction consideration, ascending offer,
ascending consideration, and non-static extra consideration item. Updated
2 existing tests that provided only `endAmount` without matching `startAmount`
to include both fields, preserving constant-price semantics.

### 14. Tips in `buildBasicOrderFulfillment` bypass token-type homogeneity validation

`isBasicOrderEligible` (called via `detectBasicOrderRouteType`) validates
that all consideration items in the order share the same `itemType`. This is
necessary because the basic order ABI treats all additional recipients as
the same token type as the primary consideration.

But `buildBasicOrderFulfillment` (`src/order.ts`, lines 117–158) accepts an
`options.tips` parameter that is **not** validated against the order's
consideration token type:

```ts
// Lines 151–157: tips are added to msg.value only if primaryConsideration is NATIVE
if (primaryConsideration.itemType === ItemType.NATIVE && options.tips) {
  for (const tip of options.tips) {
    value += tip.amount;  // blindly assumes tips are NATIVE
  }
}
```

If `primaryConsideration.itemType === ItemType.ERC20` and the caller passes
tips, the `value` computation silently ignores them — they won't be included
in `msg.value`. But the tips are still appended to `additionalRecipients` in
`toBasicOrderParameters` (line 68) and encoded into calldata. The Seaport
contract will attempt to transfer ERC20 tokens for the tip amounts — funds
the fulfiller never approved. The transaction reverts with an ERC20 transfer
failure, wasting gas.

The library validates tip-related constraints through the order structure
itself (all consideration items must match), but the tips parameter
sidesteps this validation entirely because it's appended after the check.

**Fix**: Add a tip validation check in `buildBasicOrderFulfillment` that
throws `SeaportValidationError` if tips are provided for a non-NATIVE
primary consideration:

```ts
if (options.tips && options.tips.length > 0) {
  if (primaryConsideration.itemType !== ItemType.NATIVE) {
    throw new SeaportValidationError(
      "Tips are only supported for NATIVE (ETH) primary consideration in basic orders"
    );
  }
}
```

Or, more permissively, validate that the caller understands the constraint
and handles ERC20 tips separately. The simplest correct fix is to reject
non-NATIVE tips at the builder level (the basic order ABI doesn't encode
separate token types per additional recipient, so mixed-type tips are
impossible).

**Context**: This gap exists because `isBasicOrderEligible` validates the
order structure at detection time, but tips are a runtime option appended
after detection. The detection function can't know about tips, and the
builder function assumes the detection already covered everything.

### 15. `toOrderParameters` doesn't validate the relationship between `totalOriginalConsiderationItems` and `consideration.length`

`toOrderParameters` in `src/order.ts` (lines 307–322) converts
`OrderComponents` to `OrderParameters` by replacing the `counter` field
with `totalOriginalConsiderationItems`:

```ts
export function toOrderParameters(
  components: OrderComponents,
  totalOriginalConsiderationItems: bigint,
): OrderParameters {
  return {
    offerer: components.offerer,
    zone: components.zone,
    offer: components.offer,
    consideration: components.consideration,
    orderType: components.orderType,
    startTime: components.startTime,
    endTime: components.endTime,
    zoneHash: components.zoneHash,
    salt: components.salt,
    conduitKey: components.conduitKey,
    totalOriginalConsiderationItems,
  };
}
```

The JSDoc says "Usually `components.consideration.length`", but the function
itself performs no validation. If a caller passes
`totalOriginalConsiderationItems` that differs from the actual
`consideration.length`, the on-chain order hash for `OrderParameters` will
not match the EIP-712 signed hash of `OrderComponents`, and the order won't
verify. The failure mode is a cryptic on-chain revert with no library-side
error.

This is the kind of validation the library does everywhere else. The
omission is inconsistent with the validation-first ethos.

**Fix**: Add a check at the top of the function:

```ts
if (totalOriginalConsiderationItems !== BigInt(components.consideration.length)) {
  throw new SeaportValidationError(
    `totalOriginalConsiderationItems (${totalOriginalConsiderationItems}) must match consideration.length (${components.consideration.length})`
  );
}
```

**Context**: All internal callers pass `BigInt(components.consideration.length)`
(verified by code review). External callers following the JSDoc guidance are
safe. But the library shouldn't rely on caller discipline for a constraint
that is both checkable and critical to correctness.

### 16. `getEmptyOrderComponents` produces data that violates `validateOrderComponents`

`getEmptyOrderComponents` in `src/order.ts` (lines 324–340) returns a
canonical empty padding leaf for bulk order Merkle trees:

```ts
export function getEmptyOrderComponents(): OrderComponents {
  return {
    offerer: ZERO_ADDRESS,
    zone: ZERO_ADDRESS,
    offer: [],
    consideration: [],
    orderType: OrderType.FULL_OPEN,
    startTime: 1n,
    endTime: 2n,
    zoneHash: ZERO_BYTES32,
    salt: 0n,        // ← validateOrderComponents rejects this
    conduitKey: ZERO_BYTES32,
    counter: 0n,
  };
}
```

`validateOrderComponents` throws on `salt === 0n` ("salt must not be zero").
The padding leaf has `salt: 0n`. Further, the empty `offer` and
`consideration` arrays would fail the "must have at least one offer item"
and "must have at least one consideration item" checks.

The JSDoc correctly warns: "The returned struct is not intended to be
validated or submitted on-chain." It's only used internally by
`hashOrderComponentsStruct` for Merkle tree padding. But shipping a
function that returns data the library's own validator rejects is an
invitation for confusion — a developer who calls `validateOrderComponents`
on the result (for debugging, logging, or defensive checking) gets a
misleading error.

**Fix**: Two options:

1. **Change the salt to a non-zero sentinel** (e.g., `1n`) to pass
   validation. The empty arrays still fail, but the salt check is the most
   surprising failure.

2. **Separate the padding type from `OrderComponents`** — define a narrower
   `BulkOrderPaddingLeaf` type that doesn't claim to be a full
   `OrderComponents`. This is the correct long-term fix but requires type
   changes in `buildBulkOrderTree` and `padLeaves`.

Option (1) is a one-line change with no downstream impact (the empty hash
changes but the padding invariant — all leaves being identical — is
preserved). Option (2) is more thorough but higher effort.

**Context**: The empty salt is not a bug — the padding hash is used purely
for tree construction and never submitted. But the inconsistency between
"here's an OrderComponents" and "that's not valid" is a papercut that
violates the library's otherwise strong "validate before you build" stance.

### 17. `aggregateOfferItems` and `aggregateConsiderationItems` use overly permissive generic types

Both functions in `src/order.ts` accept a loose generic constraint:

```ts
export function aggregateOfferItems<T extends { parameters: { offer: readonly unknown[] } }>(
  orders: T[],
): FulfillmentComponent[][] {

export function aggregateConsiderationItems<T extends { parameters: { consideration: readonly unknown[] } }>(
  orders: T[],
): FulfillmentComponent[][] {
```

`readonly unknown[]` accepts any array type. A caller could pass
`[{ parameters: { offer: ["nonsense", 42] } }]` and the function would
compile and run, producing `FulfillmentComponent` entries for items that
aren't OfferItems. The library is otherwise meticulous about `0x${string}`
address types, `bigint` numeric types, and branded item type discriminators.
These two functions are the only place where the type system is this
permissive.

The practical impact is low — these are exported utilities, not internal
helpers, and the most common callers pass `Order[]` or `AdvancedOrder[]`,
both of which have correctly typed `offer`/`consideration` arrays. But a
caller with a looser input type (e.g., `any[]` from a JSON API response)
gets no compile-time warning.

**Fix**: Tighten the generic constraints to match the actual item types:

```ts
export function aggregateOfferItems<
  T extends { parameters: { offer: readonly OfferItem[] } }
>(orders: T[]): FulfillmentComponent[][] {

export function aggregateConsiderationItems<
  T extends { parameters: { consideration: readonly ConsiderationItem[] } }
>(orders: T[]): FulfillmentComponent[][] {
```

This is a non-breaking change — every existing caller already satisfies
the tighter constraint.

**Context**: Both `Order` and `AdvancedOrder` will satisfy the new
constraints without changes. Custom types that extend
`{ parameters: { offer: readonly OfferItem[] } }` also still work.

### 18. No `requireValidOrderComponents` — asymmetry with `requireValidContext`

The library provides both `validateSeaportContext` (returns
`ValidationResult`) and `requireValidContext` (throws
`SeaportValidationError`) for context validation. This is an explicit
design choice documented in `requireValidContext`'s JSDoc:

> Use this to avoid repeating the 3-line validation pattern at every call site.

The same pattern exists for order components: `validateOrderComponents`
returns `ValidationResult`. But there is **no** `requireValidOrderComponents`
counterpart. Every call site that needs to throw on invalid order
components must write the boilerplate:

```ts
const result = validateOrderComponents(components);
if (!result.valid) {
  throw new SeaportValidationError(result.reason);
}
```

This is the exact 3-line pattern `requireValidContext` was designed to
aliminate. The asymmetry means consumers who adopt the `require*` pattern
for one validation path can't use it for the other.

Notably, none of the builder functions currently call
`validateOrderComponents` — they validate structural properties ad-hoc
(e.g., `offer.length !== 1` in `toBasicOrderParameters`). Adding
`requireValidOrderComponents` would also create an opportunity to
standardize validation entry points in the builders.

**Fix**: Add `requireValidOrderComponents` in `src/validate.ts`, mirroring
the `requireValidContext` pattern:

```ts
export function requireValidOrderComponents(
  components: OrderComponents,
): void {
  const result = validateOrderComponents(components);
  if (!result.valid) {
    throw new SeaportValidationError(result.reason);
  }
}
```

**Context**: This is a pure DX improvement with no behavior change. The
underlying validation logic already exists; only the throwing wrapper is
missing.

### 19. `computeTotalNativeValue` is marked `@private` but is exported and used cross-module

`computeTotalNativeValue` in `src/order.ts` (lines 418–432) has a JSDoc
`@private` tag:

```ts
/**
 * Validate the Seaport context and compute the total native value across
 * all orders' consideration items.
 *
 * @private This is an internal helper shared by fulfillment builders in this
 *   module and in `match.ts`. It is not part of the stable public API.
 */
export function computeTotalNativeValue(
```

The function is imported and called in `src/match.ts` (`buildMatchOrders`
and `buildMatchAdvancedOrders`), making it cross-module — the opposite of
`@private`. The JSDoc body correctly describes the usage ("shared by
fulfillment builders in this module and in `match.ts`"), but the tag is
wrong.

The library uses two tags for this purpose:
- `@internal` — used on `checkUint120`, `seaportCall`, `hashOrderComponentsStruct`,
  and `encodeDomainSeparator`. Means "exported for internal cross-module use,
  not part of the stable public API."
- `@private` — used only on `computeTotalNativeValue` and nowhere else.

**Fix**: Replace `@private` with `@internal`:

```ts
/**
 * Validate the Seaport context and compute the total native value across
 * all orders' consideration items.
 *
 * @internal This is an internal helper shared by fulfillment builders in this
 *   module and in `match.ts`. It is not part of the stable public API.
 */
```

**Context**: This is a documentation-only fix with zero code impact.

### 20. `@throws` documentation is inconsistent across builder functions

The library is generally good about documenting thrown errors in JSDoc.
But the `@throws` tag coverage is uneven across the builder functions:

| Function | File | `@throws` in JSDoc? | Throws from... |
|----------|------|--------------------|----------------|
| `buildBasicOrderFulfillment` | `src/order.ts` | ✅ | `requireValidContext`, route detection |
| `toBasicOrderParameters` | `src/order.ts` | ✅ | Length checks |
| `buildFulfillOrder` | `src/order.ts` | ❌ | `requireValidContext` |
| `buildFulfillAdvancedOrder` | `src/order.ts` | ❌ | `requireValidContext`, `checkUint120` |
| `buildFulfillAvailableOrders` | `src/order.ts` | ✅ (partial) | `maximumFulfilled` check, but not `requireValidContext` |
| `buildFulfillAvailableAdvancedOrders` | `src/order.ts` | ✅ (partial) | `maximumFulfilled` check, but not `requireValidContext` or `checkUint120` |
| `buildMatchOrders` | `src/match.ts` | ❌ | (indirect) `computeTotalNativeValue` → `requireValidContext` |
| `buildMatchAdvancedOrders` | `src/match.ts` | ❌ | (indirect) `computeTotalNativeValue` → `requireValidContext`; `checkUint120` |
| `buildCancel` | `src/cancel.ts` | ❌ | `requireValidContext`, empty array check |
| `buildValidate` | `src/validate.ts` | ✅ | Empty array check, but not `requireValidContext` |
| `buildIncrementCounter` | `src/increment_counter.ts` | ❌ | `requireValidContext` |

Six out of eleven builder functions have no `@throws` tag at all, despite
all of them potentially throwing `SeaportValidationError` from
`requireValidContext`. Four more have `@throws` that only partially
cover the actual throw sites.

The practical consequence is that an IDE user hovering over
`buildFulfillOrder` sees no documented error conditions, while the function
can throw from context validation.

**Fix**: Add `@throws {SeaportValidationError}` to every builder function
that calls `requireValidContext` (which is all of them, once item 5 above
is addressed). For functions that throw additional `SeaportValidationError`
instances on specific parameter checks, document those separately.

Alternatively, the project could adopt a blanket convention:
"All `build*` functions throw `SeaportValidationError` on invalid inputs" —
but the per-function tags are more useful for IDEs and generated docs.

**Context**: The inconsistency is cosmetic — all actual errors are thrown
correctly. But it violates the library's otherwise careful documentation
standards (compare the meticulous JSDoc on `OrderComponents` fields or
`seaportCall` parameter labels).
