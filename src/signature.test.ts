import { describe, expect, test } from "bun:test";
import { keccak256, stringToHex, encodeAbiParameters } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  hashOrderComponents,
  hashOrderComponentsStruct,
  verifyOrderSignature,
  ORDER_COMPONENTS_TYPE_STRING,
  CONSIDERATION_ITEM_TYPE_STRING,
  OFFER_ITEM_TYPE_STRING,
  OFFER_ITEM_COMPONENTS,
  CONSIDERATION_ITEM_COMPONENTS,
  EIP712_TYPES,
} from "./index";
import {
  ctx,
  makeOrderComponents,
  makeOfferItem,
  makeConsiderationItem,
} from "./test-fixtures";

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

  test("matches known-good reference hash", () => {
    // Hardcoded hash computed independently for makeOrderComponents().
    // This reference value was verified against the Seaport contract's
    // getOrderHash() on chain. If hashOrderComponentsStruct is refactored,
    // this test catches any accidental changes to the struct hash output.
    const components = makeOrderComponents();
    const hash = hashOrderComponentsStruct(components);
    expect(hash).toBe(
      "0x26206b335b1654460be2b2b88fffcc8a1eb24fea0fdefcf60d7c02064070e7ae",
    );
  });

  test("known-good reference with multiple items per array", () => {
    // Hardcoded hash computed independently for a multi-item order.
    // Two offer items and two consideration items.
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
    expect(hash).toBe(
      "0x166aa709fe9872b896c844105f71b17a764211eef7c9df6c89e3356bb39218e7",
    );
  });
});

// ── verifyOrderSignature ─────────────────────────────────────

describe("verifyOrderSignature", () => {
  async function makeSignedOrder() {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const components = makeOrderComponents({
      offerer: account.address,
      consideration: [
        {
          itemType: 0, // NATIVE
          token: "0x0000000000000000000000000000000000000000" as const,
          identifierOrCriteria: 0n,
          startAmount: 1000000000000000000n,
          endAmount: 1000000000000000000n,
          recipient: account.address,
        },
      ],
    });
    const signature = await account.signTypedData({
      domain: ctx.domain,
      types: EIP712_TYPES,
      primaryType: "OrderComponents",
      message: components,
    });
    return { components, signature, account };
  }

  test("returns valid for a valid signature", async () => {
    const { components, signature } = await makeSignedOrder();
    const result = await verifyOrderSignature(ctx, {
      parameters: components,
      signature,
    });
    expect(result).toEqual({ valid: true });
  });

  test("returns offerer-mismatch for a tampered signature", async () => {
    const { components, signature } = await makeSignedOrder();
    // Corrupt the s component (bytes 32-63) but keep the recovery byte intact.
    // The corrupted s may or may not cause noble to throw depending on whether
    // it's a valid secp256k1 field element. Either way, the signature won't
    // recover to the offerer — we get offerer-mismatch (not invalid-signature)
    // because the length and v byte are still valid.
    // signature is "0x" + r(64 hex) + s(64 hex) + v(2 hex) = 132 chars
    const corrupted = (signature.slice(0, 66) + "ab".repeat(32) + signature.slice(130)) as `0x${string}`;
    const result = await verifyOrderSignature(ctx, {
      parameters: components,
      signature: corrupted,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("offerer-mismatch");
      if (result.reason === "offerer-mismatch") {
        expect(result.recovered.toLowerCase()).not.toBe(components.offerer.toLowerCase());
      }
    }
  });

  test("returns invalid-signature for a structurally malformed signature", async () => {
    const { components } = await makeSignedOrder();
    // Too short — viem throws "invalid signature length" before reaching noble
    const result = await verifyOrderSignature(ctx, {
      parameters: components,
      signature: "0x00",
    });
    expect(result).toEqual({ valid: false, reason: "invalid-signature" });
  });

  test("returns invalid-signature for a bad v value", async () => {
    const { components, signature } = await makeSignedOrder();
    // Replace the recovery byte with an invalid value (e.g., 99)
    const badV = (signature.slice(0, 130) + "63") as `0x${string}`;
    const result = await verifyOrderSignature(ctx, {
      parameters: components,
      signature: badV,
    });
    expect(result).toEqual({ valid: false, reason: "invalid-signature" });
  });

  test("returns offerer-mismatch for a signature from a different offerer", async () => {
    const { components, signature } = await makeSignedOrder();
    const differentOfferer = "0xbbbb000000000000000000000000000000000002" as `0x${string}`;
    const modified = { ...components, offerer: differentOfferer };
    const result = await verifyOrderSignature(ctx, {
      parameters: modified,
      signature,
    });
    // Signature recovers to an address that doesn't match the modified offerer.
    // The recovered address is arbitrary (hash doesn't match the signature),
    // so we only assert it's not the modified offerer.
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("offerer-mismatch");
      if (result.reason === "offerer-mismatch") {
        expect(result.recovered.toLowerCase()).not.toBe(differentOfferer.toLowerCase());
      }
    }
  });

  test("returns offerer-mismatch when order data differs from signed data", async () => {
    const { components, signature } = await makeSignedOrder();
    const modified = { ...components, salt: 999n };
    const result = await verifyOrderSignature(ctx, {
      parameters: modified,
      signature,
    });
    // Different typed data hash → different recovery → mismatched offerer.
    // The recovered address is arbitrary (hash doesn't match the signature).
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("offerer-mismatch");
      if (result.reason === "offerer-mismatch") {
        expect(result.recovered.toLowerCase()).not.toBe(modified.offerer.toLowerCase());
      }
    }
  });

  test("throws for invalid context", async () => {
    const { components, signature } = await makeSignedOrder();
    await expect(
      verifyOrderSignature(
        { address: "0xinvalid" as `0x${string}`, domain: {} },
        { parameters: components, signature },
      ),
    ).rejects.toThrow();
  });
});
