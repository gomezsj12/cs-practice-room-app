/**
 * @file Reports foreground presence to Notion (profile log) for the signed-in user.
 *
 * - First navigation in a tab: one `active: true` (sessionStorage avoids duplicate
 *   posts under React Strict Mode).
 * - Full reload: one reconcile `active: true` keyed by `PerformanceNavigationTiming.startTime`.
 * - Tab hidden / visible: coalesced with a short trailing debounce so rapid toggles
 *   produce one POST with the latest state.
 * - `pagehide`: immediate inactive with `keepalive` fetch (clears any pending debounce).
 *
 * @see {@link @/app/api/profile/presence/route.ts}
 */

import { useEffect } from "react";
import { useSession } from "next-auth/react";

const TAB_OPEN_KEY = "cspr_profile_presence_tab";

/** Trailing debounce for `visibilitychange` only — initial `active: true` stays immediate. */
const VISIBILITY_DEBOUNCE_MS = 400;

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

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDebounce = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };

    const scheduleVisibilityPresence = (active: boolean) => {
      clearDebounce();
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        postPresence(active);
      }, VISIBILITY_DEBOUNCE_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        scheduleVisibilityPresence(false);
      } else {
        scheduleVisibilityPresence(true);
      }
    };

    const onPageHide = () => {
      clearDebounce();
      postPresence(false);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      clearDebounce();
    };
  }, [status, session?.user?.email]);
}
