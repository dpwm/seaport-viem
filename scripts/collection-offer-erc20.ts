import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import type {
  AdvancedOrder,
  CriteriaResolver,
  FulfillmentComponent,
} from "../src/index";
import {
  ItemType,
  OrderType,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  getCounter,
  toOrderParameters,
  buildFulfillAvailableAdvancedOrders,
  buildFulfillAdvancedOrder,
  EIP712_TYPES,
} from "../src/index";
import type { SeaportContext, OrderComponents } from "../src/index";

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

const BAYC = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" as `0x${string}`;
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as `0x${string}`;

const BUYER_KEY =
  "0x08699d7b34d89931840055b297dc2acdead42f610818999537da938a504dc471" as `0x${string}`;
const SELLER_KEY =
  "0x84ce473bdcb5460191fb3201117551d16c2d83a3cd896b55f605a4649520d140" as `0x${string}`;
const FEE_RECIPIENT_KEY =
  "0x9ee26398e8cc317fef22505535526e2957c931ec365b2c9f029c3a71a685efaf" as `0x${string}`;

const buyerAccount = privateKeyToAccount(BUYER_KEY);
const sellerAccount = privateKeyToAccount(SELLER_KEY);
const feeRecipientAccount = privateKeyToAccount(FEE_RECIPIENT_KEY);

const RPC_URL = "http://127.0.0.1:8545";
const TOKEN_IDS = [3n, 4n, 5n, 6n] as const;
const PRICE_PER_NFT = 500000000000000000n; // 0.5 WETH each
const MARKETPLACE_FEE_PER_NFT = 15000000000000000n; // 0.015 WETH each (3%)

// ── Minimal ABIs ───────────────────────────────────────────────

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

const wethAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

// ── Main ───────────────────────────────────────────────────────

