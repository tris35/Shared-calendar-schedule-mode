// Service worker: makes the site installable as an app.
// Network-first for the page files (always shows the newest design when online);
// falls back to the saved copy when offline. API, photos and calendar feeds are never cached.
const CACHE = "the-legend-v245";
// 相对路径：网站放在子资料夹（例如 GitHub Pages 的 /Shared-calendar/）也能用
const SHELL = ["./", "index.html", "v2.css", "v2.js", "dashboard.html", "config.js", "manifest.json", "icons/icon-192.png", "icons/favicon-64.png", "icons/logo-mark.png", "icons/logo-full.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/api/")) return; // live data: always from the server
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
  );
});
