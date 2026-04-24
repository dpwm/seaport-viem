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
} from "seaport-viem/order";

// Check eligibility
canFulfillAsBasicOrder(order);           // boolean
detectBasicOrderRouteType(order);        // BasicOrderRouteTypeValue | null

// Build parameters or full transaction
toBasicOrderParameters(order, routeType, fulfillerConduitKey?, tips?);
buildBasicOrderFulfillment(ctx, order, { routeType?, fulfillerConduitKey?, tips? });
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

### Encoders

```ts
import {
  encodeGetCounter,
  encodeGetOrderHash,
  encodeFulfillBasicOrder,
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

This library covers `fulfillBasicOrder` only. It does not implement `fulfillOrder`, `fulfillAdvancedOrder`, `cancel`, `incrementCounter`, `getOrderStatus`, or event parsing. This is intentional scope.

## License

MIT
