import { isAddress } from "viem";
import type { SeaportContext, OrderComponents, OrderParameters, FulfillmentData, ValidationResult } from "./types";
import { ItemType } from "./types";
import { encodeValidate } from "./encode";

const VALID_ITEM_TYPES = new Set<number>(Object.values(ItemType));

/**
 * Validate a SeaportContext before using it in Seaport operations.
 *
 * Checks that:
 * - `ctx.address` is a valid 20-byte hex address.
 * - `ctx.domain.verifyingContract` is present and non-empty.
 * - `ctx.domain.chainId` is a positive integer if provided.
 *
 * @param ctx - The Seaport deployment context to validate.
 * @returns A validation result; `{ valid: true }` on success, or
 *   `{ valid: false, reason }` describing the problem.
 */
export function validateSeaportContext(
  ctx: SeaportContext,
): ValidationResult {
  if (!ctx.address) {
    return { valid: false, reason: "ctx.address is missing" };
  }

  if (!isAddress(ctx.address)) {
    return {
      valid: false,
      reason: `ctx.address is not a valid address: ${ctx.address}`,
    };
  }

  if (
    !ctx.domain.verifyingContract ||
    ctx.domain.verifyingContract === "0x"
  ) {
    return {
      valid: false,
      reason: "ctx.domain.verifyingContract is missing or empty",
    };
  }

  if (!isAddress(ctx.domain.verifyingContract)) {
    return {
      valid: false,
      reason: `ctx.domain.verifyingContract is not a valid address: ${ctx.domain.verifyingContract}`,
    };
  }

  if (ctx.domain.chainId !== undefined) {
    if (
      typeof ctx.domain.chainId !== "number" &&
      typeof ctx.domain.chainId !== "bigint"
    ) {
      return {
        valid: false,
        reason: `ctx.domain.chainId must be a number or bigint, got ${typeof ctx.domain.chainId}`,
      };
    }

    const chainIdNum =
      typeof ctx.domain.chainId === "bigint"
        ? Number(ctx.domain.chainId)
        : ctx.domain.chainId;

    if (!Number.isInteger(chainIdNum) || chainIdNum <= 0) {
      return {
        valid: false,
        reason: `ctx.domain.chainId must be a positive integer, got ${String(ctx.domain.chainId)}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate order components client-side before submission.
 *
 * NOTE: This performs structural validation only (amounts, timing, required
 * fields). It does not validate address fields — callers are responsible for
 * ensuring offerer, zone, token, and recipient addresses are well-formed.
 *
 * @param components - The order components to validate.
 * @returns A result indicating validity, with a reason string on failure.
 */
export function validateOrderComponents(
  components: OrderComponents,
): ValidationResult {
  if (!components.offer || components.offer.length === 0) {
    return { valid: false, reason: "Order must have at least one offer item" };
  }

  for (const item of components.offer) {
    if (!VALID_ITEM_TYPES.has(item.itemType)) {
      return {
        valid: false,
        reason: `Invalid offer item type: ${item.itemType}`,
      };
    }
    if (item.startAmount <= 0n || item.endAmount <= 0n) {
      return { valid: false, reason: "Offer amounts must be greater than 0" };
    }
  }

  if (!components.consideration || components.consideration.length === 0) {
    return {
      valid: false,
      reason: "Order must have at least one consideration item",
    };
  }

  for (const item of components.consideration) {
    if (!VALID_ITEM_TYPES.has(item.itemType)) {
      return {
        valid: false,
        reason: `Invalid consideration item type: ${item.itemType}`,
      };
    }
    if (item.startAmount <= 0n || item.endAmount <= 0n) {
      return {
        valid: false,
        reason: "Consideration amounts must be greater than 0",
      };
    }
  }

  if (components.startTime >= components.endTime) {
    return {
      valid: false,
      reason: "Start time must be before end time",
    };
  }

  return { valid: true };
}

/**
 * Build a transaction to validate one or more Seaport orders.
 * Validating an order marks it as approved on-chain so it can be fulfilled
 * or matched without requiring a signature transfer.
 *
 * @param ctx - Seaport deployment context (address and EIP-712 domain).
 * @param orders - The signed orders to validate.
 * @returns Transaction data ready to send.
 */
export function buildValidate(
  ctx: SeaportContext,
  orders: { parameters: OrderParameters; signature: `0x${string}` }[],
): FulfillmentData {
  const ctxValid = validateSeaportContext(ctx);
  if (!ctxValid.valid) {
    throw new Error(ctxValid.reason);
  }

  if (orders.length === 0) {
    throw new Error("At least one order must be provided to validate");
  }

  return {
    to: ctx.address,
    data: encodeValidate(orders),
    value: 0n,
  };
}
