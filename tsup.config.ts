import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "index.ts",
    "types.ts",
    "constants.ts",
    "encode.ts",
    "signature.ts",
    "counter.ts",
    "validate.ts",
    "order.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
});
