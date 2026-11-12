// OSB text edition: the Bible text ships encrypted. This loader finds the key (private link or passphrase),
// decrypts the text into window.BIBLE, and only then loads the app. Without a key it shows a lock screen.
(() => {
  const KEY_STORE = "reader-osb-edition-key";
  const APP_SCRIPTS = ["edition.js", "study-data.js", "wisdom-data.js", "prayers-data.js", "agpeya-data.js", "personal-notes.js",
    "persistence.js", "note-alignment.js", "osb-pack.js", "reader-tools.js", "katameros-data.js",
    "today.js", "vendor/fflate/fflate.js", "library-formats.js", "library.js", "library-tools.js", "library-backup.js", "swipe.js", "app.js"];
  const fromBase64 = text => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const toBase64 = bytes => btoa(String.fromCharCode(...bytes));

  function storedKey() {
    // The link stays in the address bar so an iPhone Home Screen app, which has its own storage, keeps it.
    const linked = location.hash.match(/(?:^#|&)osb=([A-Za-z0-9_-]{43})(?:&|$)/);
    if (linked) {
      const key = linked[1].replace(/-/g, "+").replace(/_/g, "/") + "=";
      try { localStorage.setItem(KEY_STORE, key); } catch {}
      return key;
    }
    try { return localStorage.getItem(KEY_STORE); } catch { return null; }
  }
  async function decryptFile(file, rawKey) {
    const response = await fetch(file);
    if (!response.ok) throw new Error("offline");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    const zipped = await crypto.subtle.decrypt({name: "AES-GCM", iv: bytes.slice(0, 12)}, key, bytes.slice(12));
    return JSON.parse(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
  }
  async function keyFromPassphrase(meta, passphrase) {
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
      try {
        const rawKey = await keyFromPassphrase(meta, document.getElementById("lockPassphrase").value);
        await open(meta, rawKey);
        try { localStorage.setItem(KEY_STORE, toBase64(rawKey)); } catch {}
      } catch (error) {
        status.textContent = error?.message === "offline" ? "Connect to the internet once to download the text." : "That passphrase did not open the text.";
        button.disabled = false;
      }
    };
  }
  async function open(meta, rawKey) {
    window.BIBLE = await decryptFile(meta.files.bible.file, rawKey);
    window.OSB_EDITION = {meta, study: () => decryptFile(meta.files.study.file, rawKey),
      lock() { try { localStorage.removeItem(KEY_STORE); } catch {} }};
    document.getElementById("lock").hidden = true;
    document.querySelector(".app").hidden = false;
    await loadScripts(APP_SCRIPTS);
  }
  async function start() {
    let meta = null;
    try { meta = await (await fetch("edition.json")).json(); }
    catch { showLock(null, "Connect to the internet once to download the text."); return; }
    const key = storedKey();
    if (!key) { showLock(meta); return; }
    try { await open(meta, fromBase64(key)); }
    catch (error) {
      if (window.BIBLE) { document.getElementById("pane").innerHTML = '<p class="empty">Reader could not start. Reload to try again.</p>'; return; }
      showLock(meta, error?.message === "offline" ? "Connect to the internet once to download the text." : "This link no longer opens the text. Use your latest link.");
    }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  start();
})();
