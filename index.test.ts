import { describe, expect, test } from "bun:test";
import {
  ItemType,
  OrderType,
  BasicOrderRouteType,
  validateOrderComponents,
  canFulfillAsBasicOrder,
  detectBasicOrderRouteType,
  toBasicOrderParameters,
  buildBasicOrderFulfillment,
  hashOrderComponents,
  encodeGetCounter,
  encodeGetOrderHash,
  encodeFulfillBasicOrder,
  seaportAbi,
  EIP712_TYPES,
} from "./index";
import type {
  OrderComponents,
  Order,
  OfferItem,
  ConsiderationItem,
  SeaportContext,
} from "./index";

// ── Fixtures ─────────────────────────────────────────────────────

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const ALICE =
  "0xaaaa000000000000000000000000000000000001" as `0x${string}`;
const BOB =
  "0xbbbb000000000000000000000000000000000002" as `0x${string}`;
const TOKEN =
  "0xcccc000000000000000000000000000000000003" as `0x${string}`;
const NFT =
  "0xdddd000000000000000000000000000000000004" as `0x${string}`;
const SEAPORT_ADDRESS =
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC" as `0x${string}`;

const ctx: SeaportContext = {
  address: SEAPORT_ADDRESS,
  domain: {
    name: "Seaport",
    version: "1.6",
    chainId: 1,
    verifyingContract: SEAPORT_ADDRESS,
  },
};

function makeOfferItem(overrides?: Partial<OfferItem>): OfferItem {
  return {
    itemType: ItemType.ERC721,
    token: NFT,
    identifierOrCriteria: 1n,
    startAmount: 1n,
    endAmount: 1n,
    ...overrides,
  };
}

function makeConsiderationItem(
  overrides?: Partial<ConsiderationItem>,
): ConsiderationItem {
  return {
    itemType: ItemType.NATIVE,
    token: ZERO_ADDRESS,
    identifierOrCriteria: 0n,
    startAmount: 1000000000000000000n,
    endAmount: 1000000000000000000n,
    recipient: ALICE,
    ...overrides,
  };
}

function makeOrderComponents(
  overrides?: Partial<OrderComponents>,
): OrderComponents {
  return {
    offerer: ALICE,
    zone: ZERO_ADDRESS,
    offer: [makeOfferItem()],
    consideration: [makeConsiderationItem()],
    orderType: OrderType.FULL_OPEN,
    startTime: 1000n,
    endTime: 2000n,
    zoneHash: ZERO_BYTES32,
    salt: 1n,
    conduitKey: ZERO_BYTES32,
    counter: 0n,
    ...overrides,
  };
}

function makeOrder(overrides?: Partial<Order>): Order {
  return {
    parameters: makeOrderComponents(),
    signature:
      "0x" +
      "ab".repeat(65) as `0x${string}`,
    ...overrides,
  };
}

// ── Constants & ABI ──────────────────────────────────────────────

describe("constants", () => {
  test("ItemType values are correct", () => {
    expect(ItemType.NATIVE).toBe(0);
    expect(ItemType.ERC20).toBe(1);
    expect(ItemType.ERC721).toBe(2);
    expect(ItemType.ERC1155).toBe(3);
    expect(ItemType.ERC721_WITH_CRITERIA).toBe(4);
    expect(ItemType.ERC1155_WITH_CRITERIA).toBe(5);
  });

  test("OrderType values are correct", () => {
    expect(OrderType.FULL_OPEN).toBe(0);
    expect(OrderType.PARTIAL_OPEN).toBe(1);
    expect(OrderType.FULL_RESTRICTED).toBe(2);
    expect(OrderType.PARTIAL_RESTRICTED).toBe(3);
    expect(OrderType.CONTRACT).toBe(4);
  });

  test("BasicOrderRouteType values are correct", () => {
    expect(BasicOrderRouteType.ETH_TO_ERC721).toBe(0);
    expect(BasicOrderRouteType.ETH_TO_ERC1155).toBe(1);
    expect(BasicOrderRouteType.ERC20_TO_ERC721).toBe(2);
    expect(BasicOrderRouteType.ERC20_TO_ERC1155).toBe(3);
    expect(BasicOrderRouteType.ERC721_TO_ERC20).toBe(4);
    expect(BasicOrderRouteType.ERC1155_TO_ERC20).toBe(5);
  });
});

describe("seaportAbi", () => {
  test("has 3 functions", () => {
    expect(seaportAbi).toHaveLength(3);
  });

  test("has expected function names", () => {
    const names = seaportAbi.map((item) =>
      item.type === "function" ? item.name : null,
    );
    expect(names).toContain("getCounter");
    expect(names).toContain("getOrderHash");
    expect(names).toContain("fulfillBasicOrder");
  });
});

