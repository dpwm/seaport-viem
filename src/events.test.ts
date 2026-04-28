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
  OrderValidatedEventArgs,
  OrdersMatchedEventArgs,
} from "./events";
import { seaportEventAbi, ItemType, OrderType, ZERO_ADDRESS, ZERO_BYTES32 } from "./index";
import { ALICE, NFT } from "./test-fixtures";

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

describe("event ABI cross-check", () => {
  // Verify that the JSON ABI (seaportEventAbi) and the parseAbiItem() strings
  // produce identical topic hashes. If either definition is changed without
  // updating the other, at least one of these tests will fail.

  const eventNames = [
    "OrderFulfilled",
    "OrderCancelled",
    "OrderValidated",
    "OrdersMatched",
    "CounterIncremented",
  ] as const;

  // Map from JSON ABI event name to corresponding parseAbiItem export
  const parsedEvents: Record<string, unknown> = {
    OrderFulfilled: OrderFulfilledEvent,
    OrderCancelled: OrderCancelledEvent,
    OrderValidated: OrderValidatedEvent,
    OrdersMatched: OrdersMatchedEvent,
    CounterIncremented: CounterIncrementedEvent,
  };

  for (const name of eventNames) {
    test(`${name} topic hash matches between JSON ABI and parseAbiItem`, () => {
      const jsonAbiItem = seaportEventAbi.find((e) => e.name === name);
      expect(jsonAbiItem).toBeDefined();

      const fromJson = encodeEventTopics({
        abi: [jsonAbiItem!],
        eventName: name,
      })[0]!;

      const fromParsed = encodeEventTopics({
        abi: [parsedEvents[name]] as any,
        eventName: name,
      })[0]!;

      expect(String(fromJson)).toBe(String(fromParsed));
    });
  }

  // Also verify that both definitions match the hardcoded topic constants
  const topicConstants: Record<string, string> = {
    OrderFulfilled: ORDER_FULFILLED_TOPIC,
    OrderCancelled: ORDER_CANCELLED_TOPIC,
    OrderValidated: ORDER_VALIDATED_TOPIC,
    OrdersMatched: ORDERS_MATCHED_TOPIC,
    CounterIncremented: COUNTER_INCREMENTED_TOPIC,
  };

  for (const name of eventNames) {
    test(`${name} hardcoded topic constant matches ABI definitions`, () => {
      const fromJson = encodeEventTopics({
        abi: [seaportEventAbi.find((e) => e.name === name)!],
        eventName: name,
      })[0]!;
      expect(String(fromJson)).toBe(String(topicConstants[name]));
    });
  }
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

  test("decodes OrderValidated event", () => {
    const data = encodeAbiParameters(
      seaportEventAbi[2].inputs as any,
      [
        ZERO_BYTES32,
        {
          offerer: ALICE,
          zone: ZERO_ADDRESS,
          offer: [
            {
              itemType: ItemType.ERC721,
              token: NFT,
              identifierOrCriteria: 1n,
              startAmount: 1n,
              endAmount: 1n,
            },
          ],
          consideration: [
            {
              itemType: ItemType.NATIVE,
              token: ZERO_ADDRESS,
              identifierOrCriteria: 0n,
              startAmount: 1000000000000000000n,
              endAmount: 1000000000000000000n,
              recipient: ALICE,
            },
          ],
          orderType: OrderType.FULL_OPEN,
          startTime: 1000n,
          endTime: 2000n,
          zoneHash: ZERO_BYTES32,
          salt: 1n,
          conduitKey: ZERO_BYTES32,
          totalOriginalConsiderationItems: 1n,
        },
      ],
    );

    const topics = encodeEventTopics({
      abi: [OrderValidatedEvent],
      eventName: "OrderValidated",
    }) as `0x${string}`[];

    const decoded = decodeSeaportEvent(makeLog(data, topics));
    expect(decoded.eventName).toBe("OrderValidated");
    const args = decoded as OrderValidatedEventArgs;
    expect(args.orderHash).toBe(ZERO_BYTES32);
    expect(args.orderParameters.offerer.toLowerCase()).toBe(ALICE.toLowerCase());
    expect(args.orderParameters.offer).toHaveLength(1);
    expect(args.orderParameters.consideration).toHaveLength(1);
    expect(args.orderParameters.orderType).toBe(OrderType.FULL_OPEN);
    expect(args.orderParameters.offer[0]!.token.toLowerCase()).toBe(NFT.toLowerCase());
    expect(args.orderParameters.offer[0]!.itemType).toBe(ItemType.ERC721);
    expect(
      args.orderParameters.consideration[0]!.recipient.toLowerCase(),
    ).toBe(ALICE.toLowerCase());
    expect(args.orderParameters.totalOriginalConsiderationItems).toBe(1n);
  });

  test("decodes OrdersMatched event", () => {
    const orderHashes: `0x${string}`[] = [
      ZERO_BYTES32,
      "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
    ];

    const data = encodeAbiParameters(
      parseAbiParameters("bytes32[]"),
      [orderHashes],
    );

    const topics = encodeEventTopics({
      abi: [OrdersMatchedEvent],
      eventName: "OrdersMatched",
    }) as `0x${string}`[];

    const decoded = decodeSeaportEvent(makeLog(data, topics));
    expect(decoded.eventName).toBe("OrdersMatched");
    const args = decoded as OrdersMatchedEventArgs;
    expect(args.orderHashes).toHaveLength(2);
    expect(args.orderHashes[0]).toBe(ZERO_BYTES32);
    expect(args.orderHashes[1]).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
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
