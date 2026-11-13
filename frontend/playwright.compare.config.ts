import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base,
  testMatch: "compare.spec.ts",
  reporter: [["list"], ["json", {outputFile: "../docs/verification/compare/browser-results.json"}]],
  outputDir: "test-results/compare",
});
