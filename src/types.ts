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

/**
 * An item being offered in a Seaport order.
 *
 * Mirrors the Solidity `OfferItem` struct in
 * [ConsiderationStructs.sol](https://github.com/ProjectOpenSea/seaport-core/blob/main/src/lib/ConsiderationStructs.sol).
 */
export type OfferItem = {
  itemType: ItemTypeValue;
  token: `0x${string}`;
  /**
   * For concrete items (NATIVE, ERC20, ERC721, ERC1155): the exact
   * token ID or amount.
   *
   * For criteria-based items (ERC721_WITH_CRITERIA, ERC1155_WITH_CRITERIA):
   * the merkle root of the criteria tree. `identifierOrCriteria = 0` means
   * "any token in the collection" (the default OpenSea criteria).
   */
  identifierOrCriteria: bigint;
  startAmount: bigint;
  endAmount: bigint;
};

/**
 * A consideration item (payment/fee) in a Seaport order.
 *
 * Extends {@link OfferItem} with a `recipient` — the address that
 * receives this item when the order is fulfilled.
 *
 * Mirrors the Solidity `ConsiderationItem` struct.
 */
export type ConsiderationItem = OfferItem & {
  recipient: `0x${string}`;
};

/**
 * The core components of a Seaport order that get EIP-712 signed.
 *
 * Mirrors the Solidity `OrderComponents` struct defined in
 * [ConsiderationStructs.sol](https://github.com/ProjectOpenSea/seaport-core/blob/main/src/lib/ConsiderationStructs.sol).
 *
 * ## Fields that can ruin your order if wrong
 *
 * Several fields have security and correctness implications that aren't
 * obvious from their types alone. Getting any of these wrong produces an
 * order that is unfulfillable, cancellable by anyone, or silently rejected
 * by the zone:
 *
 * | Field | Gone wrong if… |
 * |--------|----------------|
 * | `counter` | Wrong value → signature mismatch. Must be the offerer's
 *   current on-chain counter (use {@link getCounter}). |
 * | `salt` | Not unique per order → order hash collision, cancellable by
 *   anyone via `cancel()` with the colliding components. |
 * | `zone` | Set to a zone address but `zoneHash` doesn't match → zone
 *   rejects the order during `validateOrder`. |
 * | `zoneHash` | Non-zero on a non-restricted order → ignored but still
 *   part of the signed hash. Non-zero with zero `zone` → meaningless. |
 * | `conduitKey` | References a conduit the offerer hasn't approved →
 *   token transfer fails. Zero key = direct transfer (no conduit). |
 * | `startTime` / `endTime` | `startTime > endTime` → order is always
 *   invalid. Too narrow a window → expires before fulfillment. |
 *
 * All of these are included in the EIP-712 signature. The contract
 * computes the order hash as:
 *
 * ```
 * keccak256(ORDER_TYPEHASH ‖ offerer ‖ zone ‖ offerHash ‖
 *            considerationHash ‖ orderType ‖ startTime ‖ endTime ‖
 *            zoneHash ‖ salt ‖ conduitKey ‖ counter)
 * ```
 *
 * If any field differs from what was signed, the signature won't verify.
 */
