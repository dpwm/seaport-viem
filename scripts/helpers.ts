import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  type PublicClient,
  type TestClient,
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import type { SeaportContext } from "../src/index";

// ── Keys and accounts ──────────────────────────────────────────

export const SELLER_KEY =
  "0x84ce473bdcb5460191fb3201117551d16c2d83a3cd896b55f605a4649520d140" as `0x${string}`;
export const BUYER_KEY =
  "0x08699d7b34d89931840055b297dc2acdead42f610818999537da938a504dc471" as `0x${string}`;
export const FEE_RECIPIENT_KEY =
  "0x9ee26398e8cc317fef22505535526e2957c931ec365b2c9f029c3a71a685efaf" as `0x${string}`;

export const sellerAccount = privateKeyToAccount(SELLER_KEY);
export const buyerAccount = privateKeyToAccount(BUYER_KEY);
export const feeRecipientAccount = privateKeyToAccount(FEE_RECIPIENT_KEY);

// ── Seaport constants ──────────────────────────────────────────

export const SEAPORT_ADDRESS =
  "0x0000000000000068F116a894984e2DB1123eB395" as `0x${string}`;

export const SEAPORT_CTX: SeaportContext = {
  address: SEAPORT_ADDRESS,
  domain: {
    name: "Seaport",
    version: "1.6",
    chainId: 1,
    verifyingContract: SEAPORT_ADDRESS,
  },
};

// ── RPC URL ────────────────────────────────────────────────────

export const RPC_URL = "http://127.0.0.1:8545";

// ── ERC721 ABI (shared across all scripts) ─────────────────────

export const erc721Abi = [
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

// ── Client factory ─────────────────────────────────────────────

export function createAnvilClients() {
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

  const seller = createWalletClient({
    account: sellerAccount,
    chain: mainnet,
    transport,
  });

  const buyer = createWalletClient({
    account: buyerAccount,
    chain: mainnet,
    transport,
  });

  return { testClient, publicClient, seller, buyer };
}

// ── NFT transfer helper ────────────────────────────────────────

export async function transferNftTo(
  testClient: TestClient,
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

// ── Block timestamp helper ─────────────────────────────────────

export async function getBlockTimestamp(
  publicClient: PublicClient,
): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return block.timestamp;
}
