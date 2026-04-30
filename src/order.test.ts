import { describe, expect, test } from "bun:test";
import {
  ItemType,
  OrderType,
  BasicOrderRouteType,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  NATIVE_TOKEN,
  computeNativeValue,
  canFulfillAsBasicOrder,
  detectBasicOrderRouteType,
  toBasicOrderParameters,
  buildBasicOrderFulfillment,
  toOrderParameters,
  aggregateOfferItems,
  aggregateConsiderationItems,
  buildFulfillOrder,
  buildFulfillAdvancedOrder,
  buildFulfillAvailableOrders,
  buildFulfillAvailableAdvancedOrders,
} from "./index";
import type { AdvancedOrder, OrderParameters, FulfillmentComponent } from "./index";
import {
  ALICE,
  BOB,
  TOKEN,
  NFT,
  ctx,
  makeOrder,
  makeOrderComponents,
  makeOfferItem,
  makeConsiderationItem,
} from "./test-fixtures";

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

  test("accepts FULL_RESTRICTED order type with zero zone", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        orderType: OrderType.FULL_RESTRICTED,
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(true);
  });

  test("accepts PARTIAL_RESTRICTED order type with zero zone", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        orderType: OrderType.PARTIAL_RESTRICTED,
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(true);
  });

  test("rejects FULL_RESTRICTED with non-zero zone", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        orderType: OrderType.FULL_RESTRICTED,
        zone: ALICE,
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("rejects PARTIAL_RESTRICTED with non-zero zone", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        orderType: OrderType.PARTIAL_RESTRICTED,
        zone: ALICE,
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

  test("rejects mixed-type considerations (NATIVE + ERC20)", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ itemType: ItemType.NATIVE }),
          makeConsiderationItem({
            itemType: ItemType.ERC20,
            token: TOKEN,
            recipient: BOB,
          }),
        ],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("rejects mixed-type considerations (ERC20 primary + ERC721 extra)", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC721 })],
        consideration: [
          makeConsiderationItem({
            itemType: ItemType.ERC20,
            token: TOKEN,
          }),
          makeConsiderationItem({
            itemType: ItemType.ERC721,
            token: NFT,
            recipient: BOB,
          }),
        ],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(false);
  });

  test("accepts single-type NATIVE considerations with extras", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ endAmount: 1000n }),
          makeConsiderationItem({ recipient: BOB, endAmount: 200n }),
        ],
      }),
    });
    expect(canFulfillAsBasicOrder(order)).toBe(true);
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
        orderType: OrderType.CONTRACT,
      }),
    });
    expect(detectBasicOrderRouteType(order)).toBeNull();
  });

  test("returns null for mixed-type considerations (NATIVE + ERC20)", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ itemType: ItemType.NATIVE }),
          makeConsiderationItem({
            itemType: ItemType.ERC20,
            token: TOKEN,
            recipient: BOB,
          }),
        ],
      }),
    });
    expect(detectBasicOrderRouteType(order)).toBeNull();
  });

  test("detects route for FULL_RESTRICTED with zero zone", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        orderType: OrderType.FULL_RESTRICTED,
      }),
    });
    expect(detectBasicOrderRouteType(order)).toBe(
      BasicOrderRouteType.ETH_TO_ERC721,
    );
  });

  test("returns null for ERC721 offer with ERC721 consideration (nft swap)", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC721, token: NFT }),
        ],
      }),
    });
    expect(detectBasicOrderRouteType(order)).toBeNull();
  });

  test("returns null for ERC1155 offer with ERC1155 consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [makeOfferItem({ itemType: ItemType.ERC1155 })],
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC1155, token: NFT }),
        ],
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
    expect(result.to).toBe(ctx.address);
    expect(result.data).toMatch(/^0x[0-9a-f]+$/);
  });

  test("computes ETH value for native payment orders", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ startAmount: 1000n, endAmount: 1000n }),
          makeConsiderationItem({ recipient: BOB, startAmount: 200n, endAmount: 200n }),
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

  test("explicit route type with ERC20 extra consideration does not inflate value", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ startAmount: 1000n, endAmount: 1000n }),
          makeConsiderationItem({
            itemType: ItemType.ERC20,
            token: TOKEN,
            startAmount: 500n,
            endAmount: 500n,
            recipient: BOB,
          }),
        ],
      }),
    });
    const result = buildBasicOrderFulfillment(ctx, order, {
      routeType: BasicOrderRouteType.ETH_TO_ERC721,
    });
    // Only the NATIVE consideration (1000n) counts toward msg.value,
    // not the ERC20 extra consideration item.
    expect(result.value).toBe(1000n);
  });

  test("computes ETH value when consideration token is NATIVE_TOKEN", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ token: NATIVE_TOKEN, startAmount: 1000n, endAmount: 1000n }),
        ],
      }),
    });
    const result = buildBasicOrderFulfillment(ctx, order);
    expect(result.value).toBe(1000n);
  });

  test("includes tip amounts in ETH value when consideration token is NATIVE_TOKEN", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ token: NATIVE_TOKEN, startAmount: 1000n, endAmount: 1000n }),
        ],
      }),
    });
    const tipRecipient =
      "0xeeee000000000000000000000000000000000005" as `0x${string}`;
    const result = buildBasicOrderFulfillment(ctx, order, {
      tips: [{ amount: 300n, recipient: tipRecipient }],
    });
    expect(result.value).toBe(1300n);
  });

  test("includes tip amounts in ETH value", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [makeConsiderationItem({ startAmount: 1000n, endAmount: 1000n })],
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
        orderType: OrderType.CONTRACT,
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
    expect(result.to).toBe(ctx.address);
  });
});

