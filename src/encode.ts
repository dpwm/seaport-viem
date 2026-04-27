import { encodeFunctionData } from "viem";
import type {
  OrderComponents,
  BasicOrderParameters,
  OrderParameters,
  AdvancedOrder,
  CriteriaResolver,
  FulfillmentComponent,
  Fulfillment,
} from "./types";
import {
  getCounterAbiItem,
  getOrderHashAbiItem,
  fulfillBasicOrderAbiItem,
  fulfillOrderAbiItem,
  fulfillAdvancedOrderAbiItem,
  fulfillAvailableOrdersAbiItem,
  fulfillAvailableAdvancedOrdersAbiItem,
  cancelAbiItem,
  incrementCounterAbiItem,
  getOrderStatusAbiItem,
  matchOrdersAbiItem,
  matchAdvancedOrdersAbiItem,
  validateAbiItem,
} from "./constants";

const UINT120_MAX = (1n << 120n) - 1n;

/**
 * Encode calldata for Seaport's getCounter(address) function.
 * @param offerer - The offerer address to query the counter for.
 * @returns ABI-encoded function call data.
 */
export function encodeGetCounter(offerer: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: [getCounterAbiItem],
    functionName: "getCounter",
    args: [offerer],
  });
}

/**
 * Encode calldata for Seaport's getOrderHash(OrderComponents) function.
 * @param orderComponents - The order components to hash.
 * @returns ABI-encoded function call data.
 */
export function encodeGetOrderHash(
  orderComponents: OrderComponents,
): `0x${string}` {
  return encodeFunctionData({
    abi: [getOrderHashAbiItem],
    functionName: "getOrderHash",
    args: [orderComponents],
  });
}

/**
 * Encode calldata for Seaport's fulfillBasicOrder(BasicOrderParameters) function.
 * @param params - The flattened basic order parameters.
 * @returns ABI-encoded function call data.
 */
export function encodeFulfillBasicOrder(
  params: BasicOrderParameters,
): `0x${string}` {
  return encodeFunctionData({
    abi: [fulfillBasicOrderAbiItem],
    functionName: "fulfillBasicOrder",
    args: [params],
  });
}

/**
 * Encode calldata for Seaport's fulfillOrder(Order, bytes32) function.
 * @param order - The order with OrderParameters and signature.
 * @param fulfillerConduitKey - Conduit key for the fulfiller.
 * @returns ABI-encoded function call data.
 */
export function encodeFulfillOrder(
  order: { parameters: OrderParameters; signature: `0x${string}` },
  fulfillerConduitKey: `0x${string}`,
): `0x${string}` {
  return encodeFunctionData({
    abi: [fulfillOrderAbiItem],
    functionName: "fulfillOrder",
    args: [order, fulfillerConduitKey],
  });
}

/**
 * Encode calldata for Seaport's fulfillAdvancedOrder function.
 * @param advancedOrder - The advanced order with partial fill params.
 * @param criteriaResolvers - Resolutions for criteria-based items.
 * @param fulfillerConduitKey - Conduit key for the fulfiller.
 * @param recipient - Address to receive the items (often the fulfiller).
 * @returns ABI-encoded function call data.
 * @throws If numerator or denominator exceed uint120 range.
 */
export function encodeFulfillAdvancedOrder(
  advancedOrder: AdvancedOrder,
  criteriaResolvers: CriteriaResolver[],
  fulfillerConduitKey: `0x${string}`,
  recipient: `0x${string}`,
): `0x${string}` {
  checkUint120(advancedOrder.numerator, "numerator");
  checkUint120(advancedOrder.denominator, "denominator");
  return encodeFunctionData({
    abi: [fulfillAdvancedOrderAbiItem],
    functionName: "fulfillAdvancedOrder",
    args: [advancedOrder, criteriaResolvers, fulfillerConduitKey, recipient],
  });
}

/**
 * Encode calldata for Seaport's fulfillAvailableOrders function.
 * @param orders - Array of orders to attempt fulfillment on.
 * @param offerFulfillments - Groups of offer items to aggregate.
 * @param considerationFulfillments - Groups of consideration items to aggregate.
 * @param fulfillerConduitKey - Conduit key for the fulfiller.
 * @param maximumFulfilled - Maximum number of orders to fulfill.
 * @returns ABI-encoded function call data.
 */
export function encodeFulfillAvailableOrders(
  orders: { parameters: OrderParameters; signature: `0x${string}` }[],
  offerFulfillments: FulfillmentComponent[][],
  considerationFulfillments: FulfillmentComponent[][],
  fulfillerConduitKey: `0x${string}`,
  maximumFulfilled: bigint,
): `0x${string}` {
  return encodeFunctionData({
    abi: [fulfillAvailableOrdersAbiItem],
    functionName: "fulfillAvailableOrders",
    args: [
      orders,
      offerFulfillments,
      considerationFulfillments,
      fulfillerConduitKey,
      maximumFulfilled,
    ],
  });
}

