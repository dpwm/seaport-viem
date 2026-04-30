import { recoverTypedDataAddress, hashTypedData, keccak256, encodeAbiParameters, concat, stringToHex } from "viem";
import type { SeaportContext, Order, OrderComponents, OrderVerificationResult } from "./types";
import {
  EIP712_TYPES,
  ORDER_COMPONENTS_TYPE_STRING,
  CONSIDERATION_ITEM_TYPE_STRING,
  OFFER_ITEM_TYPE_STRING,
  OFFER_ITEM_COMPONENTS,
  CONSIDERATION_ITEM_COMPONENTS,
  ORDER_COMPONENTS_STRUCT_ABI_TYPES,
} from "./constants";
import { requireValidContext } from "./validate";

/**
 * Verify an order's EIP-712 signature against the offerer's address.
 *
 * Uses viem's `recoverTypedDataAddress` — the same underlying crypto as
 * {@link verifyTypedData} — but returns a structured result instead of a
 * boolean so callers can distinguish a structurally invalid signature from
 * a valid signature signed by a different address.
 *
 * @returns {@link OrderVerificationResult} — a discriminated union with
 *   `valid: true` on success, or a specific `reason` on failure.
 * @throws {SeaportValidationError} If `ctx` fails {@link requireValidContext}.
 */
export async function verifyOrderSignature(
  ctx: SeaportContext,
  order: Order,
): Promise<OrderVerificationResult> {
  requireValidContext(ctx);

  let recovered: `0x${string}`;
  try {
    recovered = await recoverTypedDataAddress({
      domain: ctx.domain,
      types: EIP712_TYPES,
      primaryType: "OrderComponents",
      message: order.parameters,
      signature: order.signature,
    });
  } catch {
    // Any throw from recoverTypedDataAddress after context validation
    // means the signature is structurally invalid (bad length, bad v,
    // r/s out of range, unrecoverable public key from @noble/curves).
    // No regex needed — the domain is already validated by requireValidContext,
    // so the only thing left that can fail is the signature itself.
    return { valid: false, reason: "invalid-signature" };
  }

  if (recovered.toLowerCase() !== order.parameters.offerer.toLowerCase()) {
    return { valid: false, reason: "offerer-mismatch", recovered };
  }

  return { valid: true };
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
  requireValidContext(ctx);

  return hashTypedData({
    domain: ctx.domain,
    types: EIP712_TYPES,
    primaryType: "OrderComponents",
    message: orderComponents,
  });
}

/**
 * The Seaport ORDER_TYPEHASH constant.
 * Matches the Solidity: keccak256("OrderComponents(...)ConsiderationItem(...)OfferItem(...)")
 * Generated from EIP712_TYPES in constants.ts — keeps the two in sync automatically.
 */
const ORDER_TYPEHASH = keccak256(
  stringToHex(
    ORDER_COMPONENTS_TYPE_STRING +
    CONSIDERATION_ITEM_TYPE_STRING +
    OFFER_ITEM_TYPE_STRING,
  ),
);

/**
 * Compute the Seaport order hash (struct hash only, without EIP-712 domain separator).
 * This matches what Seaport's getOrderHash() and _deriveOrderHash() return.
 * Use this for merkle tree leaves in bulk orders.
 *
 * @internal This is a low-level struct-hash utility used internally by the bulk
 *   listings module. It is exported for advanced use cases but is not part of
 *   the stable public API.
 */
export function hashOrderComponentsStruct(
  orderComponents: OrderComponents,
): `0x${string}` {
  // Encode offer items as a dynamic array of tuples
  // Uses OFFER_ITEM_COMPONENTS from constants.ts to stay in sync with EIP-712 type definitions.
  const offerHash = keccak256(
    encodeAbiParameters(
      [{ type: "tuple[]", components: OFFER_ITEM_COMPONENTS }],
      [orderComponents.offer],
    ),
  );

  // Encode consideration items as a dynamic array of tuples
  // Uses CONSIDERATION_ITEM_COMPONENTS from constants.ts to stay in sync with EIP-712 type definitions.
  const considerationHash = keccak256(
    encodeAbiParameters(
      [{ type: "tuple[]", components: CONSIDERATION_ITEM_COMPONENTS }],
      [orderComponents.consideration],
    ),
  );

  // Encode the full order struct using ABI types derived from EIP712_TYPES.OrderComponents.
  // The types array stays in sync automatically — if a field is added/removed/reordered
  // in EIP712_TYPES, the encoding follows suit. The ORDER_TYPEHASH is prepended.
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, ...ORDER_COMPONENTS_STRUCT_ABI_TYPES],
      [
        ORDER_TYPEHASH,
        orderComponents.offerer,
        orderComponents.zone,
        offerHash,
        considerationHash,
        orderComponents.orderType,
        orderComponents.startTime,
        orderComponents.endTime,
        orderComponents.zoneHash,
        orderComponents.salt,
        orderComponents.conduitKey,
        orderComponents.counter,
      ],
    ),
  );
}