// ── toOrderParameters ────────────────────────────────────────

describe("toOrderParameters", () => {
  test("replaces counter with totalOriginalConsiderationItems", () => {
    const components = makeOrderComponents();
    const params = toOrderParameters(components, 1n);
    expect(params.totalOriginalConsiderationItems).toBe(1n);
    expect("counter" in params).toBe(false);
  });

  test("preserves all other fields", () => {
    const components = makeOrderComponents({ salt: 42n });
    const params = toOrderParameters(components, 1n);
    expect(params.offerer).toBe(components.offerer);
    expect(params.zone).toBe(components.zone);
    expect(params.salt).toBe(42n);
    expect(params.orderType).toBe(components.orderType);
    expect(params.startTime).toBe(components.startTime);
    expect(params.endTime).toBe(components.endTime);
    expect(params.conduitKey).toBe(components.conduitKey);
  });

  test("uses provided totalOriginalConsiderationItems", () => {
    const components = makeOrderComponents({
      consideration: [
        makeConsiderationItem(),
        makeConsiderationItem({ recipient: BOB }),
        makeConsiderationItem({ recipient: BOB, endAmount: 500n }),
      ],
    });
    const params = toOrderParameters(components, 2n);
    expect(params.totalOriginalConsiderationItems).toBe(2n);
    expect(params.consideration).toHaveLength(3);
  });
});

// ── computeNativeValue ──────────────────────────────────────

