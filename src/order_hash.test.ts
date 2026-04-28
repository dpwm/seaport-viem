import { describe, expect, test } from "bun:test";
import { encodeFunctionResult, type PublicClient } from "viem";
import { getOrderHash, getOrderHashAbiItem } from "./index";
import { ctx, makeOrderComponents } from "./test-fixtures";

type MockCall = (params: {
  to: `0x${string}`;
  data: `0x${string}`;
}) => Promise<{ data?: `0x${string}` }>;

function mockClient(callImpl: MockCall): PublicClient {
  return { call: callImpl } as unknown as PublicClient;
}

describe("getOrderHash", () => {
  test("returns the on-chain order hash from the contract", async () => {
    const expectedHash =
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as const;
    const encoded = encodeFunctionResult({
      abi: [getOrderHashAbiItem],
      functionName: "getOrderHash",
      result: expectedHash,
    });
    const client = mockClient(async () => ({ data: encoded }));
    const components = makeOrderComponents();
    const result = await getOrderHash(client, ctx, components);
    expect(result).toBe(expectedHash);
  });

  test("returns a different hash for different order components", async () => {
    const hash1 =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
    const hash2 =
      "0x2222222222222222222222222222222222222222222222222222222222222222" as const;

    const encoded1 = encodeFunctionResult({
      abi: [getOrderHashAbiItem],
      functionName: "getOrderHash",
      result: hash1,
    });
    const encoded2 = encodeFunctionResult({
      abi: [getOrderHashAbiItem],
      functionName: "getOrderHash",
      result: hash2,
    });

    let callCount = 0;
    const client = mockClient(async () => {
      callCount++;
      return { data: callCount === 1 ? encoded1 : encoded2 };
    });

    const components1 = makeOrderComponents({ salt: 100n });
    const components2 = makeOrderComponents({ salt: 200n });

    const result1 = await getOrderHash(client, ctx, components1);
    const result2 = await getOrderHash(client, ctx, components2);

    expect(result1).toBe(hash1);
    expect(result2).toBe(hash2);
    expect(callCount).toBe(2);
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
    const components = makeOrderComponents();
    await expect(getOrderHash(client, badCtx, components)).rejects.toThrow();
  });

  test("propagates seaportCall errors", async () => {
    const client = mockClient(async () => {
      throw new Error("network error");
    });
    const components = makeOrderComponents();
    await expect(getOrderHash(client, ctx, components)).rejects.toThrow(
      "Failed to fetch order hash",
    );
  });
});
