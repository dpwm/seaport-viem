import { formatEther, formatUnits, hexToBigInt } from "viem";
import {
  SEAPORT_ADDRESS,
  SEAPORT_CTX,
  sellerAccount,
  buyerAccount,
  feeRecipientAccount,
  erc721Abi,
  createAnvilClients,
  transferNftTo,
  getBlockTimestamp,
} from "./helpers.ts";
import type {
  AdvancedOrder,
  CriteriaResolver,
  OrderComponents,
  Order,
} from "../src/index";
import {
  ItemType,
  OrderType,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  Side,
  getCounter,
  toOrderParameters,
  buildFulfillAdvancedOrder,
  buildBasicOrderFulfillment,
  EIP712_TYPES,
  buildCriteriaTree,
  getCriteriaRoot,
  getCriteriaProof,
  verifyCriteriaProof,
  hashCriteriaLeaf,
} from "../src/index";

// ── Configuration ─────────────────────────────────────────────

const BAYC = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" as `0x${string}`;
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as `0x${string}`;
const TOKEN_IDS = [3n, 4n, 5n, 6n] as const;
const TOTAL_TOKENS = BigInt(TOKEN_IDS.length); // 4

const PRICE_PER_NFT = 1_000000000000000000n; // 1 ETH / WETH
const FEE_PER_NFT = 30000000000000000n; // 0.03 ETH / WETH (3%)

// How many the seller fulfills via the offer vs lists for sale
const OFFER_FILLS = 2;
const LIST_COUNT = TOKEN_IDS.length - OFFER_FILLS; // 2

// ── WETH ABI (for deposit/approve/balance) ────────────────────

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

