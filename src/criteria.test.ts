import { describe, test, expect } from "bun:test";
import { keccak256, encodeAbiParameters, concat } from "viem";
import {
  hashCriteriaLeaf,
  buildCriteriaTree,
  getCriteriaRoot,
  getCriteriaProof,
  verifyCriteriaProof,
} from "./index";

// ── hashCriteriaLeaf ────────────────────────────────────────

describe("hashCriteriaLeaf", () => {
  test("produces a 32-byte keccak256 hash of the ABI-encoded uint256", () => {
    const leaf = hashCriteriaLeaf(305n);
    const expected = keccak256(
      encodeAbiParameters([{ type: "uint256" }], [305n]),
    );
    expect(leaf).toBe(expected);
    expect(leaf).toHaveLength(66); // "0x" + 64 hex chars
  });

  test("different token IDs produce different hashes", () => {
    expect(hashCriteriaLeaf(1n)).not.toBe(hashCriteriaLeaf(2n));
  });

  test("same token ID produces consistent hash", () => {
    expect(hashCriteriaLeaf(42n)).toBe(hashCriteriaLeaf(42n));
  });

  test("handles large token IDs", () => {
    const maxUint256 =
      115792089237316195423570985008687907853269984665640564039457584007913129639935n;
    const leaf = hashCriteriaLeaf(maxUint256);
    expect(leaf).toHaveLength(66);
  });

  test("zero token ID produces valid hash", () => {
    const leaf = hashCriteriaLeaf(0n);
    expect(leaf).toHaveLength(66);
  });
});

// ── buildCriteriaTree ───────────────────────────────────────

describe("buildCriteriaTree", () => {
  test("throws for empty token IDs", () => {
    expect(() => buildCriteriaTree([])).toThrow("zero token IDs");
  });

  test("single token: one leaf, one root", () => {
    const tree = buildCriteriaTree([42n]);
    expect(tree).toHaveLength(1); // just the leaf layer
    expect(tree[0]).toHaveLength(1);
    expect(tree[0]![0]).toBe(hashCriteriaLeaf(42n));
  });

  test("two tokens: leaf layer + root layer", () => {
    const tree = buildCriteriaTree([42n, 101n]);
    // [ [leafHash_42, leafHash_101], [root] ]
    expect(tree).toHaveLength(2);
    expect(tree[0]).toHaveLength(2);
    expect(tree[1]).toHaveLength(1);

    // Root should be keccak256(sorted(leaf_42, leaf_101))
    const leaf42 = hashCriteriaLeaf(42n);
    const leaf101 = hashCriteriaLeaf(101n);
    const [smaller, larger] =
      leaf42 < leaf101 ? [leaf42, leaf101] : [leaf101, leaf42];
    const expectedRoot = keccak256(concat([smaller, larger]));
    expect(tree[1]![0]).toBe(expectedRoot);
  });

  test("three tokens (odd leaf count): last node duplicated at leaf layer", () => {
    const ids = [10n, 20n, 30n];
    const tree = buildCriteriaTree(ids);

    // [ [leaf_10, leaf_20, leaf_30], [hash_AB, hash_CC], [root] ]
    expect(tree).toHaveLength(3);

    // First parent layer: pair (10,20) and (30,30 duplicated)
    const leaf10 = hashCriteriaLeaf(10n);
    const leaf20 = hashCriteriaLeaf(20n);
    const leaf30 = hashCriteriaLeaf(30n);

    const [s0, l0] =
      leaf10 < leaf20 ? [leaf10, leaf20] : [leaf20, leaf10];
    const hashAB = keccak256(concat([s0, l0]));

    const [s1, l1] =
      leaf30 < leaf30 ? [leaf30, leaf30] : [leaf30, leaf30];
    const hashCC = keccak256(concat([s1, l1]));

    expect(tree[1]![0]).toBe(hashAB);
    expect(tree[1]![1]).toBe(hashCC);

    // Root: keccak256(sorted(hashAB, hashCC))
    const [sRoot, lRoot] =
      hashAB < hashCC
        ? [hashAB, hashCC]
        : [hashCC, hashAB];
    const expectedRoot = keccak256(concat([sRoot, lRoot]));
    expect(tree[2]![0]).toBe(expectedRoot);
  });

  test("deduplicates token IDs", () => {
    const tree = buildCriteriaTree([42n, 42n, 101n]);
    expect(tree[0]).toHaveLength(2); // only two unique leaves
  });

  test("sorts token IDs for deterministic output", () => {
    const tree1 = buildCriteriaTree([101n, 42n, 305n]);
    const tree2 = buildCriteriaTree([305n, 42n, 101n]);
    const root1 = tree1[tree1.length - 1]![0];
    const root2 = tree2[tree2.length - 1]![0];
    expect(root1).toBe(root2);

    // Leaves should be in ascending ID order
    expect(tree1[0]![0]).toBe(hashCriteriaLeaf(42n));
    expect(tree1[0]![1]).toBe(hashCriteriaLeaf(101n));
    expect(tree1[0]![2]).toBe(hashCriteriaLeaf(305n));
  });

  test("four tokens: balanced tree with 3 layers", () => {
    const tree = buildCriteriaTree([1n, 2n, 3n, 4n]);
    expect(tree).toHaveLength(3); // leaves, parent, root
    expect(tree[0]).toHaveLength(4);
    expect(tree[1]).toHaveLength(2);
    expect(tree[2]).toHaveLength(1);
  });

  test("large token ID sets build without error", () => {
    const ids = Array.from({ length: 100 }, (_, i) => BigInt(i * 7 + 1));
    const tree = buildCriteriaTree(ids);
    // 2^6 = 64, 2^7 = 128, so with odd-node duplication, height should be
    // ceil(log2(100)) + 1 = 8 (leaves) + 1 parent layer = 8 layers? No:
    // Actually: 100 leaves: 100→50→25→13→7→4→2→1 = 8 layers
    expect(tree[tree.length - 1]).toHaveLength(1);
  });
});

