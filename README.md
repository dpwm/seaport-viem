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
  OrderComponents,   // core order fields
  Order,             // parameters + signature
  BasicOrderParameters,
  FulfillmentData,   // { to, data, value }
  FulfillmentOptions,
} from "seaport-viem";
```

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
```

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
