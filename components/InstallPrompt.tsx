"use client";

/**
 * @module InstallPrompt
 *
 * PWA install banner shown at the bottom-left of the viewport when the app
 * is eligible for installation and hasn't been dismissed yet today.
 *
 * **Visibility rules (all must be true for the banner to appear):**
 * 1. The app is NOT already running in standalone/PWA mode.
 * 2. The browser has fired `beforeinstallprompt` (Android/desktop Chrome) OR
 *    the device is iOS Safari (which uses a manual "Add to Home Screen" flow).
 * 3. The user has not tapped "Dismiss" today (persisted in `localStorage`
 *    keyed by the local calendar date so it resets the next day).
 * 4. The auto-hide timer (15 s from first render in this session) has not
 *    expired (tracked in `sessionStorage`).
 *
 * Standalone detection and iOS/Safari sniffing use `useSyncExternalStore`
 * with a no-op subscribe + SSR-safe server snapshot (`false`) to avoid
 * hydration mismatches.
 *
 * @see ServiceWorkerRegistration — registers the SW that enables installability
 */

import { useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

/** User-agent sniff for iPhone/iPad/iPod (case-insensitive). */
function isIos() {
  if (typeof window === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/** Returns `true` when the browser is Safari (excludes Chrome-on-iOS). */
function isSafari() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();

  return userAgent.includes("safari") && !userAgent.includes("chrome");
}

/** Detects whether the app is already running as an installed PWA. */
function isStandalone() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

/**
 * No-op subscribe passed to `useSyncExternalStore`. The values these stores
 * read (user-agent, display-mode) never change at runtime, so no
 * subscription is needed — the hook just needs the snapshot functions.
 */
function noopSubscribe() {
  return () => {};
}

/**
 * Renders a fixed-position PWA install prompt or iOS "Add to Home Screen"
 * hint. Auto-hides after 15 seconds or when dismissed by the user.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const DISMISSED_DATE_KEY = "practiceRoomJamInstallPromptDismissedDate";
  const AUTO_HIDDEN_SHOWN_AT_MS_KEY =
    "practiceRoomJamInstallPromptShownAtMs";
  const AUTO_HIDE_MS = 15_000;

  function getLocalISODateString(now: Date) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function readDismissedDate(): string | null {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(DISMISSED_DATE_KEY);
    } catch {
      return null;
    }
  }

  function writeDismissedDate(dateStr: string) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(DISMISSED_DATE_KEY, dateStr);
    } catch {
      /* ignore private mode / quota */
    }
  }

  function readShownAtMs(): number | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(AUTO_HIDDEN_SHOWN_AT_MS_KEY);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  function writeShownAtMs(ms: number) {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(AUTO_HIDDEN_SHOWN_AT_MS_KEY, String(ms));
    } catch {
      /* ignore private mode / quota */
    }
  }

  const todayStr = getLocalISODateString(new Date());

  const [dismissedToday, setDismissedToday] = useState(() => {
    return readDismissedDate() === todayStr;
  });

  const [autoHidden, setAutoHidden] = useState(() => {
    const dismissedDate = readDismissedDate();
    // If the user dismissed the card on a previous day, allow it to show again
    // once that "dismissed for rest of the day" window expires.
    if (dismissedDate && dismissedDate !== todayStr) return false;

    const shownAt = readShownAtMs();
    if (!shownAt) return false;
    return Date.now() - shownAt >= AUTO_HIDE_MS;
  });

  const isStandaloneApp = useSyncExternalStore(
    noopSubscribe,
    isStandalone,
    () => false,
  );

  const showIosHint = useSyncExternalStore(
    noopSubscribe,
    () => isIos() && isSafari() && !isStandalone(),
    () => false,
  );

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (dismissedToday || isStandaloneApp || autoHidden) return;

    const cardEligible = Boolean(deferredPrompt || showIosHint);
    if (!cardEligible) return;

    const now = Date.now();
    const existingShownAt = readShownAtMs();
    const shownAt = existingShownAt ?? now;
    if (!existingShownAt) {
      // First time this card is shown in this browser session.
      writeShownAtMs(shownAt);
    }

    const elapsed = now - shownAt;
    const remaining = AUTO_HIDE_MS - elapsed;
    if (remaining <= 0) {
      // Avoid synchronously calling setState in the effect body.
      window.setTimeout(() => {
        setAutoHidden(true);
      }, 0);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAutoHidden(true);
    }, remaining);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoHidden, dismissedToday, deferredPrompt, isStandaloneApp, showIosHint]);

  if (dismissedToday || isStandaloneApp || autoHidden) {
    return null;
  }

  if (!deferredPrompt && !showIosHint) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-[60] max-w-sm rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 text-white shadow-2xl">
      {deferredPrompt ? (
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold">Install app</p>
            <p className="text-xs text-neutral-400">
              Add CS Practice Room to your home screen.
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              if (!deferredPrompt) {
                return;
              }

              await deferredPrompt.prompt();
              await deferredPrompt.userChoice;
              setDeferredPrompt(null);
            }}
            className="rounded-xl bg-blue-500 px-3 py-2 text-sm font-medium text-white"
          >
            Install
          </button>

          <button
            type="button"
            onClick={() => {
              setDismissedToday(true);
              writeDismissedDate(todayStr);
            }}
            className="text-xs text-neutral-400"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div>
            <p className="text-sm font-semibold">Install on iPhone</p>
            <p className="text-xs text-neutral-400">
              In Safari, tap Share, then tap Add to Home Screen.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setDismissedToday(true);
              writeDismissedDate(todayStr);
            }}
            className="text-xs text-neutral-400"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}