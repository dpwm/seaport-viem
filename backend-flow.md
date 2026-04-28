# Backend → Client Architecture

seaport-viem is designed for **backend-orchestrated** flows where the server
constructs orders, encodes calldata, and assembles signing payloads, while the
browser/client only signs typed data and submits transactions.

This isn't just a use case — it's a **hard design constraint** baked into
every module. The library has zero browser-specific dependencies, no React
hooks, no wallet integration, and every public function produces serializable
output that can cross the wire.

---

## Design principles

1. **Pure data transformation** — every `build*` function is a pure function of
   its inputs. No side effects, no wallet calls, no `window.ethereum`.
2. **Serializable outputs** — `FulfillmentData` is `{ to: \`0x${string}\`, data: \`0x${string}\`, value: bigint }`.
   All fields are JSON-serializable (serialize `bigint` as string).
3. **Separate concerns** — construction (server) and submission (client) are
   deliberately decoupled.
4. **No EIP-712 coupling** — the library produces the plain `TypedDataDefinition`
   that viem's `signTypedData` expects. It does not call `signTypedData` itself.

---

## Signing flow: backend constructs, client signs

The backend assembles everything the client needs for `eth_signTypedData_v4`.

### Step 1: Backend constructs order components

```ts
import {
  SeaportContext,
  OrderComponents,
  EIP712_TYPES,
  validateOrderComponents,
  hashOrderComponents,
} from "seaport-viem";

const ctx: SeaportContext = {
  address: "0x0000000000000068eb3014daFc035B00dD33FF",
  domain: {
    name: "Seaport",
    version: "1.6",
    chainId: 1,
    verifyingContract: "0x0000000000000068eb3014daFc035B00dD33FF",
  },
};

const orderComponents: OrderComponents = {
  offerer: "0xBuyer...",
  zone: "0x0000000000000000000000000000000000000000",
  offer: [{ /* ... */ }],
  consideration: [{ /* ... */ }],
  orderType: 0, // FULL_OPEN
  startTime: 1713628800n,
  endTime: 1813628800n,
  zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  salt: 12345n,
  conduitKey: "0x0000000000000000000000000000000000000000000000000000000000000000",
  counter: 0n,
};

// Validate before sending
const result = validateOrderComponents(orderComponents);
if (!result.valid) throw new Error(result.reason);
```

### Step 2: Backend sends typed data definition to client

The typed data definition is exactly what viem's `signTypedData` expects:

```ts
// Backend: construct the payload
const typedDataDefinition = {
  domain: ctx.domain,
  types: EIP712_TYPES,
  primaryType: "OrderComponents" as const,
  message: orderComponents,
};

// Send to client as JSON (no transformation needed)
res.json(typedDataDefinition);
```

Alternatively, pre-serialize with viem:

```ts
import { serializeTypedData } from "viem";

const serialized = serializeTypedData(typedDataDefinition);
// serialized is a JSON string ready for eth_signTypedData_v4
```

### Step 3: Client signs

```ts
// Client (browser)
import { signTypedData } from "viem/wallet";

const typedDataDefinition = await fetch("/api/order-to-sign").then(r => r.json());

const signature = await signTypedData(walletClient, {
  account: userAddress,
  ...typedDataDefinition,
});

// Send signature back to backend
await fetch("/api/submit-signature", {
  method: "POST",
  body: JSON.stringify({ signature }),
});
```

### Step 4: Backend assembles the signed order

```ts
import { toOrderParameters } from "seaport-viem";

const order = {
  parameters: toOrderParameters(
    orderComponents,
    BigInt(orderComponents.consideration.length),
  ),
  signature,
};
```

### Alternative: backend pre-hashes for local signers

If the client uses a local account (private key available to the backend or
a secure enclave), the full EIP-712 digest can be pre-computed:

```ts
import { hashOrderComponents } from "seaport-viem";
import { sign } from "viem/accounts";

// Backend
const digest = hashOrderComponents(ctx, orderComponents);

// Client or secure signer
const signature = await sign({ hash: digest, privateKey });
```

**Caveat**: This does not work with browser wallets (`window.ethereum`) because
`eth_sign` (raw hash signing) is deprecated and inconsistently supported. Use
the `signTypedData` path above for browser wallets.

---

## Fulfillment flow: backend builds calldata, client submits

Every transaction builder in the library returns `FulfillmentData` — a plain
object with exactly what `wallet_sendTransaction` needs:

```ts
type FulfillmentData = {
  to: `0x${string}`;   // Seaport contract address
  data: `0x${string}`;  // ABI-encoded calldata
  value: bigint;        // ETH to send
};
```

### Standard fulfillment

```ts
// Backend
import { buildFulfillOrder } from "seaport-viem";

const fulfillment = buildFulfillOrder(ctx, order);

// Serialize (bigint → string for JSON)
res.json({
  ...fulfillment,
  value: fulfillment.value.toString(), // bigint is not JSON-native
});

// Client
const { to, data, value } = await fetch("/api/fulfillment").then(r => r.json());
const hash = await walletClient.sendTransaction({
  to,
  data,
  value: BigInt(value),
  account: userAddress,
});
```

### Basic order fulfillment

```ts
// Backend
import { buildBasicOrderFulfillment, detectBasicOrderRouteType } from "seaport-viem";

const route = detectBasicOrderRouteType(order);
const fulfillment = buildBasicOrderFulfillment(ctx, order, {
  routeType: route ?? undefined, // auto-detect if not specified
});

// Client: same as above — sendTransaction(fulfillment)
```

### Advanced orders with partial fills

