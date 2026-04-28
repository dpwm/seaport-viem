# Scripts improvements

The three integration scripts in `scripts/` share ~70% of their code but
each reimplements it inline. This make the scripts harder to read (the
reader must visually filter out boilerplate) and harder to maintain (a
change to keys, ABIs, or Anvil setup requires touching all three files).

See `scripts/README.md` for a summary of what each script demonstrates.

---

## Subtasks

Work through these in order. Each is self-contained and can be committed
independently.

---

### ST1. Create `scripts/helpers.ts` — shared infrastructure ✅

Extract the following into a single shared module. Every value below is
identical across all three scripts.

**Status**: Done.

**a) Keys and accounts**

```ts
export const SELLER_KEY = "0x84ce4..." as `0x${string}`;
export const BUYER_KEY = "0x08699..." as `0x${string}`;
export const FEE_RECIPIENT_KEY = "0x9ee26..." as `0x${string}`;

export const sellerAccount = privateKeyToAccount(SELLER_KEY);
export const buyerAccount = privateKeyToAccount(BUYER_KEY);
export const feeRecipientAccount = privateKeyToAccount(FEE_RECIPIENT_KEY);
```

**b) Seaport constants**

```ts
export const SEAPORT_ADDRESS = "0x0000000000000068F11..." as `0x${string}`;

export const SEAPORT_CTX: SeaportContext = {
  address: SEAPORT_ADDRESS,
  domain: {
    name: "Seaport",
    version: "1.6",
    chainId: 1,
    verifyingContract: SEAPORT_ADDRESS,
  },
};
```

**c) RPC URL**

```ts
export const RPC_URL = "http://127.0.0.1:8545";
```

**d) ERC721 ABI**

The `erc721Abi` is defined inline (24 lines) in all three scripts.
Extract the identical definition once.

**e) Client factory**

```ts
export function createAnvilClients() {
  const transport = http(RPC_URL);
  const testClient = createTestClient({ mode: "anvil", chain: mainnet, transport });
  const publicClient = createPublicClient({ chain: mainnet, transport });
  const seller = createWalletClient({ account: sellerAccount, chain: mainnet, transport });
  const buyer = createWalletClient({ account: buyerAccount, chain: mainnet, transport });
  return { testClient, publicClient, seller, buyer };
}
```

**f) NFT transfer helper (the "Phase 0" impersonation dance)**

This 18-line pattern appears verbatim in all three scripts:

```ts
export async function transferNftTo(
  testClient: ReturnType<typeof createTestClient>,
  publicClient: PublicClient,
  nftAddress: `0x${string}`,
  tokenId: bigint,
  to: `0x${string}`,
): Promise<`0x${string}`> {
  const currentOwner = await publicClient.readContract({
    address: nftAddress,
    abi: erc721Abi,
    functionName: "ownerOf",
    args: [tokenId],
  });

  if (currentOwner.toLowerCase() === to.toLowerCase()) {
    return "0x" as `0x${string}`; // already owned, skip
  }

  await testClient.impersonateAccount({ address: currentOwner });

  const ownerWallet = createWalletClient({
    account: { address: currentOwner, type: "json-rpc" } as const,
    chain: mainnet,
    transport: http(RPC_URL),
  });

  const hash = await ownerWallet.writeContract({
    address: nftAddress,
    abi: erc721Abi,
    functionName: "transferFrom",
    args: [currentOwner, to, tokenId],
  });

  await testClient.mine({ blocks: 1 });
  await testClient.stopImpersonatingAccount({ address: currentOwner });

  return hash;
}
```

**g) Block timestamp helper**

```ts
export async function getBlockTimestamp(publicClient: PublicClient): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return block.timestamp;
}
```

**Expected impact**: Creates a single ~100-line file that replaces ~200 lines
of duplicated code across the three scripts.

---

### ST2. Simplify `scripts/list-and-buy.ts` ✅

**Status**: Done.

After ST1 is in place, rewrite `list-and-buy.ts` to import from
`helpers.ts`. The script should consist of:

1. **Imports** — viem, helpers, library exports
2. **Configuration unique to this script** — `LIST_PRICE`, `MARKETPLACE_FEE`
3. **`main()` function** — ~5 Phase blocks, each ~3–6 lines:

