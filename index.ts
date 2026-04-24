import type { TypedDataDomain, PublicClient, Abi } from "viem";
import {
  encodeFunctionData,
  verifyTypedData,
  hashTypedData,
} from "viem";

// ── Types ──────────────────────────────────────────────────────────

export type SeaportContext = {
  address: `0x${string}`;
  domain: TypedDataDomain;
};

export const ItemType = {
  NATIVE: 0,
  ERC20: 1,
  ERC721: 2,
  ERC1155: 3,
  ERC721_WITH_CRITERIA: 4,
  ERC1155_WITH_CRITERIA: 5,
} as const;

export type ItemTypeValue = (typeof ItemType)[keyof typeof ItemType];

export const OrderType = {
  FULL_OPEN: 0,
  PARTIAL_OPEN: 1,
  FULL_RESTRICTED: 2,
  PARTIAL_RESTRICTED: 3,
  CONTRACT: 4,
} as const;

export type OrderTypeValue = (typeof OrderType)[keyof typeof OrderType];

export const BasicOrderRouteType = {
  ETH_TO_ERC721: 0,
  ETH_TO_ERC1155: 1,
  ERC20_TO_ERC721: 2,
  ERC20_TO_ERC1155: 3,
  ERC721_TO_ERC20: 4,
  ERC1155_TO_ERC20: 5,
} as const;

export type BasicOrderRouteTypeValue =
  (typeof BasicOrderRouteType)[keyof typeof BasicOrderRouteType];

export type OfferItem = {
  itemType: ItemTypeValue;
  token: `0x${string}`;
  identifierOrCriteria: bigint;
  startAmount: bigint;
  endAmount: bigint;
};

export type ConsiderationItem = OfferItem & {
  recipient: `0x${string}`;
};

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

export type Order = {
  parameters: OrderComponents;
  signature: `0x${string}`;
};

export type AdditionalRecipient = {
  amount: bigint;
  recipient: `0x${string}`;
};

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

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export type FulfillmentData = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
};

// ── Constants ──────────────────────────────────────────────────────

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const NATIVE_TOKEN =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

// ── ABI ────────────────────────────────────────────────────────────

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
] as const satisfies Abi;

// ── Encoders ───────────────────────────────────────────────────────

export function encodeGetCounter(offerer: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: seaportAbi,
    functionName: "getCounter",
    args: [offerer],
  });
}

export function encodeGetOrderHash(
  orderComponents: OrderComponents,
): `0x${string}` {
  return encodeFunctionData({
    abi: seaportAbi,
    functionName: "getOrderHash",
    args: [orderComponents],
  });
}

export function encodeFulfillBasicOrder(
  params: BasicOrderParameters,
): `0x${string}` {
  return encodeFunctionData({
    abi: seaportAbi,
    functionName: "fulfillBasicOrder",
    args: [params],
  });
}

// ── EIP-712 ────────────────────────────────────────────────────────

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

// ── Signature ──────────────────────────────────────────────────────

export async function verifyOrderSignature(
  ctx: SeaportContext,
  order: Order,
): Promise<boolean> {
  try {
    return await verifyTypedData({
      domain: ctx.domain,
      types: EIP712_TYPES,
      primaryType: "OrderComponents",
      message: order.parameters,
      signature: order.signature,
      address: order.parameters.offerer,
    });
  } catch {
    return false;
  }
}

export function hashOrderComponents(
  ctx: SeaportContext,
  orderComponents: OrderComponents,
): `0x${string}` {
  return hashTypedData({
    domain: ctx.domain,
    types: EIP712_TYPES,
    primaryType: "OrderComponents",
    message: orderComponents,
  });
}

// ── Counter ────────────────────────────────────────────────────────

export async function getCounter(
  client: PublicClient,
  ctx: SeaportContext,
  offerer: `0x${string}`,
): Promise<bigint> {
  const data = encodeGetCounter(offerer);
  const result = await client.call({
    to: ctx.address,
    data,
  });
  return BigInt(result.data ?? "0");
}

// ── Validation ─────────────────────────────────────────────────────

export function validateOrderComponents(
  components: OrderComponents,
): ValidationResult {
  if (!components.offer || components.offer.length === 0) {
    return { valid: false, reason: "Order must have at least one offer item" };
  }

  for (const item of components.offer) {
    if (item.startAmount <= 0n || item.endAmount <= 0n) {
      return { valid: false, reason: "Offer amounts must be greater than 0" };
    }
  }

  if (!components.consideration || components.consideration.length === 0) {
    return {
      valid: false,
      reason: "Order must have at least one consideration item",
    };
  }

  for (const item of components.consideration) {
    if (item.startAmount <= 0n || item.endAmount <= 0n) {
      return {
        valid: false,
        reason: "Consideration amounts must be greater than 0",
      };
    }
  }

  if (components.startTime >= components.endTime) {
    return {
      valid: false,
      reason: "Start time must be before end time",
    };
  }

  return { valid: true };
}

// ── Fulfillment ────────────────────────────────────────────────────

export type FulfillmentOptions = {
  routeType?: BasicOrderRouteTypeValue;
  fulfillerConduitKey?: `0x${string}`;
  tips?: AdditionalRecipient[];
};

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

  const offerItem = order.parameters.offer[0];
  const primaryConsideration = order.parameters.consideration[0];

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

  const offerItem = order.parameters.offer[0];
  const primaryConsideration = order.parameters.consideration[0];

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

export function detectBasicOrderRouteType(
  order: Order,
): BasicOrderRouteTypeValue | null {
  if (!canFulfillAsBasicOrder(order)) {
    return null;
  }

  const offerItem = order.parameters.offer[0];
  const primaryConsideration = order.parameters.consideration[0];

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