describe("computeNativeValue", () => {
  test("returns 0n for empty array", () => {
    expect(computeNativeValue([])).toBe(0n);
  });

  test("uses endAmount when equal to startAmount (constant price)", () => {
    expect(
      computeNativeValue([{ itemType: ItemType.NATIVE, startAmount: 1000n, endAmount: 1000n }]),
    ).toBe(1000n);
  });

  test("uses startAmount for descending Dutch auction (startAmount > endAmount)", () => {
    expect(
      computeNativeValue([{ itemType: ItemType.NATIVE, startAmount: 5000n, endAmount: 1000n }]),
    ).toBe(5000n);
  });

  test("uses endAmount for ascending auction (endAmount > startAmount)", () => {
    expect(
      computeNativeValue([{ itemType: ItemType.NATIVE, startAmount: 1000n, endAmount: 5000n }]),
    ).toBe(5000n);
  });

  test("sums max(startAmount, endAmount) for multiple NATIVE items", () => {
    expect(
      computeNativeValue([
        { itemType: ItemType.NATIVE, startAmount: 500n, endAmount: 100n },
        { itemType: ItemType.NATIVE, startAmount: 1500n, endAmount: 1500n },
      ]),
    ).toBe(2000n);
  });

  test("skips ERC20 items when mixed with NATIVE", () => {
    expect(
      computeNativeValue([
        { itemType: ItemType.NATIVE, startAmount: 500n, endAmount: 100n },
        { itemType: ItemType.ERC20, startAmount: 9999n, endAmount: 9999n },
        { itemType: ItemType.NATIVE, startAmount: 300n, endAmount: 300n },
      ]),
    ).toBe(800n);
  });

  test("returns 0n when all items are ERC20", () => {
    expect(
      computeNativeValue([
        { itemType: ItemType.ERC20, startAmount: 500n, endAmount: 500n },
        { itemType: ItemType.ERC20, startAmount: 1500n, endAmount: 1500n },
      ]),
    ).toBe(0n);
  });

  test("returns 0n for single ERC20 item", () => {
    expect(
      computeNativeValue([{ itemType: ItemType.ERC20, startAmount: 100n, endAmount: 100n }]),
    ).toBe(0n);
  });
});

// ── buildFulfillOrder ────────────────────────────────────────

describe("buildFulfillOrder", () => {
  test("returns transaction data with correct to address", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const result = buildFulfillOrder(ctx, { parameters: params, signature: order.signature });
    expect(result.to).toBe(ctx.address);
    expect(result.data).toMatch(/^0x[0-9a-f]+$/);
  });

  test("computes ETH value for native consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ startAmount: 1000n, endAmount: 1000n }),
          makeConsiderationItem({ recipient: BOB, startAmount: 200n, endAmount: 200n }),
        ],
      }),
    });
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const result = buildFulfillOrder(ctx, { parameters: params, signature: order.signature });
    expect(result.value).toBe(1200n);
  });

  test("zero value for ERC20-only consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ itemType: ItemType.ERC20, token: TOKEN, endAmount: 1000n }),
        ],
      }),
    });
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const result = buildFulfillOrder(ctx, { parameters: params, signature: order.signature });
    expect(result.value).toBe(0n);
  });
  test("throws for empty offer", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [],
      }),
    });
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    expect(() =>
      buildFulfillOrder(ctx, { parameters: params, signature: order.signature }),
    ).toThrow("Order must have at least one offer item");
  });

  test("throws for empty consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [],
      }),
    });
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    expect(() =>
      buildFulfillOrder(ctx, { parameters: params, signature: order.signature }),
    ).toThrow("Order must have at least one consideration item");
  });
});

// ── buildFulfillAdvancedOrder ─────────────────────────────────

