import { describe, expect, test } from "bun:test";
import { encodeFunctionResult, type PublicClient } from "viem";
import { getOrderStatus, getOrderStatusAbiItem } from "./index";
import { ctx } from "./test-fixtures";

type MockCall = (params: {
  to: `0x${string}`;
  data: `0x${string}`;
}) => Promise<{ data?: `0x${string}` }>;

function mockClient(callImpl: MockCall): PublicClient {
  return { call: callImpl } as unknown as PublicClient;
}

const ORDER_HASH =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as const;

describe("getOrderStatus", () => {
  test("returns full order status", async () => {
    const encoded = encodeFunctionResult({
      abi: [getOrderStatusAbiItem],
      functionName: "getOrderStatus",
      result: [true, false, 5n, 10n],
    });
    const client = mockClient(async () => ({ data: encoded }));
    const result = await getOrderStatus(client, ctx, ORDER_HASH);
    expect(result).toEqual({
      isValidated: true,
      isCancelled: false,
      totalFilled: 5n,
      totalSize: 10n,
    });
  });

  test("returns validated and cancelled order", async () => {
    const encoded = encodeFunctionResult({
      abi: [getOrderStatusAbiItem],
      functionName: "getOrderStatus",
      result: [true, true, 10n, 10n],
    });
    const client = mockClient(async () => ({ data: encoded }));
    const result = await getOrderStatus(client, ctx, ORDER_HASH);
    expect(result).toEqual({
      isValidated: true,
      isCancelled: true,
      totalFilled: 10n,
      totalSize: 10n,
    });
  });

  test("returns partially filled order", async () => {
    const encoded = encodeFunctionResult({
      abi: [getOrderStatusAbiItem],
      functionName: "getOrderStatus",
      result: [true, false, 3n, 10n],
    });
    const client = mockClient(async () => ({ data: encoded }));
    const result = await getOrderStatus(client, ctx, ORDER_HASH);
    expect(result).toEqual({
      isValidated: true,
      isCancelled: false,
      totalFilled: 3n,
      totalSize: 10n,
    });
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
    await expect(
      getOrderStatus(client, badCtx, ORDER_HASH),
    ).rejects.toThrow();
  });

  test("propagates seaportCall errors", async () => {
    const client = mockClient(async () => {
      throw new Error("network error");
    });
    await expect(getOrderStatus(client, ctx, ORDER_HASH)).rejects.toThrow(
      "Failed to fetch order status",
    );
  });
});
