import { describe, expect, test } from "bun:test";
import { BaseError, type PublicClient } from "viem";
import { seaportCall } from "./index";

type MockCall = (params: {
  to: `0x${string}`;
  data: `0x${string}`;
}) => Promise<{ data?: `0x${string}` }>;

function mockClient(callImpl: MockCall): PublicClient {
  return { call: callImpl } as unknown as PublicClient;
}

describe("seaportCall", () => {
  test("returns result data on success", async () => {
    const client = mockClient(async () => ({ data: "0xdeadbeef" }));
    const result = await seaportCall(
      client,
      { to: "0x0000000000000000000000000000000000000001", data: "0x" },
      "testFn",
      "test action",
      "details",
    );
    expect(result).toBe("0xdeadbeef");
  });

  test("throws when result data is undefined", async () => {
    const client = mockClient(async () => ({}));
    await expect(
      seaportCall(
        client,
        { to: "0x0000000000000000000000000000000000000001", data: "0x" },
        "testFn",
        "test action",
        "details",
      ),
    ).rejects.toThrow("testFn returned no data details");
  });

  test("throws when result data is 0x", async () => {
    const client = mockClient(async () => ({ data: "0x" }));
    await expect(
      seaportCall(
        client,
        { to: "0x0000000000000000000000000000000000000001", data: "0x" },
        "testFn",
        "test action",
        "details",
      ),
    ).rejects.toThrow("testFn returned no data details");
  });

  test("wraps viem BaseError with short message", async () => {
    const client = mockClient(async () => {
      throw new BaseError("RPC connection failed");
    });
    await expect(
      seaportCall(
        client,
        { to: "0x0000000000000000000000000000000000000001", data: "0x" },
        "testFn",
        "test action",
        "details",
      ),
    ).rejects.toThrow("Failed to test action details: RPC connection failed");
  });

  test("wraps generic Error", async () => {
    const client = mockClient(async () => {
      throw new Error("something broke");
    });
    await expect(
      seaportCall(
        client,
        { to: "0x0000000000000000000000000000000000000001", data: "0x" },
        "testFn",
        "test action",
        "details",
      ),
    ).rejects.toThrow("Failed to test action details: something broke");
  });

  test("wraps non-Error thrown value", async () => {
    const client = mockClient(async () => {
      throw "string error";
    });
    await expect(
      seaportCall(
        client,
        { to: "0x0000000000000000000000000000000000000001", data: "0x" },
        "testFn",
        "test action",
        "details",
      ),
    ).rejects.toThrow("Failed to test action details: string error");
  });

  test("re-throws already-enriched no-data error without double wrapping", async () => {
    const client = mockClient(async () => {
      throw new Error("testFn returned no data details");
    });
    await expect(
      seaportCall(
        client,
        { to: "0x0000000000000000000000000000000000000001", data: "0x" },
        "testFn",
        "test action",
        "details",
      ),
    ).rejects.toThrow("testFn returned no data details");
    // Must NOT contain the "Failed to test action" prefix
    await expect(
      seaportCall(
        client,
        { to: "0x0000000000000000000000000000000000000001", data: "0x" },
        "testFn",
        "test action",
        "details",
      ),
    ).rejects.not.toThrow(/Failed to test action/);
  });

  test("passes params through to client.call", async () => {
    let capturedParams: unknown = null;
    const client = mockClient(async (params) => {
      capturedParams = params;
      return { data: "0x1234" };
    });
    const to = "0x0000000000000000000000000000000000000001" as const;
    const data = "0xabcdef" as const;
    await seaportCall(client, { to, data }, "fn", "action", "details");
    expect(capturedParams).toEqual({ to, data });
  });
});