// ── getCriteriaRoot ─────────────────────────────────────────

describe("getCriteriaRoot", () => {
  test("returns the root from layers", () => {
    const tree = buildCriteriaTree([42n, 101n]);
    const root = getCriteriaRoot(tree);
    // biome-ignore lint/style/noNonNullAssertion: tree has at least 1 layer with 1 element
    expect(root).toBe(tree[tree.length - 1]![0]!);
  });

  test("throws for empty layers", () => {
    expect(() => getCriteriaRoot([])).toThrow("empty layers");
  });
});

// ── getCriteriaProof ────────────────────────────────────────

describe("getCriteriaProof", () => {
  test("single token tree returns empty proof", () => {
    const tree = buildCriteriaTree([42n]);
    const proof = getCriteriaProof(tree, 42n);
    expect(proof).toEqual([]);
  });

  test("two-token tree: proof has 1 element", () => {
    const tree = buildCriteriaTree([42n, 101n]);
    const proof = getCriteriaProof(tree, 42n);
    expect(proof).toHaveLength(1);
    // The sibling should be the other leaf hash
    expect(proof[0]).toBe(hashCriteriaLeaf(101n));
  });

  test("two-token tree: proof for the second token", () => {
    const tree = buildCriteriaTree([42n, 101n]);
    const proof = getCriteriaProof(tree, 101n);
    expect(proof).toHaveLength(1);
    expect(proof[0]).toBe(hashCriteriaLeaf(42n));
  });

  test("three-token tree (odd): proof for the duplicated (last) node", () => {
    const tree = buildCriteriaTree([10n, 20n, 30n]);
    const proof = getCriteriaProof(tree, 30n);

    // 30 is index 2. Tree has 3 layers:
    // Layer 0: [hash(10), hash(20), hash(30)]
    // Layer 1: [hash_AB, hash_CC] where hash_CC = keccak256(sorted(hash30, hash30))
    // Layer 2: [root]
    //
    // idx=2: layer0 siblingIndex=3 (OOB) → sibling = hash30 (self)
    //        idx=1: layer1 siblingIndex=0 → sibling = hash_AB
    expect(proof).toHaveLength(2);

    // Verify proof works
    const root = getCriteriaRoot(tree);
    const leafHash = hashCriteriaLeaf(30n);
    expect(verifyCriteriaProof(leafHash, root, proof)).toBe(true);
  });

  test("three-token tree: proof for a middle node", () => {
    const tree = buildCriteriaTree([10n, 20n, 30n]);
    const proof = getCriteriaProof(tree, 20n);

    // 20 is index 1. 
    // idx=1: layer0 siblingIndex=0 → sibling = hash(10)
    //        idx=0: layer1 siblingIndex=1 → sibling = hash_CC
    expect(proof).toHaveLength(2);

    const root = getCriteriaRoot(tree);
    const leafHash = hashCriteriaLeaf(20n);
    expect(verifyCriteriaProof(leafHash, root, proof)).toBe(true);
  });

  test("four-token tree: proof has 2 elements (height 2)", () => {
    const tree = buildCriteriaTree([1n, 2n, 3n, 4n]);
    const proof = getCriteriaProof(tree, 1n);
    expect(proof).toHaveLength(2);
  });

  test("throws if token ID not found in tree", () => {
    const tree = buildCriteriaTree([42n, 101n]);
    expect(() => getCriteriaProof(tree, 999n)).toThrow("not found");
  });

  test("throws for empty layers", () => {
    expect(() => getCriteriaProof([], 42n)).toThrow("empty layers");
  });

  test("round-trip: build tree → get proof → verify succeeds for all tokens", () => {
    const ids = [5n, 15n, 25n, 35n, 45n, 55n, 65n];
    const tree = buildCriteriaTree(ids);
    const root = getCriteriaRoot(tree);

    for (const id of ids) {
      const proof = getCriteriaProof(tree, id);
      const leafHash = hashCriteriaLeaf(id);
      expect(verifyCriteriaProof(leafHash, root, proof)).toBe(true);
    }
  });

  test("huge token set: all tokens verify", () => {
    const ids = Array.from({ length: 50 }, (_, i) => BigInt(i * 13 + 1));
    const tree = buildCriteriaTree(ids);
    const root = getCriteriaRoot(tree);

    for (const id of ids) {
      const proof = getCriteriaProof(tree, id);
      const leafHash = hashCriteriaLeaf(id);
      expect(verifyCriteriaProof(leafHash, root, proof)).toBe(true);
    }
  });
});

