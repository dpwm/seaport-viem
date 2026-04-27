import { BaseError, verifyTypedData, hashTypedData, keccak256, encodeAbiParameters, concat, stringToHex } from "viem";
import type { SeaportContext, Order, OrderComponents } from "./types";
import {
  EIP712_TYPES,
  ORDER_COMPONENTS_TYPE_STRING,
  CONSIDERATION_ITEM_TYPE_STRING,
  OFFER_ITEM_TYPE_STRING,
} from "./constants";

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
    // Signature recovery failures from @noble/curves produce Error instances
    // with messages indicating an invalid/unrecoverable signature.
    // Only swallow signature-related errors; rethrow everything else.
    if (error instanceof Error && /signature/i.test(error.message)) {
      return false;
    }
    throw error;
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
 */
export function hashOrderComponentsStruct(
  orderComponents: OrderComponents,
): `0x${string}` {
  // Encode offer items as a dynamic array of tuples
  const offerHash = keccak256(
    encodeAbiParameters(
      [{ type: "tuple[]", components: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
      ] }],
      [orderComponents.offer],
    ),
  );

  // Encode consideration items as a dynamic array of tuples
  const considerationHash = keccak256(
    encodeAbiParameters(
      [{ type: "tuple[]", components: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
        { name: "recipient", type: "address" },
      ] }],
      [orderComponents.consideration],
    ),
  );

  // Encode the full order struct
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint256" },
      ],
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
