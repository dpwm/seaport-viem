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
  UINT120_MAX,
} from "./encode";
import { requireValidContext } from "./validate";
import { SeaportValidationError } from "./errors";

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
    throw new SeaportValidationError("Basic orders require exactly one offer item");
  }

  if (order.parameters.consideration.length < 1) {
    throw new SeaportValidationError("Order must have at least one consideration item");
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
 * @param options - Optional route type, conduit key, and tips. Tips inherit
 *   the primary consideration's token type (enforced by Seaport's
 *   `fulfillBasicOrder` ABI). For NATIVE considerations, tip amounts are
 *   included in `msg.value` automatically. For non-NATIVE considerations
 *   (ERC20, ERC721, ERC1155), the fulfiller must handle token approval
 *   separately — the library encodes the calldata but does not manage
 *   allowances.
 * @returns Transaction data ({@link FulfillmentData}) for wallet_sendTransaction.
 * @throws {SeaportValidationError} If the order cannot be fulfilled as a basic
 *   order and no explicit routeType is given, or if any tip has a zero or
 *   negative amount.
 */
export function buildBasicOrderFulfillment(
  ctx: SeaportContext,
  order: Order,
  options: FulfillmentOptions = {},
): FulfillmentData {
  requireValidContext(ctx);

  // Validate tips before encoding. Tips are appended to additionalRecipients
  // and inherit the primary consideration's token type (per the Seaport
  // contract's fulfillBasicOrder ABI). Validate amounts to catch zero-value
  // tips early, matching the pattern in validateOrderComponents.
  if (options.tips) {
    for (const tip of options.tips) {
      if (tip.amount <= 0n) {
        throw new SeaportValidationError(
          `Tip amount must be greater than 0, got ${tip.amount}`,
        );
      }
    }
  }

  const routeType = options.routeType ?? detectBasicOrderRouteType(order);
  if (routeType === null) {
    throw new SeaportValidationError("Order does not qualify for basic order fulfillment");
  }

  const params = toBasicOrderParameters(
    order,
    routeType,
    options.fulfillerConduitKey ?? ZERO_BYTES32,
    options.tips,
  );

  const data = encodeFulfillBasicOrder(params);

  // Use computeNativeValue on the full consideration array (consistent with
  // all other fulfillment builders) rather than blindly summing additional
  // recipients — those don't carry itemType info and could include ERC20
  // amounts that don't belong in msg.value.
  let value = computeNativeValue(order.parameters.consideration);

  // Tips in the basic order path are implicitly the same token type as the
  // primary consideration. Add them to msg.value only if that type is NATIVE.
  // biome-ignore lint/style/noNonNullAssertion: basic orders have ≥1 consideration
  const primaryConsideration = order.parameters.consideration[0]!;
  if (primaryConsideration.itemType === ItemType.NATIVE && options.tips) {
    for (const tip of options.tips) {
      value += tip.amount;
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
 * - All items must have static amounts (`startAmount === endAmount`). The
 *   basic order ABI encodes `endAmount` as a flat scalar with no
 *   interpolation logic, so Dutch auction orders (descending `startAmount`)
 *   or ascending-price orders must use the standard `fulfillOrder` path.
 * - Primary consideration recipient must be the offerer
 * - All consideration items must have the same itemType (basic order path treats
 *   all additional recipients as the same token type as the primary consideration)
 *
 * @private This is an internal helper used by `canFulfillAsBasicOrder` and
 *   `detectBasicOrderRouteType`. It is not part of the stable public API.
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

  // The basic order ABI encodes `endAmount` as a flat scalar with no
  // interpolation logic. Dutch auction orders (where `startAmount` >
  // `endAmount`) and ascending-price orders must use the standard
  // `fulfillOrder` path, which supports time-based interpolation.
  for (const item of order.parameters.offer) {
    if (item.startAmount !== item.endAmount) {
      return null;
    }
  }
  for (const item of order.parameters.consideration) {
    if (item.startAmount !== item.endAmount) {
      return null;
    }
  }

  if (primaryConsideration.recipient !== order.parameters.offerer) {
    return null;
  }

  // Basic order path treats all additional recipients as the same token type
  // as the primary consideration. If any non-primary consideration item has a
  // different itemType, the order cannot use the basic order path.
  for (let i = 1; i < order.parameters.consideration.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: guarded by length check above
    const item = order.parameters.consideration[i]!;
    if (item.itemType !== primaryConsideration.itemType) {
      return null;
    }
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
  return detectBasicOrderRouteType(order) !== null;
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
    if (primaryConsideration.itemType === ItemType.NATIVE) {
      return BasicOrderRouteType.ETH_TO_ERC721;
    }
    if (primaryConsideration.itemType === ItemType.ERC20) {
      return BasicOrderRouteType.ERC20_TO_ERC721;
    }
    return null;
  }

  if (offerItem.itemType === ItemType.ERC1155) {
    if (primaryConsideration.itemType === ItemType.NATIVE) {
      return BasicOrderRouteType.ETH_TO_ERC1155;
    }
    if (primaryConsideration.itemType === ItemType.ERC20) {
      return BasicOrderRouteType.ERC20_TO_ERC1155;
    }
    return null;
  }

  if (offerItem.itemType === ItemType.ERC20) {
    if (primaryConsideration.itemType === ItemType.ERC721) {
      return BasicOrderRouteType.ERC721_TO_ERC20;
    }
    if (primaryConsideration.itemType === ItemType.ERC1155) {
      return BasicOrderRouteType.ERC1155_TO_ERC20;
    }
    return null;
  }

  // Fallback: structurally eligible but unrecognized offer/consideration combo
  // (e.g., NATIVE offer item or ERC20/ERC20).
  return null;
}

/**
 * Convert OrderComponents to OrderParameters by replacing the counter field
 * with totalOriginalConsiderationItems. This produces the on-chain struct
 * expected by fulfillOrder and fulfillAdvancedOrder.
 *
 * @param components - The order components (from signing).
 * @param totalOriginalConsiderationItems - The number of original consideration
 *   items (before any tips). Must equal `components.consideration.length`.
 * @throws {SeaportValidationError} If `totalOriginalConsiderationItems` does
 *   not match `components.consideration.length`.
 */
export function toOrderParameters(
  components: OrderComponents,
  totalOriginalConsiderationItems: bigint,
): OrderParameters {
  if (totalOriginalConsiderationItems !== BigInt(components.consideration.length)) {
    throw new SeaportValidationError(
      `totalOriginalConsiderationItems (${totalOriginalConsiderationItems}) must match consideration.length (${components.consideration.length})`,
    );
  }

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
export function aggregateOfferItems<T extends { parameters: { offer: readonly OfferItem[] } }>(
  orders: T[],
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
export function aggregateConsiderationItems<T extends { parameters: { consideration: readonly ConsiderationItem[] } }>(
  orders: T[],
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
 *
 * Uses `max(startAmount, endAmount)` for each item to cover the maximum
 * possible consideration for Dutch auction orders. For constant-price
 * orders (where `startAmount === endAmount`), behavior is unchanged.
 */
export function computeNativeValue(
  consideration: readonly { itemType: ItemTypeValue; startAmount: bigint; endAmount: bigint }[],
): bigint {
  let value = 0n;
  for (const item of consideration) {
    if (item.itemType === ItemType.NATIVE) {
      value += item.startAmount > item.endAmount ? item.startAmount : item.endAmount;
    }
  }
  return value;
}

/**
 * Compute the total native value across all orders' consideration items.
 *
 * @internal This is an internal helper shared by fulfillment builders in this
 *   module and in `match.ts`. It is not part of the stable public API.
 */
export function computeTotalNativeValue(
  orders: readonly { parameters: { consideration: readonly ConsiderationItem[] } }[],
): bigint {
  let total = 0n;
  for (const order of orders) {
    total += computeNativeValue(order.parameters.consideration);
  }
  return total;
}

/**
 * Build a transaction for fulfillOrder.
 *
 * @param ctx - Seaport deployment context.
 * @param order - The order with OrderParameters and signature.
 * @param fulfillerConduitKey - Conduit key for the fulfiller. Defaults to zero.
 * @returns Transaction data ready to send.
 * @throws {SeaportValidationError} If the context is invalid, or if the order
 *   has no offer or consideration items.
 */
export function buildFulfillOrder(
  ctx: SeaportContext,
  order: { parameters: OrderParameters; signature: `0x${string}` },
  fulfillerConduitKey: `0x${string}` = ZERO_BYTES32,
): FulfillmentData {
  requireValidContext(ctx);

  if (order.parameters.offer.length === 0) {
    throw new SeaportValidationError("Order must have at least one offer item");
  }
  if (order.parameters.consideration.length === 0) {
    throw new SeaportValidationError("Order must have at least one consideration item");
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
 * @throws {SeaportValidationError} If the context is invalid, if the order has
 *   no offer or consideration items, if numerator or denominator exceed uint120
 *   range, or if denominator is zero or numerator exceeds denominator.
 */
export function buildFulfillAdvancedOrder(
  ctx: SeaportContext,
  advancedOrder: AdvancedOrder,
  criteriaResolvers: CriteriaResolver[] = [],
  fulfillerConduitKey: `0x${string}` = ZERO_BYTES32,
  recipient: `0x${string}` = ZERO_ADDRESS,
): FulfillmentData {
  requireValidContext(ctx);

  if (advancedOrder.parameters.offer.length === 0) {
    throw new SeaportValidationError("Order must have at least one offer item");
  }
  if (advancedOrder.parameters.consideration.length === 0) {
    throw new SeaportValidationError("Order must have at least one consideration item");
  }

  if (advancedOrder.numerator > UINT120_MAX) {
    throw new SeaportValidationError(
      `numerator must be a uint120 (0 to ${UINT120_MAX}), got ${advancedOrder.numerator}`,
    );
  }
  if (advancedOrder.denominator > UINT120_MAX) {
    throw new SeaportValidationError(
      `denominator must be a uint120 (0 to ${UINT120_MAX}), got ${advancedOrder.denominator}`,
    );
  }
  if (advancedOrder.denominator === 0n) {
    throw new SeaportValidationError("denominator must be non-zero");
  }
  if (advancedOrder.numerator > advancedOrder.denominator) {
    throw new SeaportValidationError(
      `numerator (${advancedOrder.numerator}) must be ≤ denominator (${advancedOrder.denominator})`,
    );
  }
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
 * @throws {SeaportValidationError} If the context is invalid, if no orders are
 *   provided, if both fulfillment arrays are empty, or if maximumFulfilled
 *   exceeds orders.length.
 */
export function buildFulfillAvailableOrders(
  ctx: SeaportContext,
  orders: { parameters: OrderParameters; signature: `0x${string}` }[],
  offerFulfillments: FulfillmentComponent[][] = [],
  considerationFulfillments: FulfillmentComponent[][] = [],
  fulfillerConduitKey: `0x${string}` = ZERO_BYTES32,
  maximumFulfilled: bigint = BigInt(orders.length),
): FulfillmentData {
  requireValidContext(ctx);

  if (orders.length === 0) {
    throw new SeaportValidationError("At least one order must be provided");
  }

  if (
    offerFulfillments.length === 0 &&
    considerationFulfillments.length === 0
  ) {
    throw new SeaportValidationError(
      "At least one offer fulfillment or consideration fulfillment must be provided",
    );
  }

  if (maximumFulfilled > BigInt(orders.length)) {
    throw new SeaportValidationError(
      `maximumFulfilled (${maximumFulfilled}) exceeds orders length (${orders.length})`,
    );
  }

  const value = computeTotalNativeValue(orders);
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
 * @throws {SeaportValidationError} If the context is invalid, if no orders are
 *   provided, if both fulfillment arrays are empty, if numerator or denominator
 *   are invalid, or if maximumFulfilled exceeds advancedOrders.length.
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
  requireValidContext(ctx);

  if (advancedOrders.length === 0) {
    throw new SeaportValidationError("At least one advanced order must be provided");
  }

  if (
    offerFulfillments.length === 0 &&
    considerationFulfillments.length === 0
  ) {
    throw new SeaportValidationError(
      "At least one offer fulfillment or consideration fulfillment must be provided",
    );
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

  if (maximumFulfilled > BigInt(advancedOrders.length)) {
    throw new SeaportValidationError(
      `maximumFulfilled (${maximumFulfilled}) exceeds advanced orders length (${advancedOrders.length})`,
    );
  }

  const value = computeTotalNativeValue(advancedOrders);
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
