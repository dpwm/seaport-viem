# N Listings Under One Signature

A practical guide to signing multiple Seaport listings with a single ECDSA
signature, and fulfilling them individually.

---

## Core Idea

Instead of signing each `OrderComponents` individually, hash all N listings into
leaves, build a complete binary tree of height H (capacity `2^H`), and sign the
root under a single EIP-712 `BulkOrder` type.

At fulfillment time, the caller passes the **same** ECDSA signature plus a
merkle proof showing that their specific order belongs to the tree that was
signed.

Seaport verifies the proof on-chain, reconstructs the root, and checks it
against the single ECDSA signature.

---

## Limits

- Tree height: 1 to 24
- Capacity: `2^height` orders per signature (2 to 16,777,216)
- Empty leaves are padded with the hash of an empty `OrderComponents` struct

---

## Phase 1: Seller (Off-Chain)

### Step 1.1: Construct N OrderComponents

For each listing, build `OrderComponents`:

```typescript
interface OrderComponents {
  offerer: Address;
  zone: Address;
  offer: OfferItem[];
  consideration: ConsiderationItem[];
  orderType: OrderType;        // FULL_OPEN = 0
  startTime: bigint;
  endTime: bigint;
  zoneHash: Hex;
  salt: bigint;
  conduitKey: Hex;
  counter: bigint;             // from Seaport.getCounter(offerer)
}
```

Example listing (ERC721 for ETH + marketplace fee):

```typescript
const listing = {
  offerer: sellerAddress,
  zone: zeroAddress,
  offer: [{
    itemType: 2,                // ERC721
    token: erc721Contract,
    identifierOrCriteria: 42n,
    startAmount: 1n,
    endAmount: 1n,
  }],
  consideration: [
    {
      itemType: 0,              // NATIVE
      token: zeroAddress,
      identifierOrCriteria: 0n,
      startAmount: parseEther("0.97"),
      endAmount: parseEther("0.97"),
      recipient: sellerAddress,
    },
    {
      itemType: 0,
      token: zeroAddress,
      identifierOrCriteria: 0n,
      startAmount: parseEther("0.03"),
      endAmount: parseEther("0.03"),
      recipient: marketplaceAddress,
    },
  ],
  orderType: 0,                 // FULL_OPEN
  startTime: BigInt(now()),
  endTime: BigInt(now() + 86400),
  zoneHash: zeroHash,
  salt: randomSalt(),
  conduitKey: zeroHash,
  counter: currentCounter,
};
```

### Step 1.2: Compute height and pad leaves

```typescript
function computeHeight(orderCount: number): number {
  const height = Math.ceil(Math.log2(orderCount));
  // height must be >= 1
  return height === 0 ? 1 : height;
}

const height = computeHeight(orderComponents.length);
const capacity = 2 ** height;

// Hash each order (via Seaport.getOrderHash or off-chain EIP-712 hashing)
const leaves: Hex[] = orderComponents.map(o => getOrderHash(o));

// Pad with empty order hash
const emptyOrderHash = getOrderHash(emptyOrderComponents);
while (leaves.length < capacity) {
  leaves.push(emptyOrderHash);
}
```

### Step 1.3: Build the tree (unsorted)

Unlike standard merkle trees, Seaport does **not** sort pairs. It always hashes
`keccak256(left, right)` in index order.

```typescript
function buildTree(leaves: Hex[]): Hex[] {
  const layers: Hex[][] = [leaves];
  let current = leaves;

  while (current.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1];
      next.push(keccak256(concat([left, right])));
    }
    layers.push(next);
    current = next;
  }

  return layers;
}

const layers = buildTree(leaves);
const root = layers[layers.length - 1][0];
```

### Step 1.4: Derive the bulk order type string

The type string depends only on the height. You can precompute it, or read it
from the on-chain `TypehashDirectory`.

