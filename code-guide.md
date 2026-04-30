# code-guide.md — A tour of `seaport-viem`

This is a literate-programming-style walkthrough of the `seaport-viem` codebase.
It explains *why* each module exists, what problem it solves, how it connects to
its neighbours, and where the interesting logic lives. ABIs are boring — we note
where they're defined but skip reproducing their contents.

> **Design constraint**: This library is **backend-first**. Every `build*`
> function returns plain `FulfillmentData` — no wallet calls, no
> `sendTransaction`. See [`backend-flow.md`](./backend-flow.md) for the full
> architecture guide.

- **Runtime dependency**: `viem` (everything is built on viem's `encodeFunctionData`, `decodeFunctionResult`, `verifyTypedData`, `keccak256`, `encodeAbiParameters`, etc.)
- **Build**: `tsup` → ESM-only, 16 entry points, one per source module.
- **Tests**: `bun test`, no test runner dependency.

---

## 0. The layout

```
src/
  index.ts              barrel — re-exports everything public
  types.ts              all TypeScript types + enum const objects
  constants.ts          ABIs, EIP-712 types, address constants, bulk order limits
  errors.ts             custom error hierarchy
  encode.ts             raw calldata encoders (thin viem wrappers)
  validate.ts           context + order component validation
  call.ts               on-chain read helper (wraps viem error handling)
  counter.ts            getCounter() on-chain read
  order_status.ts       getOrderStatus() on-chain read
  order_hash.ts         getOrderHash() on-chain read
  order.ts              the big one: fulfillment builders, route detection, helpers
  signature.ts          EIP-712 signature verification + struct hashing
  bulk_listings.ts      merkle-tree bulk order construction, proof, signing
  cancel.ts             buildCancel() transaction builder
  increment_counter.ts  buildIncrementCounter() transaction builder
  match.ts              buildMatchOrders / buildMatchAdvancedOrders
  events.ts             event decoding + topic constants
  test-fixtures.ts      shared test helpers
```

Every source file is also a subpath import: `seaport-viem/order`,
`seaport-viem/events`, etc.

---

## 1. `types.ts` — The data model

Everything begins here. The types mirror Seaport's Solidity structs exactly,
but as TypeScript types with viem-friendly hex string constraints.

**The enum const objects** are the canonical source of truth for Seaport's
numeric enums:

| Const object | Values |
|---|---|
| `ItemType` | `NATIVE: 0`, `ERC20: 1`, `ERC721: 2`, `ERC1155: 3`, `ERC721_WITH_CRITERIA: 4`, `ERC1155_WITH_CRITERIA: 5` |
| `OrderType` | `FULL_OPEN: 0`, `PARTIAL_OPEN: 1`, `FULL_RESTRICTED: 2`, `PARTIAL_RESTRICTED: 3`, `CONTRACT: 4` |
| `BasicOrderRouteType` | `ETH_TO_ERC721: 0` … `ERC1155_TO_ERC20: 5` |
| `Side` | `OFFER: 0`, `CONSIDERATION: 1` |

Each const object has a companion `*Value` type (`ItemTypeValue`, etc.) so
consumers can write `itemType: ItemTypeValue` and accept any valid numeric
item type.

**Key types**:

| Type | Solidity counterpart | Notes |
|---|---|---|
| `OfferItem` | `OfferItem` | `itemType`, `token`, `identifierOrCriteria`, `startAmount`, `endAmount` |
| `ConsiderationItem` | `ConsiderationItem` | Extends `OfferItem` with `recipient` |
| `OrderComponents` | `OrderComponents` | What gets signed; includes `counter`. **[Dangerous fields]**
  (`zone`, `zoneHash`, `salt`, `conduitKey`, `counter`, `startTime`, `endTime`)
  are documented in detail in the type's JSDoc and the README. |
| `OrderParameters` | `OrderParameters` | What goes on-chain; `counter` → `totalOriginalConsiderationItems` |
| `Order` | `Order` | `OrderParameters` + `signature` |
| `AdvancedOrder` | `AdvancedOrder` | Adds `numerator`, `denominator`, `extraData` for partial fills |
| `BasicOrderParameters` | `BasicOrderParameters` | Flattened 17-field tuple for the gas-optimised basic order path |
| `Fulfillment` | `Fulfillment` | Pairs `offerComponents` and `considerationComponents` |
| `CriteriaResolver` | `CriteriaResolver` | Resolves criteria-based items to specific identifiers |
| `FulfillmentData` | — | Library-specific: `{ to, data, value }` — ready for `wallet_sendTransaction` |
| `SeaportContext` | — | Library-specific: `{ address, domain }` — bundles the Seaport address with its EIP-712 domain |

**`SeaportContext`** is worth calling out. It appears as the first argument to
almost every public function. It couples the Seaport contract address (needed
for `to` in transactions and `call`) with the EIP-712 domain (needed for
signing and signature verification). Keeping them together means callers can't
accidentally sign for one deployment and submit to another.

---

## 2. `constants.ts` — The boring stuff we only need to know where to find

This file is the utility closet. Here is what lives in it and nothing more:

- **`ZERO_ADDRESS`**, **`ZERO_BYTES32`**, **`NATIVE_TOKEN`** — sentinel constants.
- **`seaportAbi`** — the full Seaport contract ABI, composed from individual
  named `*AbiItem` exports. Each exported ABI item (`getCounterAbiItem`,
  `fulfillBasicOrderAbiItem`, …, `validateAbiItem`) is a `const` object
  satisfying `Abi`, in JSON format (not `parseAbi`), because abitype's parser
  chokes on nested tuples. They are defined individually so `encode.ts` can
  import only the single item it needs rather than the whole ABI (tree-shaking).
- **`seaportEventAbi`** — the five Seaport event ABIs in JSON format, used by
  `events.ts` for cross-checking topic hashes.
- **`EIP712_TYPES`** — the canonical EIP-712 type definitions for
  `OrderComponents`, `OfferItem`, and `ConsiderationItem`. These are the
  **single source of truth** for the struct hash. The rest of the codebase
  derives everything else from this object.
- **`OFFER_ITEM_COMPONENTS`**, **`CONSIDERATION_ITEM_COMPONENTS`** — derived
  from `EIP712_TYPES`, used by `hashOrderComponentsStruct` in `signature.ts`
  for ABI encoding. If you add a field to `EIP712_TYPES.OfferItem`, the
  struct hash encoding follows automatically.
- **`ORDER_COMPONENTS_STRUCT_ABI_TYPES`** — derived from
  `EIP712_TYPES.OrderComponents` by mapping array types to `bytes32`
  (matching the struct hash convention). Used by `hashOrderComponentsStruct`.
- **`ORDER_COMPONENTS_TYPE_STRING`**, **`CONSIDERATION_ITEM_TYPE_STRING`**,
  **`OFFER_ITEM_TYPE_STRING`** — canonical EIP-712 type strings generated
  from `EIP712_TYPES` via `eip712TypeString()`. These are **tested against
  hardcoded canonical string literals** matching Seaport's Solidity source
  in `constants.test.ts`.
- **`BULK_ORDER_HEIGHT_MIN`** (= 1), **`BULK_ORDER_HEIGHT_MAX`** (= 24),
  **`BULK_ORDER_BRANCH_FACTOR`** (= 2) — bulk order merkle tree limits.

The `eip712TypeString()` helper converts a type name + parameter list to its
canonical form (e.g. `"OfferItem(uint8 itemType,address token,…)"`).

---

## 3. `errors.ts` — The error hierarchy

A four-deep class tree:

```
SeaportError (base)
├── SeaportValidationError — input validation failures
├── SeaportEncodingError  — uint120 overflow, malformed encoder inputs
└── SeaportCallError      — RPC failures, contract reverts, empty return data
```

Every `throw` in the library uses one of these three subclasses. Consumers can
`catch (err instanceof SeaportValidationError)` instead of fragile `.message`
matching. The base class `SeaportError` catches any library error in one
handler.

Each class's JSDoc lists exactly which code paths produce it — the canonical
reference for error-source mapping.

---

## 4. `encode.ts` — Raw calldata, no opinions

This is the thinnest layer in the library. Each function:
1. Imports the specific ABI item from `constants.ts`.
2. Calls viem's `encodeFunctionData` with it.
3. Returns `0x${string}`.

There are **14 encoders**, one per Seaport function the library wraps:

| Encoder | Seaport function | Notes |
|---|---|---|
| `encodeGetCounter` | `getCounter(address)` | |
| `encodeGetOrderHash` | `getOrderHash(OrderComponents)` | |
| `encodeFulfillBasicOrder` | `fulfillBasicOrder(BasicOrderParameters)` | |
| `encodeFulfillOrder` | `fulfillOrder(Order, bytes32)` | |
| `encodeFulfillAdvancedOrder` | `fulfillAdvancedOrder(…)` | Checks uint120 on numerator/denominator |
| `encodeFulfillAvailableOrders` | `fulfillAvailableOrders(…)` | |
| `encodeFulfillAvailableAdvancedOrders` | `fulfillAvailableAdvancedOrders(…)` | Checks uint120 on all orders |
| `encodeCancel` | `cancel(OrderComponents[])` | |
| `encodeIncrementCounter` | `incrementCounter()` | Zero-arg function |
| `encodeGetOrderStatus` | `getOrderStatus(bytes32)` | |
| `encodeMatchOrders` | `matchOrders(…)` | |
| `encodeMatchAdvancedOrders` | `matchAdvancedOrders(…)` | Checks uint120 on all orders |
| `encodeValidate` | `validate(Order[])` | |

The **uint120 checks** in the advanced-order encoders are the only validation
at this layer. `checkUint120()` is exported as an internal utility for the
higher-level builders (`order.ts`, `match.ts`) to call again — belt and
suspenders.

---

## 5. `validate.ts` — Guardrails

Two validation functions, one "validate and throw" wrapper, one transaction builder.

### `validateSeaportContext(ctx)`

Checks that:
- `ctx.address` is a valid 20-byte hex address.
- `ctx.domain.verifyingContract` is present and a valid address.
- `ctx.domain.chainId` is a positive integer if provided.

Returns `{ valid: true }` or `{ valid: false, reason: "…" }`.

### `requireValidContext(ctx)`

Three lines of code that appear at the top of almost every public function:
validate the context and throw `SeaportValidationError` immediately.

### `validateOrderComponents(components)`

Structural validation of `OrderComponents` before submission:
- At least one offer and one consideration item.
- Each item has a valid `ItemType` and positive amounts.
- `startTime < endTime`.
- `counter >= 0`.
- `salt != 0`.

Does **not** validate addresses — that is the caller's responsibility.

### `buildValidate(ctx, orders)`

The only transaction builder in this file. Calls `encodeValidate`, wraps it
in a `FulfillmentData` envelope. Validates that the orders array is non-empty.

---

## 6. `call.ts` — The RPC safety net

`seaportCall(client, params, fnLabel, actionLabel, details)` is a thin wrapper
around `client.call()` with standardised error handling for three failure modes:

| Failure mode | Error type | Message |
|---|---|---|
| Empty return data (`undefined` / `"0x"`) | `SeaportCallError` | `"getCounter returned no data for offerer 0x… at Seaport 0x…"` |
| viem `BaseError` (RPC revert, network) | `SeaportCallError` | `"Failed to fetch counter for offerer 0x… at Seaport 0x…: …"` |
| Any thrown non-Error | `SeaportCallError` | `"Failed to fetch counter for offerer 0x… at Seaport 0x…: …"` |

The **re-throw guard** (`error instanceof SeaportCallError`) prevents
double-wrapping if a downstream call to `seaportCall` itself throws
and the caller catches and re-calls `seaportCall`.

Three modules use this: `counter.ts`, `order_status.ts`, `order_hash.ts`.

---

## 7. `counter.ts`, `order_status.ts`, `order_hash.ts` — The on-chain readers

These three files follow an identical pattern:

```
requireValidContext(ctx)
encodeGet*(…)           → get calldata
seaportCall(…)          → execute read
decodeFunctionResult(…) → parse output
```

| File | Function | Returns |
|---|---|---|
| `counter.ts` | `getCounter(client, ctx, offerer)` | `bigint` — the offerer's current counter |
| `order_status.ts` | `getOrderStatus(client, ctx, orderHash)` | `OrderStatus` — `{ isValidated, isCancelled, totalFilled, totalSize }` |
| `order_hash.ts` | `getOrderHash(client, ctx, orderComponents)` | `` `0x${string}` `` — the on-chain computed order hash |

The on-chain hash is useful as a cross-check against off-chain hashing
(`hashOrderComponents`), catching encoding mismatches before submission.

---

## 8. `signature.ts` — Hashing and verifying

### `verifyOrderSignature(ctx, order)`

Calls viem's `recoverTypedDataAddress` with the Seaport EIP-712 types.
Returns a discriminated union `OrderVerificationResult`:
- `{ valid: true }` — signature is valid for the offerer.
- `{ valid: false, reason: 'invalid-signature' }` — signature is
  structurally malformed or cryptographically invalid.
- `{ valid: false, reason: 'offerer-mismatch', recovered }` — valid
  signature but signed by a different address (revealed in `recovered`).

The catch block swallows any throw from `recoverTypedDataAddress` after
context validation — since the domain is already validated, the only thing
that can fail is the signature itself. No fragile regex matching needed.

### `hashOrderComponents(ctx, orderComponents)`

The straightforward EIP-712 hash: delegates entirely to viem's `hashTypedData`
with `EIP712_TYPES`. This is what you use off-chain for signature creation
or display.

### `hashOrderComponentsStruct(orderComponents)` — The struct hash

This is the **manual struct hash** that replicates what Seaport's Solidity
`_deriveOrderHash()` computes internally. It is needed only for merkle tree
leaves in bulk orders (where the domain separator is applied differently).

The function:

1. Hashes `offer` items as `keccak256(encodeAbiParameters([tuple[] with OFFER_ITEM_COMPONENTS], [offer]))`.
2. Hashes `consideration` items the same way with `CONSIDERATION_ITEM_COMPONENTS`.
3. Computes `ORDER_TYPEHASH = keccak256("OrderComponents(…)ConsiderationItem(…)OfferItem(…)")`.
4. Encodes: `keccak256(ORDER_TYPEHASH ‖ offerer ‖ zone ‖ offerHash ‖ considerationHash ‖ orderType ‖ startTime ‖ endTime ‖ zoneHash ‖ salt ‖ conduitKey ‖ counter)`.

The critical design property: **every ABI encoding path is derived from
`EIP712_TYPES`**, not hardcoded. Adding a field to `EIP712_TYPES.OfferItem`
automatically updates the struct hash encoding.

---

## 9. `order.ts` — The big one

This is the largest module. It handles: basic order conversion, route detection,
fulfillment helpers, and five fulfillment builders.

### Basic order pathway

**Basic orders** are Seaport's gas-optimised fast path for simple 1-offer-item
orders. They use a flat `BasicOrderParameters` tuple instead of nested structs.

#### `isBasicOrderEligible(order)` — `@private`

Structural check:
- Exactly 1 offer item, ≥ 1 consideration item.
- Not a `CONTRACT` order type.
- `zone` must be zero address.
- No criteria-based items anywhere.
- Primary consideration recipient must be the offerer.
- All consideration items must share the same `itemType` (the basic order path
  treats additional recipients as the same token type as the primary).

Returns `{ offerItem, primaryConsideration }` or `null`.

#### `detectBasicOrderRouteType(order)` → `BasicOrderRouteTypeValue | null`

Given the eligible items, matches 6 possible routes:

| Offer | Primary consideration | Route |
|---|---|---|
| ERC721 | NATIVE | `ETH_TO_ERC721` |
| ERC1155 | NATIVE | `ETH_TO_ERC1155` |
| ERC721 | ERC20 | `ERC20_TO_ERC721` |
| ERC1155 | ERC20 | `ERC20_TO_ERC1155` |
| ERC20 | ERC721 | `ERC721_TO_ERC20` |
| ERC20 | ERC1155 | `ERC1155_TO_ERC20` |

Returns `null` for any other combination (e.g. NATIVE offer, ERC20/ERC20).

#### `canFulfillAsBasicOrder(order)` → `boolean`

Returns `true` if `detectBasicOrderRouteType` returns non-null.

#### `toBasicOrderParameters(order, routeType, conduitKey, tips)`

Converts a high-level `Order` into the flat `BasicOrderParameters` struct.
Notable logic:

- **`basicOrderType` packing**: `orderType + routeType * 4`. The multiplier
  is 4 because Seaport's order types (0–3) need only 2 bits, and the route
  type is shifted into the upper bits. CONTRACT orders (type 4) are excluded
  from the basic order path entirely.
- **`totalOriginalAdditionalRecipients`**: `consideration.length - 1` (all
  non-primary items).
- **`additionalRecipients`**: consideration slice(1) + any caller-supplied tips.

#### `buildBasicOrderFulfillment(ctx, order, options)`

The complete builder: detects route, converts parameters, encodes, computes
`msg.value`. Value computation uses `computeNativeValue()` on the full
consideration array (so only NATIVE items count), with tips added only when
the primary consideration is NATIVE.

### Standard / advanced fulfillment builders

Four builders, all following the same shape:

```
requireValidContext(ctx)
checkUint120(…) for advanced orders
computeNativeValue(…) across all orders
encode, wrap in FulfillmentData
```

| Builder | Seaport function | Key parameters |
|---|---|---|
| `buildFulfillOrder` | `fulfillOrder` | `order`, `fulfillerConduitKey` |
| `buildFulfillAdvancedOrder` | `fulfillAdvancedOrder` | `advancedOrder`, `criteriaResolvers`, `fulfillerConduitKey`, `recipient` |
| `buildFulfillAvailableOrders` | `fulfillAvailableOrders` | `orders`, `offerFulfillments`, `considerationFulfillments`, `maximumFulfilled` |
| `buildFulfillAvailableAdvancedOrders` | `fulfillAvailableAdvancedOrders` | `advancedOrders`, `criteriaResolvers`, `offerFulfillments`, `considerationFulfillments`, `maximumFulfilled` |

The available-orders builders validate `maximumFulfilled <= orders.length`.

### Helpers

#### `toOrderParameters(components, totalOriginalConsiderationItems)`

Converts `OrderComponents` (what you sign) to `OrderParameters` (what the
contract expects). The only difference: `counter` → `totalOriginalConsiderationItems`.

#### `getBulkOrderPaddingHash()` — `@internal`

Returns the hash of a canonical empty `OrderComponents` struct used exclusively
as padding leaves in bulk order merkle trees. Lives in `bulk_listings.ts` since
it is only needed by that module. Not intended for submission.

#### `aggregateOfferItems(orders)` / `aggregateConsiderationItems(orders)`

Generate one-to-one `FulfillmentComponent[][]` arrays for
`fulfillAvailableOrders`. Each item in each order gets its own single-element
group — no cross-order aggregation. This is the most common usage pattern.

#### `computeNativeValue(consideration)`

Sums `endAmount` of all items with `itemType === NATIVE`. Used by every
fulfillment builder to compute `msg.value`.

---

## 10. `bulk_listings.ts` — Merkle magic

This is the most algorithmically interesting module. It implements Seaport's
bulk listing mechanism, where many orders share a single signature.

### The merkle tree

Seaport uses a **binary unsorted merkle tree** (no sorting of sibling pairs).
The tree has:

```
leaves[0]   leaves[1]   leaves[2]   leaves[3]
    \          /            \        /
     node[0]                 node[1]
         \                    /
              root
```

#### `computeHeight(orderCount)`

Returns `max(1, ceil(log2(orderCount)))`. Clamped between 1 and 24.
Throws if the count exceeds `2^24` (~16 million) capacity.

#### `padLeaves(leaves)`

Pads an array of leaf hashes to the next power of 2 using
`hashOrderComponentsStruct(getEmptyOrderComponents())`.
The empty components struct has startTime=1, endTime=2, FULL_OPEN, etc.
— it is structurally valid but no real order would ever match it.

#### `buildBulkOrderTree(leaves)`

Builds all layers from bottom up. Input must be a power of 2 (call
`padLeaves` first). Returns `layers[0..n]` where `layers[0]` is
the leaf layer and `layers[n][0]` is the root.

Tree shape: each internal node is `keccak256(left ‖ right)`, no sorting.

#### `getProof(layers, index)`

Walks from leaf to root, collecting sibling hashes. `siblingIndex = idx ^ 1`
to toggle between left/right siblings. Returns an array of `height` hashes.

### Bulk order type string

#### `getBulkOrderTypeString(height)`

Generates the EIP-712 type string for a bulk order at a given height.
The type definition is recursive:

```
BulkOrder(OrderComponents[2][2]...[2] tree)
```

with `height` repetitions of `[2]`. The full string also includes
the `ConsiderationItem`, `OfferItem`, and `OrderComponents` type
definitions appended, since the struct references them transitively.

### Signing

#### `hashBulkOrder(ctx, root, height)`

Computes the EIP-712 digest for signing:

```
keccak256(0x1901 ‖ encodeDomainSeparator(domain) ‖ structHash)
```

where `structHash = keccak256(typeHash ‖ root)`.

**Note**: `hashBulkOrder` does **not** call `requireValidContext`. This is a
known inconsistency (see `improvements.md` item 20). It only uses `ctx.domain`,
but a garbage domain produces an undetectably bad hash.

#### `encodeDomainSeparator(domain)` — `@internal`

Manually computes `keccak256(EIP712Domain(…))` using `encodeAbiParameters`.
viem provides `hashDomain` which does the same thing.

### Signature packing

#### `packBulkSignature(signature, orderIndex, proof)`

Combines an EIP-2098 compact signature, a 3-byte order index, and the merkle
proof into a single byte string:

```
r (32) ‖ sCompact (32) ‖ orderIndex (3) ‖ proof (height × 32)
```

`sCompact` packs `yParity` into the high bit of `s` (bit 255).

#### `unpackBulkSignature(packed)`

Round-trip for the above. Extracts `r`, recovers `yParity` from the high bit
of `sCompact`, masks to get `s`, reads `orderIndex`, and splits the proof.
Validates length constraints (min 67 bytes, proof multiples of 32, height
within bounds).

---

## 11. `cancel.ts` — `buildCancel`

Trivial module. `requireValidContext`, check non-empty, `encodeCancel`, wrap.

```ts
buildCancel(ctx, orders) → { to, data: encodeCancel(orders), value: 0n }
```

Only the offerer or zone of each order may submit this transaction.

---

## 12. `increment_counter.ts` — `buildIncrementCounter`

Even more trivial. Zero-arg transaction:

```ts
buildIncrementCounter(ctx) → { to, data: encodeIncrementCounter(), value: 0n }
```

Calling this increments the caller's counter in Seaport, invalidating all
orders signed with the previous counter value.

---

## 13. `match.ts` — Two-sided matching

### `buildMatchOrders(ctx, orders, fulfillments)`

Walks every order, sums `computeNativeValue(order.parameters.consideration)`
to compute `msg.value`, then encodes.

### `buildMatchAdvancedOrders(ctx, advancedOrders, criteriaResolvers, fulfillments, recipient)`

Same pattern but with `checkUint120` on each advanced order's numerator and
denominator, plus optional criteria resolvers and a recipient override.

Default for `criteriaResolvers` is `[]`, default `recipient` is `ZERO_ADDRESS`
(which means `msg.sender` on-chain).

Both builders compute the total native value across all orders' consideration
items, since the match function itself can receive ETH.

---

## 14. `events.ts` — Parsing the past

### Topic constants

Computed at module load time from `seaportEventAbi` via viem's
`encodeEventTopics`. The five topic constants are:

| Constant | Event |
|---|---|
| `ORDER_FULFILLED_TOPIC` | `OrderFulfilled` |
| `ORDER_CANCELLED_TOPIC` | `OrderCancelled` |
| `ORDER_VALIDATED_TOPIC` | `OrderValidated` |
| `ORDERS_MATCHED_TOPIC` | `OrdersMatched` |
| `COUNTER_INCREMENTED_TOPIC` | `CounterIncremented` |

These are **derived from a single source of truth** — `seaportEventAbi` in
`constants.ts`. There is no hardcoding or duplication.

### `decodeSeaportEvent(log)`

The dispatcher:
1. Reads `log.topics[0]`.
2. Matches against the five known topic constants (derived from `seaportEventAbi`).
3. Calls `decodeEventLog` with the matching event ABI.
4. Returns typed args with `eventName` discriminant.

If the topic matches none of the five, throws `SeaportValidationError`.

The return type is `SeaportEventArgs`, a discriminated union:

```ts
type SeaportEventArgs =
  | ({ eventName: "OrderFulfilled" } & OrderFulfilledEventArgs)
  | ({ eventName: "OrderCancelled" } & OrderCancelledEventArgs)
  | …
```

Consumer pattern: `switch (event.eventName) { case "OrderFulfilled": … }`
— TypeScript narrows the args automatically.

---

## 15. `index.ts` — The barrel

Re-exports everything public from every module. No logic. The tsdown entry
point for `seaport-viem` (the default import).

---

## 16. `test-fixtures.ts` — Shared test scaffolding

Provides:

- **Known test addresses**: `ALICE`, `BOB`, `TOKEN`, `NFT`, `SEAPORT_ADDRESS`
  (the real Seaport 1.6 address).
- **A default `SeaportContext`** with `chainId: 1`, `name: "Seaport"`,
  `version: "1.6"`.
- **Factory functions**: `makeOfferItem()`, `makeConsiderationItem()`,
  `makeOrderComponents()`, `makeOrder()` — all accept partial overrides
  to produce specific test scenarios.

Tests import from the barrel (`./index`) as consumers would.

---

## 17. Dependency graph

```
types.ts ─────────────────────────────────────┐
  │                                            │
  ├→ constants.ts (ABI items, EIP712_TYPES)   │
  │     │                                      │
  │     ├→ encode.ts (14 encoders)            │
  │     │     ├→ order.ts (fulfillment builders)
  │     │     ├→ match.ts                     │
  │     │     ├→ cancel.ts                    │
  │     │     ├→ increment_counter.ts         │
  │     │     └→ validate.ts (buildValidate)  │
  │     │                                     │
  │     └→ signature.ts (ORDER_TYPEHASH,      │
  │        struct hashing)                    │
  │           └→ bulk_listings.ts             │
  │                                            │
  ├→ errors.ts ←── used everywhere            │
  │                                            │
  ├→ validate.ts ←── used by every builder    │
  │                                            │
  ├→ call.ts ←── counter.ts, order_status.ts, │
  │              order_hash.ts                │
  │                                            │
  └→ events.ts (standalone, no internal deps) │
                                               │
All reachable from index.ts (the barrel) ──────┘
```

---

## 18. Build system quirks

- **tsdown** (Rolldown-based) compiles 17 entry points to ESM in `dist/`.
- Each entry point bundles its dependencies independently — no shared chunks.
- `dts: true` emission requires all source-level `.ts` imports.
- `noUncheckedIndexedAccess` is on: any `array[i]` returns `T | undefined`.
  Non-null assertions after length guards use `// biome-ignore lint/style/noNonNullAssertion:`.
- `allowImportingTsExtensions` + `noEmit`: source uses `.ts` extensions but
  `tsc` doesn't emit; tsdown handles the build.

---

## 19. Known issues

See `improvements.md` for the current list. All previously documented items
have been resolved — `hashBulkOrder` validates context, `encodeDomainSeparator`
delegates to viem's `domainSeparator`, the available-orders builders are tested,
and `ORDER_COMPONENTS_STRUCT_ABI_TYPES` is marked `@internal` with clear
documentation.
