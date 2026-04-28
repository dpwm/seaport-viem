# Offers in Seaport

A buyer-initiated order. The buyer signs what they are willing to give
(consideration, usually ETH/ERC20) and what they want to receive (offer, usually
an ERC721/ERC1155). The seller fulfills by providing the token.

Offers use the same `OrderComponents` / `Order` structs as listings, but the
`offer` array contains what the *buyer* wants to receive, and the
`consideration` array contains what the *buyer* is willing to pay.

---

## Collection Offer

The buyer wants any token from a specific ERC721 contract.

### Order structure

```typescript
const collectionOffer = {
  offerer: buyerAddress,
  zone: zeroAddress,
  offer: [{
    itemType: 4,                    // ERC721_WITH_CRITERIA
    token: erc721Contract,
    identifierOrCriteria: 0n,       // 0 = any token ID in the collection
    startAmount: 1n,
    endAmount: 1n,
  }],
  consideration: [
    {
      itemType: 0,                  // NATIVE
      token: zeroAddress,
      identifierOrCriteria: 0n,
      startAmount: parseEther("1.0"),
      endAmount: parseEther("1.0"),
      recipient: buyerAddress,      // buyer pays themselves (protocol moves it)
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
  orderType: 0,                     // FULL_OPEN
  startTime: BigInt(now()),
  endTime: BigInt(now() + 86400),
  zoneHash: zeroHash,
  salt: randomSalt(),
  conduitKey: zeroHash,
  counter: currentCounter,
};
```

`identifierOrCriteria = 0` on a `WITH_CRITERIA` item type means **wildcard** — any
transferable token ID from that contract is acceptable. No merkle proof is needed
at fulfillment time.

### Fulfillment

Any seller with any token from that contract can fulfill. They call
`fulfillAdvancedOrder` with an empty `criteriaResolvers` array (since no proof
is needed):

```typescript
await seaportContract.write.fulfillAdvancedOrder([
  {
    parameters: orderParameters,
    numerator: 1n,
    denominator: 1n,
    signature: buyerSignature,
    extraData: "0x",
  },
  [],                               // criteriaResolvers (empty for wildcard)
  zeroHash,                         // fulfillerConduitKey
  sellerAddress,                    // recipient (seller receives the NFT)
]);
```

