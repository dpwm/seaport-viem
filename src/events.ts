import { decodeEventLog, encodeEventTopics } from "viem";
import type { Log } from "viem";
import type {
  SpentItem,
  ReceivedItem,
  OrderParameters,
} from "./types";
import { SeaportValidationError } from "./errors";
import { seaportEventAbi } from "./constants";

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

// ── Event topic hashes (computed from canonical seaportEventAbi) ──

// Compute all event topics at module load time from the single source of truth.
const _topics = seaportEventAbi.map(
  (abi) =>
    [abi.name, encodeEventTopics({ abi: [abi], eventName: abi.name })[0]!] as const,
);

/**
 * Map of Seaport event names to their keccak256 topic hashes.
 * Derived automatically from {@link seaportEventAbi} in constants.ts,
 * which is the single source of truth for event definitions.
 */
const EVENT_TOPIC_MAP = Object.fromEntries(_topics) as Record<
  string,
  `0x${string}`
>;

/** keccak256 topic hash for the OrderFulfilled event. */
export const ORDER_FULFILLED_TOPIC = EVENT_TOPIC_MAP.OrderFulfilled!;

/** keccak256 topic hash for the OrderCancelled event. */
export const ORDER_CANCELLED_TOPIC = EVENT_TOPIC_MAP.OrderCancelled!;

/** keccak256 topic hash for the OrderValidated event. */
export const ORDER_VALIDATED_TOPIC = EVENT_TOPIC_MAP.OrderValidated!;

/** keccak256 topic hash for the OrdersMatched event. */
export const ORDERS_MATCHED_TOPIC = EVENT_TOPIC_MAP.OrdersMatched!;

/** keccak256 topic hash for the CounterIncremented event. */
export const COUNTER_INCREMENTED_TOPIC = EVENT_TOPIC_MAP.CounterIncremented!;

// ── Event decoders ──────────────────────────────────────────

/**
 * Decode a Seaport event log into typed event arguments.
 *
 * Matches the log topic against known Seaport event signatures,
 * then uses viem's `decodeEventLog` with the corresponding event
 * ABI from the canonical {@link seaportEventAbi}.
 *
 * @param log - A viem Log object with `topics` and `data`.
 * @returns Decoded event arguments with `eventName`.
 * @throws If the log does not match any known Seaport event.
 */
export function decodeSeaportEvent(log: Log): SeaportEventArgs {
  const topic = log.topics[0];

  for (const abi of seaportEventAbi) {
    if (topic === EVENT_TOPIC_MAP[abi.name]) {
      const decoded = decodeEventLog({
        abi: [abi],
        data: log.data,
        topics: log.topics,
      });
      return { eventName: abi.name, ...decoded.args } as SeaportEventArgs;
    }
  }

  throw new SeaportValidationError(`Unknown Seaport event topic: ${topic}`);
}
