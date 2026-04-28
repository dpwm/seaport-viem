import type { OrderComponents, SeaportContext, FulfillmentData } from "./types";
import { encodeCancel } from "./encode";
import { requireValidContext } from "./validate";
import { SeaportValidationError } from "./errors";

/**
 * Build a transaction to cancel one or more Seaport orders.
 * Only the offerer or zone of each order may cancel it.
 *
 * @param ctx - Seaport deployment context (address and EIP-712 domain).
 * @param orders - The order components to cancel.
 * @returns Transaction data ready to send.
 */
export function buildCancel(
  ctx: SeaportContext,
  orders: OrderComponents[],
): FulfillmentData {
  requireValidContext(ctx);

  if (orders.length === 0) {
    throw new SeaportValidationError("At least one order must be provided to cancel");
  }

  return {
    to: ctx.address,
    data: encodeCancel(orders),
    value: 0n,
  };
}
