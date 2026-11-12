// OSB text edition: the Bible text ships encrypted. This loader finds a key (the private link, the key this
// browser remembers, or the passphrase), decrypts the text into window.BIBLE, and only then loads the app.
// Without a key that opens the text it shows a lock screen.
(() => {
  const KEY_STORE = "reader-osb-edition-key", LOCK_STORE = "reader-osb-edition-locked";
  const APP_SCRIPTS = ["edition.js", "study-data.js", "wisdom-data.js", "prayers-data.js", "agpeya-data.js", "personal-notes.js",
    "persistence.js", "note-alignment.js", "osb-pack.js", "reader-tools.js", "katameros-data.js",
    "today.js", "vendor/fflate/fflate.js", "library-formats.js", "library.js", "library-tools.js", "library-backup.js", "swipe.js", "app.js"];
  const MESSAGES = {
    offline: "Connect to the internet once to download the text.",
    link: "This link no longer opens the text. Use your latest link.",
    passphrase: "That passphrase did not open the text.",
    unsupported: "This browser cannot open the text. Update it and try again.",
    locked: "Locked on this device.",
    failed: "Reader could not start. Reload to try again.",
  };
  const fromBase64 = text => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
  const read = name => { try { return localStorage.getItem(name); } catch { return null; } };
  const write = (name, value) => { try { if (value === null) localStorage.removeItem(name); else localStorage.setItem(name, value); } catch {} };
  // Failures carry a code: "offline" (the file could not be fetched), "key" (it did not decrypt), "unsupported".
  const fail = code => Object.assign(new Error(code), {code});

  // The key in the address bar, if any. It stays there so an iPhone Home Screen app, which has its own storage, keeps it.
  function linkedKey() {
    const linked = location.hash.match(/(?:^#|&)osb=([A-Za-z0-9_-]{43})(?:&|$)/);
    return linked ? linked[1].replace(/-/g, "+").replace(/_/g, "/") + "=" : null;
  }
  // A short, one-way mark of a key: Lock remembers which key it locked without keeping the key.
  async function fingerprint(key) {
    return toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))).slice(0, 12));
  }
  async function decryptFile(file, rawKey) {
    if (!globalThis.crypto?.subtle || typeof DecompressionStream !== "function") throw fail("unsupported");
    let response;
    try { response = await fetch(file); } catch { throw fail("offline"); }
    if (!response.ok) throw fail("offline");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let zipped;
    try {
      const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
      zipped = await crypto.subtle.decrypt({name: "AES-GCM", iv: bytes.slice(0, 12)}, key, bytes.slice(12));
    } catch { throw fail("key"); }
    return JSON.parse(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
  }
  async function keyFromPassphrase(meta, passphrase) {
    if (!globalThis.crypto?.subtle) throw fail("unsupported");
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({name: "PBKDF2", hash: "SHA-256", salt: fromBase64(meta.salt), iterations: meta.iterations},
      base, {name: "AES-GCM", length: 256}, true, ["decrypt"]);
    return new Uint8Array(await crypto.subtle.exportKey("raw", key));
  }
  function loadScripts(list) {
    return list.reduce((chain, src) => chain.then(() => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src; script.async = false;
      script.onload = resolve; script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.append(script);
    })), Promise.resolve());
  }
  function showLock(meta, message = "") {
    document.querySelector(".app").hidden = true;
    const lock = document.getElementById("lock");
    lock.hidden = false;
    lock.innerHTML = `<img src="icon.svg" alt="" width="72" height="72"><h1>Reader</h1><p>Open your private link to read.</p>
      ${meta ? `<details><summary>Use passphrase</summary><form id="lockForm"><input id="lockPassphrase" type="password" autocomplete="current-password" placeholder="Passphrase" aria-label="Passphrase" required><button type="submit">Open</button></form></details>` : ""}
      <p id="lockStatus" role="status">${message}</p>`;
    const form = document.getElementById("lockForm");
    if (form) form.onsubmit = async event => {
      event.preventDefault();
      const status = document.getElementById("lockStatus"), button = form.querySelector("button");
      button.disabled = true; status.textContent = "Opening…";
      let rawKey, bible;
      try {
        rawKey = await keyFromPassphrase(meta, document.getElementById("lockPassphrase").value);
        bible = await decryptFile(meta.files.bible.file, rawKey);
      } catch (error) {
        status.textContent = error?.code === "key" ? MESSAGES.passphrase : MESSAGES[error?.code] || MESSAGES.unsupported;
        button.disabled = false;
        return;
      }
      write(KEY_STORE, toBase64(rawKey)); write(LOCK_STORE, null);
      await launch(meta, rawKey, bible);
    };
  }
  // The text is open: show the app and load it. The study pack starts decrypting at once, for the app's start-up.
  async function launch(meta, rawKey, bible) {
    window.BIBLE = bible;
    const study = decryptFile(meta.files.study.file, rawKey);
    study.catch(() => {});
    window.OSB_EDITION = {
      meta,
      study: () => study,
      // Forget the key and remember which one was locked, so a Home Screen icon that carries it stays locked too.
      async lock() {
        const key = read(KEY_STORE);
        write(KEY_STORE, null);
        if (key) write(LOCK_STORE, await fingerprint(key).catch(() => "locked"));
      },
    };
    document.getElementById("lock").hidden = true;
    document.querySelector(".app").hidden = false;
    const pane = document.getElementById("pane");
    pane.innerHTML = '<p class="empty">Opening…</p>';
    try { await loadScripts(APP_SCRIPTS); }
    catch { pane.innerHTML = `<p class="empty">${MESSAGES.failed}</p>`; }
  }
  let starting = false;
  async function start() {
    if (starting || window.BIBLE) return;
    starting = true;
    try {
      let meta = null;
      try {
        const response = await fetch("edition.json");
        if (!response.ok) throw fail("offline");
        meta = await response.json();
      } catch { showLock(null, MESSAGES.offline); return; }
      // The link's key is tried first, then the key this browser remembers. A key is remembered only once it has
      // opened the text, so a stale or foreign link never displaces a working key.
      const linked = linkedKey(), stored = read(KEY_STORE), locked = read(LOCK_STORE);
      const lockedLink = !!(linked && locked && locked === await fingerprint(linked).catch(() => ""));
      const candidates = [...new Set([lockedLink ? null : linked, stored].filter(Boolean))];
      let problem = locked && !candidates.length ? "locked" : "";
      for (const key of candidates) {
        let bible;
        try { bible = await decryptFile(meta.files.bible.file, fromBase64(key)); }
        catch (error) {
          problem = error?.code === "key" || !error?.code ? "link" : error.code;
          if (problem !== "link") break;
          if (key === stored) write(KEY_STORE, null);
          continue;
        }
        write(KEY_STORE, key); write(LOCK_STORE, null);
        await launch(meta, fromBase64(key), bible);
        return;
      }
      showLock(meta, MESSAGES[problem] || "");
    } finally { starting = false; }
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  // Pasting the link into a tab that shows the lock screen opens it.
  window.addEventListener("hashchange", () => { if (linkedKey()) start(); });
  start();
})();