The seller must have approved Seaport (or the buyer's conduit) to transfer their
ERC721. The buyer's ETH is held by the protocol — no pre-deposit is needed; the
consideration is pulled from the buyer at fulfillment time.

---

## Trait Offer

The buyer wants any token that matches a specific trait (e.g., "all Gold Fur
Apes"). The set of eligible token IDs is committed to via a merkle root.

### Step 1: Build the merkle tree (off-chain)

Use the built-in `criteria` module — no external merkle tree library needed.

```typescript
import {
  buildCriteriaTree,
  getCriteriaRoot,
  getCriteriaProof,
  hashCriteriaLeaf,
} from "seaport-viem/criteria";

// Token IDs that have the trait
const eligibleTokenIds = [42n, 101n, 305n, 888n, 1337n];

// Build a sorted-pair merkle tree (matches Seaport's _verifyProof)
const tree = buildCriteriaTree(eligibleTokenIds);
const merkleRoot = getCriteriaRoot(tree);
```

### Step 2: Sign the order with the merkle root

```typescript
const traitOffer = {
  ...collectionOffer,
  offer: [{
    itemType: 4,                    // ERC721_WITH_CRITERIA
    token: erc721Contract,
    identifierOrCriteria: bytesToBigInt(merkleRoot),  // merkle root
    startAmount: 1n,
    endAmount: 1n,
  }],
};

const orderHash = getOrderHash(traitOffer);
const signature = sign({ hash: orderHash, privateKey: buyerPrivateKey });
```

### Step 3: Seller fulfills with proof

A seller who owns token ID `305` computes the proof:

```typescript
const tokenId = 305n;
const proof = getCriteriaProof(tree, tokenId);

// Optionally verify the proof before submitting
const leafHash = hashCriteriaLeaf(tokenId);
const isValid = verifyCriteriaProof(leafHash, merkleRoot, proof);
```

Then calls `fulfillAdvancedOrder` with a `CriteriaResolver`:

```typescript
const criteriaResolver = {
  orderIndex: 0,                    // this is the first (only) order
  side: 0,                          // Side.OFFER (the criteria is on the offer)
  index: 0,                         // first item in the offer array
  identifier: tokenId,
  criteriaProof: proof,
};

await seaportContract.write.fulfillAdvancedOrder([
  {
    parameters: toOrderParameters(traitOffer),
    numerator: 1n,
    denominator: 1n,
    signature,
    extraData: "0x",
  },
  [criteriaResolver],
  zeroHash,
  sellerAddress,
]);
```

### On-chain verification

Seaport's `CriteriaResolution._applyCriteriaResolvers`:

1. Locates the offer item at `orderIndex=0`, `side=OFFER`, `index=0`
2. Checks `itemType > 3` (criteria-based)
3. Since `identifierOrCriteria != 0` (it's the merkle root), verifies the proof:
   - Hashes the leaf: `keccak256(identifier)`
   - Iterates proof elements, sorting each pair before hashing:
     `keccak256(min(a,b), max(a,b))`
   - Compares final hash to `identifierOrCriteria` (the root)
   - Reverts with `InvalidProof()` if mismatch
4. If valid, replaces the item:
   - `itemType` changes from `ERC721_WITH_CRITERIA` (4) → `ERC721` (2)
   - `identifierOrCriteria` changes from `merkleRoot` → `tokenId`
5. The order proceeds as a normal ERC721 transfer

---

## Advanced Offer: Partial Criteria

A single order can mix criteria and non-criteria items:

```typescript
offer: [
  { itemType: 4, token: collectionA, identifierOrCriteria: merkleRootA }, // trait offer
  { itemType: 4, token: collectionB, identifierOrCriteria: 0n },          // any from B
  { itemType: 2, token: collectionC, identifierOrCriteria: 123n },        // specific token
]
```

Each criteria item needs its own `CriteriaResolver` entry at fulfillment time.
Non-criteria items are ignored by the resolver logic.

---

## Criteria on Consideration

The same mechanism works on the `consideration` side. A seller can list an item
and accept "any ERC721 from collection X" as payment:

```typescript
consideration: [{
  itemType: 4,
  token: erc721Contract,
  identifierOrCriteria: merkleRoot,
  startAmount: 1n,
  endAmount: 1n,
  recipient: sellerAddress,
}]
```

At fulfillment, the buyer provides a `CriteriaResolver` with `side=CONSIDERATION`
to prove their token ID is in the set.

---

## Key Differences: Offers vs Listings

| | Listing | Offer |
|---|---|---|
| Initiator | Seller | Buyer |
| `offer` array | What seller gives (NFT) | What buyer wants (NFT) |
| `consideration` array | What seller wants (ETH) | What buyer pays (ETH) |
| Fulfillment function | `fulfillBasicOrder` / `fulfillOrder` | `fulfillAdvancedOrder` (criteria needs it) |
| Who approves what | Seller approves NFT | Seller approves NFT; buyer's ETH is pulled at execution |
| Criteria needed | No (usually) | Yes, for collection/trait offers |
| Partial fills | No (FULL_OPEN) | Yes (PARTIAL_OPEN), but criteria items must be fully resolved per fill |

---

## Wildcard Behavior

`identifierOrCriteria = 0` on a `WITH_CRITERIA` item has special meaning:

- **Collection offer**: Accept any transferable token ID. No proof needed.
- **Trait offer**: `identifierOrCriteria` must be non-zero (a real merkle root).
  Zero would mean "any token," which is the collection offer case.

For contract orders (`OrderType.CONTRACT`), zero means the contract offerer
decides the identifier dynamically in `generateOrder()`.

---

## Complete Flow Diagram

```
BUYER (off-chain)
  |
  ├─ 1. Select collection and price
  ├─ 2. For trait offer:
  │     a. Build merkle tree of eligible token IDs
  │     b. Compute merkleRoot
  ├─ 3. Construct OrderComponents
  │     - offer: ERC721_WITH_CRITERIA, token=collection, identifierOrCriteria=0 or root
  │     - consideration: ETH to buyer + fees
  ├─ 4. Sign order hash → signature
  └─ 5. Publish order + merkleRoot (if trait offer)

SELLER (off-chain / on-chain)
  |
  ├─ 6. Discover offer
  ├─ 7. If trait offer:
  │     a. Check if their token ID is in the eligible set
  │     b. Compute merkle proof for their token ID
  ├─ 8. Approve Seaport/conduit for their ERC721
  └─ 9. Call fulfillAdvancedOrder(order, [criteriaResolver], conduitKey, recipient)

SEAPORT (on-chain)
  |
  ├─ 10. Validate order signature
  ├─ 11. _applyCriteriaResolvers:
  │       a. Locate criteria item
  │       b. If root != 0: _verifyProof(identifier, root, proof) [sorted pairs]
  │       c. Replace itemType (4→2 or 5→3), identifierOrCriteria → identifier
  ├─ 12. _ensureAllRequiredCriteriaResolved:
  │       - Revert if any criteria item was not resolved
  ├─ 13. Transfer tokens:
  │       - ERC721: seller → buyer
  │       - NATIVE: buyer → seller + marketplace
  └─ 14. Emit OrderFulfilled
```

---

## Key Contracts

| Component | File |
|---|---|
| Criteria resolution | `node_modules/seaport-core/src/lib/CriteriaResolution.sol` |
| Proof verification | `CriteriaResolution._verifyProof()` |
| Item type enum | `node_modules/seaport-types/src/lib/ConsiderationEnums.sol` |
| CriteriaResolver struct | `node_modules/seaport-types/src/lib/ConsiderationStructs.sol` |
