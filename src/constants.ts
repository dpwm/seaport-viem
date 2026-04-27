import type { Abi } from "viem";

/** The zero address (0x0000...0000). */
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

/** A 32-byte zero value (0x0000...0000). */
export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Sentinel address used by Seaport to represent native ETH. */
export const NATIVE_TOKEN =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

/** Seaport contract ABI for getCounter, getOrderHash, and fulfillBasicOrder. */
export const seaportAbi = [
  {
    type: "function",
    name: "getCounter",
    stateMutability: "view",
    inputs: [{ name: "offerer", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getOrderHash",
    stateMutability: "view",
    inputs: [
      {
        name: "orderComponents",
        type: "tuple",
        components: [
          { name: "offerer", type: "address" },
          { name: "zone", type: "address" },
          {
            name: "offer",
            type: "tuple[]",
            components: [
              { name: "itemType", type: "uint8" },
              { name: "token", type: "address" },
              { name: "identifierOrCriteria", type: "uint256" },
              { name: "startAmount", type: "uint256" },
              { name: "endAmount", type: "uint256" },
            ],
          },
          {
            name: "consideration",
            type: "tuple[]",
            components: [
              { name: "itemType", type: "uint8" },
              { name: "token", type: "address" },
              { name: "identifierOrCriteria", type: "uint256" },
              { name: "startAmount", type: "uint256" },
              { name: "endAmount", type: "uint256" },
              { name: "recipient", type: "address" },
            ],
          },
          { name: "orderType", type: "uint8" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "zoneHash", type: "bytes32" },
          { name: "salt", type: "uint256" },
          { name: "conduitKey", type: "bytes32" },
          { name: "counter", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "fulfillBasicOrder",
    stateMutability: "payable",
    inputs: [
      {
        name: "parameters",
        type: "tuple",
        components: [
          { name: "considerationToken", type: "address" },
          { name: "considerationIdentifier", type: "uint256" },
          { name: "considerationAmount", type: "uint256" },
          { name: "offerer", type: "address" },
          { name: "zone", type: "address" },
          { name: "offerToken", type: "address" },
          { name: "offerIdentifier", type: "uint256" },
          { name: "offerAmount", type: "uint256" },
          { name: "basicOrderType", type: "uint8" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "zoneHash", type: "bytes32" },
          { name: "salt", type: "uint256" },
          { name: "offererConduitKey", type: "bytes32" },
          { name: "fulfillerConduitKey", type: "bytes32" },
          { name: "totalOriginalAdditionalRecipients", type: "uint256" },
          {
            name: "additionalRecipients",
            type: "tuple[]",
            components: [
              { name: "amount", type: "uint256" },
              { name: "recipient", type: "address" },
            ],
          },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "fulfillOrder",
    stateMutability: "payable",
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          {
            name: "parameters",
            type: "tuple",
            components: [
              { name: "offerer", type: "address" },
              { name: "zone", type: "address" },
              {
                name: "offer",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                ],
              },
              {
                name: "consideration",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                  { name: "recipient", type: "address" },
                ],
              },
              { name: "orderType", type: "uint8" },
              { name: "startTime", type: "uint256" },
              { name: "endTime", type: "uint256" },
              { name: "zoneHash", type: "bytes32" },
              { name: "salt", type: "uint256" },
              { name: "conduitKey", type: "bytes32" },
              { name: "totalOriginalConsiderationItems", type: "uint256" },
            ],
          },
          { name: "signature", type: "bytes" },
        ],
      },
      { name: "fulfillerConduitKey", type: "bytes32" },
    ],
    outputs: [{ name: "fulfilled", type: "bool" }],
  },
  {
    type: "function",
    name: "fulfillAdvancedOrder",
    stateMutability: "payable",
    inputs: [
      {
        name: "advancedOrder",
        type: "tuple",
        components: [
          {
            name: "parameters",
            type: "tuple",
            components: [
              { name: "offerer", type: "address" },
              { name: "zone", type: "address" },
              {
                name: "offer",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                ],
              },
              {
                name: "consideration",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                  { name: "recipient", type: "address" },
                ],
              },
              { name: "orderType", type: "uint8" },
              { name: "startTime", type: "uint256" },
              { name: "endTime", type: "uint256" },
              { name: "zoneHash", type: "bytes32" },
              { name: "salt", type: "uint256" },
              { name: "conduitKey", type: "bytes32" },
              { name: "totalOriginalConsiderationItems", type: "uint256" },
            ],
          },
          { name: "numerator", type: "uint120" },
          { name: "denominator", type: "uint120" },
          { name: "signature", type: "bytes" },
          { name: "extraData", type: "bytes" },
        ],
      },
      {
        name: "criteriaResolvers",
        type: "tuple[]",
        components: [
          { name: "orderIndex", type: "uint256" },
          { name: "side", type: "uint8" },
          { name: "index", type: "uint256" },
          { name: "identifier", type: "uint256" },
          { name: "criteriaProof", type: "bytes32[]" },
        ],
      },
      { name: "fulfillerConduitKey", type: "bytes32" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "fulfilled", type: "bool" }],
  },
  {
    type: "function",
    name: "fulfillAvailableOrders",
    stateMutability: "payable",
    inputs: [
      {
        name: "orders",
        type: "tuple[]",
        components: [
          {
            name: "parameters",
            type: "tuple",
            components: [
              { name: "offerer", type: "address" },
              { name: "zone", type: "address" },
              {
                name: "offer",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                ],
              },
              {
                name: "consideration",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                  { name: "recipient", type: "address" },
                ],
              },
              { name: "orderType", type: "uint8" },
              { name: "startTime", type: "uint256" },
              { name: "endTime", type: "uint256" },
              { name: "zoneHash", type: "bytes32" },
              { name: "salt", type: "uint256" },
              { name: "conduitKey", type: "bytes32" },
              { name: "totalOriginalConsiderationItems", type: "uint256" },
            ],
          },
          { name: "signature", type: "bytes" },
        ],
      },
      {
        name: "offerFulfillments",
        type: "tuple[][]",
        components: [
          { name: "orderIndex", type: "uint256" },
          { name: "itemIndex", type: "uint256" },
        ],
      },
      {
        name: "considerationFulfillments",
        type: "tuple[][]",
        components: [
          { name: "orderIndex", type: "uint256" },
          { name: "itemIndex", type: "uint256" },
        ],
      },
      { name: "fulfillerConduitKey", type: "bytes32" },
      { name: "maximumFulfilled", type: "uint256" },
    ],
    outputs: [
      { name: "availableOrders", type: "bool[]" },
      {
        name: "executions",
        type: "tuple[]",
        components: [
          {
            name: "item",
            type: "tuple",
            components: [
              { name: "itemType", type: "uint8" },
              { name: "token", type: "address" },
              { name: "identifier", type: "uint256" },
              { name: "amount", type: "uint256" },
              { name: "recipient", type: "address" },
            ],
          },
          { name: "offerer", type: "address" },
          { name: "conduitKey", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "fulfillAvailableAdvancedOrders",
    stateMutability: "payable",
    inputs: [
      {
        name: "advancedOrders",
        type: "tuple[]",
        components: [
          {
            name: "parameters",
            type: "tuple",
            components: [
              { name: "offerer", type: "address" },
              { name: "zone", type: "address" },
              {
                name: "offer",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                ],
              },
              {
                name: "consideration",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                  { name: "recipient", type: "address" },
                ],
              },
              { name: "orderType", type: "uint8" },
              { name: "startTime", type: "uint256" },
              { name: "endTime", type: "uint256" },
              { name: "zoneHash", type: "bytes32" },
              { name: "salt", type: "uint256" },
              { name: "conduitKey", type: "bytes32" },
              { name: "totalOriginalConsiderationItems", type: "uint256" },
            ],
          },
          { name: "numerator", type: "uint120" },
          { name: "denominator", type: "uint120" },
          { name: "signature", type: "bytes" },
          { name: "extraData", type: "bytes" },
        ],
      },
      {
        name: "criteriaResolvers",
        type: "tuple[]",
        components: [
          { name: "orderIndex", type: "uint256" },
          { name: "side", type: "uint8" },
          { name: "index", type: "uint256" },
          { name: "identifier", type: "uint256" },
          { name: "criteriaProof", type: "bytes32[]" },
        ],
      },
      {
        name: "offerFulfillments",
        type: "tuple[][]",
        components: [
          { name: "orderIndex", type: "uint256" },
          { name: "itemIndex", type: "uint256" },
        ],
      },
      {
        name: "considerationFulfillments",
        type: "tuple[][]",
        components: [
          { name: "orderIndex", type: "uint256" },
          { name: "itemIndex", type: "uint256" },
        ],
      },
      { name: "fulfillerConduitKey", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "maximumFulfilled", type: "uint256" },
    ],
    outputs: [
      { name: "availableOrders", type: "bool[]" },
      {
        name: "executions",
        type: "tuple[]",
        components: [
          {
            name: "item",
            type: "tuple",
            components: [
              { name: "itemType", type: "uint8" },
              { name: "token", type: "address" },
              { name: "identifier", type: "uint256" },
              { name: "amount", type: "uint256" },
              { name: "recipient", type: "address" },
            ],
          },
          { name: "offerer", type: "address" },
          { name: "conduitKey", type: "bytes32" },
        ],
      },
    ],
  },
] as const satisfies Abi;

/** Minimum merkle tree height for bulk orders. */
export const BULK_ORDER_HEIGHT_MIN = 1;

/** Maximum merkle tree height for bulk orders. */
export const BULK_ORDER_HEIGHT_MAX = 24;

/**
 * Seaport's bulk order merkle tree is binary (branch factor = 2).
 * Each node has exactly 2 children.
 */
export const BULK_ORDER_BRANCH_FACTOR = 2 as const;

/** EIP-712 type definitions for Seaport order signing. */
export const EIP712_TYPES = {
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" },
  ],
  OfferItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
  ],
  ConsiderationItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
} as const;