describe("EIP712_TYPES", () => {
  test("defines OrderComponents, OfferItem, ConsiderationItem", () => {
    expect(EIP712_TYPES.OrderComponents).toBeDefined();
    expect(EIP712_TYPES.OfferItem).toBeDefined();
    expect(EIP712_TYPES.ConsiderationItem).toBeDefined();
  });

  test("OrderComponents has 11 fields", () => {
    expect(EIP712_TYPES.OrderComponents).toHaveLength(11);
  });

  test("OfferItem has 5 fields", () => {
    expect(EIP712_TYPES.OfferItem).toHaveLength(5);
  });

  test("ConsiderationItem has 6 fields (OfferItem + recipient)", () => {
    expect(EIP712_TYPES.ConsiderationItem).toHaveLength(6);
  });
});

// ── Encoders ─────────────────────────────────────────────────────

describe("encodeGetCounter", () => {
  test("returns hex calldata", () => {
    const data = encodeGetCounter(ALICE);
    expect(data).toMatch(/^0x[0-9a-f]+$/);
    expect(data.length).toBeGreaterThan(2);
  });
});

describe("encodeGetOrderHash", () => {
  test("returns hex calldata", () => {
    const data = encodeGetOrderHash(makeOrderComponents());
    expect(data).toMatch(/^0x[0-9a-f]+$/);
    expect(data.length).toBeGreaterThan(2);
  });
});

describe("encodeFulfillBasicOrder", () => {
  test("returns hex calldata", () => {
    const order = makeOrder();
    const params = toBasicOrderParameters(
      order,
      BasicOrderRouteType.ETH_TO_ERC721,
    );
    const data = encodeFulfillBasicOrder(params);
    expect(data).toMatch(/^0x[0-9a-f]+$/);
    expect(data.length).toBeGreaterThan(2);
  });
});

// ── validateOrderComponents ──────────────────────────────────────

describe("validateOrderComponents", () => {
  test("valid order passes", () => {
    const result = validateOrderComponents(makeOrderComponents());
    expect(result.valid).toBe(true);
  });

  test("rejects empty offer", () => {
    const result = validateOrderComponents(
      makeOrderComponents({ offer: [] }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("offer");
    }
  });

  test("rejects offer with zero startAmount", () => {
    const result = validateOrderComponents(
      makeOrderComponents({
        offer: [makeOfferItem({ startAmount: 0n })],
      }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("amount");
    }
  });

  test("rejects offer with zero endAmount", () => {
    const result = validateOrderComponents(
      makeOrderComponents({
        offer: [makeOfferItem({ endAmount: 0n })],
      }),
    );
    expect(result.valid).toBe(false);
  });

  test("rejects empty consideration", () => {
    const result = validateOrderComponents(
      makeOrderComponents({ consideration: [] }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("consideration");
    }
  });

  test("rejects consideration with zero amount", () => {
    const result = validateOrderComponents(
      makeOrderComponents({
        consideration: [makeConsiderationItem({ startAmount: 0n })],
      }),
    );
    expect(result.valid).toBe(false);
  });

  test("rejects startTime >= endTime", () => {
    const result = validateOrderComponents(
      makeOrderComponents({ startTime: 2000n, endTime: 2000n }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Start time");
    }
  });

  test("rejects startTime > endTime", () => {
    const result = validateOrderComponents(
      makeOrderComponents({ startTime: 3000n, endTime: 2000n }),
    );
    expect(result.valid).toBe(false);
  });

  test("passes with multiple valid offer items", () => {
    const result = validateOrderComponents(
      makeOrderComponents({
        offer: [
          makeOfferItem({ token: NFT }),
          makeOfferItem({ token: TOKEN as `0x${string}` }),
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });
});

// ── canFulfillAsBasicOrder ───────────────────────────────────────

describe("canFulfillAsBasicOrder", () => {
  test("ETH_TO_ERC721: valid order returns true", () => {
    const order = makeOrder();
    expect(canFulfillAsBasicOrder(order)).toBe(true);
  });

  test("rejects multiple offer items", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem(), makeOfferItem()],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("rejects empty consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({ consideration: [] }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("rejects CONTRACT order type", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({ orderType: OrderType.CONTRACT }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("rejects FULL_RESTRICTED order type", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        orderType: OrderType.FULL_RESTRICTED,
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("rejects PARTIAL_RESTRICTED order type", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        orderType: OrderType.PARTIAL_RESTRICTED,
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("rejects non-zero zone", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({ zone: ALICE }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("rejects ERC721_WITH_CRITERIA offer", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC721_WITH_CRITERIA })],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("rejects ERC1155_WITH_CRITERIA in consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({
            itemType: ItemType.ERC1155_WITH_CRITERIA,
            token: NFT,
          }),
        ],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("rejects when primary consideration recipient is not offerer", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [makeConsiderationItem({ recipient: BOB })],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("ETH_TO_ERC1155: ERC1155 offer + NATIVE consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC1155 })],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(true);
  });

  test("ERC20_TO_ERC721: ERC721 offer + ERC20 consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC20, token: TOKEN }),
        ],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(true);
  });

  test("ERC20_TO_ERC1155: ERC1155 offer + ERC20 consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC1155 })],
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC20, token: TOKEN }),
        ],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(true);
  });

  test("ERC721_TO_ERC20: ERC20 offer + ERC721 consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC20, token: TOKEN })],
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC721, token: NFT }),
        ],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(true);
  });

  test("ERC1155_TO_ERC20: ERC20 offer + ERC1155 consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC20, token: TOKEN })],
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC1155, token: NFT }),
        ],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(true);
  });

  test("rejects unrecognized offer/consideration combo", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC20, token: TOKEN })],
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC20, token: TOKEN }),
        ],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });
});

