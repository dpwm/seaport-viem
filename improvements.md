# Improvements

Issues and action items identified during code review. Items are ordered by
impact; address the highest-priority items first.

---

## Checks before every commit

Per `AGENTS.md`:

```sh
bun test              # all tests must pass
bun run typecheck     # tsc --noEmit must pass
```

---

## Bugs

Bug 1 (`call.ts` missing from tsup entry points) has been fixed — `src/call.ts`
is now in the `entry` array in `tsup.config.ts`.

---

## Should fix

### 2. No tests for `call.ts`, `counter.ts`, or `order_status.ts`

**Fixed**: `src/call.test.ts`, `src/counter.test.ts`, and
`src/order_status.test.ts` have been added with mock PublicClient instances
covering all the required cases:
- Happy-path return data
- Empty return data (`undefined` / `"0x"`)
- viem `BaseError` wrapping
- Generic thrown error wrapping
- Re-throw of already-enriched errors (the `startsWith` guard)
- Context validation errors
- Propagated `safeCall` errors

### 3. Event ABIs defined in two places — risk of drift

**Fixed** (option C): Cross-check tests have been added to `events.test.ts`
under `describe("event ABI cross-check")` that verify the JSON ABI
(`seaportEventAbi` in `constants.ts`) and the `parseAbiItem()` strings (in
`events.ts`) produce identical topic hashes for all five events. For each
event, both definitions are compared against each other and against the
hardcoded `ORDER_*_TOPIC` constants. A change to either definition without
updating the other will cause at least one test to fail.

### 4. Missing event decoding tests for `OrderValidated` and `OrdersMatched`

**Fixed**: `src/events.test.ts` now includes decoding tests for both events:
- `OrderValidated` — encodes a complete `OrderParameters` tuple with nested
  offer and consideration arrays, then decodes and verifies all fields.
- `OrdersMatched` — encodes a `bytes32[]` with two order hashes, then decodes
  and verifies the array length and values.

### 5. Context validation boilerplate repeated 17 times

**Fixed**: A `requireValidContext(ctx)` helper has been added to `validate.ts`
and exported from the barrel. It validates the context and throws immediately
if invalid. All 14 internal call sites across 8 files (`order.ts`,
`signature.ts`, `counter.ts`, `cancel.ts`, `order_status.ts`, `match.ts`,
`increment_counter.ts`, `validate.ts`) have been updated from the 3-line
pattern to a single `requireValidContext(ctx)` call. The original
`validateSeaportContext` function remains publicly exported for consumers
who need to check validity without throwing.

### 6. `computeNativeValue` exported but no standalone subpath

**Fixed**: Added `computeNativeValue` to the README's "Order fulfillment"
section with usage documentation. The function is a legitimate public API
that lets consumers compute the required `msg.value` for arbitrary order
combinations. The subpath import `seaport-viem/order` already works.

### 7. No custom error types — consumers can't catch specific errors

**Fixed**: Three named error classes have been added in `src/errors.ts`:
- `SeaportValidationError` — for input validation failures throughout the library
- `SeaportEncodingError` — for `checkUint120` overflow and encoding failures
- `SeaportCallError` — for `safeCall` on-chain read failures

All `throw new Error("message")` call sites have been updated to use the
appropriate error class. The errors are exported from the barrel so consumers
can write `if (err instanceof SeaportValidationError)` instead of fragile
`.message.includes(...)` checks. A `SeaportError` base class is also exported
for catching any Seaport-specific error in one handler.

### 8. `hashOrderComponentsStruct` encodes struct layout independently of `EIP712_TYPES`

**Fixed**: Added `ORDER_COMPONENTS_STRUCT_ABI_TYPES` to `constants.ts`,
derived from `EIP712_TYPES.OrderComponents` via `.map()`. Array-typed
fields (`offer`, `consideration`) are automatically mapped to `bytes32`
(matching the struct hash convention). The `hashOrderComponentsStruct`
function in `signature.ts` now spreads these derived types instead of
hardcoding a 12-field ABI parameter list. If a field is added, removed,
or reordered in `EIP712_TYPES.OrderComponents`, the encoding follows
suit automatically — same pattern as the existing `OFFER_ITEM_COMPONENTS`
and `CONSIDERATION_ITEM_COMPONENTS`.

