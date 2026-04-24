import { describe, expect, test } from "bun:test";
import {
  ItemType,
  OrderType,
  BasicOrderRouteType,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  NATIVE_TOKEN,
  seaportAbi,
  EIP712_TYPES,
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
  test("has 7 functions", () => {
    expect(seaportAbi).toHaveLength(7);
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
