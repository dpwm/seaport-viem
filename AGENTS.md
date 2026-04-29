# AGENTS.md — seaport-viem

## What this is

Lightweight viem-based toolkit for Seaport NFT marketplace orders. Single runtime dependency: `viem`.

## Design constraint: backend → client

This library is **backend-first by design**. Every `build*` function returns
plain `FulfillmentData` (`{ to, data, value }`) — no wallet calls, no
`sendTransaction`, no React hooks. The server constructs and encodes; the
client only signs typed data and submits transactions.

See [`backend-flow.md`](./backend-flow.md) for the full architecture guide.

## Commands

```sh
bun test              # run all tests (bun:test, not vitest/jest)
bun run typecheck     # tsc --noEmit
```

Run a single test by name: `bun test -t "test name substring"`.

Both must pass before committing. There is no lint or format script.

## Source layout

All source files live in `src/`.

| File | Purpose |
|------|---------|
| File | Purpose |
|------|---------|
| `src/types.ts` | All TypeScript types + enum const objects (`ItemType`, `OrderType`, `BasicOrderRouteType`, `Side`) |
| `src/constants.ts` | ABI (JSON format), EIP-712 types, address constants, bulk order height limits |
| `src/errors.ts` | Custom error classes (`SeaportError`, `SeaportValidationError`, `SeaportEncodingError`, `SeaportCallError`) |
| `src/encode.ts` | Calldata encoders: `encodeGetCounter`, `encodeGetOrderHash`, `encodeFulfill*`, `encodeCancel`, `encodeIncrementCounter`, `encodeGetOrderStatus`, `encodeMatch*`, `encodeValidate` |
| `src/signature.ts` | `verifyOrderSignature`, `hashOrderComponents`, `hashOrderComponentsStruct` |
| `src/validate.ts` | `validateOrderComponents`, `validateSeaportContext`, `requireValidContext`, `buildValidate` |
| `src/call.ts` | `seaportCall` — Seaport-specific on-chain read helper (wraps viem error handling) |
| `src/counter.ts` | `getCounter` (on-chain call via `PublicClient`) |
| `src/order_status.ts` | `getOrderStatus` (on-chain call via `PublicClient`) |
| `src/order_hash.ts` | `getOrderHash` (on-chain call via `PublicClient`) |
| `src/cancel.ts` | `buildCancel` — build transaction data for `cancel` |
| `src/increment_counter.ts` | `buildIncrementCounter` — build transaction data for `incrementCounter` |
| `src/match.ts` | Two-sided matching: `buildMatchOrders`, `buildMatchAdvancedOrders` |
| `src/events.ts` | Event parsing: `decodeSeaportEvent`, event type exports, topic constants |
| `src/order.ts` | Core fulfillment: `toBasicOrderParameters`, `buildBasicOrderFulfillment`, `canFulfillAsBasicOrder`, `detectBasicOrderRouteType`, `toOrderParameters`, `getEmptyOrderComponents`, `aggregateOfferItems`, `aggregateConsiderationItems`, `computeNativeValue`, `buildFulfillOrder`, `buildFulfillAdvancedOrder`, `buildFulfillAvailableOrders`, `buildFulfillAvailableAdvancedOrders` |
| `src/bulk_listings.ts` | Bulk order signing: `computeHeight`, `padLeaves`, `buildBulkOrderTree`, `getBulkOrderTypeString`, `hashBulkOrder`, `getProof`, `packBulkSignature`, `unpackBulkSignature`, `encodeDomainSeparator` |
| `src/criteria.ts` | Criteria merkle trees for trait/collection offers: `hashCriteriaLeaf`, `buildCriteriaTree`, `getCriteriaRoot`, `getCriteriaProof`, `verifyCriteriaProof` |
| `src/index.ts` | Barrel re-export only — no logic lives here |
| `src/test-fixtures.ts` | Shared test fixtures (`makeOrder`, `makeOrderComponents`, etc.) |
| `src/constants.test.ts` | Tests for enum values, ABI, EIP-712 types, canonical type strings |
| `src/encode.test.ts` | Tests for calldata encoders |
| `src/validate.test.ts` | Tests for `validateOrderComponents` |
| `src/order.test.ts` | Tests for basic/standard/advanced fulfillment builders, eligibility, route detection |
| `src/signature.test.ts` | Tests for `verifyOrderSignature`, `hashOrderComponents` |
| `src/bulk_listings.test.ts` | Tests for bulk order tree building, proofs, type strings, signature packing |
| `src/call.test.ts` | Tests for `seaportCall` error handling and data paths |
| `src/counter.test.ts` | Tests for `getCounter` with mock client |
| `src/order_status.test.ts` | Tests for `getOrderStatus` with mock client |
| `src/order_hash.test.ts` | Tests for `getOrderHash` with mock client |
| `src/cancel.test.ts` | Tests for `buildCancel` |
| `src/increment_counter.test.ts` | Tests for `buildIncrementCounter` |
| `src/match.test.ts` | Tests for `buildMatchOrders`, `buildMatchAdvancedOrders` |
| `src/events.test.ts` | Tests for event decoding, ABI cross-checks |
| `src/criteria.test.ts` | Tests for criteria tree building, proofs, verification, edge cases |

