import { ItemType, OrderType, ZERO_ADDRESS, ZERO_BYTES32 } from "./index";
import type {
  OrderComponents,
  Order,
  OfferItem,
  ConsiderationItem,
  SeaportContext,
} from "./index";

export const ALICE =
  "0xaaaa000000000000000000000000000000000001" as `0x${string}`;
export const BOB =
  "0xbbbb000000000000000000000000000000000002" as `0x${string}`;
export const TOKEN =
  "0xcccc000000000000000000000000000000000003" as `0x${string}`;
export const NFT =
  "0xdddd000000000000000000000000000000000004" as `0x${string}`;
export const SEAPORT_ADDRESS =
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC" as `0x${string}`;

export const ctx: SeaportContext = {
  address: SEAPORT_ADDRESS,
  domain: {
    name: "Seaport",
    version: "1.6",
    chainId: 1,
    verifyingContract: SEAPORT_ADDRESS,
  },
};

export function makeOfferItem(overrides?: Partial<OfferItem>): OfferItem {
  return {
    itemType: ItemType.ERC721,
    token: NFT,
    identifierOrCriteria: 1n,
    startAmount: 1n,
    endAmount: 1n,
    ...overrides,
  };
}

export function makeConsiderationItem(
  overrides?: Partial<ConsiderationItem>,
): ConsiderationItem {
  return {
    itemType: ItemType.NATIVE,
    token: ZERO_ADDRESS,
    identifierOrCriteria: 0n,
    startAmount: 1000000000000000000n,
    endAmount: 1000000000000000000n,
    recipient: ALICE,
    ...overrides,
  };
}

export function makeOrderComponents(
  overrides?: Partial<OrderComponents>,
): OrderComponents {
  return {
    offerer: ALICE,
    zone: ZERO_ADDRESS,
    offer: [makeOfferItem()],
    consideration: [makeConsiderationItem()],
    orderType: OrderType.FULL_OPEN,
    startTime: 1000n,
    endTime: 2000n,
    zoneHash: ZERO_BYTES32,
    salt: 1n,
    conduitKey: ZERO_BYTES32,
    counter: 0n,
    ...overrides,
  };
}

export function makeOrder(overrides?: Partial<Order>): Order {
  return {
    parameters: makeOrderComponents(),
    signature:
      "0x" +
      "ab".repeat(65) as `0x${string}`,
    ...overrides,
  };
}
