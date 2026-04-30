import type {
  SeaportContext,
  OrderParameters,
  AdvancedOrder,
  CriteriaResolver,
  Fulfillment,
  FulfillmentData,
} from "./types";
import { ZERO_ADDRESS } from "./constants";
import {
  encodeMatchOrders,
  encodeMatchAdvancedOrders,
  UINT120_MAX,
} from "./encode";
import { computeTotalNativeValue } from "./order";
import { requireValidContext } from "./validate";
import { SeaportValidationError } from "./errors";

/**
 * Build a transaction for matchOrders.
 * Matches an arbitrary number of orders, allocating offer components
 * to consideration components via the supplied fulfillments.
 *
 * @param ctx - Seaport deployment context.
 * @param orders - Array of orders to match.
 * @param fulfillments - Allocations of offer to consideration components.
 * @returns Transaction data ready to send.
 */
export function buildMatchOrders(
  ctx: SeaportContext,
  orders: { parameters: OrderParameters; signature: `0x${string}` }[],
  fulfillments: Fulfillment[],
): FulfillmentData {
  requireValidContext(ctx);

  if (orders.length === 0) {
    throw new SeaportValidationError("At least one order must be provided to match");
  }

  if (fulfillments.length === 0) {
    throw new SeaportValidationError("At least one fulfillment must be provided");
  }

  const value = computeTotalNativeValue(ctx, orders);
  return {
    to: ctx.address,
    data: encodeMatchOrders(orders, fulfillments),
    value,
  };
}

/**
 * Build a transaction for matchAdvancedOrders.
 * Matches an arbitrary number of full or partial orders with criteria
 * resolvers and fulfillments.
 *
 * @param ctx - Seaport deployment context.
 * @param advancedOrders - Array of advanced orders to match.
 * @param criteriaResolvers - Resolutions for criteria-based items.
 * @param fulfillments - Allocations of offer to consideration components.
 * @param recipient - Address to receive unspent offer items (zero = caller).
 * @returns Transaction data ready to send.
 */
export function buildMatchAdvancedOrders(
  ctx: SeaportContext,
  advancedOrders: AdvancedOrder[],
  criteriaResolvers: CriteriaResolver[] = [],
  fulfillments: Fulfillment[] = [],
  recipient: `0x${string}` = ZERO_ADDRESS,
): FulfillmentData {
  requireValidContext(ctx);

  if (advancedOrders.length === 0) {
    throw new SeaportValidationError("At least one advanced order must be provided to match");
  }

  for (const order of advancedOrders) {
    if (order.numerator > UINT120_MAX) {
      throw new SeaportValidationError(
        `numerator must be a uint120 (0 to ${UINT120_MAX}), got ${order.numerator}`,
      );
    }
    if (order.denominator > UINT120_MAX) {
      throw new SeaportValidationError(
        `denominator must be a uint120 (0 to ${UINT120_MAX}), got ${order.denominator}`,
      );
    }
    if (order.denominator === 0n) {
      throw new SeaportValidationError("denominator must be non-zero");
    }
    if (order.numerator > order.denominator) {
      throw new SeaportValidationError(
        `numerator (${order.numerator}) must be ≤ denominator (${order.denominator})`,
      );
    }
  }

  const value = computeTotalNativeValue(ctx, advancedOrders);
  return {
    to: ctx.address,
    data: encodeMatchAdvancedOrders(
      advancedOrders,
      criteriaResolvers,
      fulfillments,
      recipient,
    ),
    value,
  };
}
