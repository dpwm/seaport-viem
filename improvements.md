# Improvements

Issues and action items identified during code review. Items are ordered by
impact; address the highest-priority items first.

---

## Checks before every commit

Per `AGENTS.md`:

```sh
bun test              # all 229 tests must pass
bun run typecheck     # tsc --noEmit must pass
```

---

## 1. README is outdated (High)

The README claims these features are not implemented:
_"It does not implement cancel, incrementCounter, getOrderStatus, matchOrders, matchAdvancedOrders, or event parsing."_

But all of them **are** implemented: `cancel.ts`, `increment_counter.ts`,
`order_status.ts`, `match.ts`, `events.ts`. Each is exported from the barrel
and has corresponding subpath entries in `package.json`.

The README should also document new exports: `buildCancel`, `getOrderStatus`,
`buildMatchOrders`, `buildMatchAdvancedOrders`, `buildIncrementCounter`,
`decodeSeaportEvent`, event topic constants, and event argument types.

---

## 2. Duplicated route-matching logic in `order.ts` (Medium)

`canFulfillAsBasicOrder` and `detectBasicOrderRouteType` both call
`isBasicOrderEligible()`, then each independently re-derives the route
classification through near-identical conditionals (all six
`isEthToErc721` / `isErc20ToErc1155` / … checks).

**Fix:** `canFulfillAsBasicOrder` should call `detectBasicOrderRouteType(order)`
and return `result !== null`. This consolidates the route validity truth-table
into one function and eliminates ~30 lines of redundant logic.

---

## 3. Missing `buildValidate` builder (Medium)

`encode.ts` exports `encodeValidate` (calldata for Seaport's `validate(Order[])`),
but there is no corresponding high-level builder like `buildValidate(ctx, orders):
FulfillmentData` — the pattern established for every other Seaport function
(`buildCancel`, `buildMatchOrders`, `buildFulfillOrder`, etc.).

Either add `buildValidate` in `order.ts` (or a new `validate.ts`), or
document in the README why `validate` is encoder-only.

---

## 4. `aggregateOfferItems` / `aggregateConsiderationItems` loose typing (Low)

```ts
orders: { parameters: { offer: readonly unknown[] } }[]
```

The structural type `{ parameters: { offer: readonly unknown[] } }` is too
loose — it accepts any object shape with a `parameters.offer` property. A
caller could pass unrelated objects and get silently broken
`FulfillmentComponent` output.

**Fix:** use a generic constrained type:
```ts
<T extends { parameters: { offer: readonly unknown[] } }>(orders: T[])
```

---

## 5. Monolithic `seaportAbi` constant (Low)

At ~900 lines, `seaportAbi` is the largest file. The individual function ABI
definitions are independently useful (encoders only need their specific
function fragment). Consider splitting into named exports:

```ts
export const getCounterAbiItem = { … };
export const fulfillOrderAbiItem = { … };
// seaportAbi remains the union for consumers that need the full ABI.
```

This lets tree-shakers eliminate unused entries and makes the file easier to
navigate. Not urgent — the current `satisfies Abi` pattern is correct.

---

## 6. Test fixture signatures are placeholder values (Low)

```ts
signature: "0x" + "ab".repeat(65) // 0xababab…
```

These 130-hex-char strings are valid-looking but not cryptographically
meaningful. Tests don't verify signatures against real EIP-712 digests, so
this works. Add a comment noting these are placebo signatures for unit tests.

---

## 7. `validateOrderComponents` does not check counter or salt (Low)

The validator checks amounts and timing (`startAmount <= 0n`, `startTime >=
endTime`) but does not validate `counter >= 0n`, `salt`, or `offerer`
(non-empty). The JSDoc explicitly says address validation is the caller's
responsibility. Consider adding:
- `counter >= 0n` — negative counters revert on-chain.
- `salt !== 0n` — an explicit zero salt is unusual and likely a mistake.

---

## 8. Shared error-handling pattern across `counter.ts` and `order_status.ts` (Low)

Both modules have identical structure for wrapping `client.call` results:
- Check `result.data === undefined || result.data === "0x"`
- Three-tier catch (`BaseError`, then generic `Error`) with context strings.

Extracting a helper like `safeCall(client, to, data, fnName, debugContext)`
would reduce duplication and make the pattern testable.
