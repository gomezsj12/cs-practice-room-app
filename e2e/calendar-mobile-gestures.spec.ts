/**
 * @file Mobile calendar day gestures (swipe / double-tap) over `.fc-event` blocks.
 *
 * Uses a Pixel 5 profile so `matchMedia("(max-width: 767px)")` matches and the
 * app mounts the day view + window-capture touch listeners.
 *
 * FullCalendar renders timed events as `<a class="fc-event">`; gestures must be
 * tested on that shape. When the calendar has a real `a.fc-event`, we use it.
 * Synthetic anchors are injected and touched in **one** `evaluate` call so a
 * React re-render (e.g. after Prev) cannot remove the node between steps.
 */
import { devices, expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

test.use({
  ...devices["Pixel 5"],
});

async function firstRealEventAnchor(interact: Locator): Promise<Locator | null> {
  const real = interact.locator("a.fc-event").first();
  if ((await real.count()) > 0) {
    await expect(real).toBeVisible({ timeout: 30_000 });
    return real;
  }
  return null;
}

test("horizontal swipe starting on an fc-event anchor changes the visible day", async ({
  page,
}) => {
  await page.goto("/calendar");

  const interact = page.locator("[data-calendar-interact]");
  await expect(interact).toBeVisible({ timeout: 60_000 });

  const headerBefore = await page
    .locator(".fc-col-header-cell-cushion")
    .first()
    .innerText();

  const real = await firstRealEventAnchor(interact);
  if (real) {
    await real.evaluate((el) => {
      const node = el as HTMLElement;
      const rect = node.getBoundingClientRect();
      const x1 = rect.left + rect.width / 2 + 70;
      const y1 = rect.top + rect.height / 2;
      const x2 = rect.left + rect.width / 2 - 70;
      const y2 = y1;
      const touch = (x: number, y: number) =>
        new Touch({
          identifier: 0,
          target: node,
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
      node.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [t0],
          targetTouches: [t0],
          changedTouches: [t0],
        }),
      );
      const tMove = touch(x2, y2);
      node.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          cancelable: true,
          touches: [tMove],
          targetTouches: [tMove],
          changedTouches: [tMove],
        }),
      );
      node.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [tMove],
        }),
      );
    });
  } else {
    await interact.evaluate(() => {
      function injectAnchor(
        root: HTMLElement,
        id: string,
        left: number,
        top: number,
      ): HTMLAnchorElement {
        const old = root.querySelector(`#${id}`);
        old?.closest(".fc-timegrid-event-harness")?.remove();
        const harness = document.createElement("div");
        harness.className = "fc-timegrid-event-harness";
        harness.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:220px;height:56px;z-index:5000;pointer-events:none`;
        const a = document.createElement("a");
        a.id = id;
        a.href = "#";
        a.className =
          "fc-timegrid-event fc-v-event fc-event fc-event-past";
        a.style.cssText =
          "display:block;height:100%;box-sizing:border-box;padding:8px;background:rgba(200,0,0,0.35);pointer-events:auto;touch-action:none";
        a.textContent = "GestTest";
        a.addEventListener("click", (e) => e.preventDefault());
        harness.appendChild(a);
        root.appendChild(harness);
        return a;
      }

      const root = document.querySelector(
        "[data-calendar-interact]",
      ) as HTMLElement | null;
      if (!root) {
        throw new Error("missing [data-calendar-interact]");
      }
      const node = injectAnchor(root, "gesture-test-fc-event", 48, 240);
      const rect = node.getBoundingClientRect();
      const x1 = rect.left + rect.width / 2 + 70;
      const y1 = rect.top + rect.height / 2;
      const x2 = rect.left + rect.width / 2 - 70;
      const y2 = y1;
      const touch = (x: number, y: number) =>
        new Touch({
          identifier: 0,
          target: node,
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
      node.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [t0],
          targetTouches: [t0],
          changedTouches: [t0],
        }),
      );
      const tMove = touch(x2, y2);
      node.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          cancelable: true,
          touches: [tMove],
          targetTouches: [tMove],
          changedTouches: [tMove],
        }),
      );
      node.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [tMove],
        }),
      );
    });
  }

  await expect
    .poll(async () => {
      return page.locator(".fc-col-header-cell-cushion").first().innerText();
    })
    .not.toBe(headerBefore);
});

test("double-tap on an fc-event anchor jumps to today (today column returns)", async ({
  page,
}) => {
  await page.goto("/calendar");

  const interact = page.locator("[data-calendar-interact]");
  await expect(interact).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Prev" }).click();
  await expect(
    interact.locator(".fc-timegrid-body .fc-timegrid-col.fc-day-today"),
  ).toHaveCount(0);

  const real = await firstRealEventAnchor(interact);
  if (real) {
    await real.evaluate((el) => {
      const node = el as HTMLElement;
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const touch = (x: number, y: number) =>
        new Touch({
          identifier: 0,
          target: node,
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
        node.dispatchEvent(
          new TouchEvent("touchstart", {
            bubbles: true,
            cancelable: true,
            touches: [t0],
            targetTouches: [t0],
            changedTouches: [t0],
          }),
        );
        node.dispatchEvent(
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
  } else {
    await interact.evaluate(() => {
      function injectAnchor(
        root: HTMLElement,
        id: string,
        left: number,
        top: number,
      ): HTMLAnchorElement {
        const old = root.querySelector(`#${id}`);
        old?.closest(".fc-timegrid-event-harness")?.remove();
        const harness = document.createElement("div");
        harness.className = "fc-timegrid-event-harness";
        harness.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:220px;height:56px;z-index:5000;pointer-events:none`;
        const a = document.createElement("a");
        a.id = id;
        a.href = "#";
        a.className =
          "fc-timegrid-event fc-v-event fc-event fc-event-past";
        a.style.cssText =
          "display:block;height:100%;box-sizing:border-box;padding:8px;background:rgba(0,100,200,0.35);pointer-events:auto;touch-action:none";
        a.textContent = "GestTest";
        a.addEventListener("click", (e) => e.preventDefault());
        harness.appendChild(a);
        root.appendChild(harness);
        return a;
      }

      const root = document.querySelector(
        "[data-calendar-interact]",
      ) as HTMLElement | null;
      if (!root) {
        throw new Error("missing [data-calendar-interact]");
      }
      const node = injectAnchor(root, "gesture-test-fc-event-double", 48, 260);
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const touch = (x: number, y: number) =>
        new Touch({
          identifier: 0,
          target: node,
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
        node.dispatchEvent(
          new TouchEvent("touchstart", {
            bubbles: true,
            cancelable: true,
            touches: [t0],
            targetTouches: [t0],
            changedTouches: [t0],
          }),
        );
        node.dispatchEvent(
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
  }

  await expect(
    interact.locator(".fc-timegrid-body .fc-timegrid-col.fc-day-today"),
  ).toHaveCount(1, { timeout: 10_000 });
});
