import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import type { FulfillmentComponent } from "../src/index";
import {
  ItemType,
  OrderType,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  seaportAbi,
  getCounter,
  computeHeight,
  padLeaves,
  buildBulkOrderTree,
  hashBulkOrder,
  getProof,
  packBulkSignature,
  toOrderParameters,
  buildFulfillOrder,
  buildFulfillAvailableOrders,
} from "../src/index";
import type { SeaportContext, OrderComponents, OrderParameters } from "../src/index";

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
const MARKETPLACE_FEE_BPS = 300n; // 3% = 300 basis points
const BPS_DENOMINATOR = 10000n;

const TOKEN_IDS = [3n, 4n, 5n, 6n] as const;

function priceFor(tokenId: bigint): bigint {
  const prices: Record<string, bigint> = {
    "3": 1_000000000000000000n,  // 1.0 ETH
    "4": 1_500000000000000000n,  // 1.5 ETH
    "5": 2_000000000000000000n,  // 2.0 ETH
    "6": 500000000000000000n,    // 0.5 ETH
  };
  // biome-ignore lint/style/noNonNullAssertion: tokenId is always in the set
  return prices[String(tokenId)]!;
}

function feeFor(tokenId: bigint): bigint {
  return (priceFor(tokenId) * MARKETPLACE_FEE_BPS) / BPS_DENOMINATOR;
}

