import { verifyTypedData, hashTypedData } from "viem";
import type { SeaportContext, Order, OrderComponents } from "./types";
import { EIP712_TYPES } from "./constants";

/**
 * Verify an order's EIP-712 signature against the offerer's address.
 * Returns `true` if valid, `false` if the signature is invalid.
 * Throws on infrastructure errors (bad domain config, invalid input).
 */
export async function verifyOrderSignature(
  ctx: SeaportContext,
  order: Order,
): Promise<boolean> {
  try {
    return await verifyTypedData({
      domain: ctx.domain,
      types: EIP712_TYPES,
      primaryType: "OrderComponents",
      message: order.parameters,
      signature: order.signature,
      address: order.parameters.offerer,
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("signature") ||
        error.message.includes("invalid") ||
        error.message.includes("recover"))
    ) {
      return false;
    }
    throw error;
  }
}

/** Compute the EIP-712 hash of order components. */
export function hashOrderComponents(
  ctx: SeaportContext,
  orderComponents: OrderComponents,
): `0x${string}` {
  return hashTypedData({
    domain: ctx.domain,
    types: EIP712_TYPES,
    primaryType: "OrderComponents",
    message: orderComponents,
  });
}
