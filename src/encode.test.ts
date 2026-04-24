import { describe, expect, test } from "bun:test";
import {
  BasicOrderRouteType,
  encodeGetCounter,
  encodeGetOrderHash,
  encodeFulfillBasicOrder,
  toBasicOrderParameters,
} from "./index";
import { ALICE, makeOrderComponents, makeOrder } from "./test-fixtures";

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
