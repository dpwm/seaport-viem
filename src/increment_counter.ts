import type { SeaportContext, FulfillmentData } from "./types";
import { encodeIncrementCounter } from "./encode";
import { requireValidContext } from "./validate";

/**
 * Build a transaction to increment the offerer's counter, cancelling
 * all orders from that offerer with the current counter value.
 *
 * @param ctx - Seaport deployment context (address and EIP-712 domain).
 * @returns Transaction data ready to send.
 */
export function buildIncrementCounter(
  ctx: SeaportContext,
): FulfillmentData {
  requireValidContext(ctx);

  return {
    to: ctx.address,
    data: encodeIncrementCounter(),
    value: 0n,
  };
}
