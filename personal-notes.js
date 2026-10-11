// Personal notes stay in this browser's IndexedDB, separate from app cache updates.
const builtInStudy = {notes: window.STUDY.notes, preambles: {...window.STUDY.preambles}};
let personalNotesCount = 0;
let personalNotesRevision = 0;
let personalGuides = [], personalIntroductions = {};
let personalAlignment = null;
function validatePersonalNotes(data) {
  if (!data || typeof data.notes !== "object" || !data.notes || Array.isArray(data.notes))
    throw new Error("Choose a valid study-notes JSON file.");
  const notes = {}, preambles = {};
  for (const [key, note] of Object.entries(data.notes)) {
    const match = key.match(/^([A-Z0-9]{3}):(\d+):(\d+)$/);
    if (!match || ![...window.BIBLE.books, ...(window.LEGACY_WEB?.books || [])].some((b) => b.id === match[1]) ||
        +match[2] < 1 || +match[3] < 1 || !note || typeof note.body !== "string")
      throw new Error("The notes file contains an invalid verse reference or note.");
    notes[key] = {
      kind: typeof note.kind === "string" ? note.kind : "note",
      title: typeof note.title === "string" ? note.title : "",
      body: note.body,
      see: Array.isArray(note.see) ? note.see.filter((v) => typeof v === "string" && /^[A-Z0-9]{3}:\d+:\d+$/.test(v)) : [],
    };
  }
  if (!Object.keys(notes).length) throw new Error("This file has no study notes.");
  for (const [key, intro] of Object.entries(data.preambles || {})) {
    if (![...window.BIBLE.books, ...(window.LEGACY_WEB?.books || [])].some((b) => b.id === key) || !intro || typeof intro !== "object") continue;
    preambles[key] = Object.fromEntries(
      ["author", "date", "theme", "body", "outline"].map((name) => [name, typeof intro[name] === "string" ? intro[name] : ""]),
    );
  }
  const guides = Array.isArray(data.guides) ? data.guides.map(validateStudyArticle) : [];
  const introductions = {};
  for (const [id, article] of Object.entries(data.introductions || {})) {
    if (window.BIBLE.books.some(b => b.id === id)) introductions[id] = validateStudyArticle(article);
  }
  const sourceNotes = {};
  for (const [key,note] of Object.entries(data.sourceNotes || {})) {
    if (!/^[A-Z0-9]{3}:\d+:\d+$/.test(key) || !note || typeof note.body !== "string") throw new Error("Invalid OSB source note.");
    sourceNotes[key] = {kind:"OSB source note", title:typeof note.title === "string" ? note.title : key, body:note.body,
      sourceVerse:typeof note.sourceVerse === "string" ? note.sourceVerse : "", see:Array.isArray(note.see) ? note.see.filter(k => typeof k === "string" && /^[A-Z0-9]{3}:\d+:\d+$/.test(k)) : []};
  }
  const alignment = typeof validateNoteAlignment === "function" ? validateNoteAlignment(data.alignment,sourceNotes) : null;
  return { notes, preambles, guides, introductions, sourceNotes, alignment };
}
function personalNotesStore(mode, value) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("orthobible-personal", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("study");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("study", mode);
      const store = tx.objectStore("study");
      const operation = mode === "readwrite" ? store.put(value, "notes") : store.get("notes");
      tx.oncomplete = () => { db.close(); resolve(operation.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not store notes.")); };
    };
  });
}
function applyPersonalNotes(data) {
  const imported = !!data;
  data = data || {notes: builtInStudy.notes, preambles: {}};
  window.STUDY.notes = data.notes;
  window.STUDY.preambles = { ...builtInStudy.preambles, ...data.preambles };
  personalNotesCount = imported ? Object.keys(data.notes).length : 0;
  if (typeof applyNoteAlignment === "function") applyNoteAlignment(imported ? data : null);
  personalGuides = data.guides || [];
  personalIntroductions = data.introductions || {};
  const top = pane.scrollTop;
  if (state.tab === "bible") renderChapter(state.scroll);
  else if (state.tab === "wisdom") renderWisdom();
  else if (state.tab === "library") renderLibrary();
  pane.scrollTop = top;
}
async function restorePersonalNotes() {
  const revision = personalNotesRevision;
  try {
    const data = await personalNotesStore("readonly");
    if (data && revision === personalNotesRevision) applyPersonalNotes(validatePersonalNotes(data));
  } catch {
    // Built-in notes remain usable when IndexedDB is unavailable.
  }
}
async function importPersonalNotes(event) {
  const input = event.target, file = input.files?.[0];
  if (!file) return;
  if (typeof persistenceBusy !== "undefined" && persistenceBusy) { notify("Wait for the restore to finish before importing notes."); return; }
  input.disabled = true;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("Choose a study-notes file smaller than 20 MB.");
    const data = validatePersonalNotes(JSON.parse(await file.text()));
    await personalNotesStore("readwrite", data);
    personalNotesRevision++;
    applyPersonalNotes(data);
    const status = document.getElementById("personalNotesStatus");
    if (status) showSettings();
    navigator.storage?.persist?.().catch(() => {});
    notify("Study notes saved for offline reading.");
    if (typeof queueCloudSync === "function") queueCloudSync();
  } catch (error) {
    notify(error instanceof SyntaxError ? "Choose a valid study-notes JSON file." : error.message || "Could not save notes. Check available storage and try again.");
  } finally {
    input.disabled = false;
    input.value = "";
  }
}

