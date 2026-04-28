import { keccak256, encodeAbiParameters, concat } from "viem";
import { SeaportValidationError } from "./errors";

/**
 * Hash a single token ID for use as a leaf in a criteria merkle tree.
 *
 * Mirrors Seaport's `_verifyProof` leaf hashing in
 * `CriteriaResolution.sol`: the token ID is ABI-encoded as `uint256`,
 * then hashed with keccak256.
 *
 * @param tokenId - The token ID to hash.
 * @returns The 32-byte keccak256 hash of the ABI-encoded token ID.
 *
 * @example
 * ```ts
 * const leaf = hashCriteriaLeaf(305n);
 * // leaf === keccak256(encodeAbiParameters([{ type: "uint256" }], [305n]))
 * ```
 */
export function hashCriteriaLeaf(tokenId: bigint): `0x${string}` {
  return keccak256(
    encodeAbiParameters([{ type: "uint256" }], [tokenId]),
  );
}

/**
 * Build a sorted-pair merkle tree from token IDs for criteria-based orders.
 *
 * Token IDs are deduplicated and sorted (ascending) for deterministic tree
 * construction. At each tree level, adjacent nodes are paired, sorted
 * ascending, and hashed together (`keccak256(smaller ‖ larger)`). Layers
 * with an odd number of nodes have the last node duplicated to form a pair.
 *
 * This matches Seaport's `_verifyProof` in `CriteriaResolution.sol`, which
 * uses sorted-pair hashing — unlike the bulk orders tree in
 * {@link buildBulkOrderTree} which uses unsorted concatenation.
 *
 * @param tokenIds - The token IDs in the eligible set. May contain duplicates
 *   (silently deduplicated). Must contain at least one token ID.
 * @returns All layers of the tree, from leaves to root.
 *   `layers[0]` is the hashed leaves (one per unique token ID).
 *   `layers[layers.length - 1][0]` is the merkle root.
 * @throws {SeaportValidationError} If `tokenIds` is empty.
 *
 * @example
 * ```ts
 * const tree = buildCriteriaTree([42n, 101n, 305n]);
 * const root = tree[tree.length - 1][0];
 * ```
 */
export function buildCriteriaTree(
  tokenIds: bigint[],
): `0x${string}`[][] {
  if (tokenIds.length === 0) {
    throw new SeaportValidationError("Cannot build a criteria tree from zero token IDs");
  }

  // Deduplicate and sort ascending for deterministic tree construction.
  const unique = [...new Set(tokenIds.map((id) => String(id)))]
    .map((s) => BigInt(s))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const leaves = unique.map(hashCriteriaLeaf);
  const layers: `0x${string}`[][] = [leaves];
  let current = leaves;

  while (current.length > 1) {
    const next: `0x${string}`[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      // Duplicate the last node if the layer has an odd number of nodes.
      const right = i + 1 < current.length ? current[i + 1]! : left;
      const [smaller, larger] =
        left < right ? [left, right] : [right, left];
      next.push(keccak256(concat([smaller, larger])));
    }
    layers.push(next);
    current = next;
  }

  return layers;
}

/**
 * Get the merkle root from a criteria tree.
 *
 * @param layers - All layers of the tree (as returned by {@link buildCriteriaTree}).
 * @returns The merkle root (a 32-byte hex string).
 */
export function getCriteriaRoot(
  layers: `0x${string}`[][],
): `0x${string}` {
  if (layers.length === 0) {
    throw new SeaportValidationError("Cannot get root from empty layers");
  }
  // biome-ignore lint/style/noNonNullAssertion: last layer always has at least one element
  return layers[layers.length - 1]![0]!;
}

/**
 * Extract a merkle proof for a specific token ID from a criteria tree.
 *
 * Walks the tree upward from the leaf, collecting the sibling hash at
 * each level. The resulting proof can be used in a
 * {@link CriteriaResolver} to fulfill a trait offer.
 *
 * @param layers - All layers of the tree (as returned by {@link buildCriteriaTree}).
 * @param tokenId - The token ID to prove inclusion for.
 * @returns The merkle proof as an array of 32-byte sibling hashes.
 * @throws {SeaportValidationError} If the token ID is not found in the tree.
 *
 * @example
 * ```ts
 * const tree = buildCriteriaTree([42n, 101n, 305n]);
 * const proof = getCriteriaProof(tree, 305n);
 * // Use proof in a CriteriaResolver:
 * // { orderIndex: 0n, side: Side.OFFER, index: 0n, identifier: 305n, criteriaProof: proof }
 * ```
 */
export function getCriteriaProof(
  layers: `0x${string}`[][],
  tokenId: bigint,
): `0x${string}`[] {
  if (layers.length === 0) {
    throw new SeaportValidationError("Cannot get proof from empty layers");
  }

  const leafHash = hashCriteriaLeaf(tokenId);
  // biome-ignore lint/style/noNonNullAssertion: guarded by length check above
  const leaves = layers[0]!;
  const index = leaves.indexOf(leafHash);

  if (index === -1) {
    throw new SeaportValidationError(
      `Token ID ${tokenId} not found in criteria tree`,
    );
  }

  const proof: `0x${string}`[] = [];
  let idx = index;

  for (let layer = 0; layer < layers.length - 1; layer++) {
    // biome-ignore lint/style/noNonNullAssertion: layer index is bounded by layers.length
    const layerNodes = layers[layer]!;
    const siblingIndex = idx ^ 1;

    // If the sibling index is past the end of the layer, the current node
    // was the last odd node and was duplicated during tree construction.
    // Its sibling is itself.
    // biome-ignore lint/style/noNonNullAssertion: idx is always within bounds
    const sibling =
      siblingIndex < layerNodes.length
        ? layerNodes[siblingIndex]!
        : layerNodes[idx]!;

    proof.push(sibling);
    idx = Math.floor(idx / 2);
  }

  return proof;
}

/**
 * Verify a criteria merkle proof against a root using sorted-pair hashing.
 *
 * Recomputes the merkle root from a leaf hash and proof, mirroring
 * Seaport's `_verifyProof` in `CriteriaResolution.sol`. At each step,
 * the current hash and proof element are sorted ascending before being
 * hashed together.
 *
 * This is a pure function — no on-chain call. Use it to validate a proof
 * before submitting a fulfillment transaction.
 *
 * @param leafHash - The pre-hashed token ID (output of {@link hashCriteriaLeaf}).
 * @param root - The expected merkle root (from the order's `identifierOrCriteria`).
 * @param proof - The merkle proof to verify (from {@link getCriteriaProof}).
 * @returns `true` if the proof is valid, `false` otherwise.
 *
 * @example
 * ```ts
 * const leafHash = hashCriteriaLeaf(305n);
 * const isValid = verifyCriteriaProof(leafHash, root, proof);
 * if (isValid) {
 *   // Submit fulfillment with the proof
 * }
 * ```
 */
export function verifyCriteriaProof(
  leafHash: `0x${string}`,
  root: `0x${string}`,
  proof: `0x${string}`[],
): boolean {
  let hash = leafHash;

  for (const p of proof) {
    const [smaller, larger] = hash < p ? [hash, p] : [p, hash];
    hash = keccak256(concat([smaller, larger]));
  }

  return hash === root;
}
