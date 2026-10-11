const CACHE = "reader-v33";
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
  "./library.js",
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
  "./vendor/pdfjs/cmaps/78-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/78-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/78-H.bcmap",
  "./vendor/pdfjs/cmaps/78-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/78-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/78-V.bcmap",
  "./vendor/pdfjs/cmaps/78ms-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/78ms-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/83pv-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90ms-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90ms-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/90msp-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90msp-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/90pv-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90pv-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Add-H.bcmap",
  "./vendor/pdfjs/cmaps/Add-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/Add-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Add-V.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-0.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-1.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-3.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-4.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-5.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-6.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-UCS2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-0.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-1.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-3.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-4.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-5.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-UCS2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-0.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-1.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-3.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-4.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-5.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-6.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Korea1-0.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Korea1-1.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Korea1-2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap",
  "./vendor/pdfjs/cmaps/B5-H.bcmap",
  "./vendor/pdfjs/cmaps/B5-V.bcmap",
  "./vendor/pdfjs/cmaps/B5pc-H.bcmap",
  "./vendor/pdfjs/cmaps/B5pc-V.bcmap",
  "./vendor/pdfjs/cmaps/CNS-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/CNS-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/CNS1-H.bcmap",
  "./vendor/pdfjs/cmaps/CNS1-V.bcmap",
  "./vendor/pdfjs/cmaps/CNS2-H.bcmap",
  "./vendor/pdfjs/cmaps/CNS2-V.bcmap",
  "./vendor/pdfjs/cmaps/ETHK-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/ETHK-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/ETen-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/ETen-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/ETenms-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/ETenms-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/Ext-H.bcmap",
  "./vendor/pdfjs/cmaps/Ext-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/Ext-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Ext-V.bcmap",
  "./vendor/pdfjs/cmaps/GB-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GB-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/GB-H.bcmap",
  "./vendor/pdfjs/cmaps/GB-V.bcmap",
  "./vendor/pdfjs/cmaps/GBK-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GBK-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/GBK2K-H.bcmap",
  "./vendor/pdfjs/cmaps/GBK2K-V.bcmap",
  "./vendor/pdfjs/cmaps/GBKp-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GBKp-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/GBT-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GBT-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/GBT-H.bcmap",
  "./vendor/pdfjs/cmaps/GBT-V.bcmap",
  "./vendor/pdfjs/cmaps/GBTpc-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GBTpc-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/GBpc-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GBpc-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/H.bcmap",
  "./vendor/pdfjs/cmaps/HKdla-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKdla-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/HKdlb-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKdlb-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/HKgccs-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKgccs-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/HKm314-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKm314-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/HKm471-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKm471-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/HKscs-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKscs-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/Hankaku.bcmap",
  "./vendor/pdfjs/cmaps/Hiragana.bcmap",
  "./vendor/pdfjs/cmaps/KSC-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/KSC-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/KSC-H.bcmap",
  "./vendor/pdfjs/cmaps/KSC-Johab-H.bcmap",
  "./vendor/pdfjs/cmaps/KSC-Johab-V.bcmap",
  "./vendor/pdfjs/cmaps/KSC-V.bcmap",
  "./vendor/pdfjs/cmaps/KSCms-UHC-H.bcmap",
  "./vendor/pdfjs/cmaps/KSCms-UHC-HW-H.bcmap",
  "./vendor/pdfjs/cmaps/KSCms-UHC-HW-V.bcmap",
  "./vendor/pdfjs/cmaps/KSCms-UHC-V.bcmap",
  "./vendor/pdfjs/cmaps/KSCpc-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/KSCpc-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/Katakana.bcmap",
  "./vendor/pdfjs/cmaps/NWP-H.bcmap",
  "./vendor/pdfjs/cmaps/NWP-V.bcmap",
  "./vendor/pdfjs/cmaps/RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Roman.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UCS2-H.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UCS2-H.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-HW-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-HW-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISPro-UCS2-HW-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISPro-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISPro-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX0213-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX0213-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX02132004-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX02132004-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UCS2-H.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/V.bcmap",
  "./vendor/pdfjs/cmaps/WP-Symbol.bcmap",
  "./vendor/pdfjs/pdf.mjs",
  "./vendor/pdfjs/pdf.worker.mjs",
  "./vendor/pdfjs/standard_fonts/FoxitDingbats.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitFixed.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitFixedBold.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitFixedItalic.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitSerif.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitSerifBold.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitSerifItalic.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitSymbol.pfb",
  "./vendor/pdfjs/standard_fonts/LiberationSans-Bold.ttf",
  "./vendor/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf",
  "./vendor/pdfjs/standard_fonts/LiberationSans-Italic.ttf",
  "./vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf",
  "./vendor/pdfjs/wasm/jbig2.wasm",
  "./vendor/pdfjs/wasm/jbig2_nowasm_fallback.js",
  "./vendor/pdfjs/wasm/openjpeg.wasm",
  "./vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js",
  "./vendor/pdfjs/wasm/qcms_bg.wasm",
  "./vendor/pdfjs/wasm/quickjs-eval.js",
  "./vendor/pdfjs/wasm/quickjs-eval.wasm",
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