/**
 * Convert an EIP-712 type name and parameter list to its canonical type string.
 * @example eip712TypeString("OrderComponents", EIP712_TYPES.OrderComponents)
 * // => "OrderComponents(address offerer,address zone,...)"
 */
export function eip712TypeString(
  name: string,
  params: readonly { readonly name: string; readonly type: string }[],
): string {
  return `${name}(${params.map((p) => `${p.type} ${p.name}`).join(",")})`;
}

/** Canonical type string for the OrderComponents struct. Generated from EIP712_TYPES. */
export const ORDER_COMPONENTS_TYPE_STRING = eip712TypeString("OrderComponents", EIP712_TYPES.OrderComponents);

/** Canonical type string for the ConsiderationItem struct. Generated from EIP712_TYPES. */
export const CONSIDERATION_ITEM_TYPE_STRING = eip712TypeString("ConsiderationItem", EIP712_TYPES.ConsiderationItem);

/** Canonical type string for the OfferItem struct. Generated from EIP712_TYPES. */
export const OFFER_ITEM_TYPE_STRING = eip712TypeString("OfferItem", EIP712_TYPES.OfferItem);

/** Reusable ABI component definitions for OfferItem, derived from EIP712_TYPES.
 * Keeps ABI encoding in hashOrderComponentsStruct in sync with the EIP-712 type
 * definitions automatically. */
export const OFFER_ITEM_COMPONENTS = EIP712_TYPES.OfferItem;

/** Reusable ABI component definitions for ConsiderationItem, derived from EIP712_TYPES.
 * Keeps ABI encoding in hashOrderComponentsStruct in sync with the EIP-712 type
 * definitions automatically. */
export const CONSIDERATION_ITEM_COMPONENTS = EIP712_TYPES.ConsiderationItem;
