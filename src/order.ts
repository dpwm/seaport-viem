import type {
  Order,
  OrderComponents,
  OrderParameters,
  AdvancedOrder,
  BasicOrderRouteTypeValue,
  BasicOrderParameters,
  AdditionalRecipient,
  CriteriaResolver,
  FulfillmentComponent,
  FulfillmentData,
  FulfillmentOptions,
  ItemTypeValue,
  SeaportContext,
  OfferItem,
  ConsiderationItem,
} from "./types";
import {
  ItemType,
  OrderType,
  BasicOrderRouteType,
} from "./types";
import {
  ZERO_ADDRESS,
  ZERO_BYTES32,
} from "./constants";
import {
  encodeFulfillBasicOrder,
  encodeFulfillOrder,
  encodeFulfillAdvancedOrder,
  encodeFulfillAvailableOrders,
  encodeFulfillAvailableAdvancedOrders,
  checkUint120,
} from "./encode";
import { validateSeaportContext } from "./validate";

/**
 * Convert a high-level Order into the flat BasicOrderParameters needed by
 * Seaport's fulfillBasicOrder.
 *
 * @param order - The order to convert.
 * @param routeType - The basic order route type (e.g. ETH_TO_ERC721).
 * @param fulfillerConduitKey - Conduit key for the fulfiller. Defaults to zero.
 * @param tips - Additional tip recipients to append.
 * @returns Flat parameters suitable for fulfillBasicOrder.
 * @throws If the order has != 1 offer item or 0 consideration items.
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

  // Seaport packs basicOrderType as (routeType << 2) | orderType, which is
  // equivalent to orderType + routeType * 4. The multiplier 4 derives from
  // the number of order types (0–3, FULL_OPEN through FULL_RESTRICTED);
  // CONTRACT orders (type 4) are excluded from the basic order pathway, so
  // the type field only needs 2 bits, and the basic order route type is
  // shifted into the upper bits.
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
 *
 * @param ctx - Seaport deployment context (address and EIP-712 domain).
 * @param order - The order to fulfill.
 * @param options - Optional route type, conduit key, and tips.
 * @returns Transaction data ({@link FulfillmentData}) for wallet_sendTransaction.
 * @throws If the order cannot be fulfilled as a basic order and no explicit routeType is given.
 */
