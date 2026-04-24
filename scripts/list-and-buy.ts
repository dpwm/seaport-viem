import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import {
  ItemType,
  OrderType,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  getCounter,
  buildBasicOrderFulfillment,
  EIP712_TYPES,
} from "../src/index";
import type { SeaportContext, OrderComponents, Order } from "../src/index";

// ── Configuration ──────────────────────────────────────────────

const SEAPORT_ADDRESS =
  "0x0000000000000068F116a894984e2DB1123eB395" as `0x${string}`;

const SEAPORT_CTX: SeaportContext = {
  address: SEAPORT_ADDRESS,
  domain: {
    name: "Seaport",
    version: "1.6",
    chainId: 1,
    verifyingContract: SEAPORT_ADDRESS,
  },
};

// Fresh keys — avoids collisions with Anvil's forked state
const SELLER_KEY =
  "0x84ce473bdcb5460191fb3201117551d16c2d83a3cd896b55f605a4649520d140" as `0x${string}`;
const BUYER_KEY =
  "0x08699d7b34d89931840055b297dc2acdead42f610818999537da938a504dc471" as `0x${string}`;
const FEE_RECIPIENT_KEY =
  "0x9ee26398e8cc317fef22505535526e2957c931ec365b2c9f029c3a71a685efaf" as `0x${string}`;

const sellerAccount = privateKeyToAccount(SELLER_KEY);
const buyerAccount = privateKeyToAccount(BUYER_KEY);
const feeRecipientAccount = privateKeyToAccount(FEE_RECIPIENT_KEY);

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
    name: "transferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// ── Main ───────────────────────────────────────────────────────

async function listAndBuy(nftAddress: `0x${string}`, tokenId: bigint) {
  const transport = http(RPC_URL);

  const testClient = createTestClient({
    mode: "anvil",
    chain: mainnet,
    transport,
  });

  const publicClient = createPublicClient({
    chain: mainnet,
    transport,
  });

  const buyer = createWalletClient({
    account: buyerAccount,
    chain: mainnet,
    transport,
  });

  const seller = createWalletClient({
    account: sellerAccount,
    chain: mainnet,
    transport,
  });

  // ── Phase 0: Transfer NFT from current owner to seller ─────

  const currentOwner = await publicClient.readContract({
    address: nftAddress,
    abi: erc721Abi,
    functionName: "ownerOf",
    args: [tokenId],
  });

  console.log("=== Seaport List & Buy ===\n");
  console.log(`NFT:          ${nftAddress} #${tokenId}`);
  console.log(`Current owner: ${currentOwner}`);
  console.log(`Seller:       ${sellerAccount.address}`);
  console.log(`Buyer:        ${buyerAccount.address}`);
  console.log(`Fee recip:    ${feeRecipientAccount.address}`);
  console.log(`Price:        ${formatEther(LIST_PRICE)} ETH`);
  console.log(`Fee:          ${formatEther(MARKETPLACE_FEE)} ETH`);

  // Fund seller and buyer
  await testClient.setBalance({
    address: sellerAccount.address,
    value: 10_000000000000000000n,
  });
  await testClient.setBalance({
    address: buyer.account.address,
    value: 10_000000000000000000n,
  });

  // Impersonate current owner and transfer NFT to seller
  console.log("\n[0] Transferring NFT from current owner to seller...");
  await testClient.impersonateAccount({ address: currentOwner });

  const ownerWallet = createWalletClient({
    account: { address: currentOwner, type: "json-rpc" } as const,
    chain: mainnet,
    transport,
  });
  const transferHash = await ownerWallet.writeContract({
    address: nftAddress,
    abi: erc721Abi,
    functionName: "transferFrom",
    args: [currentOwner, sellerAccount.address, tokenId],
  });
  await testClient.mine({ blocks: 1 });
  await testClient.stopImpersonatingAccount({ address: currentOwner });
  console.log(`    Transferred (tx: ${transferHash.slice(0, 18)}...)`);

  // ── Step 1: Get counter ────────────────────────────────────

  const counter = await getCounter(
    publicClient,
    SEAPORT_CTX,
    sellerAccount.address,
  );
  console.log(`\n[1] Seller counter: ${counter}`);

  // ── Step 2: Build order ────────────────────────────────────

  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const now = latestBlock.timestamp;
  const orderComponents: OrderComponents = {
    offerer: sellerAccount.address,
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
        recipient: sellerAccount.address,
      },
      {
        itemType: ItemType.NATIVE,
        token: ZERO_ADDRESS,
        identifierOrCriteria: 0n,
        startAmount: MARKETPLACE_FEE,
        endAmount: MARKETPLACE_FEE,
        recipient: feeRecipientAccount.address,
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
  await testClient.mine({ blocks: 1 });
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
  await testClient.mine({ blocks: 1 });
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
}

// ── Entry ──────────────────────────────────────────────────────

const BAYC = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" as `0x${string}`;
const TOKEN_ID = 3n;

listAndBuy(BAYC, TOKEN_ID).catch((err) => {
  console.error("Trade failed:", err);
  process.exit(1);
});