async function collectionOfferErc20() {
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

  const totalWeth = PRICE_PER_NFT * 4n + MARKETPLACE_FEE_PER_NFT * 4n;

  console.log("=== Seaport Collection Offer (ERC20 / WETH) ===\n");
  console.log(`Buyer:        ${buyerAccount.address}`);
  console.log(`Seller:       ${sellerAccount.address}`);
  console.log(`Fee recip:    ${feeRecipientAccount.address}`);
  console.log(`Collection:   BAYC (${BAYC})`);
  console.log(`Token IDs:    ${[...TOKEN_IDS].join(", ")}`);
  console.log(`Price/NFT:    ${formatUnits(PRICE_PER_NFT, 18)} WETH`);
  console.log(`Fee/NFT:      ${formatUnits(MARKETPLACE_FEE_PER_NFT, 18)} WETH`);
  console.log(`Total WETH:   ${formatUnits(totalWeth, 18)} WETH`);

  // ── Phase 0: Setup — fund accounts and transfer NFTs ──────

  console.log("\n[0] Setting up accounts...");

  await testClient.setBalance({
    address: buyerAccount.address,
    value: 10_000000000000000000n,
  });
  await testClient.setBalance({
    address: sellerAccount.address,
    value: 1_000000000000000000n,
  });

  // Mint WETH to buyer by calling deposit()
  console.log("    Minting WETH to buyer...");
  const depositHash = await buyer.sendTransaction({
    to: WETH,
    value: totalWeth,
    data: "0xd0e30db0", // deposit() selector
  });
  await testClient.mine({ blocks: 1 });
  console.log(`    WETH deposited (tx: ${depositHash.slice(0, 18)}...)`);

  const buyerWeth = await publicClient.readContract({
    address: WETH,
    abi: wethAbi,
    functionName: "balanceOf",
    args: [buyerAccount.address],
  });
  console.log(`    Buyer WETH balance: ${formatUnits(buyerWeth, 18)}`);

  // Transfer BAYC NFTs to seller
  console.log("    Transferring BAYCs to seller...");
  for (const tokenId of TOKEN_IDS) {
    const currentOwner = await publicClient.readContract({
      address: BAYC,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [tokenId],
    });

    if (currentOwner.toLowerCase() === sellerAccount.address.toLowerCase()) {
      console.log(`    BAYC #${tokenId}: seller already owns it`);
      continue;
    }

    console.log(`    BAYC #${tokenId}: owner is ${currentOwner.slice(0, 10)}...`);
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

    const newOwner = await publicClient.readContract({
      address: BAYC,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [tokenId],
    });
    const ok = newOwner.toLowerCase() === sellerAccount.address.toLowerCase();
    console.log(`    BAYC #${tokenId}: ${ok ? "transferred" : "FAILED — still owned by " + newOwner.slice(0, 10)} (tx: ${hash.slice(0, 18)}...)`);
  }

  // ── Step 1: Buyer approves WETH to Seaport (they're offering WETH) ─

  console.log("\n[1] Buyer approving WETH to Seaport...");
  const approveWethHash = await buyer.writeContract({
    address: WETH,
    abi: wethAbi,
    functionName: "approve",
    args: [SEAPORT_ADDRESS, totalWeth],
  });
  await testClient.mine({ blocks: 1 });
  console.log(`    Approved (tx: ${approveWethHash.slice(0, 18)}...)`);

  // ── Step 2: Seller approves BAYC to Seaport (they'll give NFTs) ─────

  console.log("\n[2] Seller approving BAYC to Seaport...");
  const approveBaycHash = await seller.writeContract({
    address: BAYC,
    abi: erc721Abi,
    functionName: "setApprovalForAll",
    args: [SEAPORT_ADDRESS, true],
  });
  await testClient.mine({ blocks: 1 });
  console.log(`    Approved (tx: ${approveBaycHash.slice(0, 18)}...)`);

  // ── Step 3: Build collection offer order ─────────────────

  console.log("\n[3] Building collection offer...");

  const counter = await getCounter(
    publicClient,
    SEAPORT_CTX,
    buyerAccount.address, // BUYER creates the collection OFFER to buy NFTs
  );
  console.log(`    Buyer counter: ${counter}`);

  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const now = latestBlock.timestamp;

  // BUYER creates collection OFFER to BUY BAYCs:
  // - offer = what BUYER GIVES (WETH - to pay for NFTs)
  // - consideration = what BUYER RECEIVES (BAYC NFTs)
  // When fulfilled: fulfiller gives BAYC, receives WETH
  const NUM_FILLS = 4n;
  const orderComponents: OrderComponents = {
    offerer: buyerAccount.address, // Buyer is offerer (wants to buy)
    zone: ZERO_ADDRESS,
    offer: [
      {
        itemType: ItemType.ERC20,
        token: WETH,
        identifierOrCriteria: 0n,
        startAmount: PRICE_PER_NFT * NUM_FILLS,
        endAmount: PRICE_PER_NFT * NUM_FILLS,
      },
      {
        itemType: ItemType.ERC20,
        token: WETH,
        identifierOrCriteria: 0n,
        startAmount: MARKETPLACE_FEE_PER_NFT * NUM_FILLS,
        endAmount: MARKETPLACE_FEE_PER_NFT * NUM_FILLS,
      },
    ],
    consideration: [
      {
        itemType: ItemType.ERC721_WITH_CRITERIA,
        token: BAYC,
        identifierOrCriteria: 0n,
        startAmount: NUM_FILLS,
        endAmount: NUM_FILLS,
        recipient: buyerAccount.address,
      },
    ],
    orderType: OrderType.PARTIAL_OPEN,
    startTime: now,
    endTime: now + 3600n,
    zoneHash: ZERO_BYTES32,
    salt: 42n,
    conduitKey: ZERO_BYTES32,
    counter,
  };

  console.log(`    Offer: ${NUM_FILLS}x any BAYC (ERC721_WITH_CRITERIA, wildcard)`);
  console.log(`    Consideration: ${formatUnits(PRICE_PER_NFT * NUM_FILLS, 18)} WETH + ${formatUnits(MARKETPLACE_FEE_PER_NFT * NUM_FILLS, 18)} WETH fee`);
  console.log(`    Per fill (1/${NUM_FILLS}): ${formatUnits(PRICE_PER_NFT, 18)} WETH + ${formatUnits(MARKETPLACE_FEE_PER_NFT, 18)} WETH fee`);

  // ── Step 4: Sign the order (EIP-712) ────────────────────

  console.log("\n[4] Signing order...");
  const signature = await buyer.signTypedData({
    domain: SEAPORT_CTX.domain,
    types: EIP712_TYPES,
    primaryType: "OrderComponents",
    message: orderComponents,
  });
  console.log(`    Signed: ${signature.slice(0, 18)}...`);

  // ── Step 5: Build 4 partial-fill orders ─────────────────

  console.log("\n[5] Preparing batch fulfillment...");

  const orderParams = toOrderParameters(
    orderComponents,
    BigInt(orderComponents.consideration.length),
  );

  // 4 copies of the same order, each filling 1/4
  const advancedOrders: AdvancedOrder[] = TOKEN_IDS.map(() => ({
    parameters: orderParams,
    numerator: 1n,
    denominator: 4n,
    signature,
    extraData: "0x" as `0x${string}`,
  }));

  // CriteriaResolvers: map each order's wildcard to a specific BAYC token
  const criteriaResolvers: CriteriaResolver[] = TOKEN_IDS.map(
    (tokenId, i) => ({
      orderIndex: BigInt(i),
      side: 0, // Side.OFFER
      index: 0n,
      identifier: tokenId,
      criteriaProof: [] as `0x${string}`[], // empty proof for wildcard
    }),
  );

  // Offer fulfillments: each order provides its BAYC
  const offerFulfillments: FulfillmentComponent[][] = TOKEN_IDS.map(
    (_, i) => [{ orderIndex: BigInt(i), itemIndex: 0n }],
  );

  // Consideration fulfillments: WETH payments grouped by recipient
  // Group 0: all WETH payments to buyer (consideration index 0 across all orders)
  // Group 1: all fees to fee recipient (consideration index 1 across all orders)
  const considerationFulfillments: FulfillmentComponent[][] = [
    TOKEN_IDS.map((_, i) => ({
      orderIndex: BigInt(i),
      itemIndex: 0n,
    })),
    TOKEN_IDS.map((_, i) => ({
      orderIndex: BigInt(i),
      itemIndex: 1n,
    })),
  ];

  // ── Step 6: Verify seller owns all BAYCs ────────────────

  console.log("\n[6] Verifying seller owns all BAYCs...");
  for (const tokenId of TOKEN_IDS) {
    const owner = await publicClient.readContract({
      address: BAYC,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [tokenId],
    });
    const ok = owner.toLowerCase() === sellerAccount.address.toLowerCase();
    console.log(`    BAYC #${tokenId}: ${ok ? "✓ seller" : "✗ " + owner.slice(0, 10) + "..."}`);
    if (!ok) {
      throw new Error(`Seller does not own BAYC #${tokenId}`);
    }
  }

  // ── Step 7: Buyer fulfills their own collection offer ─────

  console.log("\n[7] Seller fulfills collection offer (BAYC #3)...");

  const singleAdvancedOrder: AdvancedOrder = {
    parameters: orderParams,
    numerator: 1n,
    denominator: 4n,
    signature,
    extraData: "0x" as `0x${string}`,
  };

  const singleCriteriaResolver: CriteriaResolver[] = [{
    orderIndex: 0n,
    side: 1, // Side.CONSIDERATION - resolving which BAYC buyer receives
    index: 0n,
    identifier: TOKEN_IDS[0]!,
    criteriaProof: [] as `0x${string}`[],
  }];

  const singleFulfillment = buildFulfillAdvancedOrder(
    SEAPORT_CTX,
    singleAdvancedOrder,
    singleCriteriaResolver,
  );

  console.log(`    Calldata: ${singleFulfillment.data.slice(0, 18)}...`);

  // Seller (who has NFTs) fulfills: gives BAYC, receives WETH
  const singleTxHash = await seller.sendTransaction({
    to: singleFulfillment.to,
    data: singleFulfillment.data,
    value: singleFulfillment.value,
  });
  await testClient.mine({ blocks: 1 });
  console.log(`    Single fulfill tx: ${singleTxHash}`);

  const ownerAfter = await publicClient.readContract({
    address: BAYC,
    abi: erc721Abi,
    functionName: "ownerOf",
    args: [TOKEN_IDS[0]!],
  });
  console.log(`    BAYC #${TOKEN_IDS[0]} owner: ${ownerAfter.slice(0, 10)}... (buyer: ${ownerAfter.toLowerCase() === buyerAccount.address.toLowerCase()})`);

  // ── Step 8: Seller fulfills remaining 3 one by one ─────────

  console.log("\n[8] Seller fulfills remaining 3 BAYCs one by one...");

  const remainingIds = [...TOKEN_IDS].slice(1);

  for (const tokenId of remainingIds) {
    const advancedOrder: AdvancedOrder = {
      parameters: orderParams,
      numerator: 1n,
      denominator: 4n,
      signature,
      extraData: "0x" as `0x${string}`,
    };

    const criteriaResolver: CriteriaResolver[] = [{
      orderIndex: 0n,
      side: 1,
      index: 0n,
      identifier: tokenId,
      criteriaProof: [] as `0x${string}`[],
    }];

    const fulfill = buildFulfillAdvancedOrder(
      SEAPORT_CTX,
      advancedOrder,
      criteriaResolver,
    );

    const txHash = await seller.sendTransaction({
      to: fulfill.to,
      data: fulfill.data,
      value: fulfill.value,
    });
    await testClient.mine({ blocks: 1 });
    console.log(`    BAYC #${tokenId} fulfilled (tx: ${txHash.slice(0, 18)}...)`);
  }

  // ── Step 9: Verify ──────────────────────────────────────

  console.log("\n=== Result ===\n");

  for (const tokenId of TOKEN_IDS) {
    const owner = await publicClient.readContract({
      address: BAYC,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [tokenId],
    });
    const ok = owner.toLowerCase() === buyerAccount.address.toLowerCase();
    console.log(
      `BAYC #${tokenId}: ${ok ? "✓ buyer" : "✗ not buyer"} (${owner.slice(0, 10)}...)`,
    );
  }

  const buyerWethFinal = await publicClient.readContract({
    address: WETH,
    abi: wethAbi,
    functionName: "balanceOf",
    args: [buyerAccount.address],
  });
  const wethSpent = totalWeth - buyerWethFinal;

  console.log(`\nBuyer WETH spent: ${formatUnits(wethSpent, 18)}`);
  console.log(
    `Seller WETH received: ${formatUnits(PRICE_PER_NFT * 4n, 18)}`,
  );
  console.log(
    `Fee recipient WETH: ${formatUnits(MARKETPLACE_FEE_PER_NFT * 4n, 18)}`,
  );
  console.log(
    "\n✓ 4 BAYCs transferred from 1 buyer collection offer (ERC20)!",
  );
}

// ── Entry ──────────────────────────────────────────────────────

collectionOfferErc20().catch((err) => {
  console.error("Trade failed:", err);
  process.exit(1);
});
