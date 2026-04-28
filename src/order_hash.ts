import type { PublicClient } from "viem";
import { decodeFunctionResult } from "viem";
import type { SeaportContext, OrderComponents } from "./types";
import { getOrderHashAbiItem } from "./constants";
import { encodeGetOrderHash } from "./encode";
import { requireValidContext } from "./validate";
import { safeCall } from "./call";

/**
 * Fetch the on-chain order hash for a given set of order components.
 *
 * This calls Seaport's `getOrderHash(OrderComponents)` view function, which
 * computes the order hash using the contract's own encoding logic. Use this
 * to verify that an off-chain computed hash (via `hashOrderComponents`)
 * matches what the contract would compute.
 *
 * @param client - A viem PublicClient for on-chain reads.
 * @param ctx - Seaport deployment context (address and EIP-712 domain).
 * @param orderComponents - The order components to hash.
 * @returns The order hash as a 32-byte hex string.
 * @throws If the RPC call fails or the address is not a Seaport instance.
 */
export async function getOrderHash(
  client: PublicClient,
  ctx: SeaportContext,
  orderComponents: OrderComponents,
): Promise<`0x${string}`> {
  requireValidContext(ctx);

  const data = encodeGetOrderHash(orderComponents);
  const resultData = await safeCall(
    client,
    { to: ctx.address, data },
    "getOrderHash",
    "fetch order hash",
    `for order at Seaport ${ctx.address}`,
  );
  return decodeFunctionResult({
    abi: [getOrderHashAbiItem],
    functionName: "getOrderHash",
    data: resultData,
  });
}
