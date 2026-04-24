import { describe, expect, test } from "bun:test";
import {
  computeHeight,
  padLeaves,
  buildBulkOrderTree,
  getBulkOrderTypeString,
  hashBulkOrder,
  getProof,
  packBulkSignature,
  unpackBulkSignature,
  hashOrderComponentsStruct,
  getEmptyOrderComponents,
} from "./index";
import { ctx, makeOrderComponents } from "./test-fixtures";

// ── computeHeight ────────────────────────────────────────────

describe("computeHeight", () => {
  test("returns 1 for 0 orders", () => {
    expect(computeHeight(0)).toBe(1);
  });

  test("returns 1 for 1 order", () => {
    expect(computeHeight(1)).toBe(1);
  });

  test("returns 1 for 2 orders", () => {
    expect(computeHeight(2)).toBe(1);
  });

  test("returns 2 for 3 orders", () => {
    expect(computeHeight(3)).toBe(2);
  });

  test("returns 2 for 4 orders", () => {
    expect(computeHeight(4)).toBe(2);
  });

  test("returns 3 for 5 orders", () => {
    expect(computeHeight(5)).toBe(3);
  });

  test("returns 3 for 8 orders", () => {
    expect(computeHeight(8)).toBe(3);
  });

  test("returns 10 for 1024 orders", () => {
    expect(computeHeight(1024)).toBe(10);
  });
});

// ── getBulkOrderTypeString ────────────────────────────────────

describe("getBulkOrderTypeString", () => {
  test("height 1 has one [2] bracket", () => {
    const s = getBulkOrderTypeString(1);
    expect(s).toContain("OrderComponents[2] tree");
    expect(s).not.toContain("[2][2]");
  });

  test("height 2 has two [2] brackets", () => {
    const s = getBulkOrderTypeString(2);
    expect(s).toContain("OrderComponents[2][2] tree");
    expect(s).not.toContain("[2][2][2]");
  });

  test("height 3 has three [2] brackets", () => {
    const s = getBulkOrderTypeString(3);
    expect(s).toContain("OrderComponents[2][2][2] tree");
  });

  test("includes ConsiderationItem sub-type", () => {
    const s = getBulkOrderTypeString(1);
    expect(s).toContain("ConsiderationItem(");
  });

  test("includes OfferItem sub-type", () => {
    const s = getBulkOrderTypeString(1);
    expect(s).toContain("OfferItem(");
  });

  test("includes OrderComponents sub-type", () => {
    const s = getBulkOrderTypeString(1);
    expect(s).toContain("OrderComponents(");
  });

  test("starts with BulkOrder(", () => {
    const s = getBulkOrderTypeString(1);
    expect(s.startsWith("BulkOrder(")).toBe(true);
  });

  test("throws for height 0", () => {
    expect(() => getBulkOrderTypeString(0)).toThrow("Height must be between");
  });

  test("throws for height 25", () => {
    expect(() => getBulkOrderTypeString(25)).toThrow("Height must be between");
  });
});

// ── padLeaves ────────────────────────────────────────────────

describe("padLeaves", () => {
  test("pads 1 leaf to 2 (capacity of height 1)", () => {
    const leaf = hashOrderComponentsStruct(makeOrderComponents());
    const padded = padLeaves( [leaf]);
    expect(padded.length).toBe(2);
  });

  test("pads 3 leaves to 4 (capacity of height 2)", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 3n })),
    ];
    const padded = padLeaves( leaves);
    expect(padded.length).toBe(4);
  });

  test("leaves 2 leaves unchanged (already power of 2)", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
    ];
    const padded = padLeaves( leaves);
    expect(padded.length).toBe(2);
  });

  test("padded leaves use the empty order hash", () => {
    const leaf = hashOrderComponentsStruct(makeOrderComponents());
    const padded = padLeaves([leaf]);
    const emptyHash = hashOrderComponentsStruct(getEmptyOrderComponents());
    expect(padded[1]).toBe(emptyHash);
  });
});

// ── buildBulkOrderTree ───────────────────────────────────────

