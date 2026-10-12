import { defineWranglerConfig } from "wrangler/experimental-config";

// Build settings for `cf build` and `cf deploy`. The Worker itself is
// configured in cloudflare.config.ts.
export default defineWranglerConfig({
  assetsDirectory: "./out",
  types: { generate: false },
});