const erc721Abi = [
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "setApprovalForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
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

async function bulkListAndBuy() {
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

  console.log("=== Seaport Bulk List & Buy ===\n");
  console.log(`Seller:       ${sellerAccount.address}`);
  console.log(`Buyer:        ${buyerAccount.address}`);
  console.log(`NFTs:         ${TOKEN_IDS.map((id) => `#${id}`).join(", ")}`);

  for (const id of TOKEN_IDS) {
    console.log(`  #${id}: ${formatEther(priceFor(id))} ETH (+ ${formatEther(feeFor(id))} ETH fee)`);
  }

  // Fund seller and buyer
  await testClient.setBalance({
    address: sellerAccount.address,
    value: 1_000000000000000000n,
  });
  await testClient.setBalance({
    address: buyer.account.address,
    value: 50_000000000000000000n,
  });

  // ── Phase 0: Transfer NFTs to seller ─────────────────────

  const BAYC = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" as `0x${string}`;

  console.log("\n[0] Transferring NFTs to seller...");

  for (const tokenId of TOKEN_IDS) {
    const currentOwner = await publicClient.readContract({
      address: BAYC,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [tokenId],
    });

    await testClient.impersonateAccount({ address: currentOwner });

    const ownerWallet = createWalletClient({
      account: { address: currentOwner, type: "json-rpc" } as const,
      chain: mainnet,
      transport,
    });
    const hash = await ownerWallet.writeContract({
      address: BAYC,
      abi: erc721Abi,
      functionName: "transferFrom",
      args: [currentOwner, sellerAccount.address, tokenId],
    });
    await testClient.mine({ blocks: 1 });
    await testClient.stopImpersonatingAccount({ address: currentOwner });
    console.log(`    #${tokenId}: transferred (tx: ${hash.slice(0, 18)}...)`);
  }

  // ── Phase 1: Approve all NFTs to Seaport ─────────────────

  console.log("\n[1] Approving all NFTs to Seaport...");
  const approveHash = await seller.writeContract({
    address: BAYC,
    abi: erc721Abi,
    functionName: "setApprovalForAll",
    args: [SEAPORT_ADDRESS, true],
  });
  await testClient.mine({ blocks: 1 });
  console.log(`    Approved (tx: ${approveHash.slice(0, 18)}...)`);

  // ── Phase 2: Build order components ───────────────────────

  console.log("\n[2] Building order components...");

  const counter = await getCounter(
    publicClient,
    SEAPORT_CTX,
    sellerAccount.address,
  );
  console.log(`    Seller counter: ${counter}`);

  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const now = latestBlock.timestamp;

  const allOrderComponents: OrderComponents[] = TOKEN_IDS.map(
    (tokenId, i) => ({
      offerer: sellerAccount.address,
      zone: ZERO_ADDRESS,
      offer: [
        {
          itemType: ItemType.ERC721,
          token: BAYC,
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
          startAmount: priceFor(tokenId),
          endAmount: priceFor(tokenId),
          recipient: sellerAccount.address,
        },
        {
          itemType: ItemType.NATIVE,
          token: ZERO_ADDRESS,
          identifierOrCriteria: 0n,
          startAmount: feeFor(tokenId),
          endAmount: feeFor(tokenId),
          recipient: feeRecipientAccount.address,
        },
      ],
      orderType: OrderType.FULL_OPEN,
      startTime: now,
      endTime: now + 3600n,
      zoneHash: ZERO_BYTES32,
      salt: BigInt(i + 1),
      conduitKey: ZERO_BYTES32,
      counter,
    }),
  );

  for (let i = 0; i < TOKEN_IDS.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index is in bounds
    const tokenId = TOKEN_IDS[i]!;
    console.log(
      `    Order ${i}: BAYC #${tokenId} for ${formatEther(priceFor(tokenId))} ETH`,
    );
  }

  // ── Phase 3: Build bulk order tree ────────────────────────

  console.log("\n[3] Getting order hashes from contract...");

  // Use on-chain getOrderHash for correct leaf hashes
  const leaves = await Promise.all(
    allOrderComponents.map((oc) =>
      publicClient.readContract({
        address: SEAPORT_ADDRESS,
        abi: seaportAbi,
        functionName: "getOrderHash",
        args: [oc],
      }),
    ),
  );

  for (let i = 0; i < leaves.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index is in bounds
    console.log(`    Leaf ${i}: ${leaves[i]!.slice(0, 18)}...`);
  }

  const paddedLeaves = padLeaves(leaves);
  const layers = buildBulkOrderTree(paddedLeaves);
  const root = layers[layers.length - 1]![0]!;
  const height = computeHeight(paddedLeaves.length);

  // ── Phase 4: Sign bulk order ──────────────────────────────

  console.log("\n[4] Signing bulk order...");

  const digest = hashBulkOrder(SEAPORT_CTX, root, height);

  const rawSig = await seller.account.sign({ hash: digest });
  const r = rawSig.slice(0, 66) as `0x${string}`;
  const s = ("0x" + rawSig.slice(66, 130)) as `0x${string}`;
  const yParity = (Number.parseInt(rawSig.slice(130, 132), 16) - 27) as 0 | 1;

  console.log(`    Signed: ${rawSig.slice(0, 18)}...`);
  console.log(`    r: ${r}`);
  console.log(`    s: ${s}`);
  console.log(`    yParity: ${yParity}`);
  console.log(`    digest: ${digest}`);

  // ── Phase 5: Pack signatures & prepare listings ───────────

  console.log("\n[5] Preparing listings...");

  const listings: { parameters: OrderParameters; signature: `0x${string}` }[] = [];

  for (let i = 0; i < allOrderComponents.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index is in bounds
    const oc = allOrderComponents[i]!;
    const proof = getProof(layers, i);
    const packedSig = packBulkSignature({ r, s, yParity }, i, proof);
    const params = toOrderParameters(
      oc,
      BigInt(oc.consideration.length),
    );
    listings.push({ parameters: params, signature: packedSig });
    console.log(
      `    Listing ${i}: BAYC #${TOKEN_IDS[i]} — packed sig length: ${(packedSig.length - 2) / 2} bytes`,
    );
  }

  // ── Phase 6: Buy 1 individually ──────────────────────────

  console.log("\n[6] Buying BAYC #3 individually (fulfillOrder)...");

  const singleListing = listings[0]!;
  const singleFulfillment = buildFulfillOrder(SEAPORT_CTX, singleListing);
  console.log(`    Value: ${formatEther(singleFulfillment.value)} ETH`);

  const buyerBalanceBefore = await publicClient.getBalance({
    address: buyer.account.address,
  });

  const tx1 = await buyer.sendTransaction({
    to: singleFulfillment.to,
    data: singleFulfillment.data,
    value: singleFulfillment.value,
  });
  await testClient.mine({ blocks: 1 });
  console.log(`    Tx: ${tx1}`);

  const owner3 = await publicClient.readContract({
    address: BAYC,
    abi: erc721Abi,
    functionName: "ownerOf",
    args: [TOKEN_IDS[0]!],
  });
  console.log(
    `    BAYC #${TOKEN_IDS[0]} owner: ${owner3.slice(0, 10)}... ${owner3.toLowerCase() === buyer.account.address.toLowerCase() ? "✓" : "✗"}`,
  );

  // ── Phase 7: Buy 3 together ──────────────────────────────

  console.log("\n[7] Buying BAYC #4, #5, #6 together (fulfillAvailableOrders)...");

  const remainingListings = listings.slice(1);

  // Provide fulfillment components for 3 orders
  const offerFulfillments = remainingListings.map((_, i) => [
    { orderIndex: BigInt(i), itemIndex: 0n },
  ]);
  // Each consideration item with a different recipient must be in its own group.
  // Order i has: consideration[0] = price to seller, consideration[1] = fee to fee recipient
  const considerationFulfillments = remainingListings.flatMap((_, i) => [
    [{ orderIndex: BigInt(i), itemIndex: 0n }],  // price to seller
    [{ orderIndex: BigInt(i), itemIndex: 1n }],  // fee to fee recipient
  ]);

  const batchFulfillment = buildFulfillAvailableOrders(
    SEAPORT_CTX,
    remainingListings,
    offerFulfillments,
    considerationFulfillments,
  );
  console.log(`    Value: ${formatEther(batchFulfillment.value)} ETH`);

  const tx2 = await buyer.sendTransaction({
    to: batchFulfillment.to,
    data: batchFulfillment.data,
    value: batchFulfillment.value,
  });
  await testClient.mine({ blocks: 1 });
  console.log(`    Tx: ${tx2}`);

  const buyerBalanceAfter = await publicClient.getBalance({
    address: buyer.account.address,
  });

  // ── Phase 8: Verify ──────────────────────────────────────

  console.log("\n=== Result ===\n");

  for (const tokenId of TOKEN_IDS) {
    const owner = await publicClient.readContract({
      address: BAYC,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [tokenId],
    });
    const ok = owner.toLowerCase() === buyer.account.address.toLowerCase();
    console.log(
      `BAYC #${tokenId}: ${ok ? "✓ buyer" : "✗ not buyer"} (${owner.slice(0, 10)}...)`,
    );
  }

  console.log(`\nBuyer ETH spent: ${formatEther(buyerBalanceBefore - buyerBalanceAfter)} ETH`);
  console.log(
    "\n✓ All 4 NFTs purchased with 2 transactions from 1 seller signature!",
  );
}

// ── Entry ──────────────────────────────────────────────────────

bulkListAndBuy().catch((err) => {
  console.error("Trade failed:", err);
  process.exit(1);
});
