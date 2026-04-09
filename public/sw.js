/**
 * Service worker for the CS Practice Room PWA.
 *
 * Caching strategy:
 *   - Install: precaches the app shell (root page, manifest, PWA icons).
 *   - Activate: purges old caches and immediately claims all open clients.
 *   - Fetch:
 *       • Non-GET, cross-origin, and /api/* requests (except pwa-icon) bypass the cache entirely.
 *       • Navigation requests use network-first with cache fallback (offline support).
 *       • Other same-origin GET requests use cache-first, falling back to network on miss.
 */

const CACHE_NAME = "jam-scheduler-shell-v1";
const APP_SHELL = [
  "/",
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

  // Network-first for navigations: show the latest server-rendered page,
  // fall back to cached shell if offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });

          return response;
        })
        .catch(async () => {
          return (await caches.match(request)) || caches.match("/");
        }),
    );

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