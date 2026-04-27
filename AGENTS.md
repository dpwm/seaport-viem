# AGENTS.md — seaport-viem

## What this is

Lightweight viem-based toolkit for Seaport NFT marketplace orders. Single runtime dependency: `viem`.

## Commands

```sh
bun test              # run all tests (bun:test, not vitest/jest)
bun run typecheck     # tsc --noEmit
bun run build         # tsup → dist/
```

Run a single test by name: `bun test -t "test name substring"`.

All three must pass before committing. There is no lint or format script.

## Source layout

All source files live in `src/`.

| File | Purpose |
|------|---------|
| `src/types.ts` | All TypeScript types + enum const objects (`ItemType`, `OrderType`, `BasicOrderRouteType`, `Side`) |
| `src/constants.ts` | ABI (JSON format), EIP-712 types, address constants, bulk order height limits |
| `src/encode.ts` | `encodeGetCounter`, `encodeGetOrderHash`, `encodeFulfillBasicOrder`, `encodeFulfillOrder`, `encodeFulfillAdvancedOrder`, `encodeFulfillAvailableOrders`, `encodeFulfillAvailableAdvancedOrders` |
| `src/signature.ts` | `verifyOrderSignature`, `hashOrderComponents` |
| `src/counter.ts` | `getCounter` (on-chain call via `PublicClient`) |
| `src/validate.ts` | `validateOrderComponents` (client-side checks) |
| `src/order.ts` | Core fulfillment: `toBasicOrderParameters`, `buildBasicOrderFulfillment`, `canFulfillAsBasicOrder`, `detectBasicOrderRouteType`, `toOrderParameters`, `getEmptyOrderComponents`, `buildFulfillOrder`, `buildFulfillAdvancedOrder`, `buildFulfillAvailableOrders`, `buildFulfillAvailableAdvancedOrders` |
| `src/bulk_listings.ts` | Bulk order signing: `computeHeight`, `padLeaves`, `buildBulkOrderTree`, `getBulkOrderTypeString`, `hashBulkOrder`, `getProof`, `packBulkSignature`, `unpackBulkSignature` |
| `src/index.ts` | Barrel re-export only — no logic lives here |
| `src/test-fixtures.ts` | Shared test fixtures (`makeOrder`, `makeOrderComponents`, etc.) |
| `src/constants.test.ts` | Tests for enum values, ABI, EIP-712 types |
| `src/encode.test.ts` | Tests for calldata encoders |
| `src/validate.test.ts` | Tests for `validateOrderComponents` |
| `src/order.test.ts` | Tests for `canFulfillAsBasicOrder`, `detectBasicOrderRouteType`, `toBasicOrderParameters`, `buildBasicOrderFulfillment`, `toOrderParameters`, builders |
| `src/signature.test.ts` | Tests for `hashOrderComponents` |
| `src/bulk_listings.test.ts` | Tests for bulk order tree building, proofs, type strings, signature packing |

Subpath imports work: `import { ... } from "seaport-viem/order"` and `import { ... } from "seaport-viem/bulk-listings"`.

## TypeScript quirks

- `noUncheckedIndexedAccess` is enabled — array index access returns `T | undefined`. Use `!` non-null assertions after length guards, with `// biome-ignore lint/style/noNonNullAssertion:` comments.
- `allowImportingTsExtensions` + `noEmit` means `.ts` import extensions are required in source but `tsc` cannot emit. tsup handles the build.
- The ABI in `constants.ts` uses **JSON format** (`satisfies Abi`), not human-readable `parseAbi()` strings. This is because `abitype`'s parser doesn't support nested tuples.

## Testing

- Tests import from `./index` (the barrel), not individual modules.
- Shared fixtures live in `src/test-fixtures.ts`: `makeOrder()`, `makeOrderComponents()`, `makeOfferItem()`, `makeConsiderationItem()` — all accept partial overrides.
- Addresses in fixtures must be valid 20-byte hex (40 hex chars after `0x`). viem rejects fake addresses like `0xAlice...`.
- `verifyOrderSignature` and `getCounter` are not unit-tested (they need mocking or a live client).

## What the library does NOT cover

`fulfillOrder`, `fulfillAdvancedOrder`, `fulfillAvailableOrders`, and `fulfillAvailableAdvancedOrders` are supported (encoders + builders). `cancel`, `incrementCounter`, `getOrderStatus`, `matchOrders`, `matchAdvancedOrders`, and event parsing are not yet implemented.

## Build output

tsup emits ESM only (`format: ["esm"]`) to `dist/`. No CJS. The `exports` map in package.json defines 9 subpath entry points, one per source module.

## Open issues

See [`improvements.md`](./improvements.md) for known issues, action items, and
recommended fixes from the latest code review. Check it before starting new
work to avoid overlapping with known problems.

## Related projects

The canonical Seaport protocol reference (smart contracts) lives at
`~/Projects/seaport/`.
