import {
  keccak256,
  encodeAbiParameters,
  concat,
  stringToHex,
  numberToHex,
  hexToNumber,
  toBytes,
  toHex,
  domainSeparator,
} from "viem";
import type { TypedDataDomain } from "viem";
import type { SeaportContext } from "./types";
import { requireValidContext } from "./validate";
import {
  BULK_ORDER_HEIGHT_MIN,
  BULK_ORDER_HEIGHT_MAX,
  BULK_ORDER_BRANCH_FACTOR,
  ORDER_COMPONENTS_TYPE_STRING,
  CONSIDERATION_ITEM_TYPE_STRING,
  OFFER_ITEM_TYPE_STRING,
} from "./constants";
import { hashOrderComponentsStruct } from "./signature";
import { getEmptyOrderComponents } from "./order";
import { SeaportValidationError } from "./errors";

/**
 * Compute the merkle tree height for a given number of orders.
 * Height H gives capacity 2^H.
 * @returns The height (>= 1 and <= BULK_ORDER_HEIGHT_MAX).
 * @throws If orderCount would require a height exceeding BULK_ORDER_HEIGHT_MAX (24).
 */
export function computeHeight(orderCount: number): number {
  if (orderCount < 1) {
    throw new SeaportValidationError(
      `orderCount must be at least 1, got ${orderCount}`,
    );
  }
  const height = Math.max(
    BULK_ORDER_HEIGHT_MIN,
    Math.ceil(Math.log2(orderCount)),
  );
  if (height > BULK_ORDER_HEIGHT_MAX) {
    throw new SeaportValidationError(
      `orderCount (${orderCount}) exceeds maximum bulk order capacity (${2 ** BULK_ORDER_HEIGHT_MAX})`,
    );
  }
  return height;
}

/**
 * Pad an array of leaf hashes to the next power of 2 using the hash of an
 * empty OrderComponents struct.
 *
 * @param leaves - The leaf hashes to pad.
 * @returns A new array padded to the required capacity.
 */
export function padLeaves(
  leaves: `0x${string}`[],
): `0x${string}`[] {
  if (leaves.length === 0) {
    throw new SeaportValidationError("Cannot pad an empty leaf array");
  }
  const padded = [...leaves];
  const emptyHash = hashOrderComponentsStruct(getEmptyOrderComponents());
  const height = computeHeight(padded.length);
  const capacity = 2 ** height;
  while (padded.length < capacity) {
    padded.push(emptyHash);
  }
  return padded;
}

/**
 * Build an unsorted merkle tree from leaf hashes.
 * Seaport does NOT sort pairs — it always hashes keccak256(left || right)
 * in index order.
 *
 * @param leaves - The leaf hashes (length must be a power of 2).
 * @returns All layers of the tree, from leaves to root. `layers[0]` is the
 *   leaves, `layers[layers.length - 1][0]` is the root.
 */
export function buildBulkOrderTree(leaves: `0x${string}`[]): `0x${string}`[][] {
  if (leaves.length === 0) {
    throw new SeaportValidationError("Cannot build a tree from zero leaves");
  }

  if ((leaves.length & (leaves.length - 1)) !== 0) {
    const height = computeHeight(leaves.length);
    const capacity = 2 ** height;
    throw new SeaportValidationError(
      `Leaves must be padded to a power of 2. Expected ${capacity}, got ${leaves.length}. Use padLeaves() first.`,
    );
  }

  const layers: `0x${string}`[][] = [leaves];
  let current = leaves;

  while (current.length > 1) {
    const next: `0x${string}`[] = [];
    for (let i = 0; i < current.length; i += BULK_ORDER_BRANCH_FACTOR) {
      const left = current[i]!;
      const right = current[i + 1]!;
      next.push(keccak256(concat([left, right])));
    }
    layers.push(next);
    current = next;
  }

  return layers;
}

/**
 * Generate the EIP-712 type string for a BulkOrder at the given height.
 * The type includes the full OrderComponents definition and all its sub-types.
 */
export function getBulkOrderTypeString(height: number): string {
  if (height < BULK_ORDER_HEIGHT_MIN || height > BULK_ORDER_HEIGHT_MAX) {
    throw new SeaportValidationError(
      `Height must be between ${BULK_ORDER_HEIGHT_MIN} and ${BULK_ORDER_HEIGHT_MAX}, got ${height}`,
    );
  }

  // Seaport uses a binary merkle tree (branch factor = 2) for bulk orders.
  // The [2] bracket notation repeats `height` times to match the tree depth,
  // e.g. height 3 → "OrderComponents[2][2][2] tree"
  const brackets = `[${BULK_ORDER_BRANCH_FACTOR}]`.repeat(height);
  return (
    `BulkOrder(OrderComponents${brackets} tree)` +
    CONSIDERATION_ITEM_TYPE_STRING +
    OFFER_ITEM_TYPE_STRING +
    ORDER_COMPONENTS_TYPE_STRING
  );
}

/**
 * Compute the EIP-712 digest for a bulk order.
 *
 * @param ctx - Seaport deployment context (address and EIP-712 domain).
 * @param root - The merkle root of the bulk order tree.
 * @param height - The tree height.
 * @returns The EIP-712 digest as a 32-byte hex string (ready to sign).
 */