export function buildBasicOrderFulfillment(
  ctx: SeaportContext,
  order: Order,
  options: FulfillmentOptions = {},
): FulfillmentData {
  const ctxValid = validateSeaportContext(ctx);
  if (!ctxValid.valid) {
    throw new Error(ctxValid.reason);
  }

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

  // Seaport identifies native (ETH) transfers by itemType, not token address.
  // All other builders (buildFulfillOrder, etc.) use computeNativeValue()
  // which checks item.itemType === ItemType.NATIVE. Unify on that here.
  let value = 0n;
  // biome-ignore lint/style/noNonNullAssertion: basic orders have ≥1 consideration
  const primaryConsideration = order.parameters.consideration[0]!;
  const isNativePayment = primaryConsideration.itemType === ItemType.NATIVE;

  if (isNativePayment) {
    value = primaryConsideration.endAmount;
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
 * Check if an order passes the structural requirements for basic order
 * fulfillment, returning the offer and primary consideration items if so.
 *
 * Structural requirements:
 * - Exactly one offer item and at least one consideration item
 * - Not a CONTRACT order type
 * - Zone must be zero address
 * - No criteria-based items (ERC721_WITH_CRITERIA or ERC1155_WITH_CRITERIA)
 *   in the offer or any consideration item
 * - Primary consideration recipient must be the offerer
 */
function isBasicOrderEligible(
  order: Order,
): { offerItem: OfferItem; primaryConsideration: ConsiderationItem } | null {
  if (order.parameters.offer.length !== 1) {
    return null;
  }
  if (order.parameters.consideration.length < 1) {
    return null;
  }

  // biome-ignore lint/style/noNonNullAssertion: guarded by length checks above
  const offerItem = order.parameters.offer[0]!;
  // biome-ignore lint/style/noNonNullAssertion: guarded by length check above
  const primaryConsideration = order.parameters.consideration[0]!;

  if (order.parameters.orderType === OrderType.CONTRACT) {
    return null;
  }

  if (order.parameters.zone !== ZERO_ADDRESS) {
    return null;
  }

  if (
    offerItem.itemType === ItemType.ERC721_WITH_CRITERIA ||
    offerItem.itemType === ItemType.ERC1155_WITH_CRITERIA
  ) {
    return null;
  }

  for (const item of order.parameters.consideration) {
    if (
      item.itemType === ItemType.ERC721_WITH_CRITERIA ||
      item.itemType === ItemType.ERC1155_WITH_CRITERIA
    ) {
      return null;
    }
  }

  if (primaryConsideration.recipient !== order.parameters.offerer) {
    return null;
  }

  return { offerItem, primaryConsideration };
}

/**
 * Check whether an order can be fulfilled via the simpler fulfillBasicOrder
 * path (vs. the more complex fulfillOrder/fulfillAdvancedOrder).
 *
 * @param order - The order to check.
 * @returns `true` if the order qualifies for basic order fulfillment.
 */
export function canFulfillAsBasicOrder(order: Order): boolean {
  const items = isBasicOrderEligible(order);
  if (items === null) {
    return false;
  }

  const { offerItem, primaryConsideration } = items;

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
 *
 * @param order - The order to detect the route type for.
 * @returns The detected route type, or `null` if not a basic order.
 */
export function detectBasicOrderRouteType(
  order: Order,
): BasicOrderRouteTypeValue | null {
  const items = isBasicOrderEligible(order);
  if (items === null) {
    return null;
  }

  const { offerItem, primaryConsideration } = items;

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

  // Fallback: structurally eligible but unrecognized offer/consideration combo
  // (e.g., NATIVE offer item). canFulfillAsBasicOrder returns false for these.
  return null;
}

/**
 * Convert OrderComponents to OrderParameters by replacing the counter field
 * with totalOriginalConsiderationItems. This produces the on-chain struct
 * expected by fulfillOrder and fulfillAdvancedOrder.
 *
 * @param components - The order components (from signing).
 * @param totalOriginalConsiderationItems - The number of original consideration
 *   items (before any tips). Usually `components.consideration.length`.
 */
export function toOrderParameters(
  components: OrderComponents,
  totalOriginalConsiderationItems: bigint,
): OrderParameters {
  return {
    offerer: components.offerer,
    zone: components.zone,
    offer: components.offer,
    consideration: components.consideration,
    orderType: components.orderType,
    startTime: components.startTime,
    endTime: components.endTime,
    zoneHash: components.zoneHash,
    salt: components.salt,
    conduitKey: components.conduitKey,
    totalOriginalConsiderationItems,
  };
}

/**
 * Return a canonical empty OrderComponents struct used to pad bulk order
 * merkle trees to the required capacity.
 */
export function getEmptyOrderComponents(): OrderComponents {
  return {
    offerer: ZERO_ADDRESS,
    zone: ZERO_ADDRESS,
    offer: [],
    consideration: [],
    orderType: OrderType.FULL_OPEN,
    startTime: 0n,
    endTime: 0n,
    zoneHash: ZERO_BYTES32,
    salt: 0n,
    conduitKey: ZERO_BYTES32,
    counter: 0n,
  };
}

// ── Fulfillment component helpers ───────────────────────────

/**
 * Create default one-to-one offer fulfillment components for independent
 * order fulfillment. Each order's offer items each form their own
 * fulfillment group — no cross-order aggregation occurs. This is the
 * most common case.
 *
 * @param orders - Array of orders or advanced orders to generate
 *   components for. Each element must have a `parameters` property
 *   with an `offer` array.
 * @returns FulfillmentComponent[][] suitable for
 *   `fulfillAvailableOrders` / `fulfillAvailableAdvancedOrders`.
 */
export function aggregateOfferItems(
  orders: { parameters: { offer: readonly unknown[] } }[],
): FulfillmentComponent[][] {
  const components: FulfillmentComponent[][] = [];
  for (let i = 0; i < orders.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: loop index is bounded
    const offer = orders[i]!.parameters.offer;
    for (let j = 0; j < offer.length; j++) {
      components.push([{ orderIndex: BigInt(i), itemIndex: BigInt(j) }]);
    }
  }
  return components;
}

/**
 * Create default one-to-one consideration fulfillment components for
 * independent order fulfillment. Each order's consideration items each
 * form their own fulfillment group — no cross-order aggregation occurs.
 * This is the most common case.
 *
 * @param orders - Array of orders or advanced orders to generate
 *   components for. Each element must have a `parameters` property
 *   with a `consideration` array.
 * @returns FulfillmentComponent[][] suitable for
 *   `fulfillAvailableOrders` / `fulfillAvailableAdvancedOrders`.
 */
export function aggregateConsiderationItems(
  orders: { parameters: { consideration: readonly unknown[] } }[],
): FulfillmentComponent[][] {
  const components: FulfillmentComponent[][] = [];
  for (let i = 0; i < orders.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: loop index is bounded
    const consideration = orders[i]!.parameters.consideration;
    for (let j = 0; j < consideration.length; j++) {
      components.push([{ orderIndex: BigInt(i), itemIndex: BigInt(j) }]);
    }
  }
  return components;
}

// ── Fulfillment builders ────────────────────────────────────

/**
 * Sum all NATIVE consideration items to compute msg.value.
 */
function computeNativeValue(consideration: { itemType: ItemTypeValue; endAmount: bigint }[]): bigint {
  let value = 0n;
  for (const item of consideration) {
    if (item.itemType === ItemType.NATIVE) {
      value += item.endAmount;
    }
  }
  return value;
}

/**
 * Build a transaction for fulfillOrder.
 *
 * @param ctx - Seaport deployment context.
 * @param order - The order with OrderParameters and signature.
 * @param fulfillerConduitKey - Conduit key for the fulfiller. Defaults to zero.
 * @returns Transaction data ready to send.
 */
export function buildFulfillOrder(
  ctx: SeaportContext,
  order: { parameters: OrderParameters; signature: `0x${string}` },
  fulfillerConduitKey: `0x${string}` = ZERO_BYTES32,
): FulfillmentData {
  const ctxValid = validateSeaportContext(ctx);
  if (!ctxValid.valid) {
    throw new Error(ctxValid.reason);
  }

  return {
    to: ctx.address,
    data: encodeFulfillOrder(order, fulfillerConduitKey),
    value: computeNativeValue(order.parameters.consideration),
  };
}

/**
 * Build a transaction for fulfillAdvancedOrder.
 *
 * @param ctx - Seaport deployment context.
 * @param advancedOrder - The advanced order with partial fill params.
 * @param criteriaResolvers - Resolutions for criteria-based items.
 * @param fulfillerConduitKey - Conduit key for the fulfiller. Defaults to zero.
 * @param recipient - Address to receive the items. Defaults to zero (msg.sender).
 * @returns Transaction data ready to send.
 */
export function buildFulfillAdvancedOrder(
  ctx: SeaportContext,
  advancedOrder: AdvancedOrder,
  criteriaResolvers: CriteriaResolver[] = [],
  fulfillerConduitKey: `0x${string}` = ZERO_BYTES32,
  recipient: `0x${string}` = ZERO_ADDRESS,
): FulfillmentData {
  const ctxValid = validateSeaportContext(ctx);
  if (!ctxValid.valid) {
    throw new Error(ctxValid.reason);
  }

  checkUint120(advancedOrder.numerator, "numerator");
  checkUint120(advancedOrder.denominator, "denominator");
  return {
    to: ctx.address,
    data: encodeFulfillAdvancedOrder(
      advancedOrder,
      criteriaResolvers,
      fulfillerConduitKey,
      recipient,
    ),
    value: computeNativeValue(advancedOrder.parameters.consideration),
  };
}

/**
 * Build a transaction for fulfillAvailableOrders.
 *
 * @param ctx - Seaport deployment context.
 * @param orders - Array of orders to attempt fulfillment on.
 * @param offerFulfillments - Groups of offer items to aggregate.
 * @param considerationFulfillments - Groups of consideration items to aggregate.
 * @param fulfillerConduitKey - Conduit key for the fulfiller. Defaults to zero.
 * @param maximumFulfilled - Maximum number of orders to fulfill. Defaults to all.
 * @returns Transaction data ready to send.
 * @throws If maximumFulfilled exceeds orders.length.
 */
export function buildFulfillAvailableOrders(
  ctx: SeaportContext,
  orders: { parameters: OrderParameters; signature: `0x${string}` }[],
  offerFulfillments: FulfillmentComponent[][] = [],
  considerationFulfillments: FulfillmentComponent[][] = [],
  fulfillerConduitKey: `0x${string}` = ZERO_BYTES32,
  maximumFulfilled: bigint = BigInt(orders.length),
): FulfillmentData {
  const ctxValid = validateSeaportContext(ctx);
  if (!ctxValid.valid) {
    throw new Error(ctxValid.reason);
  }

  if (maximumFulfilled > BigInt(orders.length)) {
    throw new Error(
      `maximumFulfilled (${maximumFulfilled}) exceeds orders length (${orders.length})`,
    );
  }

  let value = 0n;
  for (const order of orders) {
    value += computeNativeValue(order.parameters.consideration);
  }
  return {
    to: ctx.address,
    data: encodeFulfillAvailableOrders(
      orders,
      offerFulfillments,
      considerationFulfillments,
      fulfillerConduitKey,
      maximumFulfilled,
    ),
    value,
  };
}

/**
 * Build a transaction for fulfillAvailableAdvancedOrders.
 *
 * @param ctx - Seaport deployment context.
 * @param advancedOrders - Array of advanced orders to attempt fulfillment on.
 * @param criteriaResolvers - Resolutions for criteria-based items.
 * @param offerFulfillments - Groups of offer items to aggregate.
 * @param considerationFulfillments - Groups of consideration items to aggregate.
 * @param fulfillerConduitKey - Conduit key for the fulfiller. Defaults to zero.
 * @param recipient - Address to receive the items. Defaults to zero (msg.sender).
 * @param maximumFulfilled - Maximum number of orders to fulfill. Defaults to all.
 * @returns Transaction data ready to send.
 * @throws If maximumFulfilled exceeds advancedOrders.length.
 */
export function buildFulfillAvailableAdvancedOrders(
  ctx: SeaportContext,
  advancedOrders: AdvancedOrder[],
  criteriaResolvers: CriteriaResolver[] = [],
  offerFulfillments: FulfillmentComponent[][] = [],
  considerationFulfillments: FulfillmentComponent[][] = [],
  fulfillerConduitKey: `0x${string}` = ZERO_BYTES32,
  recipient: `0x${string}` = ZERO_ADDRESS,
  maximumFulfilled: bigint = BigInt(advancedOrders.length),
): FulfillmentData {
  const ctxValid = validateSeaportContext(ctx);
  if (!ctxValid.valid) {
    throw new Error(ctxValid.reason);
  }

  for (const order of advancedOrders) {
    checkUint120(order.numerator, "numerator");
    checkUint120(order.denominator, "denominator");
  }

  if (maximumFulfilled > BigInt(advancedOrders.length)) {
    throw new Error(
      `maximumFulfilled (${maximumFulfilled}) exceeds advanced orders length (${advancedOrders.length})`,
    );
  }

  let value = 0n;
  for (const order of advancedOrders) {
    value += computeNativeValue(order.parameters.consideration);
  }
  return {
    to: ctx.address,
    data: encodeFulfillAvailableAdvancedOrders(
      advancedOrders,
      criteriaResolvers,
      offerFulfillments,
      considerationFulfillments,
      fulfillerConduitKey,
      recipient,
      maximumFulfilled,
    ),
    value,
  };
}