```
Phase 0: transfer Nft to seller     → transferNftTo(...)
Phase 1: get counter                → getCounter(...)
Phase 2: build order components     → inline object (unique to this flow)
Phase 3: sign + approve + fulfill   → signTypedData → writeContract(approve) → sendTransaction(fulfillBasicOrder)
Phase 4: verify                     → ownerOf check
```

**Specific removals**:

- Inline `SEAPORT_ADDRESS`, `SEAPORT_CTX`, keys, accounts → import from helpers
- Inline `erc721Abi` → import from helpers
- Client creation (15 lines) → `const { ... } = createAnvilClients()`
- Phase 0 (18 lines) → `transferNftTo(testClient, publicClient, ...)`
- `getBlock({ blockTag: "latest" }).timestamp` → `getBlockTimestamp(publicClient)`

**Expected impact**: `list-and-buy.ts` drops from ~180 lines to ~55 lines.
Every remaining line is domain-relevant to the "list and buy" flow.

---

### ST3. Simplify `scripts/bulk-list-and-buy.ts` ✅

**Status**: Done.

Same pattern as ST2. Replace inline boilerplate with helpers imports.

**Specific removals**:

- Inline `SEAPORT_ADDRESS`, `SEAPORT_CTX`, keys, accounts → import from helpers
- Inline `erc721Abi` → import from helpers
- Client creation (15 lines) → `const { ... } = createAnvilClients()`
- Phase 0 loop (transfers 4 NFTs, ~12 lines) → `transferNftTo(...)` in a loop
- `getBlock({ blockTag: "latest" }).timestamp` → `getBlockTimestamp(publicClient)`

**Keeps**: All bulk-order-specific logic (merkle tree, proofs, signature packing),
`priceFor()`, `feeFor()`, `TOKEN_IDS`, the two-step buy (single + batch).
These are the script's raison d'être and should remain in full detail.

**Expected impact**: `bulk-list-and-buy.ts` drops from ~350 lines to ~280 lines.

---

### ST4. Simplify `scripts/collection-offer-erc20.ts` ✅

**Status**: Done.

Same pattern. This script has an additional `wethAbi` that is not shared
(it is unique to the ERC20 flow). Keep it inline or export from helpers —
either is fine; if exported, name it clearly as `wethAbi` to avoid confusion
with the ERC721 ABI.

**Specific removals**:

- Inline `SEAPORT_ADDRESS`, `SEAPORT_CTX`, keys, accounts → import from helpers
- Inline `BAYC` address → already unique to this script, but could also live in helpers
- Inline `erc721Abi` → import from helpers
- Client creation (15 lines) → `const { ... } = createAnvilClients()`
- Phase 0 transfers (NFT loop, ~20 lines) → `transferNftTo(...)` in a loop
- `getBlock({ blockTag: "latest" }).timestamp` → `getBlockTimestamp(publicClient)`

**Keeps**: All collection-offer-specific logic (WETH ABI, WETH deposit/approve,
collection-wide order, partial fills, criteria resolvers). These are the
script's domain purpose.

**Expected impact**: `collection-offer-erc20.ts` drops from ~420 lines to ~350 lines.

---

### ST5. Update `scripts/README.md`

After ST1–ST4, update the README to:

- Document `helpers.ts` and what it provides
- Note that each script's code now focuses exclusively on the Seaport flow
  it demonstrates, with setup boilerplate delegated to helpers
- Keep the existing "What each script does" sections — they remain accurate
  for the domain logic

---

## Summary

| Subtask | What | Lines saved |
|---------|------|-------------|
| ST1 | New `scripts/helpers.ts` | +100 (new file) |
| ST2 | Simplify `list-and-buy.ts` | ~125 removed (180 → 55) |
| ST3 | Simplify `bulk-list-and-buy.ts` | ~70 removed (350 → 280) |
| ST4 | Simplify `collection-offer-erc20.ts` | ~70 removed (420 → 350) |
| ST5 | Update `scripts/README.md` | minor |

**Net impact**: ~265 lines of boilerplate eliminated across 3 scripts.
Every script's code becomes directly about the Seaport flow it demonstrates,
with a single `helpers.ts` ~100-line file that contains all shared setup.