async function bulkOfferAndSell() {
  const { testClient, publicClient, seller, buyer } = createAnvilClients();

  const totalWeth = PRICE_PER_NFT * TOTAL_TOKENS + FEE_PER_NFT * TOTAL_TOKENS;

  console.log("=== Seaport Bulk Offer (Criteria) + Sell ===\n");
  console.log(`Buyer:        ${buyerAccount.address}`);
  console.log(`Seller:       ${sellerAccount.address}`);
  console.log(`Fee recip:    ${feeRecipientAccount.address}`);
  console.log(`Collection:   BAYC (${BAYC})`);
  console.log(`Token IDs:    ${[...TOKEN_IDS].join(", ")}`);
  console.log(`Price/NFT:    ${formatEther(PRICE_PER_NFT)} WETH/ETH`);
  console.log(`Fee/NFT:      ${formatEther(FEE_PER_NFT)} WETH/ETH`);
  console.log(`Total payment: ${formatEther(totalWeth)} WETH/ETH`);

  // Fund accounts
  await testClient.setBalance({
    address: buyerAccount.address,
    value: 10_000000000000000000n,
  });
  await testClient.setBalance({
    address: sellerAccount.address,
    value: 1_000000000000000000n,
  });

  // ── Phase 0: Setup — mint WETH and transfer NFTs ──────────

  console.log("\n[0] Setting up accounts...");

  // Mint WETH to buyer
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
  console.log(`    Buyer WETH balance: ${formatEther(buyerWeth)}`);

  // Transfer BAYC NFTs to seller
  console.log("    Transferring BAYCs to seller...");
  for (const tokenId of TOKEN_IDS) {
    const hash = await transferNftTo(
      testClient,
      publicClient,
      BAYC,
      tokenId,
      sellerAccount.address,
    );
    if (hash === "0x") {
      console.log(`    BAYC #${tokenId}: seller already owns it`);
    } else {
      console.log(
        `    BAYC #${tokenId}: transferred (tx: ${hash.slice(0, 18)}...)`,
      );
    }
  }

  // ── Phase 1: Build criteria merkle tree ──────────────────

  console.log("\n[1] Building criteria merkle tree...");

  const tree = buildCriteriaTree([...TOKEN_IDS]);
  const merkleRoot = getCriteriaRoot(tree);

  console.log(`    Token IDs:   ${[...TOKEN_IDS].join(", ")}`);
  for (const id of TOKEN_IDS) {
    const leaf = hashCriteriaLeaf(id);
    console.log(`    Leaf #${id}:  ${leaf.slice(0, 18)}...`);
  }
  console.log(`    Tree depth:  ${tree.length}`);
  console.log(`    Merkle root: ${merkleRoot.slice(0, 18)}...`);

  // Convert bytes32 hex → uint256 for identifierOrCriteria
  const criteriaRoot = hexToBigInt(merkleRoot);

  // ── Phase 2: Buyer approves WETH to Seaport ─────────────

  console.log("\n[2] Buyer approving WETH to Seaport...");
  const approveWethHash = await buyer.writeContract({
    address: WETH,
    abi: wethAbi,
    functionName: "approve",
    args: [SEAPORT_ADDRESS, totalWeth],
  });
  await testClient.mine({ blocks: 1 });
  console.log(`    Approved (tx: ${approveWethHash.slice(0, 18)}...)`);

  // ── Phase 3: Seller approves BAYC to Seaport ────────────

  console.log("\n[3] Seller approving BAYC to Seaport...");
  const approveBaycHash = await seller.writeContract({
    address: BAYC,
    abi: erc721Abi,
    functionName: "setApprovalForAll",
    args: [SEAPORT_ADDRESS, true],
  });
  await testClient.mine({ blocks: 1 });
  console.log(`    Approved (tx: ${approveBaycHash.slice(0, 18)}...)`);

  // ── Phase 4: Build bulk offer order (criteria-based) ─────

  console.log("\n[4] Building bulk criteria offer...");

  const buyerCounter = await getCounter(
    publicClient,
    SEAPORT_CTX,
    buyerAccount.address,
  );
  console.log(`    Buyer counter: ${buyerCounter}`);

  const now = await getBlockTimestamp(publicClient);

  // Buyer creates an OFFER to buy ALL tokens from the criteria set.
  // offer = what the buyer gives (WETH payment + WETH fee)
  // consideration = what the buyer wants (ERC721_WITH_CRITERIA BAYCs)
  //
  // Since this uses criteria (not wildcard), the identifierOrCriteria
  // is the merkle root of the eligible token IDs.
  const orderComponents: OrderComponents = {
    offerer: buyerAccount.address,
    zone: ZERO_ADDRESS,
    offer: [
      {
        itemType: ItemType.ERC20,
        token: WETH,
        identifierOrCriteria: 0n,
        startAmount: PRICE_PER_NFT * TOTAL_TOKENS,
        endAmount: PRICE_PER_NFT * TOTAL_TOKENS,
      },
      {
        itemType: ItemType.ERC20,
        token: WETH,
        identifierOrCriteria: 0n,
        startAmount: FEE_PER_NFT * TOTAL_TOKENS,
        endAmount: FEE_PER_NFT * TOTAL_TOKENS,
      },
    ],
    consideration: [
      {
        itemType: ItemType.ERC721_WITH_CRITERIA,
        token: BAYC,
        identifierOrCriteria: criteriaRoot, // merkle root of eligible token IDs
        startAmount: TOTAL_TOKENS,
        endAmount: TOTAL_TOKENS,
        recipient: buyerAccount.address,
      },
    ],
    orderType: OrderType.PARTIAL_OPEN,
    startTime: now,
    endTime: now + 3600n,
    zoneHash: ZERO_BYTES32,
    salt: 99n,
    conduitKey: ZERO_BYTES32,
    counter: buyerCounter,
  };

  console.log(
    `    Offer: ${TOTAL_TOKENS}x BAYC (ERC721_WITH_CRITERIA, criteria merkle root)`,
  );
  console.log(
    `    Payment: ${formatEther(PRICE_PER_NFT * TOTAL_TOKENS)} WETH + ${formatEther(FEE_PER_NFT * TOTAL_TOKENS)} WETH fee`,
  );
  console.log(
    `    Per fill (1/${TOTAL_TOKENS}): ${formatEther(PRICE_PER_NFT)} WETH + ${formatEther(FEE_PER_NFT)} WETH fee`,
  );

  // ── Phase 5: Sign the order (EIP-712) ────────────────────

  console.log("\n[5] Signing bulk offer...");
  const signature = await buyer.signTypedData({
    domain: SEAPORT_CTX.domain,
    types: EIP712_TYPES,
    primaryType: "OrderComponents",
    message: orderComponents,
  });
  console.log(`    Signature: ${signature.slice(0, 18)}...`);

  const orderParams = toOrderParameters(
    orderComponents,
    BigInt(orderComponents.consideration.length),
  );

  // ── Phase 6: Verify proofs for all token IDs ─────────────

  console.log("\n[6] Verifying criteria proofs...");
  for (const tokenId of TOKEN_IDS) {
    const proof = getCriteriaProof(tree, tokenId);
    const leaf = hashCriteriaLeaf(tokenId);
    const valid = verifyCriteriaProof(leaf, merkleRoot, proof);
    console.log(
      `    BAYC #${tokenId}: proof length=${proof.length}, valid=${valid} ${valid ? "✓" : "✗"}`,
    );
  }

  // ── Phase 7: Seller fulfills some tokens via the offer ───

  console.log(
    `\n[7] Seller fulfills first ${OFFER_FILLS} BAYCs via the offer...`,
  );

  const offerTokenIds = [...TOKEN_IDS].slice(0, OFFER_FILLS);

  for (const tokenId of offerTokenIds) {
    const proof = getCriteriaProof(tree, tokenId);

    const advancedOrder: AdvancedOrder = {
      parameters: orderParams,
      numerator: 1n,
      denominator: TOTAL_TOKENS,
      signature,
      extraData: "0x" as `0x${string}`,
    };

    const criteriaResolver: CriteriaResolver[] = [
      {
        orderIndex: 0n,
        side: Side.CONSIDERATION, // criteria is on the consideration side
        index: 0n,
        identifier: tokenId,
        criteriaProof: proof,
      },
    ];

    const fulfillment = buildFulfillAdvancedOrder(
      SEAPORT_CTX,
      advancedOrder,
      criteriaResolver,
    );

    console.log(
      `    Fulfilling BAYC #${tokenId} (proof: ${proof.length} elements)...`,
    );

    // Seller fulfills: gives BAYC, receives WETH
    const txHash = await seller.sendTransaction({
      to: fulfillment.to,
      data: fulfillment.data,
      value: fulfillment.value,
    });
    await testClient.mine({ blocks: 1 });
    console.log(`    ✓ Tx: ${txHash.slice(0, 18)}...`);

    // Verify ownership changed
    const owner = await publicClient.readContract({
      address: BAYC,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [tokenId],
    });
    const ok = owner.toLowerCase() === buyerAccount.address.toLowerCase();
    console.log(`    BAYC #${tokenId} owner: ${owner.slice(0, 10)}... ${ok ? "✓ buyer" : "✗"}`);
  }

  // ── Phase 8: Seller lists remaining BAYCs for sale ──────

  console.log(
    `\n[8] Seller lists remaining ${LIST_COUNT} BAYCs for sale (standard listings)...`,
  );

  const remainingIds = [...TOKEN_IDS].slice(OFFER_FILLS);
  const sellerCounter = await getCounter(
    publicClient,
    SEAPORT_CTX,
    sellerAccount.address,
  );
  console.log(`    Seller counter: ${sellerCounter}`);

  const listings: Order[] = [];

  for (let i = 0; i < remainingIds.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index is in bounds
    const tokenId = remainingIds[i]!;

    const listingComponents: OrderComponents = {
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
          startAmount: PRICE_PER_NFT,
          endAmount: PRICE_PER_NFT,
          recipient: sellerAccount.address,
        },
        {
          itemType: ItemType.NATIVE,
          token: ZERO_ADDRESS,
          identifierOrCriteria: 0n,
          startAmount: FEE_PER_NFT,
          endAmount: FEE_PER_NFT,
          recipient: feeRecipientAccount.address,
        },
      ],
      orderType: OrderType.FULL_OPEN,
      startTime: now,
      endTime: now + 3600n,
      zoneHash: ZERO_BYTES32,
      salt: BigInt(100 + i),
      conduitKey: ZERO_BYTES32,
      counter: sellerCounter,
    };

    // Seller signs the listing
    const listingSig = await seller.signTypedData({
      domain: SEAPORT_CTX.domain,
      types: EIP712_TYPES,
      primaryType: "OrderComponents",
      message: listingComponents,
    });

    listings.push({ parameters: listingComponents, signature: listingSig });
    console.log(
      `    Listing BAYC #${tokenId}: ${formatEther(PRICE_PER_NFT)} ETH + ${formatEther(FEE_PER_NFT)} ETH fee`,
    );
  }

  // ── Phase 9: Buyer buys the remaining BAYCs ──────────────

  console.log("\n[9] Buyer buying remaining BAYCs via listings...");

  for (let i = 0; i < listings.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index is in bounds
    const listing = listings[i]!;
    const tokenId = remainingIds[i]!;

    const fulfillment = buildBasicOrderFulfillment(SEAPORT_CTX, listing);
    console.log(
      `    Buying BAYC #${tokenId}: value=${formatEther(fulfillment.value)} ETH`,
    );

    // Buyer fulfills: sends ETH, receives BAYC
    const txHash = await buyer.sendTransaction({
      to: fulfillment.to,
      data: fulfillment.data,
      value: fulfillment.value,
    });
    await testClient.mine({ blocks: 1 });
    console.log(`    ✓ Tx: ${txHash.slice(0, 18)}...`);

    const owner = await publicClient.readContract({
      address: BAYC,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [tokenId],
    });
    const ok = owner.toLowerCase() === buyerAccount.address.toLowerCase();
    console.log(`    BAYC #${tokenId} owner: ${owner.slice(0, 10)}... ${ok ? "✓ buyer" : "✗"}`);
  }

  // ── Phase 10: Final verification ────────────────────────

  console.log("\n=== Final Results ===\n");

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

  // WETH balances
  const buyerWethFinal = await publicClient.readContract({
    address: WETH,
    abi: wethAbi,
    functionName: "balanceOf",
    args: [buyerAccount.address],
  });
  const wethSpent = buyerWeth - buyerWethFinal;

  console.log(`\nBuyer WETH spent on offer: ${formatEther(wethSpent)}`);
  console.log(
    `Buyer ETH spent on listings: ${formatEther(PRICE_PER_NFT * BigInt(LIST_COUNT) + FEE_PER_NFT * BigInt(LIST_COUNT))}`,
  );
  console.log(
    `Seller received: ~${formatEther(PRICE_PER_NFT * TOTAL_TOKENS)} total (WETH from offer + ETH from listings)`,
  );
  console.log(`Fee recipient: ~${formatEther(FEE_PER_NFT * TOTAL_TOKENS)}`);

  console.log(
    `\n✓ All ${TOTAL_TOKENS} BAYCs now owned by buyer!`,
  );
  console.log(
    `  ${OFFER_FILLS} via criteria offer (merkle proof), ${LIST_COUNT} via standard listings`,
  );
}

// ── Entry ──────────────────────────────────────────────────────

bulkOfferAndSell().catch((err) => {
  console.error("Trade failed:", err);
  process.exit(1);
});