/**
 * Encode calldata for Seaport's fulfillAvailableAdvancedOrders function.
 * @param advancedOrders - Array of advanced orders to attempt fulfillment on.
 * @param criteriaResolvers - Resolutions for criteria-based items.
 * @param offerFulfillments - Groups of offer items to aggregate.
 * @param considerationFulfillments - Groups of consideration items to aggregate.
 * @param fulfillerConduitKey - Conduit key for the fulfiller.
 * @param recipient - Address to receive the items.
 * @param maximumFulfilled - Maximum number of orders to fulfill.
 * @returns ABI-encoded function call data.
 * @throws If any numerator or denominator exceed uint120 range.
 */
export function encodeFulfillAvailableAdvancedOrders(
  advancedOrders: AdvancedOrder[],
  criteriaResolvers: CriteriaResolver[],
  offerFulfillments: FulfillmentComponent[][],
  considerationFulfillments: FulfillmentComponent[][],
  fulfillerConduitKey: `0x${string}`,
  recipient: `0x${string}`,
  maximumFulfilled: bigint,
): `0x${string}` {
  for (const order of advancedOrders) {
    checkUint120(order.numerator, "numerator");
    checkUint120(order.denominator, "denominator");
  }
  return encodeFunctionData({
    abi: [fulfillAvailableAdvancedOrdersAbiItem],
    functionName: "fulfillAvailableAdvancedOrders",
    args: [
      advancedOrders,
      criteriaResolvers,
      offerFulfillments,
      considerationFulfillments,
      fulfillerConduitKey,
      recipient,
      maximumFulfilled,
    ],
  });
}

/**
 * Encode calldata for Seaport's cancel(OrderComponents[]) function.
 * @param orders - The order components to cancel.
 * @returns ABI-encoded function call data.
 */
export function encodeCancel(
  orders: OrderComponents[],
): `0x${string}` {
  return encodeFunctionData({
    abi: [cancelAbiItem],
    functionName: "cancel",
    args: [orders],
  });
}

/**
 * Encode calldata for Seaport's incrementCounter() function.
 * @returns ABI-encoded function call data.
 */
export function encodeIncrementCounter(): `0x${string}` {
  return encodeFunctionData({
    abi: [incrementCounterAbiItem],
    functionName: "incrementCounter",
  });
}

/**
 * Encode calldata for Seaport's getOrderStatus(bytes32) function.
 * @param orderHash - The order hash to query.
 * @returns ABI-encoded function call data.
 */
export function encodeGetOrderStatus(
  orderHash: `0x${string}`,
): `0x${string}` {
  return encodeFunctionData({
    abi: [getOrderStatusAbiItem],
    functionName: "getOrderStatus",
    args: [orderHash],
  });
}

/**
 * Encode calldata for Seaport's matchOrders function.
 * @param orders - Array of orders to match.
 * @param fulfillments - Fulfillments allocating offer to consideration components.
 * @returns ABI-encoded function call data.
 */
export function encodeMatchOrders(
  orders: { parameters: OrderParameters; signature: `0x${string}` }[],
  fulfillments: Fulfillment[],
): `0x${string}` {
  return encodeFunctionData({
    abi: [matchOrdersAbiItem],
    functionName: "matchOrders",
    args: [orders, fulfillments],
  });
}

/**
 * Encode calldata for Seaport's matchAdvancedOrders function.
 * @param advancedOrders - Array of advanced orders to match.
 * @param criteriaResolvers - Resolutions for criteria-based items.
 * @param fulfillments - Fulfillments allocating offer to consideration components.
 * @param recipient - Address to receive unspent offer items.
 * @returns ABI-encoded function call data.
 * @throws If any numerator or denominator exceed uint120 range.
 */
export function encodeMatchAdvancedOrders(
  advancedOrders: AdvancedOrder[],
  criteriaResolvers: CriteriaResolver[],
  fulfillments: Fulfillment[],
  recipient: `0x${string}`,
): `0x${string}` {
  for (const order of advancedOrders) {
    checkUint120(order.numerator, "numerator");
    checkUint120(order.denominator, "denominator");
  }
  return encodeFunctionData({
    abi: [matchAdvancedOrdersAbiItem],
    functionName: "matchAdvancedOrders",
    args: [advancedOrders, criteriaResolvers, fulfillments, recipient],
  });
}

/**
 * Encode calldata for Seaport's validate(Order[]) function.
 * @param orders - The signed orders to validate.
 * @returns ABI-encoded function call data.
 */
export function encodeValidate(
  orders: { parameters: OrderParameters; signature: `0x${string}` }[],
): `0x${string}` {
  return encodeFunctionData({
    abi: [validateAbiItem],
    functionName: "validate",
    args: [orders],
  });
}

/**
 * Check that a value fits within a uint120 range (0 to 2^120 - 1).
 * Seaport uses uint120 for partial fill numerator/denominator.
 *
 * @param value - The value to check.
 * @param name - The parameter name for error messages.
 * @throws If the value is out of range.
 */
export function checkUint120(value: bigint, name: string): void {
  if (value < 0n || value > UINT120_MAX) {
    throw new Error(
      `${name} must be a uint120 (0 to ${UINT120_MAX}), got ${value}`,
    );
  }
}
