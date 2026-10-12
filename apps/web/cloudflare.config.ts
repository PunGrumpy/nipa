import { defineConfig } from "cf/config";

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
