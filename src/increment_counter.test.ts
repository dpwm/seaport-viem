import { describe, expect, test } from "bun:test";
import { buildIncrementCounter } from "./index";
import { ctx } from "./test-fixtures";

describe("buildIncrementCounter", () => {
  test("produces valid transaction data", () => {
    const tx = buildIncrementCounter(ctx);
    expect(tx.to).toBe(ctx.address);
    expect(tx.data).toMatch(/^0x[0-9a-f]+$/);
    expect(tx.data.length).toBeGreaterThan(2);
    expect(tx.value).toBe(0n);
  });

  test("deterministic calldata (no arguments)", () => {
    const tx1 = buildIncrementCounter(ctx);
    const tx2 = buildIncrementCounter(ctx);
    expect(tx1.data).toBe(tx2.data);
  });

  test("throws for invalid context", () => {
    const badCtx = {
      address: "0xinvalid" as `0x${string}`,
      domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xinvalid" as `0x${string}` },
    };
    expect(() => buildIncrementCounter(badCtx)).toThrow();
  });
});
