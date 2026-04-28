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
    "src/cancel.ts",
    "src/order_status.ts",
    "src/order_hash.ts",
    "src/match.ts",
    "src/increment_counter.ts",
    "src/call.ts",
    "src/events.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: true,
});