describe("buildBulkOrderTree", () => {
  test("single leaf padded to 2 produces two layers", () => {
    const leaf = hashOrderComponentsStruct(makeOrderComponents());
    const padded = padLeaves( [leaf]);
    const layers = buildBulkOrderTree(padded);
    expect(layers.length).toBe(2);
    expect(layers[0]).toHaveLength(2);
    expect(layers[1]).toHaveLength(1);
  });

  test("two leaves produce two layers with root", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
    ];
    const layers = buildBulkOrderTree(leaves);
    expect(layers.length).toBe(2);
    expect(layers[0]).toHaveLength(2);
    expect(layers[1]).toHaveLength(1);
  });

  test("four leaves produce three layers", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 3n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 4n })),
    ];
    const layers = buildBulkOrderTree(leaves);
    expect(layers.length).toBe(3);
    expect(layers[2]).toHaveLength(1);
  });

  test("root is bytes32", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
    ];
    const layers = buildBulkOrderTree(leaves);
    const root = layers[layers.length - 1]![0]!;
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("throws on empty leaves", () => {
    expect(() => buildBulkOrderTree([])).toThrow("zero leaves");
  });

  test("throws on non-power-of-2 leaves", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 3n })),
    ];
    expect(() => buildBulkOrderTree(leaves)).toThrow("power of 2");
  });
});

// ── getProof ─────────────────────────────────────────────────

describe("getProof", () => {
  test("single leaf padded to 2 yields proof of length 1", () => {
    const leaf = hashOrderComponentsStruct(makeOrderComponents());
    const padded = padLeaves( [leaf]);
    const layers = buildBulkOrderTree(padded);
    const proof = getProof(layers, 0);
    expect(proof).toHaveLength(1);
  });

  test("two-leaf tree yields proof of length 1", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
    ];
    const layers = buildBulkOrderTree(leaves);
    const proof0 = getProof(layers, 0);
    const proof1 = getProof(layers, 1);
    expect(proof0).toHaveLength(1);
    expect(proof1).toHaveLength(1);
    // Siblings should be different
    expect(proof0[0]).not.toBe(proof1[0]);
  });

  test("four-leaf tree yields proof of length 2", () => {
    const leaves = padLeaves( [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 3n })),
    ]);
    const layers = buildBulkOrderTree(leaves);
    const proof = getProof(layers, 0);
    expect(proof).toHaveLength(2);
  });

  test("proof for index 0 has sibling hash at position 0", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
    ];
    const layers = buildBulkOrderTree(leaves);
    const proof = getProof(layers, 0);
    expect(proof[0]).toBe(leaves[1]);
  });

  test("proof for index 1 has sibling hash at position 0", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
    ];
    const layers = buildBulkOrderTree(leaves);
    const proof = getProof(layers, 1);
    expect(proof[0]).toBe(leaves[0]);
  });

  test("throws for negative index", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
    ];
    const layers = buildBulkOrderTree(leaves);
    expect(() => getProof(layers, -1)).toThrow("out of range");
  });

  test("throws for index >= leaf count", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
    ];
    const layers = buildBulkOrderTree(leaves);
    expect(() => getProof(layers, 2)).toThrow("out of range");
  });
});

// ── hashBulkOrder ────────────────────────────────────────────

describe("hashBulkOrder", () => {
  test("returns a bytes32 hash", () => {
    const leaf = hashOrderComponentsStruct(makeOrderComponents());
    const padded = padLeaves( [leaf]);
    const layers = buildBulkOrderTree(padded);
    const root = layers[layers.length - 1]![0]!;
    const hash = hashBulkOrder(ctx, root, 1);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("same root and height produce same hash", () => {
    const leaf = hashOrderComponentsStruct(makeOrderComponents());
    const padded = padLeaves( [leaf]);
    const layers = buildBulkOrderTree(padded);
    const root = layers[layers.length - 1]![0]!;
    const h1 = hashBulkOrder(ctx, root, 1);
    const h2 = hashBulkOrder(ctx, root, 1);
    expect(h1).toBe(h2);
  });

  test("different roots produce different hashes", () => {
    const leaves1 = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
    ];
    const leaves2 = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 3n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 4n })),
    ];
    const layers1 = buildBulkOrderTree(leaves1);
    const layers2 = buildBulkOrderTree(leaves2);
    const root1 = layers1[layers1.length - 1]![0]!;
    const root2 = layers2[layers2.length - 1]![0]!;
    const h1 = hashBulkOrder(ctx, root1, 1);
    const h2 = hashBulkOrder(ctx, root2, 1);
    expect(h1).not.toBe(h2);
  });

  test("different heights produce different hashes", () => {
    const leaves = [
      hashOrderComponentsStruct(makeOrderComponents({ salt: 1n })),
      hashOrderComponentsStruct(makeOrderComponents({ salt: 2n })),
    ];
    const padded4 = padLeaves( leaves);
    const layers = buildBulkOrderTree(padded4);
    const root = layers[layers.length - 1]![0]!;
    // Use height 1 vs height 2 with same root
    const h1 = hashBulkOrder(ctx, root, 1);
    const h2 = hashBulkOrder(ctx, root, 2);
    expect(h1).not.toBe(h2);
  });
});

