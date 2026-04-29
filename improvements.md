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
