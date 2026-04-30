# Seaport.js — A Codebase Review

> **Package:** `@opensea/seaport-js` v4.1.2
> **Repository:** [ProjectOpenSea/seaport-js](https://github.com/ProjectOpenSea/seaport-js)
> **Upstream protocol:** [Seaport](https://github.com/ProjectOpenSea/seaport) — an Ethereum NFT marketplace protocol

## Table of Contents

1. [What Is This?](#1-what-is-this)
2. [How the Codebase Is Organized](#2-how-the-codebase-is-organized)
3. [The Calling Style: Use Cases, Actions, and TransactionMethods](#3-the-calling-style-use-cases-actions-and-transactionmethods)
4. [A Walk Through a Typical Order Lifecycle](#4-a-walk-through-a-typical-order-lifecycle)
5. [What's Done Well](#5-whats-done-well)
6. [What's Missing or Incomplete](#6-whats-missing-or-incomplete)
7. [Code Quality: A Close Reading](#7-code-quality-a-close-reading)
8. [Recommendations](#8-recommendations)
9. [Summary](#9-summary)

---

## 1. What Is This?

Seaport.js is the official TypeScript SDK for OpenSea's Seaport protocol. Seaport itself is a set of Ethereum smart contracts that implement a generalized marketplace: anyone can create an order offering some mix of tokens (ETH, ERC20, ERC721, ERC1155) in exchange for some mix of consideration items. Orders can be partially filled, can express criteria-based offers (e.g., "I'll buy any BAYC for 30 ETH"), can have time-based ascending/descending amounts (Dutch auctions), and can be matched in complex multi-party fulfillments.

The SDK wraps all of this in a TypeScript API designed to be called from a browser dApp or a Node.js backend. Its two runtime dependencies are `ethers` v6 (the Ethereum interaction layer) and `merkletreejs` (for constructing Merkle trees for criteria-based items and bulk-order signing).

The build pipeline uses Hardhat v3 to compile Solidity test contracts and generate TypeChain type-safe wrappers, then `tsc` to compile the SDK itself. Formatting and linting are handled by Biome.

```jsonc
// package.json (excerpt)
{
  "name": "@opensea/seaport-js",
  "version": "4.1.2",
  "type": "module",
  "main": "lib/index.js",
  "dependencies": {
    "ethers": "^6.16.0",
    "merkletreejs": "^0.6.0"
  },
  "engines": { "node": ">=20.0.0" }
}
```

---

## 2. How the Codebase Is Organized

The project is laid out in a flat-but-disciplined structure:

```
src/
  index.ts                          # Sole export: re-exports the Seaport class
  seaport.ts                        # The Seaport class (~860 lines)
  types.ts                          # The type vocabulary of the entire SDK
  constants.ts                      # Addresses, enums, EIP-712 type descriptors, magic values
  abi/                              # Hardhat-generated ABI JSON artifacts
  contracts/                        # Solidity source for test mocks and Seaport itself
  typechain-types/                  # TypeChain output — type-safe contract wrappers
  utils/
    approval.ts                     # On-chain allowance checks and approval-action generation
    balance.ts                      # On-chain balance queries, polymorphic by token standard
    balanceAndApprovalCheck.ts      # The core validation engine for orders
    criteria.ts                     # Criteria resolution: mapping merkle roots → specific token IDs
    eip712/
      Eip712MerkleTree.ts           # Merkle tree for EIP-712 bulk-order signing
      bulk-orders.ts                # Bulk order tree construction helpers
      defaults.ts                   # Default-value generation for EIP-712 struct types
      utils.ts                      # Low-level buffer/hex/keccak helpers
    fulfill.ts                      # All fulfillment logic: basic, standard, available-orders
    gcd.ts                          # GCD computation for clean fraction reduction
    item.ts                         # Item-type predicates and time-based amount interpolation
    match.ts                        # ⚠ A 2 KB TODO comment; no implementation
    merkletree.ts                   # Thin wrapper around merkletreejs for criteria items
    order.ts                        # Order assembly, fee deduction, salt generation
    usecase.ts                      # TransactionMethods and the executeAllActions runner
test/
  *.spec.ts                         # 13 Mocha test suites
  utils/
    setup.ts                        # Hardhat fixture: deploys contracts, initializes Seaport
    balance.ts                      # Post-fulfillment balance verification helpers
    constants.ts                    # Test-only constants (OpenSea domain tag, gas limits)
    examples/                       # JSON artifacts for fulfillment examples
```

The `seaport.ts` file is the natural entry point — it contains the `Seaport` class with all public methods. The `utils/` directory contains pure-logic modules, each focused on a single responsibility. The `eip712/` subdirectory is a self-contained library for building dynamically-typed EIP-712 Merkle trees, the most technically intricate part of the codebase.

---

## 3. The Calling Style: Use Cases, Actions, and TransactionMethods

The SDK's API design revolves around three interrelated abstractions.

### 3.1 The Use Case Pattern

Every major operation — `createOrder`, `fulfillOrder`, `fulfillOrders` — returns `Promise<OrderUseCase<T>>`:

```typescript
// types.ts (abridged)
export type OrderUseCase<T extends CreateOrderAction | CreateBulkOrdersAction | ExchangeAction> = {
  actions: T extends CreateOrderAction
    ? readonly [...ApprovalAction[], CreateOrderAction]
    : T extends CreateBulkOrdersAction
      ? readonly [...ApprovalAction[], CreateBulkOrdersAction]
      : readonly [...ApprovalAction[], ExchangeAction<...>]
  executeAllActions: () => Promise<
    T extends CreateOrderAction
      ? OrderWithCounter
      : T extends CreateBulkOrdersAction
        ? OrderWithCounter[]
        : ContractTransaction
  >
}
```

This is a **discovery-then-execution** pattern. The SDK performs all its pre-flight checks (balance lookups, approval verification, order-status queries) and returns a description of what needs to happen. The caller can then either call `executeAllActions()` to run everything end-to-end, or iterate `actions` to present a step-by-step UI.

Each action is a discriminated union:

```typescript
export type ApprovalAction = {
  type: "approval"
  token: string
  identifierOrCriteria: string
  itemType: ItemType
  operator: string
  transactionMethods: TransactionMethods<...>
}

export type CreateOrderAction = {
  type: "create"
  getMessageToSign: () => Promise<string>
  createOrder: () => Promise<OrderWithCounter>
}

export type ExchangeAction<T = unknown> = {
  type: "exchange"
  transactionMethods: TransactionMethods<T>
}
```

A consumer can switch on `type`:

```typescript
const { actions } = await seaport.createOrder(input)
for (const action of actions) {
  if (action.type === "approval") {
    await action.transactionMethods.transact()
  } else if (action.type === "create") {
    const order = await action.createOrder()
  }
}
```

The `executeAllActions` convenience function (in `usecase.ts`) does exactly this — loops over all actions, awaits approval transactions, then delegates to the final action:

```typescript
// usecase.ts
export const executeAllActions = async <
  T extends CreateOrderAction | CreateBulkOrdersAction | ExchangeAction,
>(
  actions: OrderUseCase<T>["actions"],
) => {
  for (let i = 0; i < actions.length - 1; i++) {
    const action = actions[i]
    if (action.type === "approval") {
      const tx = await action.transactionMethods.transact()
      await tx.wait()
    }
  }
  const finalAction = actions[actions.length - 1] as T
  switch (finalAction.type) {
    case "create":   return finalAction.createOrder()
    case "createBulk": return finalAction.createBulkOrders()
    default:         return finalAction.transactionMethods.transact()
  }
}
```

This design is elegant: it separates the _decision_ of what needs to happen from the _execution_, giving the caller full control.

### 3.2 TransactionMethods — A Uniform Contract-Call Interface

Every on-chain interaction is wrapped in a `TransactionMethods<T>` produced by `getTransactionMethods()`:

```typescript
// usecase.ts
export type TransactionMethods<T = unknown> = {
  buildTransaction: (overrides?: Overrides) => Promise<ContractTransaction>
  staticCall:       (overrides?: Overrides) => Promise<DefaultReturnType<T>>
  estimateGas:      (overrides?: Overrides) => Promise<bigint>
  transact:         (overrides?: Overrides) => Promise<TransactionResponse>
}
```

The builder function is notable for how it handles `overrides`. It peels the last argument off the args array if it looks like an `Overrides` object (detected by key-matching against known ethers fields like `gasLimit`, `value`, `nonce`). This lets callers pass overrides interleaved with contract arguments, and they get merged with any per-call overrides:

```typescript
// usecase.ts (abridged)
export const getTransactionMethods = <T extends BaseContract, U extends keyof T>(
  signer: Signer | Promise<Signer>,
  contract: T,
  method: U,
  args: ...,
  domain?: string,
): TransactionMethods<...> => {
  let initialOverrides: Overrides
  if (args?.length > 0) {
    const lastArg = args[args.length - 1]
    if (instanceOfOverrides(lastArg)) {
      initialOverrides = lastArg
      args.pop()
    }
  }
  // ...
  const buildTransaction = async (overrides?: Overrides) => {
    const mergedOverrides = { ...initialOverrides, ...overrides }
    // domain tag appending happens here
  }
  return { staticCall, estimateGas, transact, buildTransaction }
}
```

The `domain` parameter, if provided, appends a 4-byte hash of the domain string to the end of calldata — a Seaport-specific convention for tracking which front-end or aggregator routed the transaction.

### 3.3 Synchronous vs. Asynchronous Return

An important asymmetry: methods that require pre-flight balance checks (`createOrder`, `fulfillOrder`, `fulfillOrders`) return `Promise<OrderUseCase>`. Methods that are pure wrappers (`cancelOrders`, `bulkCancelOrders`, `validate`, `matchOrders`, `matchAdvancedOrders`, `setDomain`) return `TransactionMethods` _synchronously_. This is because the latter don't do any on-chain reads before building the transaction — they trust the caller.

This means the API is not uniformly `await`-able:

```typescript
// ✅ You must await these
const { actions } = await seaport.createOrder(...)

// ❌ No await here — returns synchronously
const methods = seaport.cancelOrders(...)
await methods.transact()
```

---

## 4. A Walk Through a Typical Order Lifecycle

Let's trace what happens when a user creates and fulfills an ERC-721 listing for 10 ETH.

### 4.1 Creating an Order

```typescript
const { executeAllActions } = await seaport.createOrder({
  offer: [{
    itemType: ItemType.ERC721,
    token: nftAddress,
    identifier: "1",
  }],
  consideration: [{
    amount: parseEther("10").toString(),
    recipient: offerer,
  }],
  fees: [{ recipient: feeRecipient, basisPoints: 250 }],
})
const order = await executeAllActions()
```

Inside `createOrder`, the SDK calls `_formatOrder`, which:

1. **Converts shorthand inputs to canonical item structs.** `mapInputItemToOfferItem` normalizes the `CreateInputItem` union into `OfferItem` / `ConsiderationItem` structs. A bare currency object `{ amount: "10" }` becomes `{ itemType: NATIVE, token: ZeroAddress, identifierOrCriteria: "0", startAmount: "10", endAmount: "10" }`.

2. **Validates currency homogeneity for fees.** The fee-deduction logic only works when all currency items (ETH + ERC20) in both offer and consideration share the same token address:

    ```typescript
    // seaport.ts _formatOrder
    if (
      fees?.length &&
      !areAllCurrenciesSame({ offer: offerItems, consideration: considerationItems })
    ) {
      throw new Error(
        "All currency tokens in the order must be the same token when applying fees",
      )
    }
    ```

3. **Applies fee deductions and creates fee items.** The total currency amount is computed, each consideration item is reduced proportionally, and new consideration items are appended for fee recipients:

    ```typescript
    const considerationItemsWithFees = [
      ...deductFees(considerationItems, fees),          // e.g., 9.75 ETH to offerer
      ...fees.map(fee => feeToConsiderationItem({ ... })), // e.g., 0.25 ETH to fee recipient
    ]
    ```

    Internally, `feeToConsiderationItem` uses `multiplyBasisPoints`:

    ```typescript
    // order.ts
    const multiplyBasisPoints = (amount: BigNumberish, basisPoints: BigNumberish) =>
      (BigInt(amount) * BigInt(basisPoints)) / ONE_HUNDRED_PERCENT_BP  // 10000
    ```

4. **Generates a domain-tagged salt.** If a `domain` string (e.g., `"opensea.io"`) is provided, the first 4 bytes of the salt embed `keccak256(domain)`. This lets the Seaport contract identify which front-end or aggregator originated the order:

    ```typescript
    // order.ts
    export const generateRandomSalt = (domain?: string) => {
      if (domain) {
        return toBeHex(concat([
          keccak256(toUtf8Bytes(domain)).slice(0, 10),  // 4 bytes + "0x"
          Uint8Array.from(Array(20).fill(0)),             // 20 zero bytes
          randomBytes(8),                                  // 8 random bytes
        ]))
      }
      return `0x${Buffer.from(randomBytes(8)).toString("hex").padStart(64, "0")}`
    }
    ```

    The resulting 32-byte salt looks like `0x360c6ebe0000000000000000000000000000000000000000<random>`, where `360c6ebe` is the Keccak-256 hash of `"opensea.io"` truncated to 4 bytes.

5. **Fetches the offerer's counter** from the Seaport contract if not provided. The counter is an anti-replay nonce that increments when the offerer calls `incrementCounter()` to bulk-cancel all outstanding orders.

6. **Runs balance and approval checks** (if enabled, which is the default). For each offer item, the SDK queries:
   - The offerer's balance (e.g., `ownerOf` for ERC721)
   - The operator's allowance (e.g., `isApprovedForAll` for ERC721)

The returned `OrderUseCase` for this example contains two actions:

```typescript
[
  { type: "approval", token: nftAddress, ... },  // setApprovalForAll(seaport, true)
  { type: "create", getMessageToSign, createOrder }  // sign + return order
]
```

Calling `executeAllActions()` sends the approval transaction, waits for confirmation, then calls `createOrder()`, which internally calls `signOrder()`:

```typescript
// seaport.ts
public async signOrder(
  orderComponents: OrderComponents,
  accountAddress?: string,
): Promise<string> {
  const signer = await this._getSigner(accountAddress)
  const domainData = await this._getDomainData()
  let signature = await signer.signTypedData(
    domainData,
    EIP_712_ORDER_TYPE,
    orderComponents,
  )
  // Compact to EIP-2098 (64 bytes) for gas savings
  if (signature.length === 132) {
    signature = ethers.Signature.from(signature).compactSerialized
  }
  return signature
}
```

The EIP-2098 compaction is a nice touch: a 65-byte signature (r + s + v) becomes a 64-byte compact signature (r + yParityAndS) when `v` is 27 or 28, saving 1 byte of calldata per order.

### 4.2 Fulfilling an Order

```typescript
const { executeAllActions } = await seaport.fulfillOrder({
  order,
  accountAddress: fulfiller,
})
const tx = await executeAllActions()
```

Inside `fulfillOrder`, the SDK:

1. **Validates that the order has a signature** — throws `"Order is missing signature"` if empty or missing.

2. **Fires four parallel on-chain queries:**

    ```typescript
    const [
      offererBalancesAndApprovals,    // Does the offerer still own the NFT?
      fulfillerBalancesAndApprovals,  // Does the fulfiller have 9.75 ETH + approvals?
      currentBlock,                    // For time-based amount interpolation
      orderStatus,                     // isValidated? isCancelled? totalFilled?
    ] = await Promise.all([...])
    ```

3. **Scales the order status to maximum units.** The contract returns `totalFilled` and `totalSize` in internal units. These must be scaled to match the GCD of all item amounts (the order's "maximum size"):

    ```typescript
    // fulfill.ts
    export const scaleOrderStatusToMaxUnits = (
      order: OrderWithCounter,
      orderStatus: OrderStatus,       // ⚠ mutated in place
    ) => {
      const maxUnits = getMaximumSizeForOrder(order)
      if (orderStatus.totalSize === 0n) {
        orderStatus.totalSize = maxUnits     // first fulfillment
      } else {
        orderStatus.totalFilled =
          (orderStatus.totalFilled * maxUnits) / orderStatus.totalSize
        orderStatus.totalSize = maxUnits
      }
      return orderStatus
    }
    ```

    This is important: the contract stores filled amounts in reduced fractions. If an order has amounts of 2 and 4 (GCD = 2, maxUnits = 2), and the contract reports `totalFilled = 1, totalSize = 2`, that means 1 out of 2 units are filled — i.e., 50% of the order.

4. **Validates order state** via `validateAndSanitizeFromOrderStatus`, which throws if the order is filled or cancelled, and strips the signature (replaces with `"0x"`) if the order was already validated on-chain, saving the gas cost of signature verification:

    ```typescript
    if (isValidated) {
      return { parameters: { ...order.parameters }, signature: "0x" }
    }
    ```

5. **Decides on the fulfillment route.** For our simple ERC-721 → ETH order, `shouldUseBasicFulfill` returns `true` because:
   - Single ERC-721 offer, no partial fill, same start/end amounts — passes all 9 conditions
   
   The SDK dispatches to `fulfillBasicOrder`, which calls the cheaper `fulfillBasicOrder(uint256,bytes32,bytes32,uint256,uint256,uint256,uint256,...)` contract method instead of the more general `fulfillOrder`.

6. **Computes the native ETH value to attach.** The native-amount accumulation sums all native-currency consideration items, excluding items that match the offer type (those are sourced from the offerer, not the fulfiller). The result — `parseEther("9.75")` — becomes `overrides.value`.

7. **Returns an `OrderUseCase`** with one `ExchangeAction` (no approvals needed — ETH payments only need `msg.value`, not token approvals).

### 4.3 The Basic Fulfill Dispatch Decision

The `shouldUseBasicFulfill` function encodes 9 precise criteria from the Seaport specification. It's worth examining in full:

```typescript
// fulfill.ts
export const shouldUseBasicFulfill = (
  { offer, consideration, offerer }: OrderParameters,
  totalFilled: OrderStatus["totalFilled"],
) => {
  // 1. The order must not be partially filled
  if (totalFilled !== 0n) return false

  // 2. Must be single offer and at least one consideration
  if (offer.length > 1 || consideration.length === 0) return false

  const allItems = [...offer, ...consideration]
  const nfts = allItems.filter(({ itemType }) =>
    [ItemType.ERC721, ItemType.ERC1155].includes(itemType),
  )
  const nftsWithCriteria = allItems.filter(({ itemType }) =>
    isCriteriaItem(itemType),
  )

  // 3. No native currency as the offer item
  if (isNativeCurrencyItem(offer[0])) return false

  // 4. Exactly one non-criteria NFT in the entire order
  if (nfts.length !== 1 || nftsWithCriteria.length !== 0) return false

  // 5. All currencies share the same token address
  if (!areAllCurrenciesSame({ offer, consideration })) return false

  // 6. No ascending/descending amounts (start must equal end for every item)
  if (allItems.some(({ startAmount, endAmount }) => startAmount !== endAmount))
    return false

  const [firstConsideration, ...restConsideration] = consideration

  // 7. First consideration recipient is the offerer
  if (firstConsideration.recipient.toLowerCase() !== offerer.toLowerCase())
    return false

  // 8. If extra consideration items match the offer type, the offer must cover them
  if (
    consideration.length > 1 &&
    restConsideration.every(item => item.itemType === offer[0].itemType) &&
    totalItemsAmount(restConsideration).endAmount > BigInt(offer[0].endAmount)
  ) return false

  // 9. Canonical format: native token is ZeroAddress, currency identifiers are 0,
  //    ERC721 amounts are exactly 1
  const currencies = allItems.filter(isCurrencyItem)
  return (
    currencies
      .filter(({ itemType }) => itemType === ItemType.NATIVE)
      .every(({ token }) => token === ethers.ZeroAddress) &&
    currencies.every(
      ({ identifierOrCriteria }) => BigInt(identifierOrCriteria) === 0n,
    ) &&
    nfts
      .filter(({ itemType }) => itemType === ItemType.ERC721)
      .every(({ endAmount }) => endAmount === "1")
  )
}
```

Condition 8 is subtle: if the order offers an ERC721 and has multiple consideration items, and all the extra consideration items are also ERC721s, then the _sum_ of those extra items' amounts must not exceed the single offered NFT's amount (which must be 1). This guards against the order trying to give away more NFTs than it receives.

If any condition fails, `fulfillOrder` falls through to `fulfillStandardOrder` (or `fulfillAdvancedOrder` for criteria/partial fills). This auto-routing means callers don't need to know which contract method is optimal — the SDK chooses.

---

## 5. What's Done Well

### 5.1 The Type System Enforces Correct Usage

The `OrderUseCase<T>` conditional type correctly narrows the return type of `executeAllActions()` based on which action discriminator is used:

```typescript
const { executeAllActions } = await seaport.createOrder(...)
// typeof executeAllActions: () => Promise<OrderWithCounter>

const { executeAllActions } = await seaport.fulfillOrder(...)
// typeof executeAllActions: () => Promise<ContractTransaction>
```

Discriminated unions on `Action.type` give exhaustiveness checking in `switch` statements and accurate editor autocompletion. `as const` assertions on action objects ensure literal types (`"approval"`, `"create"`, `"exchange"`) flow through rather than widening to `string`.

### 5.2 Input Types Are Ergonomic

`CreateInputItem` accepts multiple shorthand forms and normalizes them in `mapInputItemToOfferItem`:

```typescript
// You can write this:
{ amount: parseEther("10").toString(), recipient: offerer }
// ...and the SDK infers ItemType.NATIVE + ZeroAddress + identifier "0"

// Or this with explicit token:
{ token: wethAddress, amount: parseEther("10").toString() }
// ...and it infers ItemType.ERC20 + the given token

// Criteria-based items accept either an identifiers array or a precomputed root:
{ itemType: ItemType.ERC721, token: baycAddress, identifiers: ["1","2","3"] }
// ...or:
{ itemType: ItemType.ERC721, token: baycAddress, criteria: "0xabcd..." }
```

When identifiers are provided, a `MerkleTree` is constructed and the criteria root is computed automatically. The `Erc721ItemWithCriteria` type uses a union to make this ergonomic:

```typescript
type Erc721ItemWithCriteria = {
  itemType: ItemType.ERC721
  token: string
} & ({ identifiers: string[] } | { criteria: string })
```

### 5.3 Fee Handling Is a First-Class Feature

Rather than requiring callers to manually compute 2.5% deductions, the `fees` array on `CreateOrderInput` automates everything:

```typescript
fees: [{ recipient: "0xFee...", basisPoints: 250 }]
```

The SDK deducts proportional amounts from all currency consideration items and appends new consideration items for the fee recipients. A 10 ETH listing with a 250 bp fee becomes 9.75 ETH to the seller and 0.25 ETH to the platform — the caller doesn't need to do the math.

### 5.4 Balance Modeling Correctly Accounts for Settlement Mechanics

The validation pipeline models the actual atomic transfer flow in Seaport. For standard fulfills, the SDK **virtually credits** the fulfiller's balance with all offer items _before_ checking if they can cover the consideration items:

```typescript
// balanceAndApprovalCheck.ts
const fulfillerBalancesAfterReceiving = addToExistingBalances({
  items: offer,                    // what the fulfiller will receive
  criterias: offerCriteria,
  balancesAndApprovals: fulfillerBalancesAndApprovals,
  timeBasedItemParams,
})

// Then check against consideration items (what the fulfiller must send)
const { insufficientBalances } = getInsufficientBalanceAndApprovalAmounts({
  balancesAndApprovals: fulfillerBalancesAfterReceiving,
  tokenAndIdentifierAmounts: getSummedTokenAndIdentifierAmounts({
    items: consideration,
    ...
  }),
})
```

This is correct: if Alice sells 100 USDC and wants Bob's NFT, Bob doesn't need to _already_ have 100 USDC. He receives it from Alice atomically and forwards it. The SDK's model reflects this.

For basic fulfills, the approach is different but equally correct: consideration items matching the offer type are excluded from the fulfiller's balance check entirely because they're sourced from the offerer.

### 5.5 Time-Based Amount Interpolation Handles Dutch Auctions

The `getPresentItemAmount` function computes the current amount for ascending/descending items based on elapsed time, with a configurable buffer (default 300 seconds) for ascending amounts:

```typescript
// item.ts
const isAscending = endAmountBn > startAmountBn
const adjustedBlockTimestamp = BigInt(
  isAscending
    ? currentBlockTimestamp + ascendingAmountTimestampBuffer
    : currentBlockTimestamp,
)
```

The rounding direction is intentional: round _down_ for offer items (favoring the fulfiller), round _up_ for consideration items (favoring the offerer). This prevents rounding errors from causing transactions to revert due to 1-wei discrepancies.

### 5.6 Bulk Order Signing via EIP-712 Merkle Trees

The SDK can sign dozens of orders with a single EIP-712 signature by arranging them into a padded Merkle tree. The tree depth is computed from the order count:

```typescript
// bulk-orders.ts
export function getBulkOrderTreeHeight(length: number): number {
  return Math.max(Math.ceil(Math.log2(length)), 1)
}
```

For 5 orders (next power of 2 = 8, height = 3), the EIP-712 type becomes:

```
BulkOrder: [{ name: "tree", type: "OrderComponents[2][2][2]" }]
```

Each order receives a Merkle proof embedded in its signature, so the contract can verify all orders against a single root. The `DefaultGetter` class dynamically generates zero-filled padding nodes for incomplete tree rows. This is the most technically sophisticated subsystem in the codebase.

### 5.7 Test Coverage Is Broad and Verifies On-Chain State

Thirteen test suites cover creation, basic/standard/advanced fulfillment, partial fills, bulk orders, criteria-based orders, gifting, cancellations, domain registry, and bundle orders. Each test verifies actual on-chain state changes:

```typescript
// test/basic-fulfill.spec.ts
const ownerToTokenToIdentifierBalances =
  await getBalancesForFulfillOrder(provider, order, fulfiller)

const { executeAllActions } = await seaport.fulfillOrder(...)
const tx = await executeAllActions()
const receipt = await tx.wait()

await verifyBalancesAfterFulfill({
  ownerToTokenToIdentifierBalances,
  order,
  fulfillerAddress,
  fulfillReceipt: receipt,
  provider,
})
```

The `verifyBalancesAfterFulfill` helper computes expected balance deltas from the order's parameters and asserts that on-chain balances match exactly. This catches not just revert conditions but also incorrect amount calculations.

---

## 6. What's Missing or Incomplete

### 6.1 `matchOrders` — The Algorithm Exists Only as a Comment

The file `src/utils/match.ts` is 130 lines of meticulously written prose describing how to implement match-orders, followed by `export {}` — it exports nothing. The prose describes an elegant algorithm:

> 1. Take all the orders you want to fulfill and retrieve the latest amounts
> 2. Flatten those orders into all offer items and all consideration items
> 3. Aggregate items by type + token + identifier + (offerer / recipient)
> 4. Check for self-matching items (same type/token/id with offerer == recipient) and create zero-transfer fulfillments for them
> 5. Retrieve all approvals and balances for each aggregated offer item
> 6. Search for fulfillments that can be performed before the fulfiller's order even exists
> 7. Create the mirror order with an offer item for each remaining consideration item and vice versa
> 8. Run fulfillment generation again, including the last order
> 9. Ensure all consideration items have been met

This would be the SDK's killer feature: one call to atomically match N existing orders against each other. But it's entirely unimplemented. The existing `matchOrders()` and `matchAdvancedOrders()` methods are **pass-through wrappers** that take pre-constructed fulfillments and pass them directly to the contract:

```typescript
public matchOrders({ orders, fulfillments, overrides, accountAddress, domain }) {
  this._validateMatchOrdersNativeValue(orders.map(o => o.parameters), overrides)
  return getTransactionMethods(
    this._getSigner(accountAddress),
    this.contract,
    "matchOrders",
    [orders, fulfillments, overrides],
    domain,
  )
}
```

No balance checks. No fulfillment generation. No mirror order construction. The JSDoc honestly labels these "low-level" and warns callers about the lack of validation.

### 6.2 ERC1155 Criteria Balance Assumptions

For ERC1155_WITH_CRITERIA items without explicit identifiers, the SDK **assumes the offerer has sufficient balance**:

```typescript
// balance.ts
if (!criteria) {
  // We don't have a good way to determine the balance of an erc1155
  // criteria item unless explicit identifiers are provided, so just assume
  // the offerer has sufficient balance
  const startAmount = BigInt(item.startAmount)
  const endAmount = BigInt(item.endAmount)
  return startAmount > endAmount ? startAmount : endAmount
}
```

The comment is honest, but the behavior is dangerous. The balance check silently passes, and the on-chain fulfillment will later revert with an ERC1155-specific error from the Seaport contract, wasting the user's gas on approvals and a doomed transaction.

For ERC721_WITH_CRITERIA without identifiers, the SDK falls back to `balanceOf(owner)` — total NFT count in the collection. This is a reasonable proxy but overestimates: owning 10 BAYC doesn't mean the offerer owns the specific 3 that a buyer's criteria resolves to.

### 6.3 No Input Validation

The SDK performs almost no validation of user-provided parameters:

- **`startTime > endTime`:** Accepted silently. The Dutch-auction math in `getPresentItemAmount` computes `duration = endTimeBn - startTimeBn`. If start > end, this wraps to a massive `uint256` (due to unsigned integer underflow in BigInt), producing wildly wrong interpolated amounts.

- **ERC721 `endAmount` other than `"1"`:** Accepted silently. The contract would revert, but the user gets no early warning. `shouldUseBasicFulfill` checks this as part of its qualification (condition 9), but that only affects the routing decision — it doesn't reject the order.

- **Zero-length offer or consideration arrays:** Accepted, though they'd produce an invalid order that can't be fulfilled.

- **`CreateInputItem` ambiguity:** An ERC721 item with an `amount` field (`{ itemType: ItemType.ERC721, token, identifier, amount: "1" }`) and an ERC1155 item with `amount: "1"` are structurally identical except for the `itemType` discriminator. A misplaced `itemType` could cause the wrong contract method to be called.

### 6.4 Tight Coupling to ethers v6

The SDK is thoroughly dependent on ethers v6 internals:

- Constructor accepts `JsonRpcProvider | Signer`, but the runtime logic also handles a bare `Provider` (the base type). The type signature and runtime behavior diverge:

    ```typescript
    // Constructor: type says JsonRpcProvider | Signer
    const provider = "provider" in providerOrSigner
      ? providerOrSigner.provider     // Signer has .provider
      : providerOrSigner              // Assumed to be Provider-like
    ```

    If you pass a `JsonRpcProvider`, it flows through the `else` branch and later `_getSigner` tries `(this.provider as JsonRpcProvider).getSigner(...)`, which works. If you pass an `InfuraProvider` or any non-JsonRpc `Provider`, it fails silently.

- `signTypedData()`, `TypedDataEncoder`, `ZeroAddress`, `ZeroHash`, `Signature.from().compactSerialized` — all ethers-specific. Supporting viem or web3.js would require a significant adapter layer.

### 6.5 No Retry Logic

`getBalancesAndApprovals` fires parallel RPC calls for every item:

```typescript
return Promise.all(
  items.map(async item => {
    let approvedAmount = 0n
    if (isErc721Item(item.itemType) || isErc1155Item(item.itemType)) {
      approvedAmount = await approvedItemAmount(owner, item, operator, provider)
    } else if (isErc20Item(item.itemType)) {
      approvedAmount = await approvedItemAmount(owner, item, operator, provider)
    } else {
      approvedAmount = MAX_INT
    }
    return {
      token: item.token,
      identifierOrCriteria: ...,
      balance: await balanceOf(owner, item, provider, ...),
      approvedAmount,
      itemType: item.itemType,
    }
  }),
)
```

If any single RPC call fails (rate limit, network blip, node restart), the entire operation fails with no retry. For a 10-item order, that's 20 parallel calls — a single transient failure aborts everything.

### 6.6 Race Conditions on Batched Fulfillment

`fulfillOrders` batches N orders, runs balance checks for all of them, then constructs a single `fulfillAvailableAdvancedOrders` call. Between the balance checks and mining, another party could cancel an order, partially fill one, or drain an offerer's balance. The contract method gracefully skips unfillable orders (it uses `staticcall` internally), but any approvals granted for now-unfillable orders are wasted.

### 6.7 No Event Subscription Helpers

The `seaport.contract` property is public, so callers _can_ listen for events:

```typescript
seaport.contract.on("OrderFulfilled", (orderHash, offerer, ...) => { ... })
```

But there are no typed convenience methods. For a library that otherwise prioritizes developer experience, `onOrderFulfilled(callback)` is a noticeable absence.

---

## 7. Code Quality: A Close Reading

### 7.1 Mutation of Parameters

The SDK mutates its arguments in several places, creating hidden side effects that callers must be aware of.

**`scaleOrderStatusToMaxUnits` mutates its `orderStatus` argument in place:**

```typescript
// fulfill.ts
export const scaleOrderStatusToMaxUnits = (
  order: OrderWithCounter,
  orderStatus: OrderStatus,   // ← mutated!
) => {
  const maxUnits = getMaximumSizeForOrder(order)
  if (orderStatus.totalSize === 0n) {
    orderStatus.totalSize = maxUnits       // mutation in first-fulfillment case
  } else {
    orderStatus.totalFilled =
      (orderStatus.totalFilled * maxUnits) / orderStatus.totalSize
    orderStatus.totalSize = maxUnits        // mutation in partial-fill case
  }
  return orderStatus  // returns the mutated reference
}
```

Callers rely on this side effect:

```typescript
// seaport.ts fulfillOrder
scaleOrderStatusToMaxUnits(order, orderStatus)
const { totalFilled, totalSize } = orderStatus  // reads mutated values
```

If `orderStatus` were reused after this call (e.g., passed to another function), it would contain the scaled values, not the original contract return values. A caller who isn't reading the source code wouldn't know this happened.

**`createBulkOrders` mutates the caller's input array in place:**

```typescript
// seaport.ts
for (const input of createOrderInput) {
  input.counter ??= offererCounter  // ← mutates the original array element
}
```

If the caller reuses the same `CreateOrderInput` objects after the call, the `counter` field has been silently overwritten with the offerer's counter value. This is a side effect of what appears to be a read-only operation.

**`getItemToCriteriaMap` mutates its internal copy via `.shift()`:**

```typescript
// criteria.ts
export const getItemToCriteriaMap = (items: Item[], criterias: InputCriteria[]) => {
  const criteriasCopy = [...criterias]  // shallow copy — protects the caller
  return items.reduce((map, item) => {
    if (isCriteriaItem(item.itemType)) {
      map.set(item, criteriasCopy.shift() as InputCriteria)  // mutates copy
    }
    return map
  }, new Map<Item, InputCriteria>())
}
```

The shallow copy protects the caller's original array, but the algorithm has an undocumented invariant: criteria items in the `items` array must be in the same order as their corresponding entries in the `criterias` array. If a caller passes criteria in a different order, the map will silently associate the wrong criteria with each item.

### 7.2 `as any` Casts Bypass the Type System

The `generateFulfillOrdersFulfillments` function in `fulfill.ts` contains four separate `as any` casts:

```typescript
offerAggregatedFulfillments[aggregateKey] = [
  ...((offerAggregatedFulfillments[aggregateKey] ?? []) as any),
  { orderIndex, itemIndex },
] as any
```

TypeChain generates `FulfillmentComponentStruct` as a tuple type (`[orderIndex: BigNumberish, itemIndex: BigNumberish]`). But the code constructs it incrementally as a plain object array. The casts bridge the gap by telling TypeScript "trust me." If the TypeChain types ever change (e.g., a third field is added to the struct), these casts will silently hide the breakage.

A proper fix would use the TypeChain `FulfillmentComponentStruct` constructor or declare the accumulator type correctly:

```typescript
const offerAggregatedFulfillments: Record<string, FulfillmentComponentStruct[]> = {}
```

### 7.3 Error Handling Is String-Based With No Hierarchy

Every error thrown by the SDK is `new Error("some string")`. There is no error class hierarchy:

```typescript
throw new Error("The order you are trying to fulfill is already filled")
throw new Error("The order you are trying to fulfill is cancelled")
throw new Error("Order is missing signature")
throw new Error("The offerer does not have the amount needed to create or fulfill.")
throw new Error("The fulfiller does not have the balances needed to fulfill.")
throw new Error("All currency tokens in the order must be the same token when applying fees")
```

Callers who need programmatic error handling are forced into fragile string matching:

```typescript
try {
  await seaport.fulfillOrder(...)
} catch (e) {
  if ((e as Error).message.includes("already filled")) {
    // handle filled order
  } else if ((e as Error).message.includes("cancelled")) {
    // handle cancelled order
  }
}
```

A simple error hierarchy would let callers use `instanceof`:

```typescript
export class OrderFilledError extends Error {
  constructor(orderHash: string) {
    super(`Order ${orderHash} is already filled`)
    this.name = "OrderFilledError"
  }
}
export class OrderCancelledError extends Error { /* ... */ }
export class InsufficientBalanceError extends Error { /* ... */ }
```

### 7.4 The Bare `catch` in `getDomains` Swallows All Errors

The `getDomains` method uses a bare `catch` block to handle the case where too many domains are registered under a tag (Solidity has a memory limit on return data):

```typescript
// seaport.ts
public async getDomains(tag: string): Promise<string[]> {
  try {
    return this.domainRegistry.getDomains(tag)
  } catch {
    // Fallback: query each index individually
    const totalDomains = await this.domainRegistry.getNumberOfDomains(tag)
    const domainArray = Promise.all(
      [...Array(Number(totalDomains)).keys()].map(i =>
        this.domainRegistry.getDomain(tag, i),
      ),
    )
    return await domainArray
  }
}
```

But the bare `catch` also swallows RPC errors, network timeouts, and rate-limit rejections. An RPC timeout on the initial `getDomains(tag)` call would be silently converted into N+1 queries (`getNumberOfDomains` + N `getDomain` calls), which could cascade the problem under load.

A better approach would inspect the error reason:

```typescript
try {
  return this.domainRegistry.getDomains(tag)
} catch (e) {
  if (isReturnDataTooLargeError(e)) {
    // expected fallback
  } else {
    throw e  // rethrow unexpected errors
  }
}
```

### 7.5 Significant Duplication Across Fulfillment Functions

The same amount-adjustment pattern appears verbatim in three locations:

```typescript
// Pattern: adjust order amounts by either unitsToFill or filled status
order: orderMetadata.unitsToFill
  ? mapOrderAmountsFromUnitsToFill(orderMetadata.order, {
      unitsToFill: orderMetadata.unitsToFill,
      totalSize: orderMetadata.orderStatus.totalSize,
    })
  : mapOrderAmountsFromFilledStatus(orderMetadata.order, {
      totalFilled: orderMetadata.orderStatus.totalFilled,
      totalSize: orderMetadata.orderStatus.totalSize,
    }),
```

This appears in:
1. `fulfillStandardOrder` — for the main order
2. `fulfillStandardOrder` — for tips
3. `fulfillAvailableOrders` — inside a `.map()` callback

The criteria-length validation is duplicated identically:

```typescript
if (
  offerCriteriaItems.length !== offerCriteria.length ||
  considerationCriteriaItems.length !== considerationCriteria.length
) {
  throw new Error(
    "You must supply the appropriate criterias for criteria based items",
  )
}
```

The native-amount lookup is duplicated three times:

```typescript
getSummedTokenAndIdentifierAmounts({
  items: ..., criterias: ..., timeBasedItemParams: ...,
})[ethers.ZeroAddress]?.["0"]
```

These could all be extracted into shared helpers.

### 7.6 Large Functions

Several functions exceed a comfortable mental working-set size:

| Function | Lines | Concerns |
|----------|-------|----------|
| `fulfillAvailableOrders` | ~160 | Sanitization, amount adjustment, tip adjustment, approval aggregation, criteria validation, advanced-order construction, fulfillment generation, exchange-action assembly |
| `fulfillStandardOrder` | ~125 | Amount adjustment, tip adjustment, criteria validation, native-amount computation, approval generation, route selection, exchange-action assembly |
| `Seaport.fulfillOrder` | ~100 | Signature validation, 4-way parallel fetch, order-status scaling, sanitization, time-based params, tip conversion, basic/standard dispatch |
| `Seaport.fulfillOrders` | ~90 | Signature validation, operator resolution, item aggregation, parallel data fetching, metadata construction, `fulfillAvailableOrders` dispatch |

`fulfillOrder` has a clear three-phase structure (gather → transform → dispatch) that would benefit from explicit extraction:

```typescript
// Hypothetical refactor
const data = await this._gatherFulfillmentData(order, params)
const prepared = this._prepareFulfillmentParams(data)
return this._dispatchFulfillment(prepared)
```

### 7.7 `getOrderHash` — 55 Lines of Manual Hex Manipulation

The `getOrderHash` method manually reconstructs the EIP-712 struct hash using raw hex slicing and concatenation:

```typescript
// seaport.ts
public getOrderHash = (orderComponents: OrderComponents): string => {
  const offerItemTypeString =
    "OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria," +
    "uint256 startAmount,uint256 endAmount)"
  const considerationItemTypeString =
    "ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria," +
    "uint256 startAmount,uint256 endAmount,address recipient)"
  // ... plus 40 more lines of typeHash computation, hex slicing, padStart(64, "0"),
  //     and nested keccak256 calls ...
}
```

ethers v6's `TypedDataEncoder` already computes EIP-712 struct hashes — the SDK uses it for signing (`TypedDataEncoder.getPayload`) but not for offline hash computation. The risk: if Seaport ever adds a field to `OrderComponents` or reorders existing fields, the contract's hash changes but the SDK's manual computation won't until someone updates this function in lockstep. The test suite validates consistency with `seaportContract.getOrderHash(...)`, which provides a safety net, but only for the field combinations exercised by tests.

### 7.8 Dead Code

**`shouldUseMatchForFulfill`** in `order.ts`:

```typescript
export const shouldUseMatchForFulfill = () => true
```

This function is exported, always returns `true`, and is never imported anywhere. It's a vestigial placeholder.

**`src/utils/match.ts`** — 130 lines of prose, zero executable code:

```typescript
/** Giant TODO for match orders
# Match orders
- Format: list of fulfillments
    - Each fulfillment represents a single transfer or "execution"
...
  */
export {}
```

A source file whose only content is a comment has no reason to exist in the source tree. The algorithm description belongs in documentation.

### 7.9 Naming Problems

**Overloaded `accountAddress` parameter.** Across the Seaport class, `accountAddress` means:
- In `createOrder`: the offerer
- In `fulfillOrder`: the fulfiller
- In `cancelOrders`: the canceller (offerer)
- In `signOrder`: the signer

The JSDoc clarifies each, but the name itself is semantically empty. More descriptive names (`offererAddress`, `fulfillerAddress`) would make the API self-documenting.

**Typo: "criterias".** The variable names `offerCriterias` and `considerationCriterias` appear throughout the SDK and in user-facing error messages:

```typescript
throw new Error(
  "You must supply the appropriate criterias for criteria based items"
)
```

"Criteria" is already the plural of "criterion." The correct form appears in the function name `generateCriteriaResolvers`, creating an inconsistency.

**`TestERC721__factory` misused for ERC1155.** In `approvedItemAmount`, the same TypeChain factory is used for both ERC721 and ERC1155 `isApprovedForAll` checks:

```typescript
if (isErc721Item(item.itemType) || isErc1155Item(item.itemType)) {
  const contract = TestERC721__factory.connect(item.token, provider)
  const isApprovedForAll = await contract.isApprovedForAll(owner, operator)
  return isApprovedForAll ? MAX_INT : 0n
}
```

This works because ERC721 and ERC1155 share the same `isApprovedForAll(address,address)` function selector, so the TypeChain wrapper's ABI is compatible. But reading the code, it appears to be a copy-paste error — why is `TestERC721__factory` checking an ERC1155 contract?

### 7.10 Type Safety Gaps

**The `OrderStruct` spread in `fulfillStandardOrder` silently includes extra fields:**

```typescript
const orderAccountingForTips: OrderStruct = {
  ...order,                    // order is OrderWithCounter — has .counter
  parameters: {
    ...order.parameters,
    consideration: [...order.parameters.consideration, ...tips],
    totalOriginalConsiderationItems: consideration.length,
  },
}
```

`OrderWithCounter` has a top-level `counter` field. `OrderStruct` (the TypeChain-generated type) does not. The spread includes `counter` in the result, but TypeScript doesn't complain because `OrderStruct` is declared as a structural type, and extra properties are silently compatible. If the type were ever tightened (e.g., with a branded/exact type), this would break.

**The test fixture cast in `describeWithFixture`:**

```typescript
// test/utils/setup.ts
const fixture: Partial<Fixture> = {}   // all fields undefined

beforeEach(async () => {
  // ... initialize all fixture fields ...
  fixture.seaport = seaport
  fixture.contract = contract
  // ...
})

suiteCb(fixture as Fixture)  // cast from Partial to full — reality depends on timing
```

The test suite callback receives `fixture` typed as `Fixture` (all fields non-optional), but the fields are populated in `beforeEach`, which runs _after_ the `describe` callback is registered. A top-level reference to `fixture.seaport` before the first test runs would get `undefined` despite the type claiming it's a `Seaport`. This is a classic Mocha anti-pattern; the safer approach uses `let` variables declared inside `beforeEach` and referenced via closure.

### 7.11 The `DefaultGetter` Class — Clever but Fragile

The `DefaultGetter` in `eip712/defaults.ts` walks an EIP-712 type tree and generates zero-ish default values for every field, used to pad Merkle trees to power-of-two sizes. After generating defaults for all types, it validates that they're "nullish":

```typescript
for (const name in types) {
  const defaultValue = this.getDefaultValue(name)
  this.defaultValues[name] = defaultValue
  if (!isNullish(defaultValue)) {
    throw new Error(
      `Got non-empty value for type ${name} in default generator: ${defaultValue}`,
    )
  }
}
```

The `isNullish` function considers `0n`, `false`, `"0x"`, empty arrays, and empty objects as nullish. This works for Seaport because all struct fields legitimately default to zero-ish values, but it means any EIP-712 struct with a non-zero default (e.g., a contract that requires `version = 1`) would cause a constructor error. The constraint isn't documented, and the error message doesn't explain _why_ non-nullish defaults are disallowed (they would break the Merkle-tree padding invariant).

---

## 8. Recommendations

### High Priority

**1. Implement the match-orders algorithm.** The prose in `match.ts` is a detailed spec. A first-pass implementation handling the bulk-purchase case (N sell orders → 1 buy order) would close the largest feature gap. It should follow the patterns established by other methods: pre-flight balance/approval checks, return a `UseCase`.

**2. Add input validation.** At minimum, validate in `_formatOrder`:
- `startTime < endTime` when both are provided
- ERC721 items have `endAmount === "1"`
- All amounts are non-negative
- `offer` and `consideration` arrays are non-empty

**3. Fix the ERC1155 criteria balance assumption.** Options: require explicit criteria identifiers, query `balanceOfBatch` across known token IDs, or return a warning action instead of silently assuming sufficient balance.

**4. Make `scaleOrderStatusToMaxUnits` pure.** Return a new `OrderStatus` instead of mutating the argument:

```typescript
export const scaleOrderStatusToMaxUnits = (
  order: OrderWithCounter,
  orderStatus: OrderStatus,
): OrderStatus => {
  const maxUnits = getMaximumSizeForOrder(order)
  if (orderStatus.totalSize === 0n) {
    return { ...orderStatus, totalSize: maxUnits }
  }
  return {
    ...orderStatus,
    totalFilled: (orderStatus.totalFilled * maxUnits) / orderStatus.totalSize,
    totalSize: maxUnits,
  }
}
```

### Medium Priority

**5. Add a custom error hierarchy** (`OrderFilledError`, `OrderCancelledError`, `InsufficientBalanceError`, `InsufficientApprovalError`) extending `Error` so callers can use `instanceof`.

**6. Fix the `catch` block in `getDomains`** to only catch the expected "return data too large" revert, not all errors.

**7. Stop mutating caller inputs in `createBulkOrders`.** Use local copies:

```typescript
for (const input of createOrderInput) {
  const inputWithCounter = {
    ...input,
    counter: input.counter ?? offererCounter,
  }
}
```

**8. Replace manual `getOrderHash` with `TypedDataEncoder.hashStruct()`:**

```typescript
public getOrderHash = (orderComponents: OrderComponents): string => {
  return TypedDataEncoder.hashStruct(
    "OrderComponents", EIP_712_ORDER_TYPE, orderComponents,
  )
}
```

**9. Extract duplicated fulfillment logic.** The amount-adjustment ternary, criteria-length validation, and native-amount accumulation should be shared helpers.

### Low Priority

**10. Add typed event subscription helpers** (`onOrderFulfilled`, `onOrderCancelled`, etc.).

**11. Add a `cancelOrder` convenience** that accepts `Order | OrderWithCounter` and extracts parameters.

**12. Remove or implement `shouldUseMatchForFulfill`.**

**13. Eliminate `as any` casts in `generateFulfillOrdersFulfillments`** by typing the accumulators correctly.

**14. Exclude Solidity source from the npm package** via `.npmignore`.

---

## 9. Summary

Seaport.js is a well-designed SDK built around three excellent ideas:

1. **The use-case pattern** — the SDK discovers what needs to happen (approvals, signatures, transactions) and returns it as a structured description. Callers control execution.

2. **Automatic fulfillment-route selection** — `shouldUseBasicFulfill` encodes deep protocol knowledge so callers don't need to understand Seaport's gas optimization paths.

3. **Correct balance modeling** — the virtual credit of offer items to the fulfiller before checking consideration coverage accurately models Seaport's atomic settlement mechanics.

The three biggest gaps are:

1. **`matchOrders` is unimplemented** — the most powerful feature is a 130-line comment.
2. **ERC1155 criteria balances are assumed sufficient** — a known limitation that can cause silent, gas-wasting failures on-chain.
3. **Argument mutation and bare `catch` blocks** — hidden side effects and swallowed errors that could cause subtle production bugs.

The codebase is mature and well-tested for single-order creation and fulfillment. It would benefit from a pass focused on making internal functions pure, adding input validation, and building out the match-orders infrastructure. The TypeScript usage is strong overall, with the `as any` casts in `fulfill.ts` being the main area where type safety is voluntarily surrendered.