describe("buildFulfillAdvancedOrder", () => {
  test("returns transaction data", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrder: AdvancedOrder = {
      parameters: params,
      numerator: 1n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    };
    const result = buildFulfillAdvancedOrder(ctx, advancedOrder);
    expect(result.to).toBe(ctx.address);
    expect(result.data).toMatch(/^0x[0-9a-f]+$/);
  });

  test("computes ETH value", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [makeConsiderationItem({ startAmount: 500n, endAmount: 500n })],
      }),
    });
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrder: AdvancedOrder = {
      parameters: params,
      numerator: 1n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    };
    const result = buildFulfillAdvancedOrder(ctx, advancedOrder);
    expect(result.value).toBe(500n);
  });

  test("throws for numerator > uint120", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrder: AdvancedOrder = {
      parameters: params,
      numerator: 1n << 120n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    };
    expect(() =>
      buildFulfillAdvancedOrder(ctx, advancedOrder),
    ).toThrow("uint120");
  });

  test("throws for denominator > uint120", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrder: AdvancedOrder = {
      parameters: params,
      numerator: 1n,
      denominator: 1n << 120n,
      signature: order.signature,
      extraData: "0x",
    };
    expect(() =>
      buildFulfillAdvancedOrder(ctx, advancedOrder),
    ).toThrow("uint120");
  });
  test("throws for denominator of zero", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrder: AdvancedOrder = {
      parameters: params,
      numerator: 1n,
      denominator: 0n,
      signature: order.signature,
      extraData: "0x",
    };
    expect(() =>
      buildFulfillAdvancedOrder(ctx, advancedOrder),
    ).toThrow("denominator must be non-zero");
  });
  test("throws for numerator > denominator", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrder: AdvancedOrder = {
      parameters: params,
      numerator: 3n,
      denominator: 2n,
      signature: order.signature,
      extraData: "0x",
    };
    expect(() =>
      buildFulfillAdvancedOrder(ctx, advancedOrder),
    ).toThrow("numerator (3) must be ≤ denominator (2)");
  });
  test("throws for empty offer", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [],
      }),
    });
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrder: AdvancedOrder = {
      parameters: params,
      numerator: 1n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    };
    expect(() =>
      buildFulfillAdvancedOrder(ctx, advancedOrder),
    ).toThrow("Order must have at least one offer item");
  });

  test("throws for empty consideration", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [],
      }),
    });
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrder: AdvancedOrder = {
      parameters: params,
      numerator: 1n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    };
    expect(() =>
      buildFulfillAdvancedOrder(ctx, advancedOrder),
    ).toThrow("Order must have at least one consideration item");
  });
});

// ── buildFulfillAvailableOrders ───────────────────────────────

describe("buildFulfillAvailableOrders", () => {
  test("returns transaction data", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const orders = [{ parameters: params, signature: order.signature }];
    const result = buildFulfillAvailableOrders(ctx, orders);
    expect(result.to).toBe(ctx.address);
    expect(result.data).toMatch(/^0x[0-9a-f]+$/);
  });

  test("sums ETH value across all orders", () => {
    const order1 = makeOrder({
      parameters: makeOrderComponents({
        salt: 1n,
        consideration: [makeConsiderationItem({ startAmount: 300n, endAmount: 300n })],
      }),
    });
    const order2 = makeOrder({
      parameters: makeOrderComponents({
        salt: 2n,
        consideration: [makeConsiderationItem({ startAmount: 700n, endAmount: 700n })],
      }),
    });
    const params1 = toOrderParameters(order1.parameters, BigInt(order1.parameters.consideration.length));
    const params2 = toOrderParameters(order2.parameters, BigInt(order2.parameters.consideration.length));
    const orders = [
      { parameters: params1, signature: order1.signature },
      { parameters: params2, signature: order2.signature },
    ];
    const result = buildFulfillAvailableOrders(ctx, orders);
    expect(result.value).toBe(1000n);
  });

  test("rejects maximumFulfilled exceeding orders length", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const orders = [{ parameters: params, signature: order.signature }];
    expect(() =>
      buildFulfillAvailableOrders(ctx, orders, [], [], ZERO_BYTES32, 5n),
    ).toThrow("maximumFulfilled");
  });
  test("throws for empty orders array", () => {
    expect(() =>
      buildFulfillAvailableOrders(ctx, []),
    ).toThrow("At least one order must be provided");
  });
});

// ── buildFulfillAvailableAdvancedOrders ───────────────────────