// Import structured text only: source markup never becomes executable HTML.
function validateStudyArticle(article) {
  if (!article || typeof article.title !== "string" || !Array.isArray(article.blocks) || !article.blocks.length)
    throw new Error("The study file contains an invalid introduction or guide.");
  const blocks = article.blocks.map(block => {
    if (block.type === "table" && Array.isArray(block.rows) && block.rows.every(row => Array.isArray(row) && row.every(cell => typeof cell === "string")))
      return { type: "table", rows: block.rows };
    if (!["heading", "paragraph"].includes(block.type) || typeof block.text !== "string")
      throw new Error("The study file contains an invalid text section.");
    return { type: block.type, text: block.text };
  });
  return { title: article.title, blocks };
}
function studyArticleHtml(article) {
  return article.blocks.map(block => block.type === "table"
    ? `<div class="context-table"><table>${block.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</table></div>`
    : block.type === "heading" ? `<h3>${esc(block.text)}</h3>` : `<p>${esc(block.text)}</p>`).join("");
}
function personalContextStatus() {
  const linked = Object.keys(personalAlignment?.notes || {}).length;
  const source = Object.keys(personalSourceNotes).length;
  return personalNotesCount ? `${personalNotesCount.toLocaleString()} earlier notes, ${Object.keys(personalIntroductions).length} book introductions, and ${personalGuides.length} guides stored on this device.${source ? ` ${linked.toLocaleString()} of ${source.toLocaleString()} source notes have verse links; all remain available in the notes browser.` : ''}`
    : "Import your OSB study file for offline notes, book introductions, and reading guides.";
}
function showContextLibrary(settingsSnapshot) {
  const parentView = settingsSnapshot || captureSwipeView(dialog);
  openDialog("OSB reading context", `<button class="text-button" id="contextBack">‹ Reading settings</button><p class="helper">From your personal Orthodox Study Bible copy. References follow the OSB edition.</p><h3 class="section-label">Reading guides</h3><div class="context-list">${personalGuides.map((g, i) => `<button class="topic" data-context-guide="${i}" data-context-parent="library"><span>${esc(g.title)}</span>${icon("right")}</button>`).join("") || '<p class="helper">Import the updated study file to add the OSB guides.</p>'}</div><h3 class="section-label">Book introductions</h3><div class="context-list">${window.BIBLE.books.filter(b => personalIntroductions[b.id]).map(b => `<button class="topic" data-context-intro="${b.id}" data-context-parent="library"><span>${esc(displayName(b.id))}</span>${icon("right")}</button>`).join("")}</div>`);
  dialogBack = showSettings;
  dialogBackSnapshot = parentView;
  $("contextBack").onclick = showSettings;
}
function showStudyContext(kind, id, parent) {
  const article = kind === "guide" ? personalGuides[Number(id)] : personalIntroductions[id];
  if (!article) return;
  const origin = captureDialogReturn();
  const back = origin?.show || closeDialog;
  openDialog(article.title, `<article class="essay osb-context"><button class="text-button" id="contextBack">‹ ${esc(origin?.title || (state.tab === "library" ? "Library" : "Back to reading"))}</button><p class="eyebrow">Orthodox Study Bible · personal copy</p>${studyArticleHtml(article)}</article>`);
  dialogBack = origin ? back : null;
  dialogBackSnapshot = origin?.snapshot || null;
  $("contextBack").onclick = back;
}
