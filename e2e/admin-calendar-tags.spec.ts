import { expect, test, type Page } from "@playwright/test";

const PRACTICE_EVENT = {
  id: "practice-practice-1",
  googleEventId: "practice-1",
  eventType: "practice",
  title: "Team Practice",
  start: "2026-04-29T19:00:00.000Z",
  end: "2026-04-29T20:00:00.000Z",
  color: "#767676",
  textColor: "#ffffff",
  canCancel: true,
};

const JAM_EVENT = {
  id: "jam-jam-1",
  googleEventId: "jam-1",
  eventType: "jam",
  title: "Keyboard Jam",
  start: "2026-04-29T21:00:00.000Z",
  end: "2026-04-29T22:00:00.000Z",
  color: "#3f56c9",
  textColor: "#ffffff",
  canCancel: true,
};

async function mockCalendarPage(
  page: Page,
  {
    initialPracticeTag = null,
  }: {
    initialPracticeTag?: {
      adminTagKey: string;
      adminTagLabel: string;
      adminTagColor: string;
      adminTagOverlayColor: string;
    } | null;
  },
) {
  let practiceTag = initialPracticeTag;
  let lastTagWriteBody: Record<string, unknown> | null = null;

  await page.route("**/api/practice-session/batch-statuses", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ statuses: { "practice-1": "Done" } }),
    });
  });

  await page.route("**/api/practice-session/details**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        notionPageUrl: "https://www.notion.so/example",
        notionPageId: "notion-page-1",
        currentStatus: "Done",
        patchlistLink: null,
        assignees: [],
      }),
    });
  });

  await page.route("**/api/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        events: [
          {
            ...PRACTICE_EVENT,
            ...(practiceTag ?? {}),
          },
          JAM_EVENT,
        ],
        fridayExceptions: [],
        quarter: null,
      }),
    });
  });

  await page.route("**/api/admin-event-tags", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      lastTagWriteBody = (await request.postDataJSON()) as Record<
        string,
        unknown
      >;
      practiceTag = {
        adminTagKey: String(lastTagWriteBody.tagKey),
        adminTagLabel: "Rose",
        adminTagColor: "#fb7185",
        adminTagOverlayColor: "rgba(251, 113, 133, 0.18)",
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          tag: practiceTag,
        }),
      });
      return;
    }

    if (request.method() === "DELETE") {
      lastTagWriteBody = (await request.postDataJSON()) as Record<
        string,
        unknown
      >;
      practiceTag = null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.fallback();
  });

  return {
    getLastTagWriteBody: () => lastTagWriteBody,
  };
}

test.describe("admin", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test("can add and clear a private tag without losing calendar behavior", async ({
    page,
  }) => {
    const mocks = await mockCalendarPage(page, {});

    await page.goto("/calendar");

    const practiceEvent = page.locator(".fc-event", {
      hasText: "Team Practice",
    });
    await expect(practiceEvent).toBeVisible();
    const heightBeforeTag = (await practiceEvent.boundingBox())?.height;
    await practiceEvent.click();

    // Tag icon should be visible in the modal title row
    const tagButton = page.getByRole("button", {
      name: "Private calendar tag",
    });
    await expect(tagButton).toBeVisible();

    // Open the tag dropdown and select Rose
    await tagButton.click();
    await page.getByRole("button", { name: "Tag: Rose" }).click();

    await expect(page.getByText("Private calendar tag saved.")).toBeVisible();
    await expect(practiceEvent).toHaveClass(/fc-admin-tagged-event/);
    await expect(practiceEvent.locator(".fc-admin-tag-swatch")).toBeVisible();
    const heightAfterTag = (await practiceEvent.boundingBox())?.height;
    expect(heightBeforeTag).toBeDefined();
    expect(heightAfterTag).toBeDefined();
    expect(
      Math.abs((heightAfterTag ?? 0) - (heightBeforeTag ?? 0)),
    ).toBeLessThanOrEqual(2);
    expect(mocks.getLastTagWriteBody()).toMatchObject({
      eventType: "practice",
      googleEventId: "practice-1",
      tagKey: "rose",
    });

    // Clear the tag
    await tagButton.click();
    await page.getByRole("button", { name: "No tag" }).click();

    await expect(
      page.getByText("Private calendar tag cleared."),
    ).toBeVisible();
    await expect(practiceEvent).not.toHaveClass(/fc-admin-tagged-event/);

    await page.getByRole("button", { name: "Close" }).first().click();
    await expect(tagButton).toHaveCount(0);
  });

  test("title context overlay shows Notion link on hover", async ({
    page,
  }) => {
    await mockCalendarPage(page, {});
    await page.goto("/calendar");

    const practiceEvent = page.locator(".fc-event", {
      hasText: "Team Practice",
    });
    await expect(practiceEvent).toBeVisible();
    await practiceEvent.click();

    // The "Open in Notion" link should appear in the context overlay
    // On desktop, hover triggers it; in test we can click the title area
    const notionLink = page.getByRole("link", { name: "Open in Notion" });

    // The link should not be immediately visible (hidden in overlay)
    await expect(notionLink).toHaveCount(0);

    // Click the title area to toggle the overlay (works on both mobile and desktop)
    await page.locator("h2", { hasText: "Team Practice" }).click();
    await expect(notionLink).toBeVisible();
    await expect(notionLink).toHaveAttribute(
      "href",
      "https://www.notion.so/example",
    );
  });
});

test.describe("non-admin", () => {
  test.use({ storageState: "playwright/.auth/non-admin.json" });

  test("does not see the private tag control", async ({ page }) => {
    await mockCalendarPage(page, {});

    await page.goto("/calendar");

    const practiceEvent = page.locator(".fc-event", {
      hasText: "Team Practice",
    });
    await expect(practiceEvent).toBeVisible();
    await practiceEvent.click();

    await expect(
      page.getByRole("button", { name: "Private calendar tag" }),
    ).toHaveCount(0);
  });
});
