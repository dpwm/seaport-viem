import type {
  Order,
  BasicOrderRouteTypeValue,
  BasicOrderParameters,
  AdditionalRecipient,
  FulfillmentData,
  FulfillmentOptions,
  SeaportContext,
} from "./types";
import {
  ItemType,
  OrderType,
  BasicOrderRouteType,
} from "./types";
import {
  ZERO_ADDRESS,
  ZERO_BYTES32,
  NATIVE_TOKEN,
} from "./constants";
import { encodeFulfillBasicOrder } from "./encode";

/**
 * Convert a high-level Order into the flat BasicOrderParameters needed by
 * Seaport's fulfillBasicOrder.
 */
export function toBasicOrderParameters(
  order: Order,
  routeType: BasicOrderRouteTypeValue,
  fulfillerConduitKey: `0x${string}` = ZERO_BYTES32,
  tips: AdditionalRecipient[] = [],
): BasicOrderParameters {
  if (order.parameters.offer.length !== 1) {
    throw new Error("Basic orders require exactly one offer item");
  }

  if (order.parameters.consideration.length < 1) {
    throw new Error("Order must have at least one consideration item");
  }

  // biome-ignore lint/style/noNonNullAssertion: guarded by length checks above
  const offerItem = order.parameters.offer[0]!;
  // biome-ignore lint/style/noNonNullAssertion: guarded by length check above
  const primaryConsideration = order.parameters.consideration[0]!;

  const additionalRecipients: AdditionalRecipient[] = [
    ...order.parameters.consideration.slice(1).map((item) => ({
      amount: item.endAmount,
      recipient: item.recipient,
    })),
    ...tips,
  ];

  const basicOrderType = order.parameters.orderType + routeType * 4;

  return {
    considerationToken: primaryConsideration.token,
    considerationIdentifier: primaryConsideration.identifierOrCriteria,
    considerationAmount: primaryConsideration.endAmount,
    offerer: order.parameters.offerer,
    zone: order.parameters.zone,
    offerToken: offerItem.token,
    offerIdentifier: offerItem.identifierOrCriteria,
    offerAmount: offerItem.endAmount,
    basicOrderType,
    startTime: order.parameters.startTime,
    endTime: order.parameters.endTime,
    zoneHash: order.parameters.zoneHash,
    salt: order.parameters.salt,
    offererConduitKey: order.parameters.conduitKey,
    fulfillerConduitKey,
    totalOriginalAdditionalRecipients: BigInt(
      order.parameters.consideration.length - 1,
    ),
    additionalRecipients,
    signature: order.signature,
  };
}

/**
 * Build a ready-to-send transaction for fulfilling a Seaport basic order.
 * Returns { to, data, value } suitable for passing to wallet_sendTransaction.
 */
export function buildBasicOrderFulfillment(
  ctx: SeaportContext,
  order: Order,
  options: FulfillmentOptions = {},
): FulfillmentData {
  const routeType = options.routeType ?? detectBasicOrderRouteType(order);
  if (routeType === null) {
    throw new Error("Order does not qualify for basic order fulfillment");
  }

  const params = toBasicOrderParameters(
    order,
    routeType,
    options.fulfillerConduitKey ?? ZERO_BYTES32,
    options.tips,
  );

  const data = encodeFulfillBasicOrder(params);

  let value = 0n;
  const isNativePayment =
    params.considerationToken === ZERO_ADDRESS ||
    params.considerationToken === NATIVE_TOKEN;

  if (isNativePayment) {
    value = params.considerationAmount;
    for (const recipient of params.additionalRecipients) {
      value += recipient.amount;
    }
  }

  return {
    to: ctx.address,
    data,
    value,
  };
}

/**
 * Check whether an order can be fulfilled via the simpler fulfillBasicOrder
 * path (vs. the more complex fulfillOrder/fulfillAdvancedOrder).
 */
