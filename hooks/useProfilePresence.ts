/**
 * @file Reports foreground presence to Notion (profile log) for the signed-in user.
 *
 * **Is Active** means the user still has this app open in the tab (including when
 * the tab is in the background). We only send `active: false` when the document
 * is actually going away (e.g. tab close or leave site) — **not** on full reload
 * (where `pagehide` would otherwise race with the next load’s `active: true`) and
 * **not** when the user switches to another tab (`visibilitychange` hidden).
 *
 * - First navigation in a tab: one `active: true` (sessionStorage avoids duplicate
 *   posts under React Strict Mode).
 * - Full reload: one reconcile `active: true` keyed by `PerformanceNavigationTiming.startTime`.
 * - Tab becomes visible again: debounced `active: true` (after returning from another tab).
 * - `pagehide` when leaving for real (not reload, not bfcache): `active: false` with `keepalive`.
 * - `pageshow` from bfcache: `active: true`.
 *
 * @see {@link @/app/api/profile/presence/route.ts}
 */

import { useEffect } from "react";
import { useSession } from "next-auth/react";

const TAB_OPEN_KEY = "cspr_profile_presence_tab";

/** Debounce only for “tab visible again” pings — avoids bursts when toggling tabs quickly. */
const VISIBLE_DEBOUNCE_MS = 400;

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
 * True when this document is unloading due to a **reload** (F5, location.reload, etc.).
 * Used so we do not send `active: false` on `pagehide` during refresh — the new
 * document immediately sends `active: true`.
 */
function isLikelyDocumentReload(): boolean {
  try {
    const entry = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    if (entry?.type === "reload") return true;
  } catch {
    /* ignore */
  }
  const legacy = (
    performance as unknown as { navigation?: { type?: number } }
  ).navigation;
  // PerformanceNavigation.TYPE_RELOAD === 1
  return legacy?.type === 1;
}

/**
 * Subscribes to visibility and lifecycle events and POSTs presence for the
 * current Google session. No-op when signed out.
 */
export function useProfilePresence() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return;

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

    let visibleDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const clearVisibleDebounce = () => {
      if (visibleDebounceTimer) {
        clearTimeout(visibleDebounceTimer);
        visibleDebounceTimer = null;
      }
    };

    const scheduleVisibleTrue = () => {
      clearVisibleDebounce();
      visibleDebounceTimer = setTimeout(() => {
        visibleDebounceTimer = null;
        postPresence(true);
      }, VISIBLE_DEBOUNCE_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleVisibleTrue();
      }
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        clearVisibleDebounce();
        postPresence(true);
      }
    };

    const onPageHide = (e: PageTransitionEvent) => {
      clearVisibleDebounce();
      if (e.persisted) return;
      if (isLikelyDocumentReload()) return;
      postPresence(false);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      clearVisibleDebounce();
    };
  }, [status, session?.user?.email]);
}
