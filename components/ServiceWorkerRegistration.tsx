"use client";

/**
 * @module ServiceWorkerRegistration
 *
 * Registers the app's service worker (`/sw.js`) in production builds only.
 * Rendered as a no-output Client Component so the registration side-effect
 * runs once on initial page load without blocking rendering.
 *
 * In development (`NODE_ENV !== "production"`), registration is skipped to
 * avoid caching issues during local iteration.
 */

import { useEffect } from "react";

/**
 * Registers `/sw.js` after the window `load` event in production.
 * Renders nothing (`null`); exists solely for the registration side-effect.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    if (!("serviceWorker" in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    };

    window.addEventListener("load", registerServiceWorker);

    return () => {
      window.removeEventListener("load", registerServiceWorker);
    };
  }, []);

  return null;
}