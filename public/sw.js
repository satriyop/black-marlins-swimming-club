const workerUrl = new URL(self.location.href);
const buildId = (workerUrl.searchParams.get("build") || "unknown").replace(
  /[^a-zA-Z0-9._-]/g,
  "-",
);
const cachePrefix = "bmsc-public-v";
const cacheName = `${cachePrefix}${buildId}`;
const offlineUrl = "/offline.html";
const publicAssets = new Set([
  offlineUrl,
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
]);
const networkOnlyNavigation = new Set(["/terima"]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll([...publicAssets])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (publicAssets.has(url.pathname) && !url.search) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }

  if (request.mode !== "navigate") return;
  if (networkOnlyNavigation.has(url.pathname) || url.pathname.startsWith("/api/")) return;

  // fetch() resolves for HTTP errors, so 4xx/5xx responses remain visible.
  // The public fallback is used only when a document request cannot reach the network.
  event.respondWith(fetch(request).catch(() => caches.match(offlineUrl)));
});
