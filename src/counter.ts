import type { PublicClient } from "viem";
import { decodeFunctionResult } from "viem";
import type { SeaportContext } from "./types";
import { seaportAbi } from "./constants";
import { encodeGetCounter } from "./encode";

/**
 * Fetch an offerer's current order counter from the Seaport contract.
 * @param client - A viem PublicClient for on-chain reads.
 * @param ctx - Seaport deployment context (address and EIP-712 domain).
 * @param offerer - The offerer address to query.
 * @returns The offerer's current counter value.
 */
export async function getCounter(
  client: PublicClient,
  ctx: SeaportContext,
  offerer: `0x${string}`,
): Promise<bigint> {
  const data = encodeGetCounter(offerer);
  const result = await client.call({
    to: ctx.address,
    data,
  });
  if (result.data === undefined || result.data === "0x") {
    throw new Error(
      `getCounter call returned no data for offerer ${offerer}`,
    );
  }
  return decodeFunctionResult({
    abi: seaportAbi,
    functionName: "getCounter",
    data: result.data,
  });
}
