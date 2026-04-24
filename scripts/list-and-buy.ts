import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  formatEther,
  getAccount,
} from "viem";
import { mainnet } from "viem/chains";
import {
  ItemType,
  OrderType,
  BasicOrderRouteType,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  getCounter,
  buildBasicOrderFulfillment,
  EIP712_TYPES,
} from "../src/index";
import type { SeaportContext, OrderComponents, Order } from "../src/index";

// ── Configuration ──────────────────────────────────────────────

const SEAPORT_ADDRESS =
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC" as `0x${string}`;

const SEAPORT_CTX: SeaportContext = {
  address: SEAPORT_ADDRESS,
  domain: {
    name: "Seaport",
    version: "1.6",
    chainId: 1,
    verifyingContract: SEAPORT_ADDRESS,
  },
};

// Anvil default account (index 1) — the buyer
const BUYER_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`;

// Anvil default accounts (index 0–9) — detect if NFT owner is one of these
const ANVIL_PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
] as const;

const RPC_URL = "http://127.0.0.1:8545";
const LIST_PRICE = 1_000000000000000000n; // 1 ETH
const MARKETPLACE_FEE = 30000000000000000n; // 0.03 ETH

const erc721Abi = [
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ── Main ───────────────────────────────────────────────────────

async function listAndBuy(nftAddress: `0x${string}`, tokenId: bigint) {
  const transport = http(RPC_URL);

  const client = createTestClient({
    mode: "anvil",
    chain: mainnet,
    transport,
  });

  const publicClient = createPublicClient({
    chain: mainnet,
    transport,
  });

  const buyer = createWalletClient({
    account: getAccount(BUYER_PRIVATE_KEY),
    chain: mainnet,
    transport,
  });

  // Resolve NFT owner
  const rawOwner = await publicClient.readContract({
    address: nftAddress,
    abi: erc721Abi,
    functionName: "ownerOf",
    args: [tokenId],
  });
  const owner = rawOwner.toLowerCase() as `0x${string}`;

  // Determine seller wallet — use known private key if available, else impersonate
  const ownerIndex = ANVIL_PRIVATE_KEYS.findIndex((pk) => {
    const { address } = getAccount(pk as `0x${string}`);
    return address.toLowerCase() === owner;
  });

  let seller: ReturnType<typeof createWalletClient>;
  let needsImpersonation: boolean;

  if (ownerIndex !== -1) {
    seller = createWalletClient({
      account: getAccount(ANVIL_PRIVATE_KEYS[ownerIndex] as `0x${string}`),
      chain: mainnet,
      transport,
    });
    needsImpersonation = false;
  } else {
    await client.impersonateAccount({ address: owner });
    seller = createWalletClient({
      account: getAccount(owner),
      chain: mainnet,
      transport,
    });
    needsImpersonation = true;
  }

  // ── Setup ──────────────────────────────────────────────────

  console.log("=== Seaport List & Buy ===\n");
  console.log(`NFT:        ${nftAddress} #${tokenId}`);
  console.log(`Seller:     ${owner}`);
  console.log(`Buyer:      ${buyer.account.address}`);
  console.log(`Price:      ${formatEther(LIST_PRICE)} ETH`);
  console.log(`Fee:        ${formatEther(MARKETPLACE_FEE)} ETH`);

  // Ensure buyer has funds
  await client.setBalance({
    address: buyer.account.address,
    value: 10_000000000000000000n,
  });

  // Verify ownership
  const bal = await publicClient.readContract({
    address: nftAddress,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: [owner],
  });
  console.log(`\nSeller owns ${bal} token(s) from this collection`);

  // ── Step 1: Get counter ────────────────────────────────────

  const counter = await getCounter(publicClient, SEAPORT_CTX, owner);
  console.log(`\n[1] Seller counter: ${counter}`);

  // ── Step 2: Build order ────────────────────────────────────

  const now = BigInt(Math.floor(Date.now() / 1000));
  const orderComponents: OrderComponents = {
    offerer: owner,
    zone: ZERO_ADDRESS,
    offer: [
      {
        itemType: ItemType.ERC721,
        token: nftAddress,
        identifierOrCriteria: tokenId,
        startAmount: 1n,
        endAmount: 1n,
      },
    ],
    consideration: [
      {
        itemType: ItemType.NATIVE,
        token: ZERO_ADDRESS,
        identifierOrCriteria: 0n,
        startAmount: LIST_PRICE,
        endAmount: LIST_PRICE,
        recipient: owner,
      },
      {
        itemType: ItemType.NATIVE,
        token: ZERO_ADDRESS,
        identifierOrCriteria: 0n,
        startAmount: MARKETPLACE_FEE,
        endAmount: MARKETPLACE_FEE,
        recipient: "0x0000000000000000000000000000000000000001" as `0x${string}`,
      },
    ],
    orderType: OrderType.FULL_OPEN,
    startTime: now,
    endTime: now + 3600n,
    zoneHash: ZERO_BYTES32,
    salt: 42n,
    conduitKey: ZERO_BYTES32,
    counter,
  };
  console.log("[2] Order components built");

  // ── Step 3: Sign order (EIP-712) ──────────────────────────

  const signature = await seller.signTypedData({
    domain: SEAPORT_CTX.domain,
    types: EIP712_TYPES,
    primaryType: "OrderComponents",
    message: orderComponents,
  });
  console.log(`[3] Order signed: ${signature.slice(0, 18)}...`);

  const order: Order = { parameters: orderComponents, signature };

  // ── Step 4: Approve NFT ────────────────────────────────────

  const approveHash = await seller.writeContract({
    address: nftAddress,
    abi: erc721Abi,
    functionName: "approve",
    args: [SEAPORT_ADDRESS, tokenId],
  });
  await client.mine({ blocks: 1 });
  console.log(`[4] NFT approved to Seaport (tx: ${approveHash.slice(0, 18)}...)`);

  // ── Step 5: Fulfill order ──────────────────────────────────

  const fulfillment = buildBasicOrderFulfillment(SEAPORT_CTX, order);
  console.log(`[5] Fulfillment calldata: ${fulfillment.data.slice(0, 18)}...`);
  console.log(`    Value: ${formatEther(fulfillment.value)} ETH`);

  const buyerBalanceBefore = await publicClient.getBalance({
    address: buyer.account.address,
  });

  const txHash = await buyer.sendTransaction({
    to: fulfillment.to,
    data: fulfillment.data,
    value: fulfillment.value,
  });
  await client.mine({ blocks: 1 });
  console.log(`[6] Fulfill tx: ${txHash}`);

  // ── Step 6: Verify ─────────────────────────────────────────

  const newOwner = await publicClient.readContract({
    address: nftAddress,
    abi: erc721Abi,
    functionName: "ownerOf",
    args: [tokenId],
  });

  const buyerBalanceAfter = await publicClient.getBalance({
    address: buyer.account.address,
  });

  console.log("\n=== Result ===\n");
  console.log(`NFT owner:       ${newOwner}`);
  console.log(`Buyer balance:   ${formatEther(buyerBalanceAfter)} ETH`);
  console.log(
    `ETH spent:       ${formatEther(buyerBalanceBefore - buyerBalanceAfter)} ETH`,
  );
  console.log(
    newOwner.toLowerCase() === buyer.account.address.toLowerCase()
      ? "\n✓ NFT transferred to buyer!"
      : "\n✗ Transfer failed",
  );

  // Cleanup
  if (needsImpersonation) {
    await client.stopImpersonatingAccount({ address: owner });
  }
}

// ── Entry ──────────────────────────────────────────────────────

const nftAddress = process.argv[2] as `0x${string}` | undefined;
const tokenId = process.argv[3];

if (!nftAddress || !tokenId) {
  console.error("Usage: bun run scripts/list-and-buy.ts <nftAddress> <tokenId>");
  process.exit(1);
}

listAndBuy(nftAddress, BigInt(tokenId)).catch((err) => {
  console.error("Trade failed:", err);
  process.exit(1);
});
