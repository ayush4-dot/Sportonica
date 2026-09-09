/* ================================================================
   Sportonica service worker.
   Strategy by request type:
     · navigations         → network first, offline page as fallback
     · /_next/* build output → network first (hashed in prod, unstable in
                               dev — a stale chunk silently breaks the app)
     · /public static files → cache first (icons, fonts, images)
     · Supabase / APIs / auth → straight to network, never touched
   Booking and availability data must never be served stale.
   ================================================================ */

// Bump this on any strategy change — the activate handler purges every
// cache whose key doesn't start with the current VERSION, which is what
// unsticks clients holding a poisoned v1 asset cache.
const VERSION = "sportonica-v2";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch cross-origin (Supabase, Google Fonts), the SW script
  // itself, auth callbacks, or API traffic.
  if (
    url.origin !== self.location.origin ||
    url.pathname === "/sw.js" ||
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/api")
  ) {
    return;
  }

  // Page navigations: try the network, fall back to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // Next.js build output: NETWORK-FIRST. Serving a stale JS/CSS chunk
  // here means missing styles or a hydration mismatch — the page looks
  // broken. Keep a copy only so the offline page still has its assets.
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Our own static files under /public (icons, fonts, images): stable
  // URLs, safe to serve from cache first and refresh in the background.
  if (/\.(png|jpe?g|webp|svg|gif|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
