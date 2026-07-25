/**
 * @file E2E tests for the single-set sticky navigation pills.
 *
 * The sticky pills are the only visible nav pills (header pills are always
 * hidden). They track the header nav's position via translateY, then freeze
 * at the top when the stick point is reached.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktopNarrow: { width: 1024, height: 768 },
  desktopHd: { width: 1280, height: 800 },
} as const;

const PILL_LABELS = ["Home", "Booking", "Calendar", "Support"];

const SCREENSHOT_DIR = path.join(
  process.cwd(),
  "screenshots",
  "sticky-nav-e2e",
);

async function saveScreenshot(page: Page, name: string) {
  await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });
  const target = path.join(SCREENSHOT_DIR, name);
  const tmpPath = `${target}.tmp`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.screenshot({ path: tmpPath, fullPage: false, animations: "disabled" });
      await fs.promises.rename(tmpPath, target);
      return;
    } catch {
      await fs.promises.unlink(tmpPath).catch(() => {});
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
      else throw new Error(`Failed to write screenshot ${name} after 3 attempts`);
    }
  }
}

async function ensureScrollable(page: Page) {
  await page.evaluate(() => {
    document.body.style.minHeight = "3000px";
  });
}

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`sticky nav: ${vpName} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport });

    test("pills are visible at page top", async ({ page }) => {
      await page.goto("/");
      await page.waitForTimeout(500);

      const stickyNav = page.getByTestId("sticky-nav");
      await expect(stickyNav).toBeVisible();

      for (const label of PILL_LABELS) {
        await expect(
          stickyNav.getByRole("link", { name: new RegExp(`^${label}$`, "i") }),
        ).toBeVisible();
      }

      await saveScreenshot(page, `${vpName}-at-top.png`);
    });

    test("pills remain visible after scrolling", async ({ page }) => {
      await page.goto("/");
      await page.waitForTimeout(300);
      await ensureScrollable(page);

      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(300);

      const stickyNav = page.getByTestId("sticky-nav");
      await expect(stickyNav).toBeVisible();

      for (const label of PILL_LABELS) {
        await expect(
          stickyNav.getByRole("link", { name: new RegExp(`^${label}$`, "i") }),
        ).toBeVisible();
      }

      await saveScreenshot(page, `${vpName}-scrolled.png`);
    });

    test("clicking a pill navigates correctly", async ({ page }) => {
      await page.goto("/");
      await page.waitForTimeout(800);
      await ensureScrollable(page);

      await page.evaluate(() => window.scrollBy(0, 300));
      await page.waitForTimeout(300);

      const stickyNav = page.getByTestId("sticky-nav");
      await stickyNav
        .getByRole("link", { name: /^Booking$/i })
        .click({ force: true });

      await expect(page).toHaveURL(/\/booking/, { timeout: 15000 });
    });

    test("active route is highlighted", async ({ page }) => {
      await page.goto("/calendar");
      await page.waitForTimeout(500);

      const stickyNav = page.getByTestId("sticky-nav");
      const calendarPill = stickyNav.getByRole("link", {
        name: /^Calendar$/i,
      });

      await expect(calendarPill).toBeVisible();
      const classes = await calendarPill.getAttribute("class");
      expect(classes).toContain("border-blue-400");
    });

    test("container does not block pointer events", async ({ page }) => {
      await page.goto("/");
      await page.waitForTimeout(300);

      const pointerEvents = await page
        .getByTestId("sticky-nav")
        .evaluate((el) => window.getComputedStyle(el).pointerEvents);
      expect(pointerEvents).toBe("none");
    });

    test("header nav pills are hidden after hydration", async ({ page }) => {
      await page.goto("/");
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="sticky-nav"]');
          return el && window.getComputedStyle(el).opacity === "1";
        },
        { timeout: 10000 },
      );

      const headerNavVisibility = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Main"]');
        return nav ? window.getComputedStyle(nav).visibility : null;
      });
      expect(headerNavVisibility).toBe("hidden");
    });
  });
}

test.describe("sticky nav: keyboard shortcuts (desktopHd)", () => {
  test.use({ viewport: VIEWPORTS.desktopHd });

  test("pressing B navigates to /booking", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);

    await page.keyboard.press("b");
    await expect(page).toHaveURL(/\/booking/, { timeout: 15000 });
  });

  test("pressing H navigates to / from another page", async ({ page }) => {
    await page.goto("/calendar");
    await page.waitForTimeout(1500);

    await page.keyboard.press("h");
    await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
  });
});
