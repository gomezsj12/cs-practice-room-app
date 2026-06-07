/**
 * Service worker for the CS Practice Room PWA.
 *
 * Caching strategy:
 *   - Install: precaches static shell assets (manifest, PWA icons) only.
 *   - Activate: purges old caches and immediately claims all open clients.
 *   - Fetch:
 *       • Non-GET, cross-origin, and /api/* requests (except pwa-icon) bypass the cache entirely.
 *       • Navigation requests are network-ONLY and never cached. The server-rendered
 *         HTML embeds the signed-in user's session (email, name, isAdmin), so caching
 *         it could serve one user's page to another on a shared device (SEC-05).
 *       • Other same-origin GET requests (static assets) use cache-first.
 */

// Bumped to v2 so the activate handler purges any v1 cache that may hold
// previously-cached authenticated navigation HTML (SEC-05).
const CACHE_NAME = "jam-scheduler-shell-v2";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/api/pwa-icon?size=192",
  "/api/pwa-icon?size=512",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  // API routes must always hit the server for fresh data; pwa-icon is
  // an exception because it returns a static generated image.
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/pwa-icon")) {
    return;
  }

  // SEC-05: navigations are network-ONLY and are never cached. The
  // server-rendered HTML embeds the signed-in user's session, so storing it (or
  // serving a cached copy) could leak one user's identity to another on a shared
  // device. We deliberately do not provide a cached HTML offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first for static assets: serve from cache when available,
  // populate cache on first network fetch.
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        const responseClone = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });

        return response;
      });
    }),
  );
});