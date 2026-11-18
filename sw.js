// Service worker: guarda la app en el dispositivo para que abra sin conexión.
// Los datos de las reuniones NO pasan por aquí: la app guarda su propia copia.
const VERSION = "v1";
const CACHE = "reuniones-" + VERSION;
const SHELL = [
  "./",
  "index.html",
  "css/styles.css",
  "js/config.js",
  "js/app.js",
  "js/vendor/supabase.js",
  "manifest.webmanifest",
  "icons/logo.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("reuniones-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Archivos de la app: primero la red (para recibir actualizaciones) y, si no hay conexión, la copia guardada.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