export type OrderComponents = {
  /**
   * The address that created and signed the order. Must match the
   * signer or the signature verification in `validateOrder` will fail.
   */
  offerer: `0x${string}`;

  /**
   * The zone address for restricted orders (order type 2–3) and contract
   * orders (type 4).
   *
   * For **full open** and **partial open** orders (type 0–1), this should
   * be the zero address (`0x0000…0000`). No zone validation is performed.
   *
   * For **restricted orders** (type 2–3), the zone is a contract that
   * implements `validateOrder`. After execution, Seaport calls
   * `validateOrder` on the zone with the order hash, offerer, fulfiller,
   * and `zoneHash`. The zone must return a magic value (`0x0b2a4e1c`)
   * or the order is rejected. The zone itself can also cancel the order.
   *
   * For **contract orders** (type 4), the zone is the offerer contract
   * that implements `ratifyOrder`.
   *
   * @see {@link https://github.com/ProjectOpenSea/seaport-core/blob/main/src/lib/ZoneInteraction.sol Seaport ZoneInteraction.sol}
   */
  zone: `0x${string}`;

  /**
   * The items the offerer is offering (spending).
   *
   * For listings, these are the NFTs being sold. For offers, these are
   * the items the buyer wants to receive.
   */
  offer: OfferItem[];

  /**
   * The items the offerer wants in return (receiving).
   *
   * For listings, the first item is what the seller receives
   * (typically ETH/ERC20). Additional items are royalties and fees.
   */
  consideration: ConsiderationItem[];

  /**
   * Order type controlling partial fills and restriction.
   *
   * - `FULL_OPEN (0)` — anyone fulfills, no partial fills.
   * - `PARTIAL_OPEN (1)` — anyone fulfills, partial fills allowed.
   * - `FULL_RESTRICTED (2)` — only offerer or zone fulfills, no partial fills.
   * - `PARTIAL_RESTRICTED (3)` — only offerer or zone fulfills, partial fills
   *   allowed.
   * - `CONTRACT (4)` — contract offerer with `numerator = denominator = 1`.
   *
   * @see {@link OrderType}
   * @see {@link https://github.com/ProjectOpenSea/seaport-types/blob/main/src/lib/ConsiderationEnums.sol ConsiderationEnums.sol}
   */
  orderType: OrderTypeValue;

  /**
   * Unix timestamp (seconds) when the order becomes fillable.
   *
   * Must be ≤ the current block timestamp when `validate` or any
   * fulfillment function is called. Use `0` for immediately active.
   *
   * Must be `< endTime`. If `startTime >= endTime`, the order is
   * permanently invalid.
   */
  startTime: bigint;

  /**
   * Unix timestamp (seconds) when the order expires.
   *
   * Must be ≥ the current block timestamp when `validate` or any
   * fulfillment function is called. Use `type(uint256).max`
   * (`0xffff…ffff` as a bigint) for never-expiring.
   */
  endTime: bigint;

  /**
   * An arbitrary 32-byte value passed to the zone during
   * `validateOrder` for restricted orders (type 2–3).
   *
   * For non-restricted orders (type 0–1), this field is ignored by
   * the contract but is still part of the signed EIP-712 hash. Set
   * it to `0x0000…0000` unless your zone expects a specific value.
   *
   * @see {@link ZoneParameters} in ConsiderationStructs.sol
   */
  zoneHash: `0x${string}`;

  /**
   * A unique value used to differentiate orders with otherwise
   * identical parameters.
   *
   * **Critical**: If two orders share the same offerer, same
   * parameters, and same `salt`, they produce the same order hash.
   * This means `cancel([components])` on one order cancels both.
   * Always use a unique salt per order.
   *
   * Seaport 1.6 requires `salt != 0` — the zero salt is reserved
   * as an errant value.
   */
  salt: bigint;

  /**
   * The conduit key identifying which conduit to use for token
   * transfers.
   *
   * - `0x0000…0000` — direct transfer (no conduit). Tokens must be
   *   approved to the Seaport contract directly.
   * - Non-zero — the conduit derived from this key is used. The
   *   offerer must have approved the conduit via `ConduitController`.
   *
   * Conduits batch token approvals and transfers, saving gas when
   * making many listings. The key is the `salt` passed to
   * `CREATE2` when the conduit controller deploys the conduit.
   *
   * @see {@link https://github.com/ProjectOpenSea/seaport-core/blob/main/src/lib/GettersAndDerivers.sol GettersAndDerivers.sol} `_deriveConduit`
   */
  conduitKey: `0x${string}`;

  /**
   * The offerer's counter at the time the order was signed.
   *
   * **Must match the current on-chain counter value** for the
   * offerer. Seaport uses this to bind the order hash to a
   * specific counter state, so incrementing the counter
   * (`incrementCounter()`) invalidates all orders signed with
   * the previous counter value.
   *
   * Always read the current counter via {@link getCounter}
   * before signing. Never hardcode this to `0` — the counter
   * may have been incremented by a previous order.
   *
   * @see {@link getCounter}
   * @see {@link https://github.com/ProjectOpenSea/seaport-core/blob/main/src/lib/CounterManager.sol CounterManager.sol}
   */
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

/**
 * Result of order signature verification.
 *
 * - `valid: true` — signature cryptographically verifies and recovers
 *   to `order.parameters.offerer`.
 * - `reason: 'invalid-signature'` — the signature is structurally
 *   malformed or cryptographically invalid (bad length, bad r/s/v,
 *   unrecoverable public key).
 * - `reason: 'offerer-mismatch'` — the signature is valid but recovers
 *   to a different address than the order's `offerer`. The `recovered`
 *   field contains the actual signer address.
 */
export type OrderVerificationResult =
  | { valid: true }
  | { valid: false; reason: 'invalid-signature' }
  | { valid: false; reason: 'offerer-mismatch'; recovered: `0x${string}` };

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

/** A spent (offer) item in Seaport event data. */
export type SpentItem = {
  itemType: ItemTypeValue;
  token: `0x${string}`;
  identifier: bigint;
  amount: bigint;
};

/** On-chain order status returned by getOrderStatus. */
export type OrderStatus = {
  isValidated: boolean;
  isCancelled: boolean;
  totalFilled: bigint;
  totalSize: bigint;
};
