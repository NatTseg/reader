// Durable reader state and personal imports share the existing IndexedDB database.
// Backup files deliberately exclude cloud credentials and cached public Bible text.
let persistenceReady = false, persistenceBusy = false;
let readerSaveQueue = Promise.resolve(), persistenceWarningShown = false;
function studyRead(key) {
  return studyTransaction(null, key);
}
function studyTransaction(values, readKey) {
  return new Promise((resolve, reject) => {
    // Keep the legacy database name so the new Pages path reuses existing notes.
    const request = indexedDB.open("orthobible-personal", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("study");
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other reader tabs and try again."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      const tx = db.transaction("study", values ? "readwrite" : "readonly");
      const store = tx.objectStore("study");
      let result;
      if (values) for (const [key, value] of Object.entries(values)) store.put(value, key);
      else { const get = store.get(readKey); get.onsuccess = () => { result = get.result; }; }
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error("Device storage is unavailable.")); };
    };
  });
}
function saveReaderCopy() {
  if (!persistenceReady || persistenceBusy) return;
  const copy = JSON.parse(JSON.stringify(state));
  readerSaveQueue = readerSaveQueue.then(() => studyTransaction({readerState: copy})).catch(() => {
    if (!persistenceWarningShown) { persistenceWarningShown = true; notify("The extra device copy could not be saved. Export a backup from Reading settings."); }
  });
}
async function readStoredReader() {
  let local = null, durable = null;
  try { local = JSON.parse(localStorage.getItem("obible3") || "null"); } catch {}
  try { durable = await studyRead("readerState"); } catch {}
  const isReader = value => value && typeof value === "object" && !Array.isArray(value) && typeof value.book === "string";
  if (!isReader(local)) local = null;
  if (!isReader(durable)) durable = null;
  return durable && (!local || (durable.savedAt || 0) > (local.savedAt || 0)) ? durable : local;
}
function backupReader(source) {
  const fields = ["edition", "tab", "book", "chapter", "scroll", "font", "theme", "showNotes", "showPreamble", "bookmarks", "highlights", "comments", "legacySaved", "fontFamily", "lineSpacing", "paper", "history", "readingPlan"];
  return JSON.parse(JSON.stringify(Object.fromEntries(fields.filter(key => source[key] !== undefined).map(key => [key, source[key]]))));
}
function validateBackup(value) {
  const fail = () => { throw new Error("Choose a complete reader backup file. Study-note imports belong in Import study notes."); };
  // The format identifier stays compatible with backups made before the rename.
  if (!value || value.format !== "orthobible-backup" || value.version !== 1 || !value.reader || !Object.hasOwn(value, "personal")) fail();
  const r = backupReader(value.reader);
  if (typeof normalizeReaderTools === "function") normalizeReaderTools(r);
  if (r.edition !== window.BIBLE.edition) throw new Error("This backup uses a different Bible edition. Keep the file and update the app before restoring it.");
  const isObject = x => x && typeof x === "object" && !Array.isArray(x);
  if (!bookMeta(r.book) || !Number.isInteger(r.chapter) || r.chapter < 1 || r.chapter > bookMeta(r.book).n ||
      !["bible","wisdom","prayers","library","saved"].includes(r.tab) || !["light","dark"].includes(r.theme) ||
      !Number.isFinite(r.font) || r.font < 16 || r.font > 28 || !Number.isFinite(r.scroll) || r.scroll < 0 || r.scroll > 1 ||
      typeof r.showNotes !== "boolean" || typeof r.showPreamble !== "boolean" || !Array.isArray(r.bookmarks) ||
      !isObject(r.highlights) || !isObject(r.comments) || !Array.isArray(r.legacySaved)) fail();
  if (r.bookmarks.some(b => !b || !Number.isInteger(b.chapter) || !Number.isInteger(b.verse) || !validVerse(b.book,b.chapter,b.verse))) fail();
  for (const [field, entries] of [["comments",r.comments],["highlights",r.highlights]]) {
    for (const [key, text] of Object.entries(entries)) {
      const match = key.match(/^([A-Z0-9]{3}):(\d+):(\d+)$/);
      if (!match || !validVerse(match[1],+match[2],+match[3]) || typeof text !== "string" || (field === "highlights" && !["gold","paper","rose"].includes(text))) fail();
    }
  }
  for (const entry of r.legacySaved) {
    if (!isObject(entry) || typeof entry.key !== "string" || entry.key !== `${entry.book}:${entry.chapter}:${entry.verse}` ||
        !window.LEGACY_WEB?.t[entry.book]?.[entry.chapter - 1]?.[entry.verse] ||
        typeof entry.text !== "string" || typeof entry.name !== "string" || typeof entry.source !== "string" ||
        (entry.comment !== undefined && typeof entry.comment !== "string") ||
        (entry.highlight !== undefined && !["gold","paper","rose"].includes(entry.highlight))) fail();
  }
  return {format: "orthobible-backup", version: 1, createdAt: typeof value.createdAt === "string" ? value.createdAt : "", reader: r,
    personal: value.personal === null ? null : validatePersonalNotes(value.personal)};
}
async function createBackup() {
  rememberScroll();
  await readerSaveQueue;
  // Fail visibly rather than silently exporting a backup that omits private imports.
  const personal = await studyRead("notes");
  return validateBackup({format:"orthobible-backup", version:1, createdAt:new Date().toISOString(), reader:backupReader(state), personal:personal || null});
}
function backupCounts(backup) {
  const r = backup.reader, p = backup.personal;
  return `${r.bookmarks.length} bookmarks · ${Object.keys(r.highlights).length} highlights · ${Object.keys(r.comments).length} comments · ${r.legacySaved.length} earlier saves · ${Object.keys(p?.notes || {}).length.toLocaleString()} study notes · ${Object.keys(p?.introductions || {}).length} introductions · ${p?.guides?.length || 0} guides`;
}
async function exportBackup() {
  const button = $("exportBackup");
  if (button) button.disabled = true;
  try {
    const data = await createBackup();
    const blob = new Blob([JSON.stringify(data)], {type:"application/json"});
    const filename = `reader-backup-${new Date().toISOString().slice(0,10)}.json`;
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    await studyTransaction({lastExport: new Date().toISOString()});
    notify("Backup prepared. Keep the downloaded file in Files or iCloud Drive.");
  } catch (error) { notify(error.message || "Could not prepare your backup."); }
  finally { if (button) button.disabled = false; }
}
function renderRestoredReader(reader, personal) {
  personalNotesRevision++;
  // Replace the state, including empty collections, without retaining stale fields.
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, reader);
  returnPlace = null; wisdomTopic = null; selectedPrayer = null;
  $("returnReading").hidden = true;
  applyPersonalNotes(personal);
  applyAppearance(); selectTab(state.tab);
  if (state.tab === "bible") renderChapter(state.scroll);
  else if (state.tab === "wisdom") renderWisdom();
  else if (state.tab === "prayers") renderPrayers();
  else if (state.tab === "library") renderLibrary();
  else renderSaved();
}
async function restoreBackup(data) {
  if (persistenceBusy) throw new Error("Wait for the current save to finish.");
  const backup = validateBackup(data);
  persistenceBusy = true;
  const appSurface = document.querySelector(".app");
  const appWasInert = appSurface.inert, dialogWasInert = dialog.inert;
  appSurface.inert = true; dialog.inert = true;
  cancelBackSlide();
  try {
    const previous = await createBackup();
    const reader = {...backup.reader, savedAt:Math.max(Date.now(), (Number(state.savedAt) || 0) + 1)};
    // The replacement and its undo copy commit together or not at all.
    await studyTransaction({readerState:reader, notes:backup.personal, restoreRecovery:previous});
    try { localStorage.setItem("obible3", JSON.stringify(reader)); } catch {}
    renderRestoredReader(reader, backup.personal);
    return reader;
  } finally { persistenceBusy = false; appSurface.inert = appWasInert; dialog.inert = dialogWasInert; if (typeof queueCloudSync === "function") queueCloudSync(); }
}
async function previewRestoreFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 40 * 1024 * 1024) throw new Error("Choose a backup smaller than 40 MB.");
    showRestorePreview(validateBackup(JSON.parse(await file.text())));
  } catch (error) { notify(error instanceof SyntaxError ? "That file is not valid JSON." : error.message); }
}
function showRestorePreview(backup, undo = false) {
  const parent = captureSwipeView(dialog);
  const settingsSnapshot = dialogBackSnapshot;
  const back = () => showStorage(settingsSnapshot);
  openDialog(undo ? "Undo the last restore" : "Restore your Bible", `<button class="text-button" id="storageBack">‹ Storage & backup</button><p>${esc(backupCounts(backup))}</p><p>Reading position: ${esc(refLabel(backup.reader.book,backup.reader.chapter))}</p><p class="helper">This replaces this device’s saved data, settings, and imported study material. Your current data will be kept as an undo copy. Cloud connections are not included.</p><button class="primary" id="confirmRestore">${undo ? "Undo restore" : "Restore this backup"}</button><p class="helper" id="restoreResult" role="status"></p>`);
  dialogBack = back; dialogBackSnapshot = parent;
  $("storageBack").onclick = back;
  $("confirmRestore").onclick = async () => {
    $("confirmRestore").disabled = true;
    try { await restoreBackup(backup); back(); notify("Your Bible data has been restored."); }
    catch (error) { const result = $("restoreResult"); if (result) result.textContent = error.message; if ($("confirmRestore")) $("confirmRestore").disabled = false; }
  };
}
function storageMessage(type) {
  return new Promise(async (resolve, reject) => {
    if (!("serviceWorker" in navigator)) { reject(new Error("Offline storage is unavailable in this browser.")); return; }
    let registration;
    try { registration = await navigator.serviceWorker.getRegistration(); } catch (error) { reject(error); return; }
    const worker = registration?.active;
    if (!worker) { reject(new Error("Offline files are still installing. Reconnect and check again.")); return; }
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("The offline check timed out. Reload the app and check again.")); }, type === "ORTHOBIBLE_REPAIR_CACHE" ? 60000 : 5000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data); };
    worker.postMessage({type}, [channel.port2]);
  });
}
async function updateStorageStatus() {
  const host = $("storageStatus"); if (!host) return;
  host.textContent = "Checking device storage…";
  const [offline, protectedStorage, space, notes, lastExport, recovery] = await Promise.allSettled([
    storageMessage("ORTHOBIBLE_STORAGE_STATUS"), navigator.storage?.persisted?.(), navigator.storage?.estimate?.(),
    studyRead("notes"), studyRead("lastExport"), studyRead("restoreRecovery")
  ]);
  if (!host.isConnected) return;
  const status = offline.status === "fulfilled" ? offline.value : null;
  const offlineText = status ? status.missing.length ? `${status.cached} of ${status.total} files saved. Connect to the internet and repair the offline download.` : "Bible and app files are ready for offline reading." : offline.reason.message;
  const protectionText = protectedStorage.status === "fulfilled" && protectedStorage.value === true ? "Storage protection granted. Keep a backup for device loss or manually cleared data." : "Storage protection is not confirmed. Keep a backup outside this browser.";
  const mb = bytes => (bytes / 1024 / 1024).toFixed(1);
  host.innerHTML = `<p>${esc(offlineText)}</p><p>${esc(protectionText)}</p><p>${notes.status === "fulfilled" ? `${Object.keys(notes.value?.notes || {}).length.toLocaleString()} imported study notes saved on this device.` : "Personal storage could not be read. Try again before making a backup."}</p>${space.status === "fulfilled" && space.value ? `<p class="helper">Browser storage used: ${mb(space.value.usage || 0)} MB.</p>` : ""}${lastExport.status === "fulfilled" && lastExport.value ? `<p class="helper">Last backup prepared: ${esc(new Date(lastExport.value).toLocaleString())}. Check that you saved the downloaded file.</p>` : '<p class="helper">No backup has been exported from this device yet.</p>'}`;
  const undo = $("undoRestore"); if (undo) undo.hidden = !(recovery.status === "fulfilled" && recovery.value);
}
function showStorage(settingsSnapshot) {
  const parent = settingsSnapshot?.clone ? settingsSnapshot : captureSwipeView(dialog);
  openDialog("Storage & backup", `<button class="text-button" id="storageBack">‹ Reading settings</button><div id="storageStatus" role="status" aria-live="polite"></div><div class="storage-actions"><button class="secondary" id="protectStorage">Protect device storage</button><button class="secondary" id="repairOffline">Repair offline download</button><button class="text-button" id="refreshStorage">Check again</button></div><h3 class="section-label">Your backup</h3><p class="helper">Includes your reading position, bookmarks, highlights, comments, settings, and imported OSB material. Save the file in Files or iCloud Drive to keep a copy outside this browser. For PDF and EPUB books, saved passages, and reflections, use the complete Reader ZIP backup.</p><button class="primary" data-library-backup="true">Complete backup with Library ›</button><button class="secondary" id="exportBackup">Back up my Bible only</button><label class="text-button" for="restoreBackupFile">Choose a backup to restore</label><input id="restoreBackupFile" type="file" accept=".json,application/json"><button class="text-button" id="undoRestore" hidden>Undo the last restore</button>`);
  dialogBack = showSettings; dialogBackSnapshot = parent;
  $("storageBack").onclick = showSettings;
  $("exportBackup").onclick = exportBackup;
  $("restoreBackupFile").onchange = previewRestoreFile;
  $("refreshStorage").onclick = updateStorageStatus;
  $("protectStorage").onclick = async event => {
    event.target.disabled = true;
    try { if (navigator.storage?.persist) await navigator.storage.persist(); else notify("Storage protection is unavailable in this browser."); }
    catch { notify("The browser could not grant storage protection."); }
    finally { event.target.disabled = false; updateStorageStatus(); }
  };
  $("repairOffline").onclick = async event => {
    event.target.disabled = true;
    try { await storageMessage("ORTHOBIBLE_REPAIR_CACHE"); notify("Offline download checked."); }
    catch (error) { notify(error.message); }
    finally { event.target.disabled = false; updateStorageStatus(); }
  };
  $("undoRestore").onclick = async () => {
    try { const backup = await studyRead("restoreRecovery"); if (backup) showRestorePreview(validateBackup(backup), true); }
    catch (error) { notify(error.message); }
  };
  updateStorageStatus();
}
