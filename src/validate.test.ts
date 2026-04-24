import { describe, expect, test } from "bun:test";
import { validateOrderComponents } from "./index";
import { makeOrderComponents, makeOfferItem, makeConsiderationItem } from "./test-fixtures";

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
          makeOfferItem(),
          makeOfferItem({ token: "0xcccc000000000000000000000000000000000003" as `0x${string}` }),
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });
});
