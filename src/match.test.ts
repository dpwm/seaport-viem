import { describe, expect, test } from "bun:test";
import {
  buildMatchOrders,
  buildMatchAdvancedOrders,
  toOrderParameters,
  ZERO_ADDRESS,
  SeaportValidationError,
} from "./index";
import type { Fulfillment, AdvancedOrder, CriteriaResolver } from "./index";
import { ctx, makeOrder } from "./test-fixtures";

describe("buildMatchOrders", () => {
  test("produces valid transaction data with single order", () => {
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
    const tx = buildMatchOrders(ctx, orders, fulfillments);
    expect(tx.to).toBe(ctx.address);
    expect(tx.data).toMatch(/^0x[0-9a-f]+$/);
    expect(tx.data.length).toBeGreaterThan(2);
  });

  test("computes msg.value from NATIVE consideration items", () => {
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
    const tx = buildMatchOrders(ctx, orders, fulfillments);
    // Default consideration is NATIVE with 1 ETH
    expect(tx.value).toBe(1000000000000000000n);
  });

  test("throws for invalid context", () => {
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
    expect(() =>
      buildMatchOrders(
        { address: "0xinvalid" as `0x${string}`, domain: {} },
        orders,
        fulfillments,
      ),
    ).toThrow();
  });

  test("throws SeaportValidationError for empty orders array", () => {
    expect(() =>
      buildMatchOrders(ctx, [], []),
    ).toThrow(SeaportValidationError);
    expect(() =>
      buildMatchOrders(ctx, [], []),
    ).toThrow("At least one order must be provided to match");
  });

  test("throws SeaportValidationError for empty fulfillments array", () => {
    const order = makeOrder();
    const params = toOrderParameters(
      order.parameters,
      BigInt(order.parameters.consideration.length),
    );
    const orders = [{ parameters: params, signature: order.signature }];
    expect(() =>
      buildMatchOrders(ctx, orders, []),
    ).toThrow(SeaportValidationError);
    expect(() =>
      buildMatchOrders(ctx, orders, []),
    ).toThrow("At least one fulfillment must be provided");
  });
});

describe("buildMatchAdvancedOrders", () => {
  test("produces valid transaction data", () => {
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
    const tx = buildMatchAdvancedOrders(ctx, advancedOrders);
    expect(tx.to).toBe(ctx.address);
    expect(tx.data).toMatch(/^0x[0-9a-f]+$/);
    expect(tx.data.length).toBeGreaterThan(2);
  });

  test("throws for denominator > uint120", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrders: AdvancedOrder[] = [{
      parameters: params,
      numerator: 1n,
      denominator: 1n << 120n,
      signature: order.signature,
      extraData: "0x",
    }];
    expect(() =>
      buildMatchAdvancedOrders(ctx, advancedOrders),
    ).toThrow("uint120");
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
    expect(() => buildMatchAdvancedOrders(ctx, advancedOrders)).toThrow(
      "uint120",
    );
  });

  test("throws for invalid context", () => {
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
    expect(() =>
      buildMatchAdvancedOrders(
        { address: "0xinvalid" as `0x${string}`, domain: {} },
        advancedOrders,
      ),
    ).toThrow();
  });

  test("throws SeaportValidationError for empty advanced orders array", () => {
    expect(() =>
      buildMatchAdvancedOrders(ctx, []),
    ).toThrow(SeaportValidationError);
    expect(() =>
      buildMatchAdvancedOrders(ctx, []),
    ).toThrow("At least one advanced order must be provided to match");
  });

  test("throws for denominator of zero", () => {
    const order = makeOrder();
    const params = toOrderParameters(
      order.parameters,
      BigInt(order.parameters.consideration.length),
    );
    const advancedOrders: AdvancedOrder[] = [
      {
        parameters: params,
        numerator: 1n,
        denominator: 0n,
        signature: order.signature,
        extraData: "0x",
      },
    ];
    expect(() => buildMatchAdvancedOrders(ctx, advancedOrders)).toThrow(
      "denominator must be non-zero",
    );
  });

  test("throws for numerator > denominator", () => {
    const order = makeOrder();
    const params = toOrderParameters(
      order.parameters,
      BigInt(order.parameters.consideration.length),
    );
    const advancedOrders: AdvancedOrder[] = [
      {
        parameters: params,
        numerator: 4n,
        denominator: 3n,
        signature: order.signature,
        extraData: "0x",
      },
    ];
    expect(() => buildMatchAdvancedOrders(ctx, advancedOrders)).toThrow(
      "numerator (4) must be ≤ denominator (3)",
    );
  });

  test("accepts optional criteriaResolvers, fulfillments, recipient", () => {
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
    const tx = buildMatchAdvancedOrders(
      ctx,
      advancedOrders,
      criteriaResolvers,
      fulfillments,
      ZERO_ADDRESS,
    );
    expect(tx.data).toMatch(/^0x[0-9a-f]+$/);
  });
});
