/**
 * Captures lookbook screenshots of the local app at multiple viewports.
 * Run: npx playwright test e2e/lookbook-screenshots.spec.ts --project=chromium
 *
 * Outputs to docs/screenshots/ with naming convention:
 *   {viewport}-{page}[-suffix].png
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "@playwright/test";

const OUT = path.join(process.cwd(), "docs", "screenshots");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

const PAGES = [
  { name: "homepage", path: "/", waitMs: 2000 },
  { name: "booking", path: "/booking", waitMs: 2000 },
  { name: "calendar", path: "/calendar", waitMs: 3000 },
  { name: "support", path: "/support", waitMs: 2000 },
];

async function shot(
  dir: string,
  name: string,
  fullPage: boolean,
  page: import("@playwright/test").Page,
) {
  await fs.promises.mkdir(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, name),
    fullPage,
    animations: "disabled",
  });
}

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`Lookbook — ${vpName} (${viewport.width}×${viewport.height})`, () => {
    for (const pg of PAGES) {
      test(`${pg.name}`, async ({ browser }) => {
        const isMobile = viewport.width < 768;
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: isMobile ? 2 : 1,
          isMobile,
          hasTouch: isMobile,
        });
        const page = await context.newPage();
        try {
          await page.goto(pg.path, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(pg.waitMs);

          const topName = `${vpName}-${pg.name}-top.png`;
          await shot(OUT, topName, false, page);

          const fullName = `${vpName}-${pg.name}-full.png`;
          await shot(OUT, fullName, true, page);
        } finally {
          await context.close();
        }
      });
    }
  });
}