### 9. README subpath import table is incomplete

**Fixed**: Added missing API sections for `bulk-listings` and `call` (the two
that were absent). Every subpath module now has a dedicated API section in the
README.

### 10. `safeCall` function name is misleading for a Seaport-specific wrapper

`safeCall` implies a general-purpose viem helper, but it's tightly coupled to
Seaport's error message format (the `fnLabel`, `actionLabel`, `details`
convention). If it's public API (it's exported from the barrel), consumers may
try to use it for non-Seaport calls. Consider renaming to `seaportCall` or
keeping it internal-only (remove from barrel exports).

---

## Nice to have

### 11. Add bulk listings / bulk order example to README

**Fixed**: Added a "Guides" section to the README with a link to
`n-listings-one-signature.md` alongside `offers.md`.

### 12. Add criteria resolver / offer fulfillment example to README

**Fixed**: Added a "Guides" section to the README with a link to `offers.md`.

### 13. Mark untestable functions with `@internal` or `@private` TSDoc

Functions like `safeCall`, `hashOrderComponentsStruct`, `encodeDomainSeparator`
are internal implementation details that happen to be exported. Marking them
`@internal` or `@private` in TSDoc helps consumers understand the intended
public surface area.

### 14. Test `ORDER_COMPONENTS_TYPE_STRING` output against canonical Seaport

The `EIP712_TYPES` → type string conversion is tested indirectly through
`hashOrderComponentsStruct` tests and the `getBulkOrderTypeString` cross-check
tests, but there's no standalone test verifying that
`ORDER_COMPONENTS_TYPE_STRING` matches Seaport's canonical
`OrderComponents(address offerer,...)` format. This is a single assertion away.

### 15. Test `CONSIDERATION_ITEM_TYPE_STRING` and `OFFER_ITEM_TYPE_STRING` output

Like item 15 — these are generated programmatically from `EIP712_TYPES` and
should have explicit format tests to catch accidental reordering of fields.

### 16. `buildBasicOrderFulfillment` inflates value with non-NATIVE additional recipients

**Fixed**: Two-part fix:

1. **`isBasicOrderEligible` now rejects mixed-type considerations.** The basic
   order path in Seaport treats all additional recipients as the same token
   type as the primary consideration. If any non-primary consideration item
   has a different `itemType`, the order no longer qualifies for basic order
   fulfillment. This prevents orders with, e.g., a NATIVE primary and ERC20
   royalty fee from being incorrectly routed through the basic order path.

2. **`buildBasicOrderFulfillment` now uses `computeNativeValue()`** on the
   full consideration array (consistent with all other fulfillment builders)
   instead of blindly summing `additionalRecipients`. Only items with
   `itemType === ItemType.NATIVE` count toward `msg.value`. Tips are added
   separately, only when the primary consideration is NATIVE (since tips in
   the basic order protocol are implicitly the same token type as the primary
   consideration).

Tests added for:
- `canFulfillAsBasicOrder` rejects mixed-type considerations (NATIVE + ERC20)
- `canFulfillAsBasicOrder` rejects mixed-type considerations (ERC20 + ERC721)
- `canFulfillAsBasicOrder` accepts single-type NATIVE considerations with extras
- `detectBasicOrderRouteType` returns null for mixed-type considerations
- `buildBasicOrderFulfillment` with explicit route type and ERC20 extra
  consideration does not inflate ETH value

### 17. Add `getOrderHash` on-chain read function

**Fixed**: `src/order_hash.ts` now exports `getOrderHash(client, ctx,
orderComponents)` — an on-chain read function that calls Seaport's
`getOrderHash(OrderComponents)` view function. Follows the same pattern
as `getCounter` and `getOrderStatus`. The subpath import
`seaport-viem/order-hash` is available. Tests in `order_hash.test.ts`
cover happy-path return, different inputs, invalid context, and
propagated `safeCall` errors.

### 18. tsup `splitting: true` may cause issues with CJS consumers

The build uses `splitting: true` which emits shared chunks. Some bundlers
struggle with code-split ESM when imported from CJS contexts. Since the
library targets ESM-only (`"type": "module"`), this is low risk but worth
noting if consumers report issues.
