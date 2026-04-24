import type { PublicClient } from "viem";
import type { SeaportContext } from "./types";
import { encodeGetCounter } from "./encode";

/** Fetch an offerer's current order counter from the Seaport contract. */
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
  return BigInt(result.data);
}
