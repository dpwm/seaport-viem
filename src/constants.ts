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

/** ABI for Seaport's getCounter(address) view function. */
export const getCounterAbiItem = {
  type: "function",
  name: "getCounter",
  stateMutability: "view",
  inputs: [{ name: "offerer", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
} as const;

/** ABI for Seaport's getOrderHash(OrderComponents) view function. */
export const getOrderHashAbiItem = {
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
} as const;

/** ABI for Seaport's fulfillBasicOrder(BasicOrderParameters) payable function. */
export const fulfillBasicOrderAbiItem = {
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
} as const;

/** ABI for Seaport's fulfillOrder(Order, bytes32) payable function. */
export const fulfillOrderAbiItem = {
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
} as const;

/** ABI for Seaport's fulfillAdvancedOrder payable function. */
export const fulfillAdvancedOrderAbiItem = {
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
} as const;

/** ABI for Seaport's fulfillAvailableOrders payable function. */
export const fulfillAvailableOrdersAbiItem = {
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
} as const;

/** ABI for Seaport's fulfillAvailableAdvancedOrders payable function. */
export const fulfillAvailableAdvancedOrdersAbiItem = {
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
} as const;

/** ABI for Seaport's cancel(OrderComponents[]) function. */
export const cancelAbiItem = {
  type: "function",
  name: "cancel",
  stateMutability: "nonpayable",
  inputs: [
    {
      name: "orders",
      type: "tuple[]",
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
  outputs: [{ name: "cancelled", type: "bool" }],
} as const;

/** ABI for Seaport's incrementCounter() function. */
export const incrementCounterAbiItem = {
  type: "function",
  name: "incrementCounter",
  stateMutability: "nonpayable",
  inputs: [],
  outputs: [{ name: "newCounter", type: "uint256" }],
} as const;

/** ABI for Seaport's getOrderStatus(bytes32) view function. */
export const getOrderStatusAbiItem = {
  type: "function",
  name: "getOrderStatus",
  stateMutability: "view",
  inputs: [{ name: "orderHash", type: "bytes32" }],
  outputs: [
    { name: "isValidated", type: "bool" },
    { name: "isCancelled", type: "bool" },
    { name: "totalFilled", type: "uint256" },
    { name: "totalSize", type: "uint256" },
  ],
} as const;

/** ABI for Seaport's matchOrders payable function. */
export const matchOrdersAbiItem = {
  type: "function",
  name: "matchOrders",
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
      name: "fulfillments",
      type: "tuple[]",
      components: [
        {
          name: "offerComponents",
          type: "tuple[]",
          components: [
            { name: "orderIndex", type: "uint256" },
            { name: "itemIndex", type: "uint256" },
          ],
        },
        {
          name: "considerationComponents",
          type: "tuple[]",
          components: [
            { name: "orderIndex", type: "uint256" },
            { name: "itemIndex", type: "uint256" },
          ],
        },
      ],
    },
  ],
  outputs: [
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
} as const;

/** ABI for Seaport's matchAdvancedOrders payable function. */
export const matchAdvancedOrdersAbiItem = {
  type: "function",
  name: "matchAdvancedOrders",
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
      name: "fulfillments",
      type: "tuple[]",
      components: [
        {
          name: "offerComponents",
          type: "tuple[]",
          components: [
            { name: "orderIndex", type: "uint256" },
            { name: "itemIndex", type: "uint256" },
          ],
        },
        {
          name: "considerationComponents",
          type: "tuple[]",
          components: [
            { name: "orderIndex", type: "uint256" },
            { name: "itemIndex", type: "uint256" },
          ],
        },
      ],
    },
    { name: "recipient", type: "address" },
  ],
  outputs: [
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
} as const;

/** ABI for Seaport's validate(Order[]) function. */
export const validateAbiItem = {
  type: "function",
  name: "validate",
  stateMutability: "nonpayable",
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
  ],
  outputs: [{ name: "validated", type: "bool" }],
} as const;

/** Full Seaport contract ABI, composed from individual named exports. */
export const seaportAbi = [
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
] as const satisfies Abi;

/** Seaport event ABI definitions for typed log parsing. */
export const seaportEventAbi = [
  {
    type: "event",
    name: "OrderFulfilled",
    inputs: [
      { name: "orderHash", type: "bytes32", indexed: false },
      { name: "offerer", type: "address", indexed: true },
      { name: "zone", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: false },
      {
        name: "offer",
        type: "tuple[]",
        components: [
          { name: "itemType", type: "uint8" },
          { name: "token", type: "address" },
          { name: "identifier", type: "uint256" },
          { name: "amount", type: "uint256" },
        ],
      },
      {
        name: "consideration",
        type: "tuple[]",
        components: [
          { name: "itemType", type: "uint8" },
          { name: "token", type: "address" },
          { name: "identifier", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "recipient", type: "address" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "OrderCancelled",
    inputs: [
      { name: "orderHash", type: "bytes32", indexed: false },
      { name: "offerer", type: "address", indexed: true },
      { name: "zone", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "OrderValidated",
    inputs: [
      { name: "orderHash", type: "bytes32", indexed: false },
      {
        name: "orderParameters",
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
    ],
  },
  {
    type: "event",
    name: "OrdersMatched",
    inputs: [
      { name: "orderHashes", type: "bytes32[]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CounterIncremented",
    inputs: [
      { name: "newCounter", type: "uint256", indexed: false },
      { name: "offerer", type: "address", indexed: true },
    ],
  },
] as const;

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

/** ABI parameter types for the OrderComponents struct hash in hashOrderComponentsStruct.
 * Derived from EIP712_TYPES.OrderComponents so the encoding stays in sync
 * automatically. Array-typed fields (offer, consideration) map to bytes32
 * (their keccak256 hash), matching the struct hash convention.
 * The ORDER_TYPEHASH is prepended separately in hashOrderComponentsStruct.
 *
 * @internal This is an internal ABI-encoding helper used by `hashOrderComponentsStruct`.
 *   It is exported from the module for access by `signature.ts` but is not part
 *   of the stable public API. */
export const ORDER_COMPONENTS_STRUCT_ABI_TYPES = EIP712_TYPES.OrderComponents.map(
  (field) => ({
    type: field.type.endsWith("[]") ? "bytes32" : field.type,
  }),
);
