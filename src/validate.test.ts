import { describe, expect, test } from "bun:test";
import {
  validateOrderComponents,
  validateSeaportContext,
  buildValidate,
  toOrderParameters,
} from "./index";
import {
  makeOrder,
  makeOrderComponents,
  makeOfferItem,
  makeConsiderationItem,
  ctx,
  SEAPORT_ADDRESS,
} from "./test-fixtures";

describe("validateSeaportContext", () => {
  test("valid context passes", () => {
    const result = validateSeaportContext(ctx);
    expect(result.valid).toBe(true);
  });

  test("rejects missing address", () => {
    const result = validateSeaportContext({
      ...ctx,
      address: undefined as unknown as `0x${string}`,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("address is missing");
    }
  });

  test("rejects invalid address format", () => {
    const result = validateSeaportContext({
      ...ctx,
      address: "0xshort" as `0x${string}`,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("not a valid address");
    }
  });

  test("rejects missing verifyingContract", () => {
    const result = validateSeaportContext({
      ...ctx,
      domain: {
        ...ctx.domain,
        verifyingContract: undefined as unknown as `0x${string}`,
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("verifyingContract");
    }
  });

  test("rejects empty verifyingContract (0x)", () => {
    const result = validateSeaportContext({
      ...ctx,
      domain: {
        ...ctx.domain,
        verifyingContract: "0x" as `0x${string}`,
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("verifyingContract");
    }
  });

  test("rejects invalid verifyingContract address", () => {
    const result = validateSeaportContext({
      ...ctx,
      domain: {
        ...ctx.domain,
        verifyingContract: "0xnotvalid0000000000000000000000000000" as `0x${string}`,
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("not a valid address");
    }
  });

  test("accepts chainId as number", () => {
    const result = validateSeaportContext({
      ...ctx,
      domain: { ...ctx.domain, chainId: 1 },
    });
    expect(result.valid).toBe(true);
  });

  test("accepts chainId as bigint", () => {
    const result = validateSeaportContext({
      ...ctx,
      domain: { ...ctx.domain, chainId: 1n },
    });
    expect(result.valid).toBe(true);
  });

  test("accepts chainId as undefined", () => {
    const result = validateSeaportContext({
      ...ctx,
      domain: { ...ctx.domain, chainId: undefined },
    });
    expect(result.valid).toBe(true);
  });

  test("rejects non-positive chainId", () => {
    const result = validateSeaportContext({
      ...ctx,
      domain: { ...ctx.domain, chainId: 0 },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("positive integer");
    }
  });

  test("rejects negative chainId", () => {
    const result = validateSeaportContext({
      ...ctx,
      domain: { ...ctx.domain, chainId: -1 },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("positive integer");
    }
  });

  test("rejects non-integer chainId", () => {
    const result = validateSeaportContext({
      ...ctx,
      domain: { ...ctx.domain, chainId: 1.5 },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("positive integer");
    }
  });
});

describe("validateOrderComponents", () => {
  test("valid order passes", () => {
    const result = validateOrderComponents(makeOrderComponents());
    expect(result.valid).toBe(true);
  });

  test("rejects empty offer", () => {
    const result = validateOrderComponents(
      makeOrderComponents({ offer: [] }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("offer");
    }
  });

  test("rejects offer with zero startAmount", () => {
    const result = validateOrderComponents(
      makeOrderComponents({
        offer: [makeOfferItem({ startAmount: 0n })],
      }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("amount");
    }
  });

  test("rejects offer with zero endAmount", () => {
    const result = validateOrderComponents(
      makeOrderComponents({
        offer: [makeOfferItem({ endAmount: 0n })],
      }),
    );
    expect(result.valid).toBe(false);
  });

  test("rejects empty consideration", () => {
    const result = validateOrderComponents(
      makeOrderComponents({ consideration: [] }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("consideration");
    }
  });

  test("rejects consideration with zero amount", () => {
    const result = validateOrderComponents(
      makeOrderComponents({
        consideration: [makeConsiderationItem({ startAmount: 0n })],
      }),
    );
    expect(result.valid).toBe(false);
  });

  test("rejects startTime >= endTime", () => {
    const result = validateOrderComponents(
      makeOrderComponents({ startTime: 2000n, endTime: 2000n }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Start time");
    }
  });

  test("rejects startTime > endTime", () => {
    const result = validateOrderComponents(
      makeOrderComponents({ startTime: 3000n, endTime: 2000n }),
    );
    expect(result.valid).toBe(false);
  });

  test("rejects offer item with invalid itemType (out of range)", () => {
    const result = validateOrderComponents(
      makeOrderComponents({
        offer: [makeOfferItem({ itemType: 99 } as any)],
      }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("item type");
    }
  });

  test("rejects offer item with negative itemType", () => {
    const result = validateOrderComponents(
      makeOrderComponents({
        offer: [makeOfferItem({ itemType: -1 } as any)],
      }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("item type");
    }
  });

  test("rejects consideration item with invalid itemType", () => {
    const result = validateOrderComponents(
      makeOrderComponents({
        consideration: [makeConsiderationItem({ itemType: 42 } as any)],
      }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("consideration item type");
    }
  });

  test("accepts all valid itemType values (0-5)", () => {
    for (const itemType of [0, 1, 2, 3, 4, 5] as const) {
      const result = validateOrderComponents(
        makeOrderComponents({
          offer: [makeOfferItem({ itemType })],
          consideration: [makeConsiderationItem({ itemType })],
        }),
      );
      expect(result.valid).toBe(true);
    }
  });

  test("passes with multiple valid offer items", () => {
    const result = validateOrderComponents(
      makeOrderComponents({
        offer: [
          makeOfferItem(),
          makeOfferItem({ token: "0xcccc000000000000000000000000000000000003" as `0x${string}` }),
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });
});

describe("buildValidate", () => {
  test("returns transaction data with correct to address", () => {
    const order = makeOrder();
    const params = toOrderParameters(
      order.parameters,
      BigInt(order.parameters.consideration.length),
    );
    const result = buildValidate(ctx, [
      { parameters: params, signature: order.signature },
    ]);
    expect(result.to).toBe(ctx.address);
    expect(result.data).toMatch(/^0x[0-9a-f]+$/);
    expect(result.value).toBe(0n);
  });

  test("includes encoded validate function selector", () => {
    const order = makeOrder();
    const params = toOrderParameters(
      order.parameters,
      BigInt(order.parameters.consideration.length),
    );
    const result = buildValidate(ctx, [
      { parameters: params, signature: order.signature },
    ]);
    // validate function selector: 0x88147732
    expect(result.data.startsWith("0x88147732")).toBe(true);
  });

  test("accepts multiple orders", () => {
    const order1 = makeOrder({ parameters: makeOrderComponents({ salt: 1n }) });
    const order2 = makeOrder({ parameters: makeOrderComponents({ salt: 2n }) });
    const params1 = toOrderParameters(
      order1.parameters,
      BigInt(order1.parameters.consideration.length),
    );
    const params2 = toOrderParameters(
      order2.parameters,
      BigInt(order2.parameters.consideration.length),
    );
    const result = buildValidate(ctx, [
      { parameters: params1, signature: order1.signature },
      { parameters: params2, signature: order2.signature },
    ]);
    expect(result.to).toBe(ctx.address);
    expect(result.data).toMatch(/^0x[0-9a-f]+$/);
  });

  test("throws on empty orders array", () => {
    expect(() => buildValidate(ctx, [])).toThrow(
      "At least one order must be provided to validate",
    );
  });

  test("throws on invalid context", () => {
    const order = makeOrder();
    const params = toOrderParameters(
      order.parameters,
      BigInt(order.parameters.consideration.length),
    );
    expect(() =>
      buildValidate(
        { ...ctx, address: undefined as unknown as `0x${string}` },
        [{ parameters: params, signature: order.signature }],
      ),
    ).toThrow("ctx.address");
  });
});
