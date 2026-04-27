# Integration scripts

End-to-end scripts that exercise the library against a live (forked) Seaport
deployment. These require a running Anvil instance forked from Ethereum
mainnet.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
  (provides `anvil`)
- [Bun](https://bun.sh) (the project's JS runtime)
- An Ethereum mainnet RPC URL (e.g., Infura, Alchemy, or a local node)

## Quick start

```bash
# 1. Start Anvil forked from mainnet at block 22200000
anvil --fork-url $ETH_RPC_URL --fork-block-number 22200000

# 2. In another terminal, run any script:
bun run scripts/list-and-buy.ts
bun run scripts/bulk-list-and-buy.ts
bun run scripts/collection-offer-erc20.ts
```

All scripts target `http://127.0.0.1:8545` (Anvil's default port).

## What each script does

### `list-and-buy.ts`

A single seller lists one BAYC NFT for 1 ETH and a buyer purchases it via
`fulfillBasicOrder`. Demonstrates the simplest possible flow:

1. Transfer the NFT to the seller (Anvil impersonation)
2. Build and EIP-712 sign `OrderComponents`
3. Approve the NFT to Seaport
4. Build and send `fulfillBasicOrder` calldata
5. Verify the NFT transferred to the buyer

### `bulk-list-and-buy.ts`

A seller lists 4 BAYC NFTs using Seaport 1.6 bulk listings. Demonstrates the
bulk order tree workflow:

1. Transfer all 4 NFTs to the seller
2. Set approval-for-all on BAYC for Seaport
3. Build 4 `OrderComponents`, one per NFT
4. Fetch on-chain `getOrderHash` for each
5. Build the Merkle tree (`padLeaves`, `buildBulkOrderTree`, `computeHeight`)
6. Sign the bulk root (`hashBulkOrder` → ECDSA sign → `packBulkSignature`)
7. Buy one NFT individually via `buildFulfillOrder`
8. Buy the remaining three together via `buildFulfillAvailableOrders`
9. Verify all 4 NFTs ownered by the buyer

### `collection-offer-erc20.ts`

A buyer creates a collection-wide offer to purchase any BAYC for WETH. The
seller fulfills it piecemeal. Demonstrates advanced order features:

1. Setup: transfer BAYCs to seller, mint WETH to buyer via `deposit()`
2. Buyer approves WETH to Seaport, seller approves BAYC to Seaport
3. Buyer builds and signs a `PARTIAL_OPEN` order with `ERC721_WITH_CRITERIA`
   consideration (wildcard for any token ID)
4. Party actually fulfilling is the seller (who owns the NFTs)
5. 4 partial fills are created (`numerator: 1, denominator: 4`) with
   `CriteriaResolver` entries mapping each fill to a specific token ID
6. Each fill uses `buildFulfillAdvancedOrder`
7. Verify all 4 BAYCs transferred to the buyer, WETH transferred to seller
   and fee recipient

## Caveats

- Scripts use **hardcoded private keys** with no real value — these are fresh
  keys that only work inside the forked Anvil where balances are artificially
  set via `anvil_setBalance`.
- The scripts import from `../src/index` (not the built `dist/`) because
  `allowImportingTsExtensions` + `bun` resolve `.ts` files directly.
- Block 22200000 is chosen arbitrarily; any recent mainnet block works as
  long as the BAYC holders at that block own the referenced token IDs (3–6).
  If a token moved since that block, you may need a more recent fork block.
- These scripts touch real Seaport mainnet contracts on the fork — they
  depend on the deployed Seaport 1.6 instance at
  `0x0000000000000068F116a894984e2DB1123eB395`.
- BAYC token IDs 3–6 are assumed to exist and be transferable. If they've
  been burned or locked, the scripts will fail at the impersonation step.
