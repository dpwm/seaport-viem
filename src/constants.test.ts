import { describe, expect, test } from "bun:test";
import {
  ItemType,
  OrderType,
  BasicOrderRouteType,
  Side,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  NATIVE_TOKEN,
  seaportAbi,
  EIP712_TYPES,
  ORDER_COMPONENTS_TYPE_STRING,
  OFFER_ITEM_TYPE_STRING,
  CONSIDERATION_ITEM_TYPE_STRING,
} from "./index";

describe("constants", () => {
  test("ItemType values are correct", () => {
    expect(ItemType.NATIVE).toBe(0);
    expect(ItemType.ERC20).toBe(1);
    expect(ItemType.ERC721).toBe(2);
    expect(ItemType.ERC1155).toBe(3);
    expect(ItemType.ERC721_WITH_CRITERIA).toBe(4);
    expect(ItemType.ERC1155_WITH_CRITERIA).toBe(5);
  });

  test("OrderType values are correct", () => {
    expect(OrderType.FULL_OPEN).toBe(0);
    expect(OrderType.PARTIAL_OPEN).toBe(1);
    expect(OrderType.FULL_RESTRICTED).toBe(2);
    expect(OrderType.PARTIAL_RESTRICTED).toBe(3);
    expect(OrderType.CONTRACT).toBe(4);
  });

  test("BasicOrderRouteType values are correct", () => {
    expect(BasicOrderRouteType.ETH_TO_ERC721).toBe(0);
    expect(BasicOrderRouteType.ETH_TO_ERC1155).toBe(1);
    expect(BasicOrderRouteType.ERC20_TO_ERC721).toBe(2);
    expect(BasicOrderRouteType.ERC20_TO_ERC1155).toBe(3);
    expect(BasicOrderRouteType.ERC721_TO_ERC20).toBe(4);
    expect(BasicOrderRouteType.ERC1155_TO_ERC20).toBe(5);
  });

  test("Side values are correct", () => {
    expect(Side.OFFER).toBe(0);
    expect(Side.CONSIDERATION).toBe(1);
  });

  test("ZERO_ADDRESS is a valid 20-byte hex address", () => {
    expect(ZERO_ADDRESS).toBe("0x0000000000000000000000000000000000000000");
    expect(ZERO_ADDRESS).toHaveLength(42);
  });

  test("ZERO_BYTES32 is a valid 32-byte hex value", () => {
    expect(ZERO_BYTES32).toHaveLength(66);
    expect(ZERO_BYTES32).toMatch(/^0x0{64}$/);
  });

  test("NATIVE_TOKEN is a valid address", () => {
    expect(NATIVE_TOKEN).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe("seaportAbi", () => {
  test("has 13 functions", () => {
    expect(seaportAbi).toHaveLength(13);
  });

  test("has expected function names", () => {
    const names = seaportAbi.map((item) =>
      item.type === "function" ? item.name : null,
    );
    expect(names).toContain("getCounter");
    expect(names).toContain("getOrderHash");
    expect(names).toContain("fulfillBasicOrder");
    expect(names).toContain("fulfillOrder");
    expect(names).toContain("fulfillAdvancedOrder");
    expect(names).toContain("fulfillAvailableOrders");
    expect(names).toContain("fulfillAvailableAdvancedOrders");
    expect(names).toContain("cancel");
    expect(names).toContain("incrementCounter");
    expect(names).toContain("getOrderStatus");
    expect(names).toContain("matchOrders");
    expect(names).toContain("matchAdvancedOrders");
    expect(names).toContain("validate");
  });
});

describe("EIP712_TYPES", () => {
  test("defines OrderComponents, OfferItem, ConsiderationItem", () => {
    expect(EIP712_TYPES.OrderComponents).toBeDefined();
    expect(EIP712_TYPES.OfferItem).toBeDefined();
    expect(EIP712_TYPES.ConsiderationItem).toBeDefined();
  });

  test("OrderComponents has 11 fields", () => {
    expect(EIP712_TYPES.OrderComponents).toHaveLength(11);
  });

  test("OfferItem has 5 fields", () => {
    expect(EIP712_TYPES.OfferItem).toHaveLength(5);
  });

  test("ConsiderationItem has 6 fields (OfferItem + recipient)", () => {
    expect(EIP712_TYPES.ConsiderationItem).toHaveLength(6);
  });
});

describe("canonical EIP-712 type strings", () => {
  test("ORDER_COMPONENTS_TYPE_STRING matches canonical Seaport format", () => {
    expect(ORDER_COMPONENTS_TYPE_STRING).toBe(
      "OrderComponents(address offerer,address zone,OfferItem[] offer,ConsiderationItem[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)",
    );
  });

  test("OFFER_ITEM_TYPE_STRING matches canonical Seaport format", () => {
    expect(OFFER_ITEM_TYPE_STRING).toBe(
      "OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)",
    );
  });

  test("CONSIDERATION_ITEM_TYPE_STRING matches canonical Seaport format", () => {
    expect(CONSIDERATION_ITEM_TYPE_STRING).toBe(
      "ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)",
    );
  });
});
