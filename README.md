# seaport-viem

Lightweight [viem](https://viem.sh)-based toolkit for building and fulfilling [Seaport](https://github.com/ProjectOpenSea/seaport) NFT marketplace orders.

Single runtime dependency: `viem`.

## Install

```bash
npm install seaport-viem viem
```

`viem` is a peer dependency — you must install it alongside this package.

## Quick start

```ts
import {
  buildBasicOrderFulfillment,
  detectBasicOrderRouteType,
  validateOrderComponents,
} from "seaport-viem";

// Validate order components before signing
const result = validateOrderComponents(orderComponents);
if (!result.valid) {
  console.error(result.reason);
}

// Check if an order can be fulfilled as a basic order
const route = detectBasicOrderRouteType(order);

// Build transaction data ready to send
const { to, data, value } = buildBasicOrderFulfillment(ctx, order);
```

## API

### Types & enums

```ts
import {
  ItemType,          // NATIVE, ERC20, ERC721, ERC1155, ERC721_WITH_CRITERIA, ERC1155_WITH_CRITERIA
  OrderType,         // FULL_OPEN, PARTIAL_OPEN, FULL_RESTRICTED, PARTIAL_RESTRICTED, CONTRACT
  BasicOrderRouteType, // ETH_TO_ERC721, ETH_TO_ERC1155, ERC20_TO_ERC721, ...
} from "seaport-viem";

import type {
  SeaportContext,     // { address, domain }
  OrderComponents,   // core order fields — see "Dangerous fields" below
  Order,              // parameters + signature
  BasicOrderParameters,
  FulfillmentData,    // { to, data, value }
  FulfillmentOptions,
} from "seaport-viem";
```

### Dangerous fields in OrderComponents

Several fields have security and correctness implications that aren't obvious
from their types alone. Getting any of these wrong produces an order that is
unfulfillable, cancellable by anyone, or silently rejected by the zone:

| Field | Safe default / rule | Gone wrong if… |
|--------|---------------------|----------------|
| `counter` | Always read from chain via `getCounter()` | Wrong value → order hash mismatch, signature won't verify |
| `salt` | Unique per order, non-zero | Reuse → hash collision, `cancel()` on one order cancels both |
| `zone` | `0x0000…0000` for open orders | Set to a contract but `zoneHash` is wrong → rejected by `validateOrder` |
| `zoneHash` | `0x0000…0000` for open orders | Non-zero with no zone → meaningless but still part of the signed hash |
| `conduitKey` | `0x0000…0000` (direct transfer) | References a conduit the offerer hasn't approved → transfer fails |
| `startTime` | `0` (active immediately) | `startTime > endTime` → permanently invalid |
| `endTime` | `2^256 - 1` (never expires) | Too narrow a window → expires before fulfillment |

The full field semantics with Solidity source references are documented in
[JSDoc on `OrderComponents`](./src/types.ts) and in [the backend flow guide](./backend-flow.md).

### Order fulfillment

```ts
import {
  canFulfillAsBasicOrder,
  detectBasicOrderRouteType,
  toBasicOrderParameters,
  buildBasicOrderFulfillment,
  computeNativeValue,
} from "seaport-viem/order";

// Check eligibility
canFulfillAsBasicOrder(order);           // boolean
detectBasicOrderRouteType(order);        // BasicOrderRouteTypeValue | null

// Build parameters or full transaction
toBasicOrderParameters(order, routeType, fulfillerConduitKey?, tips?);
buildBasicOrderFulfillment(ctx, order, { routeType?, fulfillerConduitKey?, tips? });

// Compute msg.value from NATIVE consideration items
computeNativeValue(order.parameters.consideration);  // bigint
```

### Validation

```ts
import { validateOrderComponents } from "seaport-viem/validate";

const result = validateOrderComponents(components);
// { valid: true } | { valid: false, reason: string }
```

### Signatures

```ts
import { verifyOrderSignature, hashOrderComponents } from "seaport-viem/signature";

const isValid = await verifyOrderSignature(ctx, order);  // boolean
const hash = hashOrderComponents(ctx, orderComponents);   // 0x...
```

### On-chain reads

```ts
import { getCounter } from "seaport-viem/counter";

const counter = await getCounter(client, ctx, offerer);   // bigint
```

### Call helper

```ts
import { seaportCall } from "seaport-viem/call";

// Perform a static on-chain call with standardized Seaport error wrapping
const data = await seaportCall(client, params, "getCounter", "fetch counter", "for offerer 0x...");
```

`seaportCall` wraps viem's `client.call` with consistent error messages for Seaport on-chain reads. It handles no-data responses, viem `BaseError` exceptions, and unexpected thrown values.

### Cancel

```ts
import { buildCancel } from "seaport-viem/cancel";

const tx = buildCancel(ctx, orders);
// { to: ctx.address, data: encodeCancel(orders), value: 0n }
```

### Increment counter

```ts
import { buildIncrementCounter } from "seaport-viem/increment-counter";

const tx = buildIncrementCounter(ctx);
// { to: ctx.address, data: encodeIncrementCounter(), value: 0n }
```

### Order status

```ts
import { getOrderStatus } from "seaport-viem/order-status";

const status = await getOrderStatus(client, ctx, orderHash);
// { isValidated, isCancelled, totalFilled, totalSize }
```

### Two-sided matching

```ts
import { buildMatchOrders, buildMatchAdvancedOrders } from "seaport-viem/match";

const tx = buildMatchOrders(ctx, orders, fulfillments);
const tx2 = buildMatchAdvancedOrders(ctx, advancedOrders, criteriaResolvers, fulfillments, recipient);
```

### Bulk listings

```ts
import {
  computeHeight,       // minimum tree height for N orders
  padLeaves,           // pad leaf array to next power of 2
  buildBulkOrderTree,  // build unsorted merkle tree from leaves
  getBulkOrderTypeString, // EIP-712 type string for a bulk order at a given height
  hashBulkOrder,       // EIP-712 digest for a bulk order
  getProof,            // extract merkle proof for a leaf at the given index
  packBulkSignature,   // pack signature + proof into compact form (67 + height*32 bytes)
  unpackBulkSignature, // unpack a compact bulk signature back into components
  encodeDomainSeparator, // encode EIP-712 domain separator as bytes32
} from "seaport-viem/bulk-listings";
```

### Criteria merkle trees

Build sorted-pair merkle trees from token IDs for trait offers and
collection offers. Used to construct `CriteriaResolver` proofs for
`buildFulfillAdvancedOrder` and `buildMatchAdvancedOrders`.

```ts
import {
  hashCriteriaLeaf,      // keccak256 of ABI-encoded uint256 token ID
  buildCriteriaTree,     // sorted-pair merkle tree from token IDs
  getCriteriaRoot,       // root from tree layers
  getCriteriaProof,      // proof for a specific token ID
  verifyCriteriaProof,   // verify proof against root (pure, no chain call)
} from "seaport-viem/criteria";

const tree = buildCriteriaTree([42n, 101n, 305n]);
const root = getCriteriaRoot(tree);
const proof = getCriteriaProof(tree, 305n);
const isValid = verifyCriteriaProof(hashCriteriaLeaf(305n), root, proof);
```

See the [Offers in Seaport](./offers.md) guide for the complete trait offer
flow.

### Event parsing

```ts
import {
  decodeSeaportEvent,
  ORDER_FULFILLED_TOPIC,
  ORDER_CANCELLED_TOPIC,
  ORDER_VALIDATED_TOPIC,
  ORDERS_MATCHED_TOPIC,
  COUNTER_INCREMENTED_TOPIC,
} from "seaport-viem/events";

// Decode a Seaport event log
const args = decodeSeaportEvent(log);
// args.eventName is the event type (union discriminator)

// Type exports
import type {
  OrderFulfilledEventArgs,
  OrderCancelledEventArgs,
  OrderValidatedEventArgs,
  OrdersMatchedEventArgs,
  CounterIncrementedEventArgs,
  SeaportEventArgs,
} from "seaport-viem/events";
```

### Encoders

```ts
import {
  encodeGetCounter,
  encodeGetOrderHash,
  encodeFulfillBasicOrder,
  encodeFulfillOrder,
  encodeFulfillAdvancedOrder,
  encodeFulfillAvailableOrders,
  encodeFulfillAvailableAdvancedOrders,
  encodeCancel,
  encodeIncrementCounter,
  encodeGetOrderStatus,
  encodeMatchOrders,
  encodeMatchAdvancedOrders,
  encodeValidate,
} from "seaport-viem/encode";
```

### Constants

```ts
import {
  ZERO_ADDRESS,
  ZERO_BYTES32,
  NATIVE_TOKEN,
  seaportAbi,
  EIP712_TYPES,
} from "seaport-viem/constants";
```

## Subpath imports

Every module is available as a subpath import for tree-shaking:

```ts
import { buildBasicOrderFulfillment } from "seaport-viem/order";
import { validateOrderComponents } from "seaport-viem/validate";
import { buildCriteriaTree, getCriteriaProof } from "seaport-viem/criteria";
```

## Build output

tsdown builds ESM only (`format: ["esm"]`) to `dist/` via Rolldown
(Rust-based bundler). Output uses `.mjs` and `.d.mts` extensions. No CJS.
The `exports` map in `package.json` defines subpath entries for all 17
modules — see [AGENTS.md](./AGENTS.md#build-output) for the full list.

Each entry point bundles its dependencies independently; there are no shared
chunk files. This simplifies the output structure and avoids the
code-splitting edge cases that ESM shared chunks can trigger in unusual
bundler setups.

## Guides

- **[Backend → Client Architecture](./backend-flow.md)** — How to use seaport-viem in server-orchestrated flows: construct orders and calldata on the backend, sign and submit from the browser.
- **[N Listings Under One Signature](./n-listings-one-signature.md)** — Sign multiple Seaport listings with a single ECDSA signature using bulk order merkle trees.
- **[Offers in Seaport](./offers.md)** — Collection offers, trait offers, and criteria resolution for buyer-initiated orders.

## Scope

This library covers:
- Basic order fulfillment (`fulfillBasicOrder`)
- Standard order fulfillment (`fulfillOrder`)
- Advanced order fulfillment with partial fills (`fulfillAdvancedOrder`)
- Batch fulfillment of available orders and advanced orders (`fulfillAvailableOrders`, `fulfillAvailableAdvancedOrders`)
- Two-sided matching of orders (`matchOrders`, `matchAdvancedOrders`)
- Bulk order tree building, signing, and signature packing (for Seaport 1.6 bulk listings)
- Order cancellation (`cancel`)
- Counter management (`incrementCounter`)
- Order component validation, EIP-712 signature verification, and on-chain reads (counter, order status)
- Event parsing for all Seaport events

## License

MIT
