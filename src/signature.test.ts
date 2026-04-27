import { describe, expect, test } from "bun:test";
import { keccak256, stringToHex, encodeAbiParameters } from "viem";
import { hashOrderComponents, hashOrderComponentsStruct, ORDER_COMPONENTS_TYPE_STRING, CONSIDERATION_ITEM_TYPE_STRING, OFFER_ITEM_TYPE_STRING, OFFER_ITEM_COMPONENTS, CONSIDERATION_ITEM_COMPONENTS } from "./index";
import { ctx, makeOrderComponents, makeOfferItem, makeConsiderationItem } from "./test-fixtures";

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
    const h1 = hashOrderComponents(ctx, makeOrderComponents({ offerer: "0xaaaa000000000000000000000000000000000001" as `0x${string}` }));
    const h2 = hashOrderComponents(ctx, makeOrderComponents({ offerer: "0xbbbb000000000000000000000000000000000002" as `0x${string}` }));
    expect(h1).not.toBe(h2);
  });
});

// ── hashOrderComponentsStruct ────────────────────────────────

describe("hashOrderComponentsStruct", () => {
  test("returns a bytes32 hash", () => {
    const hash = hashOrderComponentsStruct(makeOrderComponents());
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("same inputs produce same hash", () => {
    const components = makeOrderComponents();
    const h1 = hashOrderComponentsStruct(components);
    const h2 = hashOrderComponentsStruct(components);
    expect(h1).toBe(h2);
  });

  test("different salt produces different hash", () => {
    const h1 = hashOrderComponentsStruct(makeOrderComponents({ salt: 1n }));
    const h2 = hashOrderComponentsStruct(makeOrderComponents({ salt: 2n }));
    expect(h1).not.toBe(h2);
  });

  test("different offerer produces different hash", () => {
    const h1 = hashOrderComponentsStruct(makeOrderComponents({ offerer: "0xaaaa000000000000000000000000000000000001" as `0x${string}` }));
    const h2 = hashOrderComponentsStruct(makeOrderComponents({ offerer: "0xbbbb000000000000000000000000000000000002" as `0x${string}` }));
    expect(h1).not.toBe(h2);
  });

  test("different counter produces different hash", () => {
    const h1 = hashOrderComponentsStruct(makeOrderComponents({ counter: 0n }));
    const h2 = hashOrderComponentsStruct(makeOrderComponents({ counter: 5n }));
    expect(h1).not.toBe(h2);
  });

  test("produces correct struct hash demonstrably (independent computation)", () => {
    // Verify hashOrderComponentsStruct by recomputing the expected value
    // step by step using the same ABI encoding primitives.
    // This is NOT cross-referencing viem's hashTypedData (which uses
    // EIP-712 encoding for arrays of structs, different from Seaport's
    // raw abi.encode approach). Instead it validates that the function's
    // internal steps produce the correct output.
    // Uses shared OFFER_ITEM_COMPONENTS / CONSIDERATION_ITEM_COMPONENTS
    // from constants.ts, so the test stays in sync with EIP-712 type defs.
    const components = makeOrderComponents();

    const hash = hashOrderComponentsStruct(components);

    // Recompute ORDER_TYPEHASH from the canonical type strings
    const ORDER_TYPEHASH = keccak256(
      stringToHex(
        ORDER_COMPONENTS_TYPE_STRING +
        CONSIDERATION_ITEM_TYPE_STRING +
        OFFER_ITEM_TYPE_STRING,
      ),
    );

    // Encode offer items as a dynamic array of tuples
    const offerHash = keccak256(
      encodeAbiParameters(
        [{ type: "tuple[]", components: OFFER_ITEM_COMPONENTS }],
        [components.offer],
      ),
    );

    // Encode consideration items as a dynamic array of tuples
    const considerationHash = keccak256(
      encodeAbiParameters(
        [{ type: "tuple[]", components: CONSIDERATION_ITEM_COMPONENTS }],
        [components.consideration],
      ),
    );

    // Encode the full order struct
    const expected = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "address" },
          { type: "address" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint8" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "uint256" },
        ],
        [
          ORDER_TYPEHASH,
          components.offerer,
          components.zone,
          offerHash,
          considerationHash,
          components.orderType,
          components.startTime,
          components.endTime,
          components.zoneHash,
          components.salt,
          components.conduitKey,
          components.counter,
        ],
      ),
    );

    expect(hash).toBe(expected);
  });

  test("independent computation with multiple items per array", () => {
    // Verify the function handles multi-element offer/consideration arrays
    const components = makeOrderComponents({
      offer: [
        makeOfferItem({ token: "0xdddd000000000000000000000000000000000004" as `0x${string}`, identifierOrCriteria: 1n }),
        makeOfferItem({ token: "0xeeee000000000000000000000000000000000005" as `0x${string}`, identifierOrCriteria: 2n }),
      ],
      consideration: [
        makeConsiderationItem({ recipient: "0xaaaa000000000000000000000000000000000001" as `0x${string}`, startAmount: 1000000000000000000n }),
        makeConsiderationItem({ recipient: "0xbbbb000000000000000000000000000000000002" as `0x${string}`, startAmount: 500000000000000000n }),
      ],
    });

    const hash = hashOrderComponentsStruct(components);

    // Recompute with the same logic as above
    const ORDER_TYPEHASH = keccak256(
      stringToHex(
        ORDER_COMPONENTS_TYPE_STRING +
        CONSIDERATION_ITEM_TYPE_STRING +
        OFFER_ITEM_TYPE_STRING,
      ),
    );

    const offerHash = keccak256(
      encodeAbiParameters(
        [{ type: "tuple[]", components: OFFER_ITEM_COMPONENTS }],
        [components.offer],
      ),
    );

    const considerationHash = keccak256(
      encodeAbiParameters(
        [{ type: "tuple[]", components: CONSIDERATION_ITEM_COMPONENTS }],
        [components.consideration],
      ),
    );

    const expected = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "address" },
          { type: "address" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint8" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "uint256" },
        ],
        [
          ORDER_TYPEHASH,
          components.offerer,
          components.zone,
          offerHash,
          considerationHash,
          components.orderType,
          components.startTime,
          components.endTime,
          components.zoneHash,
          components.salt,
          components.conduitKey,
          components.counter,
        ],
      ),
    );

    expect(hash).toBe(expected);
  });
});
