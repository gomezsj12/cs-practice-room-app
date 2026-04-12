"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthCardShortcutActions } from "@/components/auth-card-shortcut-actions-context";

const HD_MIN_WIDTH_PX = 72 * 16;

/** Hold duration before I/O fire sign-in / sign-out (matches deliberate press-and-hold UX). */
const AUTH_KEY_HOLD_MS = 500;

const HOLD_LETTERS = new Set(["i", "o"]);

/** True when a blocking in-app modal overlay is mounted (excludes install banner & toasts). */
function hasBlockingAppModal(): boolean {
  return document.querySelector("[data-blocking-app-modal]") != null;
}

function isTypingContext(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;

  const active = document.activeElement;
  if (active instanceof HTMLIFrameElement) return true;

  let el: Element | null =
    target instanceof Element ? target : target.parentElement;

  while (el) {
    if (el.hasAttribute("data-disable-nav-shortcuts")) return true;

    if (
      el instanceof HTMLElement &&
      el.isContentEditable &&
      el.getAttribute("contenteditable") !== "false"
    ) {
      return true;
    }

    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      return true;
    }

    if (el instanceof HTMLInputElement) {
      const t = el.type;
      const nonTextInput =
        t === "button" ||
        t === "submit" ||
        t === "reset" ||
        t === "checkbox" ||
        t === "radio" ||
        t === "file" ||
        t === "range" ||
        t === "color";
      if (!nonTextInput) return true;
    }

    el = el.parentElement;
  }

  return false;
}

const ROUTES: Record<string, string> = {
  h: "/",
  b: "/booking",
  c: "/calendar",
  s: "/support",
};

/**
 * Desktop-only keyboard shortcuts when focus is not in a text field, iframe, or
 * region opted out via `data-disable-nav-shortcuts`.
 *
 * Nav: H/B/C/S. Auth card: R (reload profile / sync), hold I / hold O (sign in / out).
 *
 * When a `[data-blocking-app-modal]` overlay is present, shortcuts are disabled so
 * Escape and in-modal handling stay unaffected. Install prompt and toasts are not blocking.
 */
export default function DesktopNavShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const authActions = useAuthCardShortcutActions();
  const authActionsRef = useRef(authActions);
  authActionsRef.current = authActions;

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${HD_MIN_WIDTH_PX}px)`);
    const holdTimers = new Map<string, number>();

    const clearHold = (letter: string) => {
      const t = holdTimers.get(letter);
      if (t !== undefined) {
        window.clearTimeout(t);
        holdTimers.delete(letter);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!mq.matches) return;
      if (e.key.length !== 1) return;
      const letter = e.key.toLowerCase();
      if (HOLD_LETTERS.has(letter)) clearHold(letter);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!mq.matches) return;
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const blockShortcuts = hasBlockingAppModal() && e.key !== "Escape";

      const key = e.key.length === 1 ? e.key.toLowerCase() : "";

      if (HOLD_LETTERS.has(key)) {
        if (blockShortcuts) return;
        if (e.repeat) return;
        if (isTypingContext(e.target)) return;
        clearHold(key);
        const t = window.setTimeout(() => {
          holdTimers.delete(key);
          if (hasBlockingAppModal()) return;
          const a = authActionsRef.current;
          if (key === "i") a.signIn();
          else a.signOut();
        }, AUTH_KEY_HOLD_MS);
        holdTimers.set(key, t);
        return;
      }

      if (e.repeat) return;

      if (blockShortcuts) return;

      if (key === "r") {
        if (isTypingContext(e.target)) return;
        e.preventDefault();
        authActionsRef.current.reloadProfile();
        return;
      }

      const href = ROUTES[key];
      if (!href) return;
      if (isTypingContext(e.target)) return;
      e.preventDefault();
      if (pathname !== href) router.push(href);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      for (const t of holdTimers.values()) window.clearTimeout(t);
      holdTimers.clear();
    };
  }, [pathname, router]);

  return null;
}