// ── detectBasicOrderRouteType ────────────────────────────────────

describe("detectBasicOrderRouteType", () => {
  test("ETH_TO_ERC721", () => {
    const order = makeOrder();
    expect(detectBasicOrderRouteType(order)).toBe(
      BasicOrderRouteType.ETH_TO_ERC721,
    );
  });

  test("ETH_TO_ERC1155", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC1155 })],
      }),
    });
    expect(detectBasicOrderRouteType(order)).toBe(
      BasicOrderRouteType.ETH_TO_ERC1155,
    );
  });

  test("ERC20_TO_ERC721", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC20, token: TOKEN }),
        ],
      }),
    });
    expect(detectBasicOrderRouteType(order)).toBe(
      BasicOrderRouteType.ERC20_TO_ERC721,
    );
  });

  test("ERC20_TO_ERC1155", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC1155 })],
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC20, token: TOKEN }),
        ],
      }),
    });
    expect(detectBasicOrderRouteType(order)).toBe(
      BasicOrderRouteType.ERC20_TO_ERC1155,
    );
  });

  test("ERC721_TO_ERC20", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC20, token: TOKEN })],
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC721, token: NFT }),
        ],
      }),
    });
    expect(detectBasicOrderRouteType(order)).toBe(
      BasicOrderRouteType.ERC721_TO_ERC20,
    );
  });

  test("ERC1155_TO_ERC20", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC20, token: TOKEN })],
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC1155, token: NFT }),
        ],
      }),
    });
    expect(detectBasicOrderRouteType(order)).toBe(
      BasicOrderRouteType.ERC1155_TO_ERC20,
    );
  });

  test("returns null for non-basic order", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        orderType: OrderType.FULL_RESTRICTED,
      }),
    });
    expect(detectBasicOrderRouteType(order)).toBeNull();
  });
});

// ── toBasicOrderParameters ───────────────────────────────────────

describe("toBasicOrderParameters", () => {
  test("builds correct params for ETH_TO_ERC721", () => {
    const order = makeOrder();
    const params = toBasicOrderParameters(
      order,
      BasicOrderRouteType.ETH_TO_ERC721,
    );

    expect(params.considerationToken).toBe(ZERO_ADDRESS);
    expect(params.considerationAmount).toBe(1000000000000000000n);
    expect(params.offerToken).toBe(NFT);
    expect(params.offerIdentifier).toBe(1n);
    expect(params.offerAmount).toBe(1n);
    expect(params.basicOrderType).toBe(0); // FULL_OPEN(0) + ETH_TO_ERC721(0) * 4
    expect(params.startTime).toBe(1000n);
    expect(params.endTime).toBe(2000n);
    expect(params.zone).toBe(ZERO_ADDRESS);
    expect(params.offerer).toBe(ALICE);
    expect(params.totalOriginalAdditionalRecipients).toBe(0n);
    expect(params.additionalRecipients).toEqual([]);
  });

  test("throws on multiple offer items", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem(), makeOfferItem()],
      }),
    });
    expect(() =>
      toBasicOrderParameters(order, BasicOrderRouteType.ETH_TO_ERC721),
    ).toThrow("exactly one offer item");
  });

  test("throws on empty consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({ consideration: [] }),
    });
    expect(() =>
      toBasicOrderParameters(order, BasicOrderRouteType.ETH_TO_ERC721),
    ).toThrow("at least one consideration item");
  });

  test("maps additional consideration items to additionalRecipients", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem(),
          makeConsiderationItem({ recipient: BOB, endAmount: 2500n }),
        ],
      }),
    });
    const params = toBasicOrderParameters(
      order,
      BasicOrderRouteType.ETH_TO_ERC721,
    );

    expect(params.totalOriginalAdditionalRecipients).toBe(1n);
    expect(params.additionalRecipients).toHaveLength(1);
    expect(params.additionalRecipients[0]).toEqual({
      amount: 2500n,
      recipient: BOB,
    });
  });

  test("appends tips to additionalRecipients", () => {
    const order = makeOrder();
    const tipRecipient =
      "0xeeee000000000000000000000000000000000005" as `0x${string}`;
    const params = toBasicOrderParameters(
      order,
      BasicOrderRouteType.ETH_TO_ERC721,
      ZERO_BYTES32,
      [{ amount: 500n, recipient: tipRecipient }],
    );

    expect(params.additionalRecipients).toHaveLength(1);
    expect(params.additionalRecipients[0]).toEqual({
      amount: 500n,
      recipient: tipRecipient,
    });
  });

  test("basicOrderType = orderType + routeType * 4", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        orderType: OrderType.PARTIAL_OPEN,
      }),
    });
    const params = toBasicOrderParameters(
      order,
      BasicOrderRouteType.ERC20_TO_ERC1155,
    );
    // PARTIAL_OPEN(1) + ERC20_TO_ERC1155(3) * 4 = 13
    expect(params.basicOrderType).toBe(13);
  });

  test("uses custom fulfillerConduitKey", () => {
    const customKey =
      "0x" + "ff".repeat(32) as `0x${string}`;
    const order = makeOrder();
    const params = toBasicOrderParameters(
      order,
      BasicOrderRouteType.ETH_TO_ERC721,
      customKey,
    );
    expect(params.fulfillerConduitKey).toBe(customKey);
  });
});