Subpath imports work for all 16 entry points: `seaport-viem`, `seaport-viem/types`, `seaport-viem/constants`, `seaport-viem/encode`, `seaport-viem/signature`, `seaport-viem/counter`, `seaport-viem/validate`, `seaport-viem/order`, `seaport-viem/bulk-listings`, `seaport-viem/criteria`, `seaport-viem/cancel`, `seaport-viem/order-status`, `seaport-viem/order-hash`, `seaport-viem/match`, `seaport-viem/increment-counter`, `seaport-viem/call`, `seaport-viem/events`. See the `exports` map in `package.json`.

## TypeScript quirks

- `noUncheckedIndexedAccess` is enabled — array index access returns `T | undefined`. Use `!` non-null assertions after length guards, with `// biome-ignore lint/style/noNonNullAssertion:` comments.
- `allowImportingTsExtensions` + `noEmit` means `.ts` import extensions are required in source but `tsc` cannot emit. tsup handles the build.
- The ABI in `constants.ts` uses **JSON format** (`satisfies Abi`), not human-readable `parseAbi()` strings. This is because `abitype`'s parser doesn't support nested tuples.

## Testing

- Tests import from `./index` (the barrel), not individual modules.
- Shared fixtures live in `src/test-fixtures.ts`: `makeOrder()`, `makeOrderComponents()`, `makeOfferItem()`, `makeConsiderationItem()` — all accept partial overrides.
- Addresses in fixtures must be valid 20-byte hex (40 hex chars after `0x`). viem rejects fake addresses like `0xAlice...`.

## What the library covers

The library provides complete support for:
- Order fulfillment (basic, standard, advanced, available orders)
- Order cancellation (`buildCancel`)
- Counter management (`buildIncrementCounter`, `getCounter`)
- Order status and hash queries (`getOrderStatus`, `getOrderHash`)
- Two-sided matching (`buildMatchOrders`, `buildMatchAdvancedOrders` with criteria resolvers)
- Event parsing and decoding (`decodeSeaportEvent`)
- Order signing and signature verification
- Bulk order/listing creation and signing
- Criteria merkle trees for trait offers and collection offers (`buildCriteriaTree`, `getCriteriaProof`, `verifyCriteriaProof`)
- On-chain read operations via `seaportCall`

`matchAdvancedOrders` via criteria resolvers is implemented and tested.

Trait offer fulfillment works end-to-end: build a criteria merkle tree from
eligible token IDs, sign an order with the merkle root as
`identifierOrCriteria`, then submit a `CriteriaResolver` with a proof for
the specific token being sold.

## Build output

tsup emits ESM only (`format: ["esm"]`) to `dist/`. No CJS. The `exports`
map in package.json defines 16 subpath entry points, one per source module.

### Code splitting

The tsup config enables `splitting: true`, which produces shared chunk files
(e.g., `chunk-*.js`) alongside each entry point. Shared dependencies (ABI
constants, EIP-712 types, etc.) are extracted into these chunks rather than
being duplicated across every entry point. This is an intentional
optimization — modern bundlers (Vite, webpack, Rollup, esbuild) handle ESM
code splitting natively. If a consumer reports issues with older bundlers,
`import "seaport-viem"` (the barrel) can be used instead of deep imports.

## Guides

- **[Backend → Client Architecture](./backend-flow.md)** — How to use this
  library in server-orchestrated flows: construct orders and calldata on the
  backend, sign and submit from the browser.
- **[N Listings Under One Signature](./n-listings-one-signature.md)** — Sign
  multiple Seaport listings with a single ECDSA signature using bulk order
  merkle trees.
- **[Offers in Seaport](./offers.md)** — Collection offers, trait offers, and
  criteria resolution for buyer-initiated orders.

## Known issues

See [`improvements.md`](./improvements.md) for all known issues, action items, and
recommended fixes. Some items remain open — check it before starting new work.

## Related projects

The canonical Seaport protocol reference (smart contracts) lives at
`~/Projects/seaport/`.
