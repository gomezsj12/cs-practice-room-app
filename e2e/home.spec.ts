/**
 * @file Smoke test for the homepage.
 *
 * Verifies the critical above-the-fold content renders: page title, hero heading,
 * main nav links to booking and calendar pages, and the contact section.
 */
import { expect, test } from "@playwright/test";

test("homepage shows the main navigation and hero copy", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/CS Practice Room App/i);
  await expect(
    page.getByRole("heading", {
      name: /Welcome to the NEW CS Practice Room App!/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: /Main/i }).getByRole("link", {
      name: /^Booking$/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: /Main/i }).getByRole("link", {
      name: /^Calendar$/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Contact Us/i }),
  ).toBeVisible();
});
