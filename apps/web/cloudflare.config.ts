import { defineConfig } from "cf/config";

// The site is a static export, so the Worker has no code of its own. It only
// serves the files that `next build` writes to `out/`, which wrangler.config.ts
// names because this file has no field for the assets directory.
//
// Deploy with `bun run deploy`, not `cf deploy`. On its own, `cf deploy` sees
// Next.js and runs `next build`, which doesn't write the build output that cf
// uploads. The script builds that output with `cf-wrangler build` first.
export default defineConfig({
  worker: {
    assets: {
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "404-page",
    },
    compatibilityDate: "2026-10-01",
    name: "nipa",
  },
});
