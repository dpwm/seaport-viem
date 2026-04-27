import { describe, expect, test } from "bun:test";
import { decodeFunctionData, getAddress, isAddress } from "viem";
import {
  BasicOrderRouteType,
  encodeGetCounter,
  encodeGetOrderHash,
  encodeFulfillBasicOrder,
  encodeFulfillOrder,
  encodeFulfillAdvancedOrder,
  encodeFulfillAvailableOrders,
  encodeFulfillAvailableAdvancedOrders,
  toBasicOrderParameters,
  toOrderParameters,
} from "./index";
import type { AdvancedOrder, CriteriaResolver, FulfillmentComponent } from "./index";
import { ZERO_BYTES32, ZERO_ADDRESS, seaportAbi } from "./index";
import { ALICE, BOB, ctx, makeOrderComponents, makeOrder, makeOfferItem, makeConsiderationItem } from "./test-fixtures";

describe("encodeGetCounter", () => {
  test("round-trips arguments correctly", () => {
    const data = encodeGetCounter(ALICE);
    const decoded = decodeFunctionData({ abi: seaportAbi, data });
    expect(decoded.functionName).toBe("getCounter");
    // viem's decodeFunctionData returns checksummed addresses; normalize with getAddress
    expect(getAddress(decoded.args[0] as `0x${string}`)).toBe(
      getAddress(ALICE),
    );
  });
});

/**
 * Recursively normalize all Ethereum addresses in an object so that
 * checksummed and lowercase forms compare equal. Uses getAddress.
 */
function normalizeAddresses(obj: unknown): unknown {
  if (typeof obj === "string" && isAddress(obj)) {
    return getAddress(obj as `0x${string}`);
  }
  if (Array.isArray(obj)) return obj.map(normalizeAddresses);
  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      out[key] = normalizeAddresses((obj as Record<string, unknown>)[key]);
    }
    return out;
  }
  return obj;
}

describe("encodeGetOrderHash", () => {
  test("round-trips arguments correctly", () => {
    const components = makeOrderComponents();
    const data = encodeGetOrderHash(components);
    const decoded = decodeFunctionData({ abi: seaportAbi, data });
    expect(decoded.functionName).toBe("getOrderHash");
    // decodeFunctionData returns checksummed addresses; normalize both sides
    expect(normalizeAddresses(decoded.args)).toEqual(
      normalizeAddresses([components]),
    );
  });
});

describe("encodeFulfillBasicOrder", () => {
  test("returns hex calldata", () => {
    const order = makeOrder();
    const params = toBasicOrderParameters(
      order,
      BasicOrderRouteType.ETH_TO_ERC721,
    );
    const data = encodeFulfillBasicOrder(params);
    expect(data).toMatch(/^0x[0-9a-f]+$/);
    expect(data.length).toBeGreaterThan(2);
  });
});

describe("encodeFulfillOrder", () => {
  test("returns hex calldata", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const data = encodeFulfillOrder(
      { parameters: params, signature: order.signature },
      ZERO_BYTES32,
    );
    expect(data).toMatch(/^0x[0-9a-f]+$/);
    expect(data.length).toBeGreaterThan(2);
  });
});

describe("encodeFulfillAdvancedOrder", () => {
  test("returns hex calldata", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrder: AdvancedOrder = {
      parameters: params,
      numerator: 1n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    };
    const data = encodeFulfillAdvancedOrder(
      advancedOrder,
      [],
      ZERO_BYTES32,
      ALICE,
    );
    expect(data).toMatch(/^0x[0-9a-f]+$/);
    expect(data.length).toBeGreaterThan(2);
  });

  test("throws for numerator > uint120", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrder: AdvancedOrder = {
      parameters: params,
      numerator: 1n << 120n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    };
    expect(() =>
      encodeFulfillAdvancedOrder(advancedOrder, [], ZERO_BYTES32, ALICE),
    ).toThrow("uint120");
  });

  test("throws for denominator > uint120", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrder: AdvancedOrder = {
      parameters: params,
      numerator: 1n,
      denominator: 1n << 120n,
      signature: order.signature,
      extraData: "0x",
    };
    expect(() =>
      encodeFulfillAdvancedOrder(advancedOrder, [], ZERO_BYTES32, ALICE),
    ).toThrow("uint120");
  });
});

describe("encodeFulfillAvailableOrders", () => {
  test("returns hex calldata", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const orders = [{ parameters: params, signature: order.signature }];
    const offerFulfillments: FulfillmentComponent[][] = [[{ orderIndex: 0n, itemIndex: 0n }]];
    const considerationFulfillments: FulfillmentComponent[][] = [[{ orderIndex: 0n, itemIndex: 0n }]];
    const data = encodeFulfillAvailableOrders(
      orders,
      offerFulfillments,
      considerationFulfillments,
      ZERO_BYTES32,
      1n,
    );
    expect(data).toMatch(/^0x[0-9a-f]+$/);
    expect(data.length).toBeGreaterThan(2);
  });
});

describe("encodeFulfillAvailableAdvancedOrders", () => {
  test("returns hex calldata", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrders: AdvancedOrder[] = [{
      parameters: params,
      numerator: 1n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    }];
    const offerFulfillments: FulfillmentComponent[][] = [[{ orderIndex: 0n, itemIndex: 0n }]];
    const considerationFulfillments: FulfillmentComponent[][] = [[{ orderIndex: 0n, itemIndex: 0n }]];
    const data = encodeFulfillAvailableAdvancedOrders(
      advancedOrders,
      [],
      offerFulfillments,
      considerationFulfillments,
      ZERO_BYTES32,
      ALICE,
      1n,
    );
    expect(data).toMatch(/^0x[0-9a-f]+$/);
    expect(data.length).toBeGreaterThan(2);
  });
});