```typescript
function getBulkOrderTypeString(height: number): string {
  const brackets = "[2]".repeat(height);
  return (
    `BulkOrder(OrderComponents${brackets} tree)` +
    `ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)` +
    `OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)` +
    `OrderComponents(address offerer,address zone,OfferItem[] offer,ConsiderationItem[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)`
  );
}

const bulkOrderTypeHash = keccak256(toBytes(getBulkOrderTypeString(height)));
```

### Step 1.5: Hash and sign the bulk order

```typescript
const bulkOrderHash = keccak256(
  encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }],
    [bulkOrderTypeHash, root]
  )
);

// Standard EIP-712 digest
const digest = keccak256(
  concat([
    "0x1901",
    domainSeparator,
    bulkOrderHash,
  ])
);

// Sign once
const { r, s, v } = sign({ hash: digest, privateKey: sellerPrivateKey });
```

### Step 1.6: Compute per-order proofs

For each order at index `i`:

```typescript
function getProof(layers: Hex[][], index: number): Hex[] {
  const proof: Hex[] = [];
  for (let layer = 0; layer < layers.length - 1; layer++) {
    const siblingIndex = index ^ 1; // flip last bit
    proof.push(layers[layer][siblingIndex]);
    index = Math.floor(index / 2);
  }
  return proof;
}
```

### Step 1.7: Publish the listings

For each order `i`, publish:

```typescript
interface PublishedListing {
  orderComponents: OrderComponents;
  signature: Hex;   // packed: ECDSA_sig (65 bytes) + orderIndex (3 bytes) + proof (N * 32 bytes)
}
```

Pack the signature:

```typescript
function packBulkSignature(
  r: Hex,
  s: Hex,
  v: number,
  orderIndex: number,
  proof: Hex[]
): Hex {
  return concat([
    r,
    s,
    numberToHex(v, { size: 1 }),
    numberToHex(orderIndex, { size: 3 }),
    ...proof,
  ]);
}
```

**Note on compact signatures**: If using EIP-2098 compact signatures, encode the
yParity into the high bit of `s` (32 bytes total), resulting in a 64-byte ECDSA
component instead of 65.

---

## Phase 2: Buyer (On-Chain)

### Step 2.1: Select one or more listings

The buyer picks published listings. Each has:
- `OrderComponents` (the order itself)
- `signature` (packed with proof)

### Step 2.2: Fulfill a single listing

Call `fulfillOrder` or `fulfillAdvancedOrder` with the packed signature:

```typescript
// Convert OrderComponents to OrderParameters (drop counter)
const orderParameters = toOrderParameters(orderComponents);

const order: Order = {
  parameters: orderParameters,
  signature: packedSignature,    // 65 + 3 + (height * 32) bytes
};

await seaportContract.write.fulfillOrder([
  order,
  zeroHash,                       // fulfillerConduitKey
], {
  value: totalPrice + fees,       // msg.value must cover all consideration
});
```

Seaport automatically detects the bulk signature by its length and verifies it.

### Step 2.3: Batch fulfill multiple listings

Call `fulfillAvailableOrders` or `fulfillAvailableAdvancedOrders`:

```typescript
const orders: Order[] = selectedListings.map(l => ({
  parameters: toOrderParameters(l.orderComponents),
  signature: l.signature,
}));

// No aggregation needed for simple independent orders
const offerFulfillments: FulfillmentComponent[][] = [];
const considerationFulfillments: FulfillmentComponent[][] = [];

await seaportContract.write.fulfillAvailableOrders([
  orders,
  offerFulfillments,
  considerationFulfillments,
  zeroHash,                       // fulfillerConduitKey
  BigInt(orders.length),          // maximumFulfilled
], {
  value: totalValueForAllOrders,
});
```

For gas efficiency, provide `offerFulfillments` and `considerationFulfillments`
to aggregate identical transfers (e.g., multiple ETH payments to the same
seller get batched into one native transfer).

---

## On-Chain Verification Flow

When Seaport receives a fulfillment:

```
1. _verifySignature(offerer, orderHash, signature):
   a. Is signature length a valid bulk order size?
      Formula: length = (64 + x) + 3 + 32y
      where x ∈ {0, 1}, y ∈ [1, 24]
      (65 bytes ECDSA + 3 byte index + height * 32 byte proof)

   b. If valid bulk size:
      - Extract ECDSA sig (65 bytes)
      - Extract 3-byte orderIndex (big-endian)
      - Extract proof: height * 32 bytes
      - Reconstruct root from orderHash + proof + orderIndex bits
        (at each level, left/right position determined by bit in index)
      - Look up bulkOrderTypeHash for this height from TypehashDirectory
        (extcodecopy from deployed bytecode at offset = 1 + 32 * (height - 1))
      - Recompute bulkOrderHash = keccak256(bulkOrderTypeHash, root)
      - digest = keccak256(0x1901 || domainSeparator || bulkOrderHash)
      - ECDSA recover signer, compare to offerer

   c. If not bulk size: standard single-order signature verification
```

---

## Sparse Trees

You don't need to know all listings upfront. Sign a large tree (e.g., height
10 = 1024 slots) with only slot 42 populated:

