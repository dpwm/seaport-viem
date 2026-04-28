import { describe, expect, test } from "bun:test";
import { encodeFunctionResult, type PublicClient } from "viem";
import { getCounter, getCounterAbiItem } from "./index";
import { ctx, ALICE } from "./test-fixtures";

type MockCall = (params: {
  to: `0x${string}`;
  data: `0x${string}`;
}) => Promise<{ data?: `0x${string}` }>;

function mockClient(callImpl: MockCall): PublicClient {
  return { call: callImpl } as unknown as PublicClient;
}

describe("getCounter", () => {
  test("returns the counter value from the contract", async () => {
    const expectedCounter = 42n;
    const encoded = encodeFunctionResult({
      abi: [getCounterAbiItem],
      functionName: "getCounter",
      result: expectedCounter,
    });
    const client = mockClient(async () => ({ data: encoded }));
    const result = await getCounter(client, ctx, ALICE);
    expect(result).toBe(expectedCounter);
  });

  test("returns zero counter", async () => {
    const encoded = encodeFunctionResult({
      abi: [getCounterAbiItem],
      functionName: "getCounter",
      result: 0n,
    });
    const client = mockClient(async () => ({ data: encoded }));
    const result = await getCounter(client, ctx, ALICE);
    expect(result).toBe(0n);
  });

  test("throws for invalid context", async () => {
    const client = mockClient(async () => ({ data: "0x" }));
    const badCtx = {
      address: "0xinvalid" as `0x${string}`,
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xinvalid" as `0x${string}`,
      },
    };
    await expect(getCounter(client, badCtx, ALICE)).rejects.toThrow();
  });

  test("propagates safeCall errors", async () => {
    const client = mockClient(async () => {
      throw new Error("RPC error");
    });
    await expect(getCounter(client, ctx, ALICE)).rejects.toThrow(
      "Failed to fetch counter",
    );
  });
});
