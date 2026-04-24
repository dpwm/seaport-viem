import { BaseError, verifyTypedData, hashTypedData } from "viem";
import type { SeaportContext, Order, OrderComponents } from "./types";
import { EIP712_TYPES } from "./constants";

/**
 * Verify an order's EIP-712 signature against the offerer's address.
 * Returns `true` if valid, `false` if the signature is malformed or was
 * signed by a different address. Throws on infrastructure errors (bad
 * domain config, invalid address, etc.).
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
    // Re-throw viem infrastructure errors (bad address, bad domain, etc.)
    if (error instanceof BaseError) {
      throw error;
    }
    // Plain Error from @noble/curves — malformed or unrecoverable signature
    return false;
  }
}

/**
 * Compute the EIP-712 hash of order components.
 * @param ctx - Seaport deployment context (address and EIP-712 domain).
 * @param orderComponents - The order components to hash.
 * @returns The EIP-712 hash as a 32-byte hex string.
 */
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
