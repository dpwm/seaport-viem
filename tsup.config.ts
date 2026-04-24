import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/types.ts",
    "src/constants.ts",
    "src/encode.ts",
    "src/signature.ts",
    "src/counter.ts",
    "src/validate.ts",
    "src/order.ts",
    "src/bulk_listings.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
});
