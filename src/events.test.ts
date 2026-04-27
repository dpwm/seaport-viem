import { describe, expect, test } from "bun:test";
import type { Log } from "viem";
import { encodeEventTopics, encodeAbiParameters, parseAbiParameters } from "viem";
import {
  decodeSeaportEvent,
  ORDER_FULFILLED_TOPIC,
  ORDER_CANCELLED_TOPIC,
  ORDER_VALIDATED_TOPIC,
  ORDERS_MATCHED_TOPIC,
  COUNTER_INCREMENTED_TOPIC,
  OrderFulfilledEvent,
  OrderCancelledEvent,
  OrderValidatedEvent,
  OrdersMatchedEvent,
  CounterIncrementedEvent,
} from "./events";
import type {
  OrderFulfilledEventArgs,
  OrderCancelledEventArgs,
  CounterIncrementedEventArgs,
} from "./events";
import { seaportEventAbi, ItemType, ZERO_ADDRESS, ZERO_BYTES32 } from "./index";
import { ALICE } from "./test-fixtures";

describe("seaportEventAbi", () => {
  test("has 5 events", () => {
    expect(seaportEventAbi).toHaveLength(5);
  });

  test("has expected event names", () => {
    const names = seaportEventAbi.map((item) => item.name);
    expect(names).toContain("OrderFulfilled");
    expect(names).toContain("OrderCancelled");
    expect(names).toContain("OrderValidated");
    expect(names).toContain("OrdersMatched");
    expect(names).toContain("CounterIncremented");
  });
});

describe("topic hashes", () => {
  test("ORDER_FULFILLED_TOPIC matches parsed event", () => {
    const computed = encodeEventTopics({
      abi: [OrderFulfilledEvent],
      eventName: "OrderFulfilled",
    })[0]!;
    expect(String(ORDER_FULFILLED_TOPIC)).toBe(String(computed));
  });

  test("ORDER_CANCELLED_TOPIC matches parsed event", () => {
    const computed = encodeEventTopics({
      abi: [OrderCancelledEvent],
      eventName: "OrderCancelled",
    })[0]!;
    expect(String(ORDER_CANCELLED_TOPIC)).toBe(String(computed));
  });

  test("ORDER_VALIDATED_TOPIC matches parsed event", () => {
    const computed = encodeEventTopics({
      abi: [OrderValidatedEvent],
      eventName: "OrderValidated",
    })[0]!;
    expect(String(ORDER_VALIDATED_TOPIC)).toBe(String(computed));
  });

  test("ORDERS_MATCHED_TOPIC matches parsed event", () => {
    const computed = encodeEventTopics({
      abi: [OrdersMatchedEvent],
      eventName: "OrdersMatched",
    })[0]!;
    expect(String(ORDERS_MATCHED_TOPIC)).toBe(String(computed));
  });

  test("COUNTER_INCREMENTED_TOPIC matches parsed event", () => {
    const computed = encodeEventTopics({
      abi: [CounterIncrementedEvent],
      eventName: "CounterIncremented",
    })[0]!;
    expect(String(COUNTER_INCREMENTED_TOPIC)).toBe(String(computed));
  });
});

function makeLog(data: `0x${string}`, topics: `0x${string}`[]): Log {
  return {
    data,
    topics: topics as [`0x${string}`, ...`0x${string}`[]],
    address: ZERO_ADDRESS,
    blockHash: ZERO_BYTES32,
    blockNumber: 0n,
    transactionHash: ZERO_BYTES32,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  };
}

describe("decodeSeaportEvent", () => {
  test("decodes OrderFulfilled event", () => {
    const offerAbi =
      "(uint8 itemType, address token, uint256 identifier, uint256 amount)";
    const considerationAbi =
      "(uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)";

    const data = encodeAbiParameters(
      parseAbiParameters(`bytes32, address, ${offerAbi}[], ${considerationAbi}[]`),
      [
        ZERO_BYTES32,
        ZERO_ADDRESS,
        [{ itemType: ItemType.ERC721, token: ALICE, identifier: 1n, amount: 1n }],
        [
          {
            itemType: ItemType.NATIVE,
            token: ZERO_ADDRESS,
            identifier: 0n,
            amount: 1000000000000000000n,
            recipient: ALICE,
          },
        ],
      ],
    );

    const topics = encodeEventTopics({
      abi: [OrderFulfilledEvent],
      eventName: "OrderFulfilled",
      args: { offerer: ALICE, zone: ZERO_ADDRESS },
    }) as `0x${string}`[];

    const decoded = decodeSeaportEvent(makeLog(data, topics));
    expect(decoded.eventName).toBe("OrderFulfilled");
    expect((decoded as OrderFulfilledEventArgs).offerer).toBeDefined();
  });

  test("decodes OrderCancelled event", () => {
    const data = encodeAbiParameters(parseAbiParameters("bytes32"), [
      ZERO_BYTES32,
    ]);

    const topics = encodeEventTopics({
      abi: [OrderCancelledEvent],
      eventName: "OrderCancelled",
      args: { offerer: ALICE, zone: ZERO_ADDRESS },
    }) as `0x${string}`[];

    const decoded = decodeSeaportEvent(makeLog(data, topics));
    expect(decoded.eventName).toBe("OrderCancelled");
    const args = decoded as OrderCancelledEventArgs;
    expect(args.orderHash).toBe(ZERO_BYTES32);
    expect(args.offerer).toBeDefined();
  });

  test("decodes CounterIncremented event", () => {
    const data = encodeAbiParameters(parseAbiParameters("uint256"), [42n]);

    const topics = encodeEventTopics({
      abi: [CounterIncrementedEvent],
      eventName: "CounterIncremented",
      args: { offerer: ALICE },
    }) as `0x${string}`[];

    const decoded = decodeSeaportEvent(makeLog(data, topics));
    expect(decoded.eventName).toBe("CounterIncremented");
    const args = decoded as CounterIncrementedEventArgs;
    expect(args.newCounter).toBe(42n);
    expect(args.offerer).toBeDefined();
  });

  test("throws for unknown event topic", () => {
    const log: Log = {
      data: "0x",
      topics: [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      ],
      address: ZERO_ADDRESS,
      blockHash: ZERO_BYTES32,
      blockNumber: 0n,
      logIndex: 0,
      removed: false,
      transactionHash: ZERO_BYTES32,
      transactionIndex: 0,
    };
    expect(() => decodeSeaportEvent(log)).toThrow(
      "Unknown Seaport event topic",
    );
  });
});
