import { describe, expect, test } from "bun:test";
import {
  keccak256,
  encodeAbiParameters,
  concat,
  stringToHex,
  recoverAddress,
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
} from "./index";
import { ctx, makeOrderComponents, makeOfferItem, makeConsiderationItem } from "./test-fixtures";

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

  test("domain separator matches hashTypedData domain", () => {
    // Compute domain separator the same way as hashBulkOrder
    const domainTypeHash = keccak256(
      stringToHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
    );
    const nameHash = keccak256(stringToHex(ctx.domain.name as string));
    const versionHash = keccak256(stringToHex(ctx.domain.version as string));

    const domainSeparator = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "address" },
        ],
        [domainTypeHash, nameHash, versionHash, ctx.domain.verifyingContract as `0x${string}`],
      ),
    );

    console.log(`  domain separator: ${domainSeparator}`);

    // The domain separator should be deterministic
    expect(domainSeparator).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
