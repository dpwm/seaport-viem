import { encodeFunctionData } from "viem";
import type {
  OrderComponents,
  BasicOrderParameters,
  OrderParameters,
  AdvancedOrder,
  CriteriaResolver,
  FulfillmentComponent,
} from "./types";
import { seaportAbi } from "./constants";

const UINT120_MAX = (1n << 120n) - 1n;

/**
 * Encode calldata for Seaport's getCounter(address) function.
 * @param offerer - The offerer address to query the counter for.
 * @returns ABI-encoded function call data.
 */
export function encodeGetCounter(offerer: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: seaportAbi,
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
    abi: seaportAbi,
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
    abi: seaportAbi,
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
    abi: seaportAbi,
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
    abi: seaportAbi,
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
    abi: seaportAbi,
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
    abi: seaportAbi,
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

function checkUint120(value: bigint, name: string): void {
  if (value < 0n || value > UINT120_MAX) {
    throw new Error(
      `${name} must be a uint120 (0 to ${UINT120_MAX}), got ${value}`,
    );
  }
}
