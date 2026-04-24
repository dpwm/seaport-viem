import { describe, expect, test } from "bun:test";
import { hashOrderComponents } from "./index";
import { ctx, makeOrderComponents } from "./test-fixtures";

describe("hashOrderComponents", () => {
  test("returns a bytes32 hash", () => {
    const hash = hashOrderComponents(ctx, makeOrderComponents());
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("same inputs produce same hash", () => {
    const components = makeOrderComponents();
    const h1 = hashOrderComponents(ctx, components);
    const h2 = hashOrderComponents(ctx, components);
    expect(h1).toBe(h2);
  });

  test("different salt produces different hash", () => {
    const h1 = hashOrderComponents(ctx, makeOrderComponents({ salt: 1n }));
    const h2 = hashOrderComponents(ctx, makeOrderComponents({ salt: 2n }));
    expect(h1).not.toBe(h2);
  });

  test("different offerer produces different hash", () => {
    const h1 = hashOrderComponents(ctx, makeOrderComponents({ offerer: "0xaaaa000000000000000000000000000000000001" as `0x${string}` }));
    const h2 = hashOrderComponents(ctx, makeOrderComponents({ offerer: "0xbbbb000000000000000000000000000000000002" as `0x${string}` }));
    expect(h1).not.toBe(h2);
  });
});
