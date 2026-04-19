/**
 * Captures fixed-viewport screenshots of the public app for user/admin documentation.
 * Run: GUIDE_BASE_URL=https://wwu-cspr.app npx playwright test e2e/guide-screenshots.spec.ts -c playwright.guide.config.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "@playwright/test";

const OUT = path.join(process.cwd(), "docs", "guide-screenshots");

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

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

test.describe("Guide screenshots (production)", () => {
  test("desktop viewports", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: DESKTOP,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    try {
      await page.goto("/", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await shot(OUT, "desktop-home.png", true, page);

      await page.goto("/calendar", { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
      await shot(OUT, "desktop-calendar.png", true, page);

      await page.goto("/booking", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await shot(OUT, "desktop-booking.png", true, page);

      await page.goto("/support", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await shot(OUT, "desktop-support.png", true, page);
    } finally {
      await context.close();
    }
  });

  test("mobile viewports", async ({ browser, browserName }) => {
    if (browserName === "firefox") {
      test.skip();
      return;
    }
    const context = await browser.newContext({
      viewport: MOBILE,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await page.goto("/", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await shot(OUT, "mobile-home.png", true, page);

      await page.goto("/calendar", { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
      await shot(OUT, "mobile-calendar.png", true, page);

      await page.goto("/booking", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await shot(OUT, "mobile-booking.png", true, page);

      await page.goto("/support", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await shot(OUT, "mobile-support.png", true, page);
    } finally {
      await context.close();
    }
  });
});
