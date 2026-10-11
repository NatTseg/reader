const CACHE = "reader-v32";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./swipe.js",
  "./personal-notes.js",
  "./persistence.js",
  "./cloud-config.js",
  "./cloud-sync.js",
  "./reader-tools.js",
  "./note-alignment.js",
  "./prayers-data.js",
  "./styles.css",
  "./bible-data.js",
  "./legacy-web-data.js",
  "./edition.js",
  "./study-data.js",
  "./wisdom-data.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./fish.svg",
  "./apple-touch-icon.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" }))),
      )
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
            .filter((key) => /^(?:reader|orthodox-bible)-v\d+$/.test(key) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.href.startsWith(self.registration.scope)
  )
    return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        return await fetch(req);
      } catch {
        if (req.mode === "navigate")
          return (await cache.match("./index.html")) || Response.error();
        return Response.error();
      }
    }),
  );
});

self.addEventListener("message", event => {
  const type = event.data?.type;
  if (!["ORTHOBIBLE_STORAGE_STATUS", "ORTHOBIBLE_REPAIR_CACHE"].includes(type) || !event.ports?.[0]) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      let missing = (await Promise.all(ASSETS.map(async url => await cache.match(url) ? null : url))).filter(Boolean);
      if (type === "ORTHOBIBLE_REPAIR_CACHE" && missing.length) {
        await cache.addAll(missing.map(url => new Request(url, {cache:"reload"})));
        missing = (await Promise.all(ASSETS.map(async url => await cache.match(url) ? null : url))).filter(Boolean);
      }
      event.ports[0].postMessage({version:CACHE, total:ASSETS.length, cached:ASSETS.length - missing.length, missing});
    } catch { event.ports[0].postMessage({error:"Offline files could not be checked or repaired. Reconnect and try again."}); }
  })());
});