describe("buildFulfillAvailableAdvancedOrders", () => {
  test("returns transaction data", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrders: AdvancedOrder[] = [{
      parameters: params,
      numerator: 1n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    }];
    const result = buildFulfillAvailableAdvancedOrders(ctx, advancedOrders);
    expect(result.to).toBe(ctx.address);
    expect(result.data).toMatch(/^0x[0-9a-f]+$/);
  });

  test("computes ETH value", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [makeConsiderationItem({ startAmount: 800n, endAmount: 800n })],
      }),
    });
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrders: AdvancedOrder[] = [{
      parameters: params,
      numerator: 1n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    }];
    const result = buildFulfillAvailableAdvancedOrders(ctx, advancedOrders);
    expect(result.value).toBe(800n);
  });

  test("throws for numerator > uint120", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrders: AdvancedOrder[] = [{
      parameters: params,
      numerator: 1n << 120n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    }];
    expect(() =>
      buildFulfillAvailableAdvancedOrders(ctx, advancedOrders),
    ).toThrow("uint120");
  });

  test("throws for denominator > uint120", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrders: AdvancedOrder[] = [{
      parameters: params,
      numerator: 1n,
      denominator: 1n << 120n,
      signature: order.signature,
      extraData: "0x",
    }];
    expect(() =>
      buildFulfillAvailableAdvancedOrders(ctx, advancedOrders),
    ).toThrow("uint120");
  });

  test("throws for denominator of zero", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrders: AdvancedOrder[] = [{
      parameters: params,
      numerator: 1n,
      denominator: 0n,
      signature: order.signature,
      extraData: "0x",
    }];
    expect(() =>
      buildFulfillAvailableAdvancedOrders(ctx, advancedOrders),
    ).toThrow("denominator must be non-zero");
  });

  test("throws for numerator > denominator", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrders: AdvancedOrder[] = [{
      parameters: params,
      numerator: 5n,
      denominator: 3n,
      signature: order.signature,
      extraData: "0x",
    }];
    expect(() =>
      buildFulfillAvailableAdvancedOrders(ctx, advancedOrders),
    ).toThrow("numerator (5) must be ≤ denominator (3)");
  });

  test("rejects maximumFulfilled exceeding advanced orders length", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, BigInt(order.parameters.consideration.length));
    const advancedOrders: AdvancedOrder[] = [{
      parameters: params,
      numerator: 1n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    }];
    expect(() =>
      buildFulfillAvailableAdvancedOrders(ctx, advancedOrders, [], [], [], ZERO_BYTES32, ZERO_ADDRESS, 5n),
    ).toThrow("maximumFulfilled");
  });
  test("throws for empty advancedOrders array", () => {
    expect(() =>
      buildFulfillAvailableAdvancedOrders(ctx, []),
    ).toThrow("At least one advanced order must be provided");
  });
});

// ── aggregateOfferItems / aggregateConsiderationItems ────────

describe("aggregateOfferItems", () => {
  test("returns empty array for empty input", () => {
    expect(aggregateOfferItems([])).toEqual([]);
  });

  test("single order with single offer item", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, 1n);
    const orders = [{ parameters: params, signature: order.signature }];
    const result = aggregateOfferItems(orders);
    expect(result).toEqual([[{ orderIndex: 0n, itemIndex: 0n }]]);
  });

  test("single order with multiple offer items", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        offer: [
          makeOfferItem({ token: NFT }),
          makeOfferItem({ token: NFT, identifierOrCriteria: 2n }),
          makeOfferItem({ token: NFT, identifierOrCriteria: 3n }),
        ],
      }),
    });
    const params = toOrderParameters(order.parameters, 1n);
    const orders = [{ parameters: params, signature: order.signature }];
    const result = aggregateOfferItems(orders);
    expect(result).toEqual([
      [{ orderIndex: 0n, itemIndex: 0n }],
      [{ orderIndex: 0n, itemIndex: 1n }],
      [{ orderIndex: 0n, itemIndex: 2n }],
    ]);
  });

  test("multiple orders with single offer items each", () => {
    const order1 = makeOrder({
      parameters: makeOrderComponents({ salt: 1n }),
    });
    const order2 = makeOrder({
      parameters: makeOrderComponents({ salt: 2n }),
    });
    const params1 = toOrderParameters(order1.parameters, 1n);
    const params2 = toOrderParameters(order2.parameters, 1n);
    const orders = [
      { parameters: params1, signature: order1.signature },
      { parameters: params2, signature: order2.signature },
    ];
    const result = aggregateOfferItems(orders);
    expect(result).toEqual([
      [{ orderIndex: 0n, itemIndex: 0n }],
      [{ orderIndex: 1n, itemIndex: 0n }],
    ]);
  });

  test("works with AdvancedOrder[]", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, 1n);
    const advancedOrders: AdvancedOrder[] = [{
      parameters: params,
      numerator: 1n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    }];
    const result = aggregateOfferItems(advancedOrders);
    expect(result).toEqual([[{ orderIndex: 0n, itemIndex: 0n }]]);
  });
});

