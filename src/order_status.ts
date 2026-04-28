import type { PublicClient } from "viem";
import { decodeFunctionResult } from "viem";
import type { SeaportContext, OrderStatus } from "./types";
import { getOrderStatusAbiItem } from "./constants";
import { encodeGetOrderStatus } from "./encode";
import { requireValidContext } from "./validate";
import { safeCall } from "./call";

/**
 * Fetch the on-chain status of an order by its hash.
 *
 * @param client - A viem PublicClient for on-chain reads.
 * @param ctx - Seaport deployment context (address and EIP-712 domain).
 * @param orderHash - The order hash to query.
 * @returns The order status including validated, cancelled, and fill fraction.
 * @throws If the RPC call fails or the address is not a Seaport instance.
 */
export async function getOrderStatus(
  client: PublicClient,
  ctx: SeaportContext,
  orderHash: `0x${string}`,
): Promise<OrderStatus> {
  requireValidContext(ctx);

  const data = encodeGetOrderStatus(orderHash);
  const resultData = await safeCall(
    client,
    { to: ctx.address, data },
    "getOrderStatus",
    "fetch order status",
    `for order hash ${orderHash} at Seaport ${ctx.address}`,
  );
  const [isValidated, isCancelled, totalFilled, totalSize] =
    decodeFunctionResult({
      abi: [getOrderStatusAbiItem],
      functionName: "getOrderStatus",
      data: resultData,
    });
  return { isValidated, isCancelled, totalFilled, totalSize };
}