// ── buildBasicOrderFulfillment ───────────────────────────────────

describe("buildBasicOrderFulfillment", () => {
  test("returns transaction data with correct to address", () => {
    const order = makeOrder();
    const result = buildBasicOrderFulfillment(ctx, order);
    expect(result.to).toBe(SEAPORT_ADDRESS);
    expect(result.data).toMatch(/^0x[0-9a-f]+$/);
  });

  test("computes ETH value for native payment orders", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ endAmount: 1000n }),
          makeConsiderationItem({ recipient: BOB, endAmount: 200n }),
        ],
      }),
    });
    const result = buildBasicOrderFulfillment(ctx, order);
    expect(result.value).toBe(1200n);
  });

  test("zero value for ERC20 payment orders", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC721 })],
        consideration: [
          makeConsiderationItem({
            itemType: ItemType.ERC20,
            token: TOKEN,
            endAmount: 1000n,
          }),
        ],
      }),
    });
    const result = buildBasicOrderFulfillment(ctx, order);
    expect(result.value).toBe(0n);
  });

  test("includes tip amounts in ETH value", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [makeConsiderationItem({ endAmount: 1000n })],
      }),
    });
    const tipRecipient =
      "0xeeee000000000000000000000000000000000005" as `0x${string}`;
    const result = buildBasicOrderFulfillment(ctx, order, {
      tips: [{ amount: 300n, recipient: tipRecipient }],
    });
    expect(result.value).toBe(1300n);
  });

  test("throws for non-basic order", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        orderType: OrderType.FULL_RESTRICTED,
      }),
    });
    expect(() => buildBasicOrderFulfillment(ctx, order)).toThrow(
      "does not qualify",
    );
  });

  test("respects explicit routeType option", () => {
    const order = makeOrder();
    const result = buildBasicOrderFulfillment(ctx, order, {
      routeType: BasicOrderRouteType.ETH_TO_ERC721,
    });
    expect(result.to).toBe(SEAPORT_ADDRESS);
  });
});

// ── hashOrderComponents ──────────────────────────────────────────

describe("hashOrderComponents", () => {
  test("returns a bytes32 hash", () => {
    const hash = hashOrderComponents(ctx, makeOrderComponents());
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("same inputs produce same hash", () => {
    const components = makeOrderComponents();
    const h1 = hashOrderComponents(ctx, components);
    const h2 = hashOrderComponents(ctx, components);
    expect(h1).toBe(h2);
  });

  test("different salt produces different hash", () => {
    const h1 = hashOrderComponents(ctx, makeOrderComponents({ salt: 1n }));
    const h2 = hashOrderComponents(ctx, makeOrderComponents({ salt: 2n }));
    expect(h1).not.toBe(h2);
  });

  test("different offerer produces different hash", () => {
    const h1 = hashOrderComponents(ctx, makeOrderComponents({ offerer: ALICE }));
    const h2 = hashOrderComponents(ctx, makeOrderComponents({ offerer: BOB }));
    expect(h1).not.toBe(h2);
  });
});
