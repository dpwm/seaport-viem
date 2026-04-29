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

## Should fix

### 1. `encodeDomainSeparator` defaults create inconsistent domain separator with `hashOrderComponents`

`encodeDomainSeparator` in `src/bulk_listings.ts` (lines 307–323) wraps viem's
`hashDomain` but provides explicit defaults for undefined domain fields before
passing them along:

```ts
export function encodeDomainSeparator(domain: TypedDataDomain): `0x${string}` {
  return hashDomain({
    domain: {
      name: domain.name ?? "",
      version: domain.version ?? "",
      chainId: BigInt(domain.chainId ?? 0),
      verifyingContract: domain.verifyingContract as `0x${string}`,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
    },
  });
}
```

Meanwhile, `hashOrderComponents` in `src/signature.ts` (line 65) passes
`ctx.domain` directly to viem's `hashTypedData`, which internally calls
`getTypesForEIP712Domain({ domain })` to dynamically generate only the
EIP-712 domain types for fields that are actually present
(`node_modules/viem/_esm/utils/typedData.js`, line 84–95):

```ts
export function getTypesForEIP712Domain({ domain }) {
  return [
    typeof domain?.name === 'string' && { name: 'name', type: 'string' },
    domain?.version && { name: 'version', type: 'string' },
    (typeof domain?.chainId === 'number' ||
      typeof domain?.chainId === 'bigint') && { name: 'chainId', type: 'uint256' },
    domain?.verifyingContract && { name: 'verifyingContract', type: 'address' },
    domain?.salt && { name: 'salt', type: 'bytes32' },
  ].filter(Boolean);
}
```

This creates an **inconsistency** when any optional domain field is `undefined`:

| Domain field | `hashOrderComponents` (via `hashTypedData`) | `hashBulkOrder` (via `encodeDomainSeparator`) |
|---|---|---|
| `name: undefined` | Domain sep **omits** `name` | Domain sep includes `name = ""` |
| `version: undefined` | Domain sep **omits** `version` | Domain sep includes `version = ""` |
| `chainId: undefined` | Domain sep **omits** `chainId` | Domain sep includes `chainId = 0n` |

Since both functions share the same `ctx.domain`, a consumer with a
`SeaportContext` where `name`, `version`, or `chainId` is omitted would get
different domain separators — and therefore different EIP-712 digests —
depending on which function they call.

`validateSeaportContext` in `src/validate.ts` (line 21) does not check for
`name` or `version`, and treats `chainId` as optional (it only validates it
when present). So `requireValidContext` does not catch this.

**Fix**: Remove the defaults from `encodeDomainSeparator` and pass domain
fields through as-is. Let `hashDomain` handle undefined fields the same way
`hashTypedData` does — by omitting the corresponding type from the EIP-712
domain type array based on whether the field is present. This can be done by
using a dynamic type array (mirroring `getTypesForEIP712Domain`) instead of
the current hardcoded one.

**Context**: The issue only manifests with contexts that omit one or more
optional fields (`name`, `version`, `chainId`). The provided `SEAPORT_CTX`
populates all three, so standard usage is unaffected. But the library should
produce consistent results for any valid `SeaportContext` regardless of
which hash function is called.