```typescript
const height = 10;
const orderIndex = 42;

// The proof for a sparse tree is just the chain of empty-node hashes
// All empty slots hash to the same value at each level
```

The seller commits to a large tree once and can fill slots later by publishing
the order + proof. This is useful for marketplaces that want sellers to sign
one bulk order and add listings incrementally.

---

## Approval Requirements

Before any listing can be fulfilled:

```
For each ERC721 listed:
  seller must call token.approve(seaportAddress, tokenId)
  OR
  seller must call token.setApprovalForAll(conduitAddress, true)
  where conduitAddress is derived from the conduitKey in the order
```

A single `setApprovalForAll` to Seaport (or a shared conduit) covers all tokens
from that contract.

---

## Complete Flow Diagram

```
SELLER (off-chain)
  |
  ├─ 1. Build N OrderComponents (one per listing)
  ├─ 2. Compute height = ceil(log2(N))
  ├─ 3. Hash each → leaves, pad to 2^height with empty order hash
  ├─ 4. Build binary tree (unsorted), get root
  ├─ 5. Derive bulkOrderTypeHash for this height
  ├─ 6. Sign: keccak256(0x1901 || domainSeparator || keccak256(bulkOrderTypeHash || root))
  ├─ 7. Compute proof for each leaf
  └─ 8. Publish: (OrderComponents[i], packedSignature[i]) for each i

BUYER (on-chain)
  |
  ├─ 9. Select one or more listings
  ├─ 10. Call fulfillOrder / fulfillAvailableOrders
  │        Pass packedSignature (contains ECDSA + index + proof)
  │        Pass msg.value = sum of all consideration amounts
  └─ 11. Seaport verifies proof, recovers root, checks single ECDSA sig
         Then executes transfers (ERC721: seller→buyer, NATIVE: buyer→recipients)
```

---

## Gas Notes

- Each fulfillment pays `height` keccak256 operations for proof verification
- Height 10: ~10 hashes, negligible compared to ERC721 transfer (~20k gas)
- ECDSA recovery happens once per fulfillment (the same signature is reused,
  but each call must do the recover because the proof is order-specific)
- Use `fulfillAvailableOrders` with fulfillment components to aggregate
  identical transfers and save gas on batch buys

---

## Key Contracts

| Component | File |
|-----------|------|
| Signature verification | `node_modules/seaport-core/src/lib/Verifiers.sol` |
| Bulk order proof computation | `_computeBulkOrderProof` in Verifiers.sol |
| Typehash lookup | `contracts/test/TypehashDirectory.sol` |
| Test helper for signing | `test/foundry/utils/EIP712MerkleTree.sol` |
| EIP-712 type definitions | `eip-712-types/bulkOrder.js` |
