import { formatEther } from "viem";
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
import {
  ItemType,
  OrderType,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  getCounter,
  buildBasicOrderFulfillment,
  EIP712_TYPES,
} from "../src/index";
import type { OrderComponents, Order } from "../src/index";

// ── Configuration unique to this script ────────────────────────

const LIST_PRICE = 1_000000000000000000n; // 1 ETH
const MARKETPLACE_FEE = 30000000000000000n; // 0.03 ETH

// ── Main ───────────────────────────────────────────────────────

async function listAndBuy(nftAddress: `0x${string}`, tokenId: bigint) {
  const { testClient, publicClient, seller, buyer } = createAnvilClients();

  console.log("=== Seaport List & Buy ===\n");
  console.log(`NFT:          ${nftAddress} #${tokenId}`);
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
    address: buyerAccount.address,
    value: 10_000000000000000000n,
  });

  // ── Phase 0: Transfer NFT from current owner to seller ─────

  console.log("\n[0] Transferring NFT from current owner to seller...");
  const transferHash = await transferNftTo(
    testClient,
    publicClient,
    nftAddress,
    tokenId,
    sellerAccount.address,
  );
  if (transferHash === "0x") {
    console.log("    Already owned by seller, skipping");
  } else {
    console.log(`    Transferred (tx: ${transferHash.slice(0, 18)}...)`);
  }

  // ── Step 1: Get counter ────────────────────────────────────

  const counter = await getCounter(
    publicClient,
    SEAPORT_CTX,
    sellerAccount.address,
  );
  console.log(`\n[1] Seller counter: ${counter}`);

  // ── Step 2: Build order ────────────────────────────────────

  const now = await getBlockTimestamp(publicClient);
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
    address: buyerAccount.address,
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
    address: buyerAccount.address,
  });

  console.log("\n=== Result ===\n");
  console.log(`NFT owner:       ${newOwner}`);
  console.log(`Buyer balance:   ${formatEther(buyerBalanceAfter)} ETH`);
  console.log(
    `ETH spent:       ${formatEther(
      buyerBalanceBefore - buyerBalanceAfter,
    )} ETH`,
  );
  console.log(
    newOwner.toLowerCase() === buyerAccount.address.toLowerCase()
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
