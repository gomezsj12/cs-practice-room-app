/**
 * @file Smoke test for the homepage.
 *
 * Verifies the critical above-the-fold content renders: page title, hero heading,
 * navigation links to booking and jam pages, and the contact/support section.
 */
import { expect, test } from "@playwright/test";

test("homepage shows the main navigation and hero copy", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/CS Practice Room App/i);
  await expect(
    page.getByRole("heading", {
      name: /One home for room booking, jam reservations, and student support/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Practice room booking form/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Jam reservation calendar/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Get help or ask a question/i }),
  ).toBeVisible();
});
