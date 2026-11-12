// The owner's Orthodox Study Bible notes, introductions, and section headings ship encrypted (osb-data.enc.json).
// A private unlock link (#osb=<key>) or the passphrase opens them on a device; the decrypted copy stays in IndexedDB.
// The link stays in the address bar so an iPhone Home Screen app, which has its own storage, keeps it.
const OSB_KEY_STORE = "reader-osb-key";
const osbFromBase64 = text => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const osbToBase64 = bytes => btoa(String.fromCharCode(...bytes));
let osbEnvelope = null, osbPackState = "locked";

function osbStoredKey() {
  const linked = location.hash.match(/(?:^#|&)osb=([A-Za-z0-9_-]{43})(?:&|$)/);
  if (linked) {
    const key = linked[1].replace(/-/g, "+").replace(/_/g, "/") + "=";
    try { localStorage.setItem(OSB_KEY_STORE, key); } catch {}
    return key;
  }
  try { return localStorage.getItem(OSB_KEY_STORE); } catch { return null; }
}
function forgetOsbKey() { try { localStorage.removeItem(OSB_KEY_STORE); } catch {} }
async function fetchOsbEnvelope() {
  if (osbEnvelope) return osbEnvelope;
  const response = await fetch("osb-data.enc.json");
  if (!response.ok) throw new Error("The encrypted OSB copy is unavailable. Connect once to download it.");
  osbEnvelope = await response.json();
  return osbEnvelope;
}
async function decryptOsbPack(envelope, rawKey) {
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const zipped = await crypto.subtle.decrypt({name: "AES-GCM", iv: osbFromBase64(envelope.iv)}, key, osbFromBase64(envelope.data));
  return JSON.parse(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
}
async function osbKeyFromPassphrase(envelope, passphrase) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name: "PBKDF2", hash: "SHA-256", salt: osbFromBase64(envelope.salt), iterations: envelope.iterations},
    base, {name: "AES-GCM", length: 256}, true, ["decrypt"]);
  return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}
// Links the owner reviewed by hand survive a newer pack.
function keepReviewedLinks(previous, next) {
  const old = previous?.alignment;
  if (!old || !next.alignment) return next;
  for (const [key, evidence] of Object.entries(old.evidence || {})) {
    if (evidence?.method !== "user-reviewed" || !next.sourceNotes?.[key]) continue;
    if (old.notes?.[key]) { next.alignment.notes[key] = next.alignment.verses[key] = old.notes[key]; next.alignment.evidence[key] = evidence; }
    else { delete next.alignment.notes[key]; delete next.alignment.verses[key]; next.alignment.evidence[key] = evidence; }
  }
  return next;
}
// Returns validated study data from the pack when it is newer than what this device holds, else null.
async function loadOsbPack(stored, rawKey) {
  const keyText = rawKey ? osbToBase64(rawKey) : osbStoredKey();
  if (!keyText) { osbPackState = stored?.packId ? "unlocked" : "locked"; return null; }
  const envelope = await fetchOsbEnvelope();
  if (stored?.packId === envelope.id) { osbPackState = "unlocked"; return null; }
  const data = keepReviewedLinks(stored, validatePersonalNotes(await decryptOsbPack(envelope, osbFromBase64(keyText))));
  await personalNotesStore("readwrite", {...data, packId: envelope.id});
  osbPackState = "unlocked";
  return data;
}
async function unlockOsbWithPassphrase(passphrase) {
  const envelope = await fetchOsbEnvelope();
  const rawKey = await osbKeyFromPassphrase(envelope, passphrase);
  let stored = null;
  try { stored = await personalNotesStore("readonly"); } catch {}
  const data = await loadOsbPack(stored && stored.packId ? stored : null, rawKey);
  try { localStorage.setItem(OSB_KEY_STORE, osbToBase64(rawKey)); } catch {}
  personalNotesRevision++;
  applyPersonalNotes(data || validatePersonalNotes(stored));
}
async function lockOsb() {
  forgetOsbKey();
  if (location.hash.includes("osb=")) history.replaceState(null, "", location.pathname + location.search);
  await personalNotesStore("readwrite", null).catch(() => {});
  personalNotesRevision++;
  osbPackState = "locked";
  applyPersonalNotes(null);
}
function osbSettingsHtml() {
  if (personalNotesCount && osbPackState === "unlocked")
    return `<p class="helper">Your Orthodox Study Bible introductions, footnotes, and section headings are open on this device.</p><button class="text-button" id="lockOsb">Lock on this device</button>`;
  if (personalNotesCount)
    return `<p class="helper">Using the study file you imported on this device.</p>`;
  return `<p class="helper">Open your Orthodox Study Bible introductions, footnotes, and section headings with your private link or passphrase.</p><form id="osbUnlockForm" class="osb-unlock"><input id="osbPassphrase" type="password" autocomplete="current-password" placeholder="Passphrase" aria-label="OSB passphrase"><button class="secondary" type="submit">Unlock</button></form><p class="helper" id="osbUnlockStatus" role="status"></p>`;
}
function wireOsbSettings() {
  if ($("lockOsb")) $("lockOsb").onclick = async () => {
    await lockOsb(); notify("OSB notes locked on this device"); showSettings();
  };
  if ($("osbUnlockForm")) $("osbUnlockForm").onsubmit = async event => {
    event.preventDefault();
    const status = $("osbUnlockStatus"), button = event.target.querySelector("button");
    button.disabled = true; status.textContent = "Opening…";
    try { await unlockOsbWithPassphrase($("osbPassphrase").value); notify("Orthodox Study Bible notes are open"); showSettings(); }
    catch (error) { status.textContent = error?.name === "OperationError" ? "That passphrase did not open the notes." : error.message || "Could not open the notes."; button.disabled = false; }
  };
}
