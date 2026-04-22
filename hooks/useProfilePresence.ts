"use client";

/**
 * @file Reports foreground presence to Notion (profile log) for the signed-in user.
 *
 * Uses a **heartbeat + idle timeout** model instead of `pagehide` (which cannot
 * reliably distinguish tab close from refresh from navigation).
 *
 * **Active state:** heartbeat posts `active: true` every {@link HEARTBEAT_MS}.
 * User interactions reset a {@link IDLE_TIMEOUT_MS} idle timer.
 *
 * **Idle state:** after {@link IDLE_TIMEOUT_MS} of no interaction, one
 * `active: false` is posted and the heartbeat stops.
 *
 * **Wake up:** any interaction (or tab becoming visible) while idle immediately
 * posts `active: true` and restarts the heartbeat + idle timer.
 *
 * All interaction listeners are passive/capture and throttled to one idle-timer
 * reset per {@link INTERACTION_THROTTLE_MS} so mousemove/scroll stay cheap.
 *
 * @see {@link @/app/api/profile/presence/route.ts}
 */

import { useEffect } from "react";
import { useSession } from "next-auth/react";

const TAB_OPEN_KEY = "cspr_profile_presence_tab";

const HEARTBEAT_MS = 60_000;
const IDLE_TIMEOUT_MS = 60_000;
const INTERACTION_THROTTLE_MS = 2_000;

const INTERACTION_EVENTS: (keyof DocumentEventMap)[] = [
  "click",
  "scroll",
  "keydown",
  "touchstart",
  "pointermove",
];

function postPresence(active: boolean) {
  void fetch("/api/profile/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({ active }),
  });
}

/**
 * Subscribes to interaction and visibility events and POSTs presence for the
 * current Google session. No-op when signed out.
 */
export function useProfilePresence() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return;

    /* ---- initial active: true (dedup across Strict Mode / reload) ---- */

    const nav = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    const navType = nav?.type ?? "navigate";

    if (navType === "reload" && nav) {
      const reloadKey = `cspr_profile_presence_reload_${nav.startTime}`;
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        postPresence(true);
      }
    } else if (!sessionStorage.getItem(TAB_OPEN_KEY)) {
      sessionStorage.setItem(TAB_OPEN_KEY, "1");
      postPresence(true);
    }

    /* ---- state ---- */

    let isIdle = false;
    let heartbeatId: ReturnType<typeof setInterval> | null = null;
    let idleTimerId: ReturnType<typeof setTimeout> | null = null;
    let lastInteractionTs = 0;

    /* ---- helpers ---- */

    const startHeartbeat = () => {
      if (heartbeatId) return;
      heartbeatId = setInterval(() => postPresence(true), HEARTBEAT_MS);
    };

    const stopHeartbeat = () => {
      if (heartbeatId) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }
    };

    const resetIdleTimer = () => {
      if (idleTimerId) clearTimeout(idleTimerId);
      idleTimerId = setTimeout(goIdle, IDLE_TIMEOUT_MS);
    };

    const goIdle = () => {
      if (isIdle) return;
      isIdle = true;
      stopHeartbeat();
      postPresence(false);
    };

    const wakeUp = () => {
      isIdle = false;
      postPresence(true);
      startHeartbeat();
      resetIdleTimer();
    };

    /* ---- interaction handler (throttled) ---- */

    const onInteraction = () => {
      const now = Date.now();
      if (now - lastInteractionTs < INTERACTION_THROTTLE_MS) return;
      lastInteractionTs = now;

      if (isIdle) {
        wakeUp();
      } else {
        resetIdleTimer();
      }
    };

    /* ---- visibility handler ---- */

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (isIdle) {
        wakeUp();
      } else {
        resetIdleTimer();
      }
    };

    /* ---- start ---- */

    startHeartbeat();
    resetIdleTimer();

    for (const evt of INTERACTION_EVENTS) {
      document.addEventListener(evt, onInteraction, {
        passive: true,
        capture: true,
      });
    }
    document.addEventListener("visibilitychange", onVisibility);

    /* ---- cleanup ---- */

    return () => {
      stopHeartbeat();
      if (idleTimerId) clearTimeout(idleTimerId);
      for (const evt of INTERACTION_EVENTS) {
        document.removeEventListener(evt, onInteraction, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, session?.user?.email]);
}
