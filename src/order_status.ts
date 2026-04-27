import type { PublicClient } from "viem";
import { decodeFunctionResult, BaseError } from "viem";
import type { SeaportContext, OrderStatus } from "./types";
import { getOrderStatusAbiItem } from "./constants";
import { encodeGetOrderStatus } from "./encode";
import { validateSeaportContext } from "./validate";

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
  const ctxValid = validateSeaportContext(ctx);
  if (!ctxValid.valid) {
    throw new Error(ctxValid.reason);
  }

  const data = encodeGetOrderStatus(orderHash);
  try {
    const result = await client.call({
      to: ctx.address,
      data,
    });
    if (result.data === undefined || result.data === "0x") {
      throw new Error(
        `getOrderStatus returned no data for order hash ${orderHash} at Seaport ${ctx.address}`,
      );
    }
    const [isValidated, isCancelled, totalFilled, totalSize] =
      decodeFunctionResult({
        abi: [getOrderStatusAbiItem],
        functionName: "getOrderStatus",
        data: result.data,
      });
    return { isValidated, isCancelled, totalFilled, totalSize };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.startsWith("getOrderStatus returned no data")
    ) {
      throw error;
    }
    if (error instanceof BaseError) {
      throw new Error(
        `Failed to fetch order status for order hash ${orderHash} from Seaport at ${ctx.address}: ${error.shortMessage ?? error.message}`,
      );
    }
    throw new Error(
      `Failed to fetch order status for order hash ${orderHash} from Seaport at ${ctx.address}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
