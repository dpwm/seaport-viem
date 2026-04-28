# Improvements

Issues and action items identified during code review. Items are ordered by
impact; address the highest-priority items first.

---

## Checks before every commit

Per `AGENTS.md`:

```sh
bun test              # all 238 tests must pass
bun run typecheck     # tsc --noEmit must pass
```

---

## Bugs

Bug 1 (`call.ts` missing from tsup entry points) has been fixed — `src/call.ts`
is now in the `entry` array in `tsup.config.ts`.

---

## Should fix

### 2. No tests for `call.ts`, `counter.ts`, or `order_status.ts`

These three modules (`safeCall`, `getCounter`, `getOrderStatus`) are entirely
untested. `safeCall` is a pure wrapper around `client.call` — it can be tested
with a mock `PublicClient` that returns controlled data/errors. `getCounter`
and `getOrderStatus` can then be tested via the same mock.

Because `safeCall` is the error-handling foundation for all on-chain reads,
untested error paths here could mask bugs in `getCounter`, `getOrderStatus`,
and any future read functions.

**Fix**: Add `src/call.test.ts`, `src/counter.test.ts`, and
`src/order_status.test.ts` with mock PublicClient instances. At minimum test:
- Happy-path return data
- Empty return data (`undefined` / `"0x"`)
- viem `BaseError` wrapping
- Generic thrown error wrapping
- Re-throw of already-enriched errors (the `startsWith` guard)

### 3. Event ABIs defined in two places — risk of drift

`seaportEventAbi` (JSON format in `constants.ts`) and `parseAbiItem()` calls
(string format in `events.ts`) define the same five event signatures. A change
to any event's parameters must be updated in both places, and nothing enforces
consistency. The `decodeSeaportEvent` function ignores `seaportEventAbi`
entirely — it uses hardcoded `parseAbiItem` references plus hardcoded topic
hash constants.

The test file validates that the topic hashes match the `parseAbiItem`
definitions, but no test validates `parseAbiItem` against `seaportEventAbi`.

**Fix alternatives**:
- (A) Derive the parsed event ABIs from `seaportEventAbi` using viem's
  `formatAbi` / `parseAbi`, so there's a single source of truth.
- (B) Delete `seaportEventAbi` and use only `parseAbiItem` strings if the JSON
  ABI isn't needed by consumers.
- (C) At minimum, add a test cross-checking that `parseAbiItem` strings and
  `seaportEventAbi` entries produce the same topic hashes and decode
  identically.

### 4. Missing event decoding tests for `OrderValidated` and `OrdersMatched`

`decodeSeaportEvent` is tested for three of five event types. The two most
complex events are untested:
- `OrderValidated` — includes a nested `OrderParameters` tuple with its own
  nested offer/consideration arrays.
- `OrdersMatched` — dynamic `bytes32[]` argument.

**Fix**: Add `OrderValidated` and `OrdersMatched` decoding tests to
`events.test.ts`.

### 5. Context validation boilerplate repeated 17 times

Every builder (`buildBasicOrderFulfillment`, `buildFulfillOrder`,
`buildFulfillAdvancedOrder`, `buildFulfillAvailableOrders`,
`buildFulfillAvailableAdvancedOrders`, `buildCancel`, `buildIncrementCounter`,
`buildValidate`, `buildMatchOrders`, `buildMatchAdvancedOrders`), every on-chain
read (`getCounter`, `getOrderStatus`), and both signature functions
(`verifyOrderSignature`, `hashOrderComponents`) repeats the same pattern:

```ts
const ctxValid = validateSeaportContext(ctx);
if (!ctxValid.valid) throw new Error(ctxValid.reason);
```

**Fix**: Extract a small `requireValidContext(ctx)` helper that validates and
throws (or returns the validated context as a narrowed type):

```ts
function requireValidContext(ctx: SeaportContext): void {
  const result = validateSeaportContext(ctx);
  if (!result.valid) throw new Error(result.reason);
}
```

This drops each call-site from 3 lines to 1 and removes the risk of
accidentally swallowing the invalid result. The helper can live in
`validate.ts` and be re-exported from the barrel.

### 6. `computeNativeValue` exported but no standalone subpath

