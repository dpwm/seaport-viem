import { describe, expect, test } from "bun:test";
import {
  keccak256,
  encodeAbiParameters,
  concat,
  stringToHex,
  recoverAddress,
  hashTypedData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ItemType,
  OrderType,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  hashOrderComponentsStruct,
  computeHeight,
  padLeaves,
  buildBulkOrderTree,
  hashBulkOrder,
  getProof,
  toOrderParameters,
  encodeDomainSeparator,
} from "./index";
import { ctx, makeOrderComponents, makeOfferItem, makeConsiderationItem } from "./test-fixtures";

// Test-only key — do NOT use for any real funds. This key is used exclusively
// for integration-level debugging of bulk order signing.
const SELLER_KEY =
  "0x84ce473bdcb5460191fb3201117551d16c2d83a3cd896b55f605a4649520d140" as `0x${string}`;

describe("bulk order signing diagnostics", () => {
  test("recovered signer matches offerer", async () => {
    const account = privateKeyToAccount(SELLER_KEY);

    const orders = [
      makeOrderComponents({ offerer: account.address, salt: 1n }),
      makeOrderComponents({ offerer: account.address, salt: 2n }),
      makeOrderComponents({ offerer: account.address, salt: 3n }),
      makeOrderComponents({ offerer: account.address, salt: 4n }),
    ];

    const leaves = orders.map((o) => hashOrderComponentsStruct(o));
    const padded = padLeaves( leaves);
    const layers = buildBulkOrderTree(padded);
    const root = layers[layers.length - 1]![0]!;
    const height = computeHeight(padded.length);

    const digest = hashBulkOrder(ctx, root, height);

    // Sign the raw digest
    const sig = await account.sign({ hash: digest });

    // Recover the signer
    const recovered = await recoverAddress({ hash: digest, signature: sig });

    console.log(`  offerer:   ${account.address}`);
    console.log(`  recovered: ${recovered}`);
    console.log(`  match: ${recovered.toLowerCase() === account.address.toLowerCase()}`);
    console.log(`  digest: ${digest}`);
    console.log(`  root: ${root}`);
    console.log(`  height: ${height}`);

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  test("root reconstruction from proof matches computed root", () => {
    const account = privateKeyToAccount(SELLER_KEY);

    const orders = [
      makeOrderComponents({ offerer: account.address, salt: 1n }),
      makeOrderComponents({ offerer: account.address, salt: 2n }),
      makeOrderComponents({ offerer: account.address, salt: 3n }),
      makeOrderComponents({ offerer: account.address, salt: 4n }),
    ];

    const leaves = orders.map((o) => hashOrderComponentsStruct(o));
    const padded = padLeaves( leaves);
    const layers = buildBulkOrderTree(padded);
    const root = layers[layers.length - 1]![0]!;

    // Reconstruct root from leaf 0 + proof
    const proof = getProof(layers, 0);
    let current = leaves[0]!;
    for (const sibling of proof) {
      current = keccak256(concat([current, sibling]));
    }

    console.log(`  computed root:    ${root}`);
    console.log(`  reconstructed:    ${current}`);
    console.log(`  match: ${current === root}`);

    expect(current).toBe(root);
  });

  test("domain separator matches hashTypedData", () => {
    // Use the exported encodeDomainSeparator from the library (same as hashBulkOrder uses)
    const domainSeparator = encodeDomainSeparator(ctx.domain);

    // Cross-check against viem's hashTypedData with an empty struct
    const viemDigest = hashTypedData({
      domain: ctx.domain,
      types: { Empty: [] },
      primaryType: "Empty",
      message: {},
    });
    // The EIP-712 digest is keccak256(0x1901 || domainSeparator || structHash).
    // For an Empty type, structHash = keccak256(abi.encode(keccak256("Empty()"))).
    const emptyTypeHash = keccak256(stringToHex("Empty()"));
    const expectedStructHash = keccak256(
      encodeAbiParameters([{ type: "bytes32" }], [emptyTypeHash]),
    );
    const expectedDigest = keccak256(
      concat(["0x1901", domainSeparator, expectedStructHash]),
    );

    console.log(`  domain separator: ${domainSeparator}`);
    console.log(`  viem digest:      ${viemDigest}`);
    console.log(`  expected digest:  ${expectedDigest}`);
    console.log(`  match: ${expectedDigest === viemDigest}`);

    expect(expectedDigest).toBe(viemDigest);
  });
});