export function canFulfillAsBasicOrder(order: Order): boolean {
  if (order.parameters.offer.length !== 1) {
    return false;
  }

  if (order.parameters.consideration.length < 1) {
    return false;
  }

  if (
    order.parameters.orderType === OrderType.CONTRACT ||
    order.parameters.orderType === OrderType.FULL_RESTRICTED ||
    order.parameters.orderType === OrderType.PARTIAL_RESTRICTED
  ) {
    return false;
  }

  if (order.parameters.zone !== ZERO_ADDRESS) {
    return false;
  }

  // biome-ignore lint/style/noNonNullAssertion: guarded by length checks above
  const offerItem = order.parameters.offer[0]!;
  // biome-ignore lint/style/noNonNullAssertion: guarded by length check above
  const primaryConsideration = order.parameters.consideration[0]!;

  if (
    offerItem.itemType === ItemType.ERC721_WITH_CRITERIA ||
    offerItem.itemType === ItemType.ERC1155_WITH_CRITERIA
  ) {
    return false;
  }

  for (const item of order.parameters.consideration) {
    if (
      item.itemType === ItemType.ERC721_WITH_CRITERIA ||
      item.itemType === ItemType.ERC1155_WITH_CRITERIA
    ) {
      return false;
    }
  }

  if (primaryConsideration.recipient !== order.parameters.offerer) {
    return false;
  }

  const isEthToErc721 =
    offerItem.itemType === ItemType.ERC721 &&
    primaryConsideration.itemType === ItemType.NATIVE;

  const isEthToErc1155 =
    offerItem.itemType === ItemType.ERC1155 &&
    primaryConsideration.itemType === ItemType.NATIVE;

  const isErc20ToErc721 =
    offerItem.itemType === ItemType.ERC721 &&
    primaryConsideration.itemType === ItemType.ERC20;

  const isErc20ToErc1155 =
    offerItem.itemType === ItemType.ERC1155 &&
    primaryConsideration.itemType === ItemType.ERC20;

  const isErc721ToErc20 =
    offerItem.itemType === ItemType.ERC20 &&
    primaryConsideration.itemType === ItemType.ERC721;

  const isErc1155ToErc20 =
    offerItem.itemType === ItemType.ERC20 &&
    primaryConsideration.itemType === ItemType.ERC1155;

  return (
    isEthToErc721 ||
    isEthToErc1155 ||
    isErc20ToErc721 ||
    isErc20ToErc1155 ||
    isErc721ToErc20 ||
    isErc1155ToErc20
  );
}

/**
 * Detect the BasicOrderRouteType for an order, or null if it cannot be
 * fulfilled as a basic order.
 */
export function detectBasicOrderRouteType(
  order: Order,
): BasicOrderRouteTypeValue | null {
  if (!canFulfillAsBasicOrder(order)) {
    return null;
  }

  // biome-ignore lint/style/noNonNullAssertion: guarded by canFulfillAsBasicOrder
  const offerItem = order.parameters.offer[0]!;
  // biome-ignore lint/style/noNonNullAssertion: guarded by canFulfillAsBasicOrder
  const primaryConsideration = order.parameters.consideration[0]!;

  if (offerItem.itemType === ItemType.ERC721) {
    return primaryConsideration.itemType === ItemType.NATIVE
      ? BasicOrderRouteType.ETH_TO_ERC721
      : BasicOrderRouteType.ERC20_TO_ERC721;
  }

  if (offerItem.itemType === ItemType.ERC1155) {
    return primaryConsideration.itemType === ItemType.NATIVE
      ? BasicOrderRouteType.ETH_TO_ERC1155
      : BasicOrderRouteType.ERC20_TO_ERC1155;
  }

  if (offerItem.itemType === ItemType.ERC20) {
    return primaryConsideration.itemType === ItemType.ERC721
      ? BasicOrderRouteType.ERC721_TO_ERC20
      : BasicOrderRouteType.ERC1155_TO_ERC20;
  }

  return null;
}