// ── verifyCriteriaProof ─────────────────────────────────────

describe("verifyCriteriaProof", () => {
  test("valid proof returns true", () => {
    const ids = [42n, 101n, 305n];
    const tree = buildCriteriaTree(ids);
    const root = getCriteriaRoot(tree);
    const proof = getCriteriaProof(tree, 305n);
    const leafHash = hashCriteriaLeaf(305n);

    expect(verifyCriteriaProof(leafHash, root, proof)).toBe(true);
  });

  test("empty proof with matching leafHash and root returns true (single token)", () => {
    const leafHash = hashCriteriaLeaf(42n);
    // For a single-token tree, the root IS the leaf hash
    const root = buildCriteriaTree([42n])[0]![0]!;
    expect(verifyCriteriaProof(leafHash, root, [])).toBe(true);
  });

  test("tampered proof returns false", () => {
    const ids = [42n, 101n];
    const tree = buildCriteriaTree(ids);
    const root = getCriteriaRoot(tree);
    const proof = getCriteriaProof(tree, 42n);

    // Tamper with the proof
    const tampered = [...proof] as `0x${string}`[];
    tampered[0] = ("0x" + "ff".repeat(32)) as `0x${string}`;

    const leafHash = hashCriteriaLeaf(42n);
    expect(verifyCriteriaProof(leafHash, root, tampered)).toBe(false);
  });

  test("wrong root returns false", () => {
    const ids = [42n, 101n];
    const tree = buildCriteriaTree(ids);
    const proof = getCriteriaProof(tree, 42n);
    const leafHash = hashCriteriaLeaf(42n);

    const wrongRoot = buildCriteriaTree([999n])[0]![0]!;
    expect(verifyCriteriaProof(leafHash, wrongRoot!, proof)).toBe(false);
  });

  test("wrong leafHash returns false", () => {
    const ids = [42n, 101n];
    const tree = buildCriteriaTree(ids);
    const root = getCriteriaRoot(tree);
    const proof = getCriteriaProof(tree, 42n);

    const wrongLeafHash = hashCriteriaLeaf(999n);
    expect(verifyCriteriaProof(wrongLeafHash, root, proof)).toBe(false);
  });

  test("extra proof element returns false", () => {
    const ids = [42n, 101n];
    const tree = buildCriteriaTree(ids);
    const root = getCriteriaRoot(tree);
    const proof = getCriteriaProof(tree, 42n);

    const leafHash = hashCriteriaLeaf(42n);
    const badProof = [...proof, proof[0]!];
    expect(verifyCriteriaProof(leafHash, root, badProof)).toBe(false);
  });

  test("missing proof element returns false", () => {
    const ids = [1n, 2n, 3n, 4n];
    const tree = buildCriteriaTree(ids);
    const root = getCriteriaRoot(tree);
    const proof = getCriteriaProof(tree, 1n); // should have 2 elements
    const leafHash = hashCriteriaLeaf(1n);

    const shortProof = [proof[0]!]; // only 1 of 2
    expect(verifyCriteriaProof(leafHash, root, shortProof)).toBe(false);
  });

  test("sorted-pair ordering: swapped proof order gives same result", () => {
    // Since verifyCriteriaProof sorts before hashing, the relative order
    // of hash vs proof element at each level shouldn't matter — but we
    // test that a correctly-constructed proof (with siblings in tree order)
    // still works.
    const ids = [10n, 30n];
    const tree = buildCriteriaTree(ids);
    const root = getCriteriaRoot(tree);
    const proof = getCriteriaProof(tree, 10n);
    const leafHash = hashCriteriaLeaf(10n);

    // The proof element is the sibling — should work regardless of which is
    // larger because sorted-pair handles it.
    expect(verifyCriteriaProof(leafHash, root, proof)).toBe(true);

    // Swap them manually and verify again
    // (proof has one element — swapping leaf and proof element before
    //  hashing yields the same result due to sorting)
    const reversedLeaf = proof[0]!; // use sibling as "leaf"
    const reversedProof = [leafHash] as `0x${string}`[];
    // The pair (sibling, leaf) sorted should produce the same hash as (leaf, sibling) sorted
    const [smaller, larger] =
      leafHash < proof[0]! ? [leafHash, proof[0]!] : [proof[0]!, leafHash];
    const directHash = keccak256(concat([smaller, larger]));
    expect(directHash).toBe(root);
  });
});
