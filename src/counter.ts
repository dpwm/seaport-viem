import type { PublicClient } from "viem";
import { decodeFunctionResult } from "viem";
import type { SeaportContext } from "./types";
import { getCounterAbiItem } from "./constants";
import { encodeGetCounter } from "./encode";
import { requireValidContext } from "./validate";
import { seaportCall } from "./call";

/**
 * Fetch an offerer's current order counter from the Seaport contract.
 *
 * Wraps network and contract errors with a descriptive message including the
 * Seaport address and offerer address for easier debugging.
 *
 * @param client - A viem PublicClient for on-chain reads.
 * @param ctx - Seaport deployment context (address and EIP-712 domain).
 * @param offerer - The offerer address to query.
 * @returns The offerer's current counter value.
 * @throws If the RPC call fails, the contract reverts, or the address is not a Seaport instance.
 */
export async function getCounter(
  client: PublicClient,
  ctx: SeaportContext,
  offerer: `0x${string}`,
): Promise<bigint> {
  requireValidContext(ctx);

  const data = encodeGetCounter(offerer);
  const resultData = await seaportCall(
    client,
    { to: ctx.address, data },
    "getCounter",
    "fetch counter",
    `for offerer ${offerer} at Seaport ${ctx.address}`,
  );
  return decodeFunctionResult({
    abi: [getCounterAbiItem],
    functionName: "getCounter",
    data: resultData,
  });
}
