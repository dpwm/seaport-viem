import { describe, expect, test } from "bun:test";
import { decodeFunctionData, getAddress } from "viem";
import {
  encodeCancel,
  encodeIncrementCounter,
  encodeGetOrderStatus,
  encodeMatchOrders,
  encodeMatchAdvancedOrders,
  encodeValidate,
  toOrderParameters,
  seaportAbi,
  ZERO_BYTES32,
  ZERO_ADDRESS,
} from "./index";
import type {
  AdvancedOrder,
  Fulfillment,
  CriteriaResolver,
  OrderParameters,
} from "./index";
import {
  ALICE,
  BOB,
  ctx,
  makeOrderComponents,
  makeOrder,
} from "./test-fixtures";

function normalizeAddresses(obj: unknown): unknown {
  if (typeof obj === "string" && obj.length === 42 && obj.startsWith("0x")) {
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

describe("encodeCancel", () => {
  test("round-trips arguments correctly", () => {
    const components = [makeOrderComponents()];
    const data = encodeCancel(components);
    const decoded = decodeFunctionData({ abi: seaportAbi, data });
    expect(decoded.functionName).toBe("cancel");
    expect(normalizeAddresses(decoded.args)).toEqual(
      normalizeAddresses([components]),
    );
  });

  test("encodes multiple orders", () => {
    const components = [makeOrderComponents(), makeOrderComponents({ salt: 2n })];
    const data = encodeCancel(components);
    expect(data).toMatch(/^0x[0-9a-f]+$/);
    expect(data.length).toBeGreaterThan(2);
  });
});

describe("encodeIncrementCounter", () => {
  test("returns valid calldata", () => {
    const data = encodeIncrementCounter();
    const decoded = decodeFunctionData({ abi: seaportAbi, data });
    expect(decoded.functionName).toBe("incrementCounter");
    // viem returns undefined for no-arg functions, not []
    expect(decoded.args).toBeUndefined();
  });
});

describe("encodeGetOrderStatus", () => {
  test("round-trips arguments correctly", () => {
    const orderHash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as const;
    const data = encodeGetOrderStatus(orderHash);
    const decoded = decodeFunctionData({ abi: seaportAbi, data });
    expect(decoded.functionName).toBe("getOrderStatus");
    expect(decoded.args).toEqual([orderHash]);
  });
});

describe("encodeMatchOrders", () => {
  test("round-trips arguments correctly", () => {
    const order = makeOrder();
    const params = toOrderParameters(
      order.parameters,
      BigInt(order.parameters.consideration.length),
    );
    const orders = [{ parameters: params, signature: order.signature }];
    const fulfillments: Fulfillment[] = [
      {
        offerComponents: [{ orderIndex: 0n, itemIndex: 0n }],
        considerationComponents: [{ orderIndex: 0n, itemIndex: 0n }],
      },
    ];
    const data = encodeMatchOrders(orders, fulfillments);
    const decoded = decodeFunctionData({ abi: seaportAbi, data });
    expect(decoded.functionName).toBe("matchOrders");
    expect(normalizeAddresses(decoded.args)).toEqual(
      normalizeAddresses([orders, fulfillments]),
    );
  });
});

describe("encodeMatchAdvancedOrders", () => {
  test("round-trips arguments correctly", () => {
    const order = makeOrder();
    const params = toOrderParameters(
      order.parameters,
      BigInt(order.parameters.consideration.length),
    );
    const advancedOrders: AdvancedOrder[] = [
      {
        parameters: params,
        numerator: 1n,
        denominator: 1n,
        signature: order.signature,
        extraData: "0x",
      },
    ];
    const criteriaResolvers: CriteriaResolver[] = [];
    const fulfillments: Fulfillment[] = [];
    const data = encodeMatchAdvancedOrders(
      advancedOrders,
      criteriaResolvers,
      fulfillments,
      ALICE,
    );
    const decoded = decodeFunctionData({ abi: seaportAbi, data });
    expect(decoded.functionName).toBe("matchAdvancedOrders");
    expect(normalizeAddresses(decoded.args)).toEqual(
      normalizeAddresses([advancedOrders, criteriaResolvers, fulfillments, ALICE]),
    );
  });

  test("throws for numerator > uint120", () => {
    const order = makeOrder();
    const params = toOrderParameters(
      order.parameters,
      BigInt(order.parameters.consideration.length),
    );
    const advancedOrders: AdvancedOrder[] = [
      {
        parameters: params,
        numerator: 1n << 120n,
        denominator: 1n,
        signature: order.signature,
        extraData: "0x",
      },
    ];
    expect(() =>
      encodeMatchAdvancedOrders(advancedOrders, [], [], ALICE),
    ).toThrow("uint120");
  });
});

describe("encodeValidate", () => {
  test("round-trips arguments correctly", () => {
    const order = makeOrder();
    const params = toOrderParameters(
      order.parameters,
      BigInt(order.parameters.consideration.length),
    );
    const orders = [{ parameters: params, signature: order.signature }];
    const data = encodeValidate(orders);
    const decoded = decodeFunctionData({ abi: seaportAbi, data });
    expect(decoded.functionName).toBe("validate");
    expect(normalizeAddresses(decoded.args)).toEqual(
      normalizeAddresses([orders]),
    );
  });
});
