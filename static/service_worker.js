const CACHE_NAME = "vesper-cache-v70";

const ASSETS_TO_CACHE = [
  "/",
  "/static/style.css",

  "/static/js/main.js",
  "/static/js/map.js",
  "/static/js/ui.js",
  "/static/js/upload.js",
  "/static/js/gallery.js",
  "/static/js/utils.js",
  "/static/js/constants.js",
  "/static/js/moment-view.js",

  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log("Caching core assets...");

      // Cache files individually so one failure doesn't break everything
      const cachePromises = ASSETS_TO_CACHE.map(async (url) => {
        try {
          // Add { cache: 'reload' } to ensure we bypass browser cache during SW install
          const request = new Request(url, { cache: "reload" });
          const response = await fetch(request);

          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }

          await cache.put(request, response);
          console.log(`Successfully cached: ${url}`);
        } catch (err) {
          console.error(
            `Failed to cache specific asset (${url}):`,
            err.message,
          );
        }
      });

      return Promise.all(cachePromises);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith("http")) {
    return;
  }

  const url = new URL(event.request.url);

  // Bypass cache completely for API calls and dynamic images
  if (
    url.pathname.startsWith("/pins") ||
    url.pathname.startsWith("/upload") ||
    url.pathname.startsWith("/static/images/")
  ) {
    return;
  }

  // Handle HTML Navigation (The Offline Screen Bouncer)
  if (
    event.request.mode === "navigate" ||
    (event.request.headers.get("accept") &&
      event.request.headers.get("accept").includes("text/html"))
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // THE INLINE ZERO-DEPENDENCY OFFLINE PAGE (Mobile Optimized)
        const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#0d1117">
    <title>Vesper - Sky Unavailable</title>
    <style>
        body { margin: 0; padding: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center; background-color: #0d1117; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow: hidden; color: #e0e0e0; box-sizing: border-box; padding: env(safe-area-inset-top) 20px env(safe-area-inset-bottom) 20px; }
        .error-card { text-align: center; padding: clamp(25px, 6vw, 50px) clamp(20px, 5vw, 40px); background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 28px; width: 100%; max-width: 360px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); animation: slideUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; box-sizing: border-box; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .eclipse { width: clamp(55px, 15vw, 75px); height: clamp(55px, 15vw, 75px); border-radius: 50%; background: #ff5e3a; margin: 0 auto clamp(15px, 5vw, 25px) auto; position: relative; box-shadow: 0 0 30px rgba(255, 94, 58, 0.4); animation: pulse 3s ease-in-out infinite alternate; }
        .eclipse::after { content: ''; position: absolute; top: 6%; right: -12%; width: 96%; height: 96%; border-radius: 50%; background: #0d1117; }
        @keyframes pulse { 0% { box-shadow: 0 0 15px rgba(255, 94, 58, 0.2); } 100% { box-shadow: 0 0 45px rgba(255, 94, 58, 0.7); } }
        h1 { font-size: clamp(1.2rem, 5vw, 1.5rem); margin: 0 0 clamp(8px, 3vw, 12px) 0; color: #ffffff; letter-spacing: 0.5px; font-weight: 700; }
        p { font-size: clamp(0.9rem, 4vw, 0.95rem); line-height: 1.5; color: #aaa; margin: 0 auto clamp(20px, 6vw, 30px) auto; max-width: 95%; }
        .retry-btn { background: transparent; color: #ff5e3a; border: 1px solid rgba(255, 94, 58, 0.5); padding: 12px 24px; border-radius: 30px; font-size: clamp(0.95rem, 4vw, 1rem); font-weight: 600; cursor: pointer; transition: all 0.3s ease; outline: none; width: 100%; max-width: 200px; min-height: 48px; touch-action: manipulation; display: inline-flex; align-items: center; justify-content: center; margin: 0 auto; }
        .retry-btn:hover, .retry-btn:active { background: rgba(255, 94, 58, 0.1); border-color: #ff5e3a; transform: scale(1.04); }
        @media (max-height: 500px) and (orientation: landscape) { .error-card { padding: 20px; } .eclipse { width: 45px; height: 45px; margin-bottom: 10px; } h1 { font-size: 1.1rem; margin-bottom: 6px; } p { font-size: 0.85rem; margin-bottom: 15px; } .retry-btn { min-height: 40px; padding: 8px 16px; } }
    </style>
</head>
<body>
    <div class="error-card">
        <div class="eclipse"></div>
        <h1>Lost in the clouds</h1>
        <p>Vesper is taking a brief pause. We can't reach the server right now, but the sky will clear up shortly.</p>
        <button class="retry-btn" onclick="window.location.reload()">Look again</button>
    </div>
</body>
</html>`;

        // Serve the inline HTML instead of throwing the browser dinosaur
        return new Response(OFFLINE_HTML, {
          headers: { "Content-Type": "text/html" },
        });
      }),
    );
    return;
  }

  // 3. Stale-While-Revalidate for Static Assets (CSS, JS, Leaflet)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Kick off a network request in the background
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // 2. Clone the response safely BEFORE putting it in the cache
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((err) => {
          console.warn("Background fetch failed (user may be offline):", err);
          // THE FIX: Return a generic empty response instead of throwing an error.
          // This prevents the "Uncaught Promise TypeError" and lets the app keep running smoothly.
          return new Response("", { status: 503, statusText: "Offline" });
        });

      // 3. INSTANTLY return the cached version if we have it,
      // otherwise wait for the network to finish.
      return cachedResponse || fetchPromise;
    }),
  );
});