// ── packBulkSignature / unpackBulkSignature ──────────────────

describe("packBulkSignature", () => {
  const sig = {
    r: ("0x" + "aa".repeat(32)) as `0x${string}`,
    s: ("0x" + "0b".repeat(32)) as `0x${string}`,
    yParity: 0 as const,
  };

  test("produces correct length for height 1 proof", () => {
    const proof = [("0x" + "cc".repeat(32)) as `0x${string}`];
    const packed = packBulkSignature(sig, 0, proof);
    // 32 (r) + 32 (sCompact) + 3 (index) + 32 (proof) = 99 bytes = 198 hex chars + 2 prefix
    expect(packed.length).toBe(2 + 99 * 2);
  });

  test("produces correct length for height 2 proof", () => {
    const proof = [
      ("0x" + "cc".repeat(32)) as `0x${string}`,
      ("0x" + "dd".repeat(32)) as `0x${string}`,
    ];
    const packed = packBulkSignature(sig, 0, proof);
    // 32 + 32 + 3 + 64 = 131 bytes
    expect(packed.length).toBe(2 + 131 * 2);
  });

  test("round-trips with yParity 0", () => {
    const proof = [("0x" + "cc".repeat(32)) as `0x${string}`];
    const packed = packBulkSignature(sig, 5, proof);
    const unpacked = unpackBulkSignature(packed);
    expect(unpacked.signature.r).toBe(sig.r);
    expect(unpacked.signature.s).toBe(sig.s);
    expect(unpacked.signature.yParity).toBe(0);
    expect(unpacked.orderIndex).toBe(5);
    expect(unpacked.proof).toEqual(proof);
  });

  test("round-trips with yParity 1", () => {
    const sigV1 = { ...sig, yParity: 1 as const };
    const proof = [("0x" + "cc".repeat(32)) as `0x${string}`];
    const packed = packBulkSignature(sigV1, 42, proof);
    const unpacked = unpackBulkSignature(packed);
    expect(unpacked.signature.r).toBe(sigV1.r);
    expect(unpacked.signature.s).toBe(sigV1.s);
    expect(unpacked.signature.yParity).toBe(1);
    expect(unpacked.orderIndex).toBe(42);
    expect(unpacked.proof).toEqual(proof);
  });

  test("round-trips with orderIndex 0", () => {
    const proof = [("0x" + "cc".repeat(32)) as `0x${string}`];
    const packed = packBulkSignature(sig, 0, proof);
    const unpacked = unpackBulkSignature(packed);
    expect(unpacked.orderIndex).toBe(0);
  });

  test("round-trips with max orderIndex (0xffffff)", () => {
    const proof = [("0x" + "cc".repeat(32)) as `0x${string}`];
    const packed = packBulkSignature(sig, 0xffffff, proof);
    const unpacked = unpackBulkSignature(packed);
    expect(unpacked.orderIndex).toBe(0xffffff);
  });

  test("throws for negative orderIndex", () => {
    expect(() => packBulkSignature(sig, -1, [])).toThrow("3 bytes");
  });

  test("throws for orderIndex > 0xffffff", () => {
    expect(() => packBulkSignature(sig, 0x1000000, [])).toThrow("3 bytes");
  });
});

describe("unpackBulkSignature", () => {
  test("throws for too-short input", () => {
    const short = ("0x" + "aa".repeat(66)) as `0x${string}`;
    expect(() => unpackBulkSignature(short)).toThrow("too short");
  });

  test("throws for invalid length (not 67 + 32k)", () => {
    const bad = ("0x" + "aa".repeat(68)) as `0x${string}`;
    expect(() => unpackBulkSignature(bad)).toThrow("invalid length");
  });
});
