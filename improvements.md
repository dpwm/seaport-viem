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

## ~~1. README is outdated (High)~~ ✅ Resolved

The README has been updated to:
- Remove the false "does not implement" claim
- Add `cancel`, `incrementCounter`, `getOrderStatus`, `matchOrders`,
  `matchAdvancedOrders`, and event parsing to the scope list
- Add API documentation for `buildCancel`, `getOrderStatus`,
  `buildMatchOrders`, `buildMatchAdvancedOrders`, `buildIncrementCounter`,
  `decodeSeaportEvent`, event topic constants, and event argument types
- Update the encoders import example to include all encoder functions

---

## ~~2. Duplicated route-matching logic in `order.ts` (Medium)~~ ✅ Resolved

`canFulfillAsBasicOrder` now delegates to `detectBasicOrderRouteType(order)` and
returns `result !== null`, eliminating ~30 lines of redundant route-matching
conditionals. Additionally, `detectBasicOrderRouteType` was fixed to properly
return `null` for invalid offer/consideration combinations (e.g., ERC20 offer +
ERC20 consideration would incorrectly return `ERC1155_TO_ERC20`).

---

## ~~3. Missing `buildValidate` builder (Medium)~~ ✅ Resolved

`buildValidate(ctx, orders)` added to `src/validate.ts`, exported from the
barrel, following the same pattern as `buildCancel`. The function validates
the SeaportContext, checks the orders array is non-empty, and returns
`FulfillmentData` with the `validate(Order[])` calldata and zero value.

---

## ~~4. `aggregateOfferItems` / `aggregateConsiderationItems` loose typing (Low)~~ ✅ Resolved

Both functions now use a generic constrained type:
```ts
<T extends { parameters: { offer: readonly unknown[] } }>(orders: T[])
```

---

## ~~5. Monolithic `seaportAbi` constant (Low)~~ ✅ Resolved

`seaportAbi` has been split into individual named exports per function
(`getCounterAbiItem`, `getOrderHashAbiItem`, …, `validateAbiItem`) while
keeping `seaportAbi` as the composed union. Encoders and other consumers now
import only the specific ABI item they need, enabling better tree-shaking.

---

## ~~6. Test fixture signatures are placeholder values (Low)~~ ✅ Resolved

A comment has been added to the `signature` field in `makeOrder()` noting
that it is a placebo — not a real EIP-712 signature.

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
