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
  const target = path.join(dir, name);
  const tmpPath = `${target}.tmp`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.screenshot({ path: tmpPath, fullPage, animations: "disabled" });
      await fs.promises.rename(tmpPath, target);
      return;
    } catch {
      await fs.promises.unlink(tmpPath).catch(() => {});
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
      else throw new Error(`Failed to write screenshot ${name} after 3 attempts`);
    }
  }
}

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`Lookbook: ${vpName} (${viewport.width}×${viewport.height})`, () => {
    for (const pg of PAGES) {
      test(`${pg.name}`, async ({ browser, browserName }) => {
        const isMobile = viewport.width < 768;
        if (isMobile && browserName === "firefox") {
          test.skip();
          return;
        }
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: isMobile ? 2 : 1,
          isMobile,
          hasTouch: isMobile,
        });
        const page = await context.newPage();
        try {
          await page.goto(pg.path, { waitUntil: "networkidle" });
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