```ts
// Backend
import { buildFulfillAdvancedOrder } from "seaport-viem";

const advancedOrder = {
  parameters: order.parameters,
  numerator: 1n,
  denominator: 2n,    // fill 50%
  signature: order.signature,
  extraData: "0x",
};

const fulfillment = buildFulfillAdvancedOrder(ctx, advancedOrder, criteriaResolvers);
```

### Available orders (batch fulfillment)

```ts
// Backend
import {
  buildFulfillAvailableOrders,
  aggregateOfferItems,
  aggregateConsiderationItems,
} from "seaport-viem";

const offerFulfillments = aggregateOfferItems(orders);
const considerationFulfillments = aggregateConsiderationItems(orders);

const fulfillment = buildFulfillAvailableOrders(
  ctx,
  orders,
  offerFulfillments,
  considerationFulfillments,
);
```

### Cancellation

```ts
// Backend
import { buildCancel } from "seaport-viem";

const cancelTx = buildCancel(ctx, [orderComponents]);
// → { to, data, value: 0n }
```

### Two-sided matching

```ts
// Backend
import { buildMatchOrders } from "seaport-viem";

const matchTx = buildMatchOrders(ctx, orders, fulfillments);
```

### Every transaction builder follows this pattern

| Builder | Returns |
|---|---|
| `buildBasicOrderFulfillment` | `FulfillmentData` |
| `buildFulfillOrder` | `FulfillmentData` |
| `buildFulfillAdvancedOrder` | `FulfillmentData` |
| `buildFulfillAvailableOrders` | `FulfillmentData` |
| `buildFulfillAvailableAdvancedOrders` | `FulfillmentData` |
| `buildMatchOrders` | `FulfillmentData` |
| `buildMatchAdvancedOrders` | `FulfillmentData` |
| `buildCancel` | `FulfillmentData` |
| `buildIncrementCounter` | `FulfillmentData` |
| `buildValidate` | `FulfillmentData` |

All `build*` functions produce the same shape. The contract is: **server
builds, client submits.**

---

## What stays on the backend

The backend is the natural home for:

- **Order construction** — assembling `OrderComponents` from business logic
  (pricing, royalties, offer aggregation).
- **Validation** — `validateOrderComponents`, `requireValidContext`.
- **Route detection** — `detectBasicOrderRouteType`, `canFulfillAsBasicOrder`.
- **Calldata encoding** — all 14 encoder functions.
- **Value computation** — `computeNativeValue` to determine `msg.value`.
- **On-chain reads** — `getCounter`, `getOrderStatus`, `getOrderHash` (these
  need a `PublicClient`; the backend has your RPC URL).
- **Bulk order trees** — building the merkle tree, computing proofs.

## What stays on the client

The client is intentionally thin:

- **Signing** — `signTypedData(walletClient, typedData)` (the only place a
  private key / wallet is needed).
- **Transaction submission** — `sendTransaction(fulfillmentData)`.
- **Gas estimation** — viem handles this automatically during `sendTransaction`.

---

## Cross-environment compatibility

The library works identically on:

| Environment | Notes |
|---|---|
| **Node.js** | Full support |
| **Bun** | Full support (tested in CI) |
| **Deno** | Works (ESM-only, viem compatible) |
| **Cloudflare Workers** | Works (no Node.js dependencies) |
| **Vercel Edge** | Works (same as above) |
| **Browser** | Works, though typically only the client-side signing is done here |

The only runtime dependency is `viem`, which is also environment-agnostic
(ships browser, Node, and Bun builds).

---

## Bulk listings: backend-heavy, client-light

Bulk listings (many orders under one signature) are the extreme case. The
backend does all the heavy lifting:

```ts
// Backend
import {
  computeHeight,
  padLeaves,
  buildBulkOrderTree,
  getBulkOrderTypeString,
  hashBulkOrder,
  getProof,
  packBulkSignature,
} from "seaport-viem/bulk-listings";

// 1. Compute struct hashes for each order (off-chain hash, no domain)
const leaves = orders.map(order => hashOrderComponentsStruct(order));

// 2. Build the merkle tree
const height = computeHeight(leaves.length);
const padded = padLeaves(leaves);
const layers = buildBulkOrderTree(padded);
const root = layers[layers.length - 1][0];

// 3. Construct the bulk order EIP-712 digest
const digest = hashBulkOrder(ctx, root, height);
// Send `digest` to client for signing, or construct the full TypedDataDefinition

// 4. After signing, pack the signature with proofs for each individual order
const proof0 = getProof(layers, 0);
const packed = packBulkSignature(signature, 0, proof0);
```

Only the signing step (`hashBulkOrder` → sign) touches the client. Everything
else — tree construction, proof extraction, signature packing — is pure
computation done server-side.

---

## BigInt serialization note

`FulfillmentData.value` is a `bigint`. JSON does not support `bigint` natively.
When sending `FulfillmentData` over HTTP:

```ts
// Backend: serialize
JSON.stringify({ ...fulfillment, value: fulfillment.value.toString() });

// Client: deserialize
const { value, ...rest } = JSON.parse(raw);
const tx = { ...rest, value: BigInt(value) };
```

Alternatively, use a JSON reviver or a transport format that supports bigints
(e.g., `superjson`, a custom `BigInt` wrapper).

---

## Summary

Every function in seaport-viem follows the same contract:

- **`build*`** → `FulfillmentData` (ready for `sendTransaction`)
- **`encode*`** → `` `0x${string}` `` (raw calldata, if you need it)
- **`hash*` / `verify*`** → `` `0x${string}` `` / `boolean` (pure computation)
- **`get*`** → typed result (needs `PublicClient`, but can run on backend)
- **`validate*`** → `ValidationResult` (pure validation)

No function calls `sendTransaction`. No function calls `signTypedData`. The
library produces **data**, not effects. This is intentional — it means you
control where and when transactions are submitted.
