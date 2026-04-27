import { describe, expect, test } from "bun:test";
import { buildCancel, ZERO_ADDRESS } from "./index";
import { ctx, makeOrderComponents } from "./test-fixtures";

describe("buildCancel", () => {
  test("produces valid transaction data", () => {
    const components = [makeOrderComponents()];
    const tx = buildCancel(ctx, components);
    expect(tx.to).toBe(ctx.address);
    expect(tx.data).toMatch(/^0x[0-9a-f]+$/);
    expect(tx.value).toBe(0n);
  });

  test("throws for empty orders array", () => {
    expect(() => buildCancel(ctx, [])).toThrow(
      "At least one order must be provided",
    );
  });

  test("throws for invalid context", () => {
    const badCtx = {
      address: "0xinvalid" as `0x${string}`,
      domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xinvalid" as `0x${string}` },
    };
    expect(() => buildCancel(badCtx, [makeOrderComponents()])).toThrow();
  });

  test("encodes multiple orders", () => {
    const components = [
      makeOrderComponents(),
      makeOrderComponents({ salt: 2n }),
      makeOrderComponents({ salt: 3n }),
    ];
    const tx = buildCancel(ctx, components);
    expect(tx.data).toMatch(/^0x[0-9a-f]+$/);
    expect(tx.data.length).toBeGreaterThan(2);
  });
});
