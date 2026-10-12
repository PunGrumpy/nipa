import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

const jsPlugins = selectJsPlugins(["github", "sonarjs"]);

export default defineConfig({
  extends: [core, antiSlop, jsPlugins],
  ignorePatterns: core.ignorePatterns,
  jsPlugins: jsPlugins.jsPlugins,
  // The React and Next.js rules read any `use*` call as a hook, so they stay
  // out of the CLI.
  overrides: [
    {
      files: ["apps/web/**"],
      plugins: [...(react.plugins ?? []), ...(next.plugins ?? [])],
      rules: { ...react.rules, ...next.rules },
    },
  ],
  settings: jsPluginSettings,
});