`computeNativeValue` is publicly exported from `order.ts` and the barrel
`index.ts`, but there is no `"seaport-viem/order"` → `computeNativeValue` gap
(it's under `order` which is fine). However, the README doesn't list it. Either
add it to the README or evaluate whether it should be public (it's used
internally and may not need to be a public API).

### 7. `AGENTS.md` test count is stale

AGENTS.md says "all 229 tests must pass" — the suite currently has **238**
tests. This will drift again as tests are added/removed.

**Fix**: Replace the static count with `bun test` output guidance, or
remove the number and just say "all tests must pass."

### 8. No custom error types — consumers can't catch specific errors

Every error is `throw new Error("message")`. Programmatic error discrimination
requires string-matching on `.message`. Consider adding named error classes:

- `SeaportValidationError` — for `validateOrderComponents` / `validateSeaportContext` failures
- `SeaportEncodingError` — for `checkUint120` / malformed inputs
- `SeaportCallError` — for `safeCall` failures

This lets consumers write `if (err instanceof SeaportValidationError)` instead
of fragile `.message.includes(...)` checks.

### 9. `hashOrderComponentsStruct` encodes struct layout independently of `EIP712_TYPES`

The function hardcodes a 12-field ABI parameter list (`bytes32`, `address`,
`address`, `bytes32`, `bytes32`, `uint8`, `uint256`, `uint256`, `bytes32`,
`uint256`, `bytes32`, `uint256`) that mirrors `EIP712_TYPES.OrderComponents`.
If the EIP-712 type definition changes (e.g., a new field is added), this
function won't automatically update — the tests would catch it, but it's a
maintenance hazard.

**Fix**: Derive the ABI parameter types programmatically from
`EIP712_TYPES.OrderComponents` so the struct encoding stays in sync
automatically. The offer/consideration sub-arrays already use
`OFFER_ITEM_COMPONENTS` / `CONSIDERATION_ITEM_COMPONENTS` which are derived
from `EIP712_TYPES` — extend this pattern to the top-level struct.

### 10. README subpath import table is incomplete

The README lists only a subset of available subpath imports. Missing from the
API section: `events`, `bulk-listings`, `call`, `order-status`, `match`,
`increment-counter`. The "Subpath imports" section correctly states "every
module is available," but the API section should enumerate all available
subpaths for discoverability.

### 11. `safeCall` function name is misleading for a Seaport-specific wrapper

`safeCall` implies a general-purpose viem helper, but it's tightly coupled to
Seaport's error message format (the `fnLabel`, `actionLabel`, `details`
convention). If it's public API (it's exported from the barrel), consumers may
try to use it for non-Seaport calls. Consider renaming to `seaportCall` or
keeping it internal-only (remove from barrel exports).

---

## Nice to have

### 12. Add bulk listings / bulk order example to README

The `n-listings-one-signature.md` guide is comprehensive and well-written.
Consider linking it from the README so users discover it.

### 13. Add criteria resolver / offer fulfillment example to README

The `offers.md` guide documents collection/trait offers and criteria
resolution. Link it from the README alongside `n-listings-one-signature.md`.

### 14. Mark untestable functions with `@internal` or `@private` TSDoc

Functions like `safeCall`, `hashOrderComponentsStruct`, `encodeDomainSeparator`
are internal implementation details that happen to be exported. Marking them
`@internal` or `@private` in TSDoc helps consumers understand the intended
public surface area.

### 15. Test `ORDER_COMPONENTS_TYPE_STRING` output against canonical Seaport

The `EIP712_TYPES` → type string conversion is tested indirectly through
`hashOrderComponentsStruct` tests and the `getBulkOrderTypeString` cross-check
tests, but there's no standalone test verifying that
`ORDER_COMPONENTS_TYPE_STRING` matches Seaport's canonical
`OrderComponents(address offerer,...)` format. This is a single assertion away.

### 16. Test `CONSIDERATION_ITEM_TYPE_STRING` and `OFFER_ITEM_TYPE_STRING` output

Like item 15 — these are generated programmatically from `EIP712_TYPES` and
should have explicit format tests to catch accidental reordering of fields.

### 17. Verify `buildBasicOrderFulfillment` handles mixed NATIVE/ERC20 tips

The basic order value computation loops over `params.additionalRecipients` and
adds all amounts to ETH value when the primary consideration is NATIVE. This
assumes tips are also NATIVE. If a caller passes an ERC20 tip alongside a
NATIVE primary consideration, the ETH value would be incorrect. A validation
step or documentation note would help.

### 18. Add `getOrderHash` on-chain read function

The library has `encodeGetOrderHash` (encoder) and `hashOrderComponents`
(off-chain EIP-712) but no `getOrderHash(client, ctx, orderComponents)` for
calling Seaport's on-chain `getOrderHash`. This is a common operation for
verifying order hashes match the contract's computation.

### 19. tsup `splitting: true` may cause issues with CJS consumers

The build uses `splitting: true` which emits shared chunks. Some bundlers
struggle with code-split ESM when imported from CJS contexts. Since the
library targets ESM-only (`"type": "module"`), this is low risk but worth
noting if consumers report issues.
