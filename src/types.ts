import type { TypedDataDomain } from "viem";

/** Context for interacting with a Seaport deployment. */
export type SeaportContext = {
  address: `0x${string}`;
  domain: TypedDataDomain;
};

/** Seaport item type enum values. */
export const ItemType = {
  NATIVE: 0,
  ERC20: 1,
  ERC721: 2,
  ERC1155: 3,
  ERC721_WITH_CRITERIA: 4,
  ERC1155_WITH_CRITERIA: 5,
} as const;

/** Numeric value of an {@link ItemType} member. */
export type ItemTypeValue = (typeof ItemType)[keyof typeof ItemType];

/** Seaport order type enum values. */
export const OrderType = {
  FULL_OPEN: 0,
  PARTIAL_OPEN: 1,
  FULL_RESTRICTED: 2,
  PARTIAL_RESTRICTED: 3,
  CONTRACT: 4,
} as const;

/** Numeric value of an {@link OrderType} member. */
export type OrderTypeValue = (typeof OrderType)[keyof typeof OrderType];

/**
 * Basic order route type enum values.
 * Each route is from the fulfiller's perspective (what the fulfiller sends → what they receive).
 */
export const BasicOrderRouteType = {
  ETH_TO_ERC721: 0,
  ETH_TO_ERC1155: 1,
  ERC20_TO_ERC721: 2,
  ERC20_TO_ERC1155: 3,
  ERC721_TO_ERC20: 4,
  ERC1155_TO_ERC20: 5,
} as const;

/** Numeric value of a {@link BasicOrderRouteType} member. */
export type BasicOrderRouteTypeValue =
  (typeof BasicOrderRouteType)[keyof typeof BasicOrderRouteType];

/** An item being offered in a Seaport order. */
export type OfferItem = {
  itemType: ItemTypeValue;
  token: `0x${string}`;
  identifierOrCriteria: bigint;
  startAmount: bigint;
  endAmount: bigint;
};

/** A consideration item (payment/fee) in a Seaport order. */
export type ConsiderationItem = OfferItem & {
  recipient: `0x${string}`;
};

/** The core components of a Seaport order. */
export type OrderComponents = {
  offerer: `0x${string}`;
  zone: `0x${string}`;
  offer: OfferItem[];
  consideration: ConsiderationItem[];
  orderType: OrderTypeValue;
  startTime: bigint;
  endTime: bigint;
  zoneHash: `0x${string}`;
  salt: bigint;
  conduitKey: `0x${string}`;
  counter: bigint;
};

/** A Seaport order with its cryptographic signature. */
export type Order = {
  parameters: OrderComponents;
  signature: `0x${string}`;
};

/** An additional recipient (tip/fee) in a basic order. */
export type AdditionalRecipient = {
  amount: bigint;
  recipient: `0x${string}`;
};

/** Flattened parameters for Seaport's fulfillBasicOrder function. */
export type BasicOrderParameters = {
  considerationToken: `0x${string}`;
  considerationIdentifier: bigint;
  considerationAmount: bigint;
  offerer: `0x${string}`;
  zone: `0x${string}`;
  offerToken: `0x${string}`;
  offerIdentifier: bigint;
  offerAmount: bigint;
  basicOrderType: number;
  startTime: bigint;
  endTime: bigint;
  zoneHash: `0x${string}`;
  salt: bigint;
  offererConduitKey: `0x${string}`;
  fulfillerConduitKey: `0x${string}`;
  totalOriginalAdditionalRecipients: bigint;
  additionalRecipients: AdditionalRecipient[];
  signature: `0x${string}`;
};

/** Result of order component validation. */
export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/** Transaction data ready to be sent on-chain. */
export type FulfillmentData = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
};

/** Options for building a basic order fulfillment. */
export type FulfillmentOptions = {
  routeType?: BasicOrderRouteTypeValue;
  fulfillerConduitKey?: `0x${string}`;
  tips?: AdditionalRecipient[];
};

/** Seaport's on-chain OrderParameters struct (OrderComponents with totalOriginalConsiderationItems instead of counter). */
export type OrderParameters = {
  offerer: `0x${string}`;
  zone: `0x${string}`;
  offer: OfferItem[];
  consideration: ConsiderationItem[];
  orderType: OrderTypeValue;
  startTime: bigint;
  endTime: bigint;
  zoneHash: `0x${string}`;
  salt: bigint;
  conduitKey: `0x${string}`;
  totalOriginalConsiderationItems: bigint;
};

/** An advanced order with numerator/denominator for partial fills. */
export type AdvancedOrder = {
  parameters: OrderParameters;
  numerator: bigint;
  denominator: bigint;
  signature: `0x${string}`;
  extraData: `0x${string}`;
};

/**
 * A component identifying an item in a fulfillment group.
 * Both fields are `bigint` (matching Seaport's uint256 ABI encoding).
 * Callers must convert `number` values via `BigInt()` — passing a raw
 * `number` risks silent precision loss for values > 2^53.
 */
export type FulfillmentComponent = {
  orderIndex: bigint;
  itemIndex: bigint;
};

/**
 * Side enum for criteria resolution.
 * Indicates whether a criteria resolver applies to the offer side (0) or
 * consideration side (1) of an order.
 */
export const Side = {
  OFFER: 0,
  CONSIDERATION: 1,
} as const;

/** Numeric value of a {@link Side} member. */
export type SideValue = (typeof Side)[keyof typeof Side];

/** Resolves criteria-based items to specific token identifiers. */
export type CriteriaResolver = {
  orderIndex: bigint;
  side: SideValue;
  index: bigint;
  identifier: bigint;
  criteriaProof: `0x${string}`[];
};

/** Pairs offer and consideration fulfillment components for order matching. */
export type Fulfillment = {
  offerComponents: FulfillmentComponent[];
  considerationComponents: FulfillmentComponent[];
};

/** A received item in a Seaport execution result. */
export type ReceivedItem = {
  itemType: ItemTypeValue;
  token: `0x${string}`;
  identifier: bigint;
  amount: bigint;
  recipient: `0x${string}`;
};

/** A resolved execution from fulfillAvailable* or match* functions. */
export type Execution = {
  item: ReceivedItem;
  offerer: `0x${string}`;
  conduitKey: `0x${string}`;
};