describe("aggregateConsiderationItems", () => {
  test("returns empty array for empty input", () => {
    expect(aggregateConsiderationItems([])).toEqual([]);
  });

  test("single order with single consideration item", () => {
    const order = makeOrder();
    const params = toOrderParameters(order.parameters, 1n);
    const orders = [{ parameters: params, signature: order.signature }];
    const result = aggregateConsiderationItems(orders);
    expect(result).toEqual([[{ orderIndex: 0n, itemIndex: 0n }]]);
  });

  test("single order with multiple consideration items", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ endAmount: 100n, recipient: ALICE }),
          makeConsiderationItem({ endAmount: 200n, recipient: BOB }),
        ],
      }),
    });
    const params = toOrderParameters(order.parameters, 1n);
    const orders = [{ parameters: params, signature: order.signature }];
    const result = aggregateConsiderationItems(orders);
    expect(result).toEqual([
      [{ orderIndex: 0n, itemIndex: 0n }],
      [{ orderIndex: 0n, itemIndex: 1n }],
    ]);
  });

  test("multiple orders with mixed consideration counts", () => {
    const order1 = makeOrder({
      parameters: makeOrderComponents({
        salt: 1n,
        consideration: [
          makeConsiderationItem({ endAmount: 100n, recipient: ALICE }),
          makeConsiderationItem({ endAmount: 200n, recipient: BOB }),
        ],
      }),
    });
    const order2 = makeOrder({
      parameters: makeOrderComponents({
        salt: 2n,
      }),
    });
    const params1 = toOrderParameters(
      order1.parameters,
      BigInt(order1.parameters.consideration.length),
    );
    const params2 = toOrderParameters(
      order2.parameters,
      BigInt(order2.parameters.consideration.length),
    );
    const orders = [
      { parameters: params1, signature: order1.signature },
      { parameters: params2, signature: order2.signature },
    ];
    const result = aggregateConsiderationItems(orders);
    expect(result).toEqual([
      [{ orderIndex: 0n, itemIndex: 0n }],
      [{ orderIndex: 0n, itemIndex: 1n }],
      [{ orderIndex: 1n, itemIndex: 0n }],
    ]);
  });

  test("works with AdvancedOrder[]", () => {
    const order = makeOrder({
      parameters: makeOrderComponents({
        consideration: [
          makeConsiderationItem({ endAmount: 100n, recipient: ALICE }),
          makeConsiderationItem({ endAmount: 200n, recipient: BOB }),
        ],
      }),
    });
    const params = toOrderParameters(
      order.parameters,
      BigInt(order.parameters.consideration.length),
    );
    const advancedOrders: AdvancedOrder[] = [{
      parameters: params,
      numerator: 1n,
      denominator: 1n,
      signature: order.signature,
      extraData: "0x",
    }];
    const result = aggregateConsiderationItems(advancedOrders);
    expect(result).toEqual([
      [{ orderIndex: 0n, itemIndex: 0n }],
      [{ orderIndex: 0n, itemIndex: 1n }],
    ]);
  });
});
