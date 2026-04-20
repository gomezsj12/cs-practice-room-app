/**
 * @file Mobile calendar day gestures (swipe / double-tap) over `.fc-event` blocks.
 *
 * Uses a Pixel 5 profile so `matchMedia("(max-width: 767px)")` matches and the
 * app mounts the day view + window-capture touch listeners. Injects a fake
 * `.fc-event` node so the test does not depend on live Google Calendar data.
 */
import { devices, expect, test } from "@playwright/test";

test.use({
  ...devices["Pixel 5"],
});

test("horizontal swipe starting on a fake fc-event changes the visible day", async ({
  page,
}) => {
  await page.goto("/calendar");

  const interact = page.locator("[data-calendar-interact]");
  await expect(interact).toBeVisible({ timeout: 60_000 });

  await interact.evaluate((root) => {
    const el = document.createElement("div");
    el.id = "gesture-test-fc-event";
    el.setAttribute("data-testid", "gesture-test-fc-event");
    el.className = "fc-timegrid-event-harness fc-event fc-event-past";
    el.style.cssText =
      "position:absolute;left:48px;top:240px;width:220px;height:56px;z-index:5000;background:rgba(200,0,0,0.35);pointer-events:auto;touch-action:none";
    root.appendChild(el);
  });

  const fake = page.locator("#gesture-test-fc-event");
  await expect(fake).toBeAttached();

  const headerBefore = await page
    .locator(".fc-col-header-cell-cushion")
    .first()
    .innerText();

  await fake.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const x1 = rect.left + rect.width / 2 + 70;
    const y1 = rect.top + rect.height / 2;
    const x2 = rect.left + rect.width / 2 - 70;
    const y2 = y1;

    const touch = (x: number, y: number) =>
      new Touch({
        identifier: 0,
        target: el,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
        screenX: x,
        screenY: y,
        radiusX: 1,
        radiusY: 1,
        rotationAngle: 0,
        force: 1,
      });

    const t0 = touch(x1, y1);
    el.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches: [t0],
        targetTouches: [t0],
        changedTouches: [t0],
      }),
    );

    const tMove = touch(x2, y2);
    el.dispatchEvent(
      new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches: [tMove],
        targetTouches: [tMove],
        changedTouches: [tMove],
      }),
    );

    el.dispatchEvent(
      new TouchEvent("touchend", {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [tMove],
      }),
    );
  });

  await expect
    .poll(async () => {
      return page.locator(".fc-col-header-cell-cushion").first().innerText();
    })
    .not.toBe(headerBefore);
});

test("double-tap on fake fc-event jumps to today (today column returns)", async ({
  page,
}) => {
  await page.goto("/calendar");

  const interact = page.locator("[data-calendar-interact]");
  await expect(interact).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Prev" }).click();
  await expect(
    interact.locator(".fc-timegrid-body .fc-timegrid-col.fc-day-today"),
  ).toHaveCount(0);

  await interact.evaluate((root) => {
    const el = document.createElement("div");
    el.id = "gesture-test-fc-event-double";
    el.className = "fc-timegrid-event-harness fc-event fc-event-past";
    el.style.cssText =
      "position:absolute;left:48px;top:260px;width:220px;height:56px;z-index:5000;background:rgba(0,100,200,0.35);pointer-events:auto;touch-action:none";
    root.appendChild(el);
  });

  const fake = page.locator("#gesture-test-fc-event-double");

  await fake.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const touch = (x: number, y: number) =>
      new Touch({
        identifier: 0,
        target: el,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
        screenX: x,
        screenY: y,
        radiusX: 1,
        radiusY: 1,
        rotationAngle: 0,
        force: 1,
      });

    const fireTap = () => {
      const t0 = touch(cx, cy);
      el.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [t0],
          targetTouches: [t0],
          changedTouches: [t0],
        }),
      );
      el.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [t0],
        }),
      );
    };

    fireTap();
    fireTap();
  });

  await expect(
    interact.locator(".fc-timegrid-body .fc-timegrid-col.fc-day-today"),
  ).toHaveCount(1, { timeout: 10_000 });
});
