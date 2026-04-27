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
  checkUint120,
} from "./encode";
import { validateSeaportContext } from "./validate";
import { computeNativeValue } from "./order";

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
  const ctxValid = validateSeaportContext(ctx);
  if (!ctxValid.valid) {
    throw new Error(ctxValid.reason);
  }

  let value = 0n;
  for (const order of orders) {
    value += computeNativeValue(order.parameters.consideration);
  }

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
  const ctxValid = validateSeaportContext(ctx);
  if (!ctxValid.valid) {
    throw new Error(ctxValid.reason);
  }

  for (const order of advancedOrders) {
    checkUint120(order.numerator, "numerator");
    checkUint120(order.denominator, "denominator");
  }

  let value = 0n;
  for (const order of advancedOrders) {
    value += computeNativeValue(order.parameters.consideration);
  }

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
