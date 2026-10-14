"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { EventHoverDetails } from "@/lib/event-hover-details";

/**
 * Desktop hover card for calendar events, ported from calendar-app's
 * `event-hover-card.tsx`. Resting the pointer on an event shows its details
 * beside it, flipping left near the screen edge. Moving straight to the next
 * event swaps the card without the delay. One card serves the whole grid,
 * fed through a tiny store outside React so hovering re-renders only it.
 */

/** Long enough that sweeping the pointer across a week shows nothing. */
const SHOW_DELAY_MS = 350;
/** Once a card has shown, the next event within this long shows at once. */
const WARM_MS = 400;
/** Room for the arrow between the card and the event. */
const GAP_PX = 14;
const EDGE_PX = 12;
/** The 150ms exit animation, plus a frame, before the card unmounts. */
const EXIT_MS = 160;
/** How far the arrow stays from the card's top and bottom corners. */
const ARROW_INSET_PX = 12;

type HoverTarget = { id: string; details: EventHoverDetails; rect: DOMRect } | null;

let target: HoverTarget = null;
let timer = 0;
/** When the pointer last left a visible card, for the warm handoff. */
let leftAt = -Infinity;
const listeners = new Set<() => void>();

function emit(next: HoverTarget) {
  target = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Schedules the hover card for an event, anchored to `el` when it opens. */
export function showEventHover(
  id: string,
  details: EventHoverDetails,
  el: HTMLElement,
  e: MouseEvent,
): void {
  window.clearTimeout(timer);
  // Mouse only: touch fires emulated mouseover, and a held button means a drag.
  if (e.buttons !== 0 || !window.matchMedia("(hover: hover)").matches) return;
  // Measured on open, not on enter: a poll can move or replace the event meanwhile.
  const open = () => {
    if (el.isConnected) emit({ id, details, rect: el.getBoundingClientRect() });
  };
  if (performance.now() - leftAt < WARM_MS) open();
  else timer = window.setTimeout(open, SHOW_DELAY_MS);
}

/** Cancels a pending hover card and hides a visible one. */
export function hideEventHover(): void {
  window.clearTimeout(timer);
  if (!target) return;
  leftAt = performance.now();
  emit(null);
}

/** Hides the card with no warm handoff, for a press or a scroll. */
function dismissEventHover(): void {
  hideEventHover();
  leftAt = -Infinity;
}

export function EventHoverCard() {
  const current = useSyncExternalStore(subscribe, () => target, () => null);
  // The last card shown, kept mounted through its exit animation.
  const [shown, setShown] = useState<HoverTarget>(null);
  if (current && current !== shown) setShown(current);
  const closing = !current && shown !== null;
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => setShown(null), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  // A press starts a click or a drag, and a scroll moves the event out from under the card.
  useEffect(() => {
    window.addEventListener("pointerdown", dismissEventHover, true);
    window.addEventListener("scroll", dismissEventHover, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", dismissEventHover, true);
      window.removeEventListener("scroll", dismissEventHover, true);
      window.clearTimeout(timer);
      target = null;
    };
  }, []);

  const card = current ?? shown;
  if (!card) return null;
  return createPortal(
    <HoverCardBody key={card.id} details={card.details} rect={card.rect} closing={closing} />,
    document.body,
  );
}

type Placement = { left: number; top: number; side: "left" | "right"; arrowY: number };

function place(rect: DOMRect, w: number, h: number): Placement {
  let side: Placement["side"] = "right";
  let left = rect.right + GAP_PX;
  if (left + w > window.innerWidth - EDGE_PX) {
    side = "left";
    left = rect.left - w - GAP_PX;
  }
  left = Math.max(EDGE_PX, left);
  const top = Math.max(EDGE_PX, Math.min(rect.top, window.innerHeight - h - EDGE_PX));
  // Level with the event's title line, or its middle when it is short.
  const aim = rect.top + Math.min(rect.height / 2, 18) - top;
  const arrowY = Math.max(ARROW_INSET_PX, Math.min(aim, h - ARROW_INSET_PX));
  return { left, top, side, arrowY };
}

function HoverCardBody({
  details,
  rect,
  closing,
}: {
  details: EventHoverDetails;
  rect: DOMRect;
  closing: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Measured and placed before paint; written to the DOM so placing costs no second render.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const pos = place(rect, node.offsetWidth, node.offsetHeight);
    node.dataset.side = pos.side;
    node.style.left = `${pos.left}px`;
    node.style.top = `${pos.top}px`;
    node.style.setProperty("--arrow-y", `${pos.arrowY}px`);
    node.style.visibility = "";
  }, [rect]);

  return (
    <div
      ref={ref}
      className="fc-event-hover"
      role="tooltip"
      data-closing={closing || undefined}
      style={{ left: 0, top: 0, visibility: "hidden" }}
    >
      <div className="fc-event-hover-title">{details.title}</div>
      {details.when ? <div className="fc-event-hover-when">{details.when}</div> : null}
      <div className="fc-event-hover-meta">
        <i style={{ background: details.dotColor }} />
        {details.kind}
      </div>
      {details.tagColor ? (
        <div className="fc-event-hover-meta">
          <i style={{ background: details.tagColor }} />
          {details.tagLabel}
        </div>
      ) : null}
      <span className="fc-event-hover-arrow" aria-hidden="true" />
    </div>
  );
}
