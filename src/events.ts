import type { Log } from "viem";
import { decodeEventLog, parseAbiItem } from "viem";
import type {
  SpentItem,
  ReceivedItem,
  OrderParameters,
} from "./types";
import { SeaportValidationError } from "./errors";

// ── Event argument types ────────────────────────────────────

/** Decoded arguments for the OrderFulfilled event. */
export type OrderFulfilledEventArgs = {
  orderHash: `0x${string}`;
  offerer: `0x${string}`;
  zone: `0x${string}`;
  recipient: `0x${string}`;
  offer: readonly SpentItem[];
  consideration: readonly ReceivedItem[];
};

/** Decoded arguments for the OrderCancelled event. */
export type OrderCancelledEventArgs = {
  orderHash: `0x${string}`;
  offerer: `0x${string}`;
  zone: `0x${string}`;
};

/** Decoded arguments for the OrderValidated event. */
export type OrderValidatedEventArgs = {
  orderHash: `0x${string}`;
  orderParameters: OrderParameters;
};

/** Decoded arguments for the OrdersMatched event. */
export type OrdersMatchedEventArgs = {
  orderHashes: readonly `0x${string}`[];
};

/** Decoded arguments for the CounterIncremented event. */
export type CounterIncrementedEventArgs = {
  newCounter: bigint;
  offerer: `0x${string}`;
};

/** Union of all Seaport decoded event argument types. */
export type SeaportEventArgs =
  | ({ eventName: "OrderFulfilled" } & OrderFulfilledEventArgs)
  | ({ eventName: "OrderCancelled" } & OrderCancelledEventArgs)
  | ({ eventName: "OrderValidated" } & OrderValidatedEventArgs)
  | ({ eventName: "OrdersMatched" } & OrdersMatchedEventArgs)
  | ({ eventName: "CounterIncremented" } & CounterIncrementedEventArgs);

// ── Event topic hashes ──────────────────────────────────────

/** keccak256 of the OrderFulfilled event signature. */
export const ORDER_FULFILLED_TOPIC =
  "0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31" as const;

/** keccak256 of the OrderCancelled event signature. */
export const ORDER_CANCELLED_TOPIC =
  "0x6bacc01dbe442496068f7d234edd811f1a5f833243e0aec824f86ab861f3c90d" as const;

/** keccak256 of the OrderValidated event signature. */
export const ORDER_VALIDATED_TOPIC =
  "0xf280791efe782edcf06ce15c8f4dff17601db3b88eb3805a0db7d77faf757f04" as const;

/** keccak256 of the OrdersMatched event signature. */
export const ORDERS_MATCHED_TOPIC =
  "0x4b9f2d36e1b4c93de62cc077b00b1a91d84b6c31b4a14e012718dcca230689e7" as const;

/** keccak256 of the CounterIncremented event signature. */
export const COUNTER_INCREMENTED_TOPIC =
  "0x721c20121297512b72821b97f5326877ea8ecf4bb9948fea5bfcb6453074d37f" as const;

// ── Parsed AbiEvent references (for use with viem helpers) ──

/** Parsed ABI for the OrderFulfilled event. */
export const OrderFulfilledEvent = parseAbiItem(
  "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)",
);

/** Parsed ABI for the OrderCancelled event. */
export const OrderCancelledEvent = parseAbiItem(
  "event OrderCancelled(bytes32 orderHash, address indexed offerer, address indexed zone)",
);

/** Parsed ABI for the OrderValidated event. */
export const OrderValidatedEvent = parseAbiItem(
  "event OrderValidated(bytes32 orderHash, (address offerer, address zone, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount)[] offer, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount, address recipient)[] consideration, uint8 orderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 conduitKey, uint256 totalOriginalConsiderationItems) orderParameters)",
);

/** Parsed ABI for the OrdersMatched event. */
export const OrdersMatchedEvent = parseAbiItem(
  "event OrdersMatched(bytes32[] orderHashes)",
);

/** Parsed ABI for the CounterIncremented event. */
export const CounterIncrementedEvent = parseAbiItem(
  "event CounterIncremented(uint256 newCounter, address indexed offerer)",
);

// ── Event decoders ──────────────────────────────────────────

/**
 * Decode a Seaport event log into typed event arguments.
 *
 * Matches the log topic against known Seaport event signatures,
 * then uses viem's `decodeEventLog` with the corresponding parsed
 * event ABI to produce type-safe arguments.
 *
 * @param log - A viem Log object with `topics` and `data`.
 * @returns Decoded event arguments with `eventName`.
 * @throws If the log does not match any known Seaport event.
 */
export function decodeSeaportEvent(log: Log): SeaportEventArgs {
  const topic = log.topics[0];

  if (topic === ORDER_FULFILLED_TOPIC) {
    const decoded = decodeEventLog({
      abi: [OrderFulfilledEvent],
      data: log.data,
      topics: log.topics,
    });
    const args = decoded.args as OrderFulfilledEventArgs;
    return { eventName: "OrderFulfilled" as const, ...args };
  }

  if (topic === ORDER_CANCELLED_TOPIC) {
    const decoded = decodeEventLog({
      abi: [OrderCancelledEvent],
      data: log.data,
      topics: log.topics,
    });
    const args = decoded.args as OrderCancelledEventArgs;
    return { eventName: "OrderCancelled" as const, ...args };
  }

  if (topic === ORDER_VALIDATED_TOPIC) {
    const decoded = decodeEventLog({
      abi: [OrderValidatedEvent],
      data: log.data,
      topics: log.topics,
    });
    const args = decoded.args as OrderValidatedEventArgs;
    return { eventName: "OrderValidated" as const, ...args };
  }

  if (topic === ORDERS_MATCHED_TOPIC) {
    const decoded = decodeEventLog({
      abi: [OrdersMatchedEvent],
      data: log.data,
      topics: log.topics,
    });
    const args = decoded.args as OrdersMatchedEventArgs;
    return { eventName: "OrdersMatched" as const, ...args };
  }

  if (topic === COUNTER_INCREMENTED_TOPIC) {
    const decoded = decodeEventLog({
      abi: [CounterIncrementedEvent],
      data: log.data,
      topics: log.topics,
    });
    const args = decoded.args as CounterIncrementedEventArgs;
    return { eventName: "CounterIncremented" as const, ...args };
  }

  throw new SeaportValidationError(`Unknown Seaport event topic: ${topic}`);
}