export function hashBulkOrder(
  ctx: SeaportContext,
  root: `0x${string}`,
  height: number,
): `0x${string}` {
  requireValidContext(ctx);
  const typeString = getBulkOrderTypeString(height);
  const typeHash = keccak256(stringToHex(typeString));

  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [typeHash, root],
    ),
  );

  return keccak256(
    concat(["0x1901", encodeDomainSeparator(ctx.domain), structHash]),
  );
}

/**
 * Extract a merkle proof for a leaf at the given index.
 *
 * @param layers - All layers of the tree (as returned by buildBulkOrderTree).
 * @param index - The leaf index (0-based).
 * @returns The proof as an array of sibling hashes.
 */
export function getProof(
  layers: `0x${string}`[][],
  index: number,
): `0x${string}`[] {
  if (index < 0 || index >= (layers[0]?.length ?? 0)) {
    throw new SeaportValidationError(`Index ${index} out of range for tree with ${layers[0]?.length ?? 0} leaves`);
  }

  const proof: `0x${string}`[] = [];
  let idx = index;

  for (let layer = 0; layer < layers.length - 1; layer++) {
    const siblingIndex = idx ^ 1;
    // biome-ignore lint/style/noNonNullAssertion: siblingIndex is always within bounds for a complete binary tree
    proof.push(layers[layer]![siblingIndex]!);
    idx = Math.floor(idx / 2);
  }

  return proof;
}

/**
 * Pack a bulk order signature using EIP-2098 compact form.
 *
 * Format (67 + height * 32 bytes):
 *   r (32 bytes) ‖ sCompact (32 bytes) ‖ orderIndex (3 bytes) ‖ proof (height * 32 bytes)
 *
 * sCompact encodes yParity in the high bit (bit 255) of s.
 */
export function packBulkSignature(
  signature: { r: `0x${string}`; s: `0x${string}`; yParity: 0 | 1 },
  orderIndex: number,
  proof: `0x${string}`[],
): `0x${string}` {
  if (proof.length < 1) {
    throw new SeaportValidationError(
      "Bulk order signature must include at least one proof element",
    );
  }

  if (proof.length > BULK_ORDER_HEIGHT_MAX) {
    throw new SeaportValidationError(
      `Proof height (${proof.length}) exceeds maximum bulk order height (${BULK_ORDER_HEIGHT_MAX})`,
    );
  }

  if (orderIndex < 0 || orderIndex > 0xffffff) {
    throw new SeaportValidationError(
      `orderIndex must fit in 3 bytes (0–16777215), got ${orderIndex}`,
    );
  }

  const sBigInt = BigInt(signature.s);
  const yParityBit = signature.yParity === 1 ? 1n << 255n : 0n;
  const sCompact = yParityBit | sBigInt;

  return concat([
    signature.r,
    numberToHex(sCompact, { size: 32 }),
    numberToHex(orderIndex, { size: 3 }),
    ...proof,
  ]);
}

/**
 * Unpack a bulk order signature from EIP-2098 compact form.
 *
 * @param packed - The packed bulk signature.
 * @returns The signature components, order index, and merkle proof.
 * @throws If the packed signature has height < 1 (no proof elements).
 */
export function unpackBulkSignature(packed: `0x${string}`): {
  signature: { r: `0x${string}`; s: `0x${string}`; yParity: 0 | 1 };
  orderIndex: number;
  proof: `0x${string}`[];
} {
  const bytes = toBytes(packed);

  if (bytes.length < 67) {
    throw new SeaportValidationError(
      `Packed signature too short: expected at least 67 bytes, got ${bytes.length}`,
    );
  }

  const remainder = (bytes.length - 67) % 32;
  if (remainder !== 0) {
    throw new SeaportValidationError(
      `Packed signature has invalid length: proof must be a multiple of 32 bytes`,
    );
  }

  const height = (bytes.length - 67) / 32;

  if (height < 1) {
    throw new SeaportValidationError(
      "Packed signature must include at least one proof element",
    );
  }

  if (height > BULK_ORDER_HEIGHT_MAX) {
    throw new SeaportValidationError(
      `Packed signature height (${height}) exceeds maximum bulk order height (${BULK_ORDER_HEIGHT_MAX})`,
    );
  }

  const r = toHex(bytes.slice(0, 32));
  const sCompact = BigInt(toHex(bytes.slice(32, 64)));
  const yParity: 0 | 1 = sCompact >> 255n === 1n ? 1 : 0;
  const s = sCompact & ((1n << 255n) - 1n);
  const orderIndex = hexToNumber(toHex(bytes.slice(64, 67)));

  const proof: `0x${string}`[] = [];
  for (let i = 0; i < height; i++) {
    const start = 67 + i * 32;
    proof.push(toHex(bytes.slice(start, start + 32)));
  }

  return {
    signature: { r, s: numberToHex(s, { size: 32 }), yParity },
    orderIndex,
    proof,
  };
}

/**
 * Encode an EIP-712 domain separator as bytes32.
 *
 * Delegates to viem's `domainSeparator` which uses a dynamic type array —
 * only fields present in the domain are included.  This guarantees the same
 * domain separator as `hashTypedData` and `recoverTypedDataAddress` for any
 * valid domain.
 *
 * @internal This is an internal utility used by `hashBulkOrder`. It is exported
 *   for advanced use cases but is not part of the stable public API.
 *
 * @param domain - The EIP-712 domain to encode.
 * @returns The domain separator hash (bytes32).
 */
export function encodeDomainSeparator(domain: TypedDataDomain): `0x${string}` {
  return domainSeparator({ domain });
}
