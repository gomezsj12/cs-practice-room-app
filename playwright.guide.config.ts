/**
 * Playwright config for capturing documentation screenshots against production.
 * Does not start a local dev server.
 *
 * Usage: npx playwright test e2e/guide-screenshots.spec.ts -c playwright.guide.config.ts
 */
import { defineConfig } from "@playwright/test";

const BASE = process.env.GUIDE_BASE_URL ?? "https://wwu-cspr.app";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
