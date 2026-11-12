// Study material from the encrypted OSB pack: notes on their verses, introductions, guides, and study articles.
const builtInStudy = {notes: window.STUDY.notes, preambles: {...window.STUDY.preambles}};
let personalNotesCount = 0;
let personalGuides = [], personalIntroductions = {}, personalTextNotes = {};
let personalAlignment = null;
function validatePersonalNotes(data) {
  if (!data || typeof data.notes !== "object" || !data.notes || Array.isArray(data.notes))
    throw new Error("Choose a valid study-notes JSON file.");
  const notes = {}, preambles = {};
  for (const [key, note] of Object.entries(data.notes)) {
    const match = key.match(/^([A-Z0-9]{3}):(\d+):(\d+)$/);
    if (!match || !window.BIBLE.books.some((b) => b.id === match[1]) ||
        +match[2] < 1 || +match[3] < 1 || !note || typeof note.body !== "string")
      throw new Error("The notes file contains an invalid verse reference or note.");
    notes[key] = {
      kind: typeof note.kind === "string" ? note.kind : "note",
      title: typeof note.title === "string" ? note.title : "",
      body: note.body,
      see: Array.isArray(note.see) ? note.see.filter((v) => typeof v === "string" && /^[A-Z0-9]{3}:\d+:\d+$/.test(v)) : [],
    };
  }
  for (const [key, intro] of Object.entries(data.preambles || {})) {
    if (!window.BIBLE.books.some((b) => b.id === key) || !intro || typeof intro !== "object") continue;
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
  if (!Object.keys(sourceNotes).length || !alignment) throw new Error("The study pack has no notes.");
  // The translators' footnotes of the New Testament: [[letter, text], ...] on the verse that carries the letters.
  const textNotes = {};
  for (const [key, list] of Object.entries(data.textNotes || {})) {
    const m = key.match(/^([A-Z0-9]{3}):(\d+):(\d+)$/);
    if (!m || !validVerse(m[1], +m[2], +m[3]) || !Array.isArray(list) || !list.every((n) => Array.isArray(n) && /^[a-z]{1,2}$/.test(n[0]) && typeof n[1] === "string"))
      throw new Error("The study pack contains an invalid translators' note.");
    textNotes[key] = list.map(([letter, text]) => [letter, text]);
  }
  return { notes, preambles, guides, introductions, sourceNotes, alignment, textNotes };
}
function applyPersonalNotes(data) {
  const imported = !!data;
  data = data || {notes: builtInStudy.notes, preambles: {}};
  window.STUDY.notes = data.notes;
  window.STUDY.preambles = { ...builtInStudy.preambles, ...data.preambles };
  personalNotesCount = imported ? Object.keys(data.sourceNotes || {}).length : 0;
  if (typeof applyNoteAlignment === "function") applyNoteAlignment(imported ? data : null);
  personalGuides = data.guides || [];
  personalIntroductions = data.introductions || {};
  personalTextNotes = data.textNotes || {};
  const top = pane.scrollTop;
  if (state.tab === "bible") renderChapter(state.scroll);
  else if (state.tab === "wisdom") renderWisdom();
  else if (state.tab === "library") renderLibrary();
  pane.scrollTop = top;
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
  // group: "Study articles" marks the OSB's in-text articles; after: the verse each one follows in the text.
  return { title: article.title, blocks, ...(typeof article.group === "string" ? { group: article.group } : {}),
    ...(typeof article.after === "string" && /^[A-Z0-9]{3}:\d+:\d+$/.test(article.after) ? { after: article.after } : {}) };
}
function studyArticleHtml(article) {
  return article.blocks.map(block => block.type === "table"
    ? `<div class="context-table"><table>${block.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</table></div>`
    : block.type === "heading" ? `<h3>${esc(block.text)}</h3>` : `<p>${esc(block.text)}</p>`).join("");
}
function contextListHtml(items) {
  return `<div class="context-list">${items.map(([attr, title]) => `<button class="topic" ${attr} data-context-parent="library"><span>${esc(title)}</span>${icon("right")}</button>`).join("")}</div>`;
}
function showContextLibrary(settingsSnapshot) {
  // From Library this opens on its own; from Reading settings it keeps a way back.
  const fromSettings = !!settingsSnapshot || dialog.open;
  const parentView = settingsSnapshot || (fromSettings ? captureSwipeView(dialog) : null);
  const guides = personalGuides.map((g, i) => [i, g]);
  const list = (group) => contextListHtml(guides.filter(([, g]) => (g.group || "") === group).map(([i, g]) => [`data-context-guide="${i}"`, g.title]));
  openDialog("Orthodox Study Bible", `${fromSettings ? '<button class="text-button" id="contextBack">‹ Reading settings</button>' : ""}<h3 class="section-label">Reading guides</h3>${list("")}<h3 class="section-label">Study articles</h3>${list("Study articles")}<h3 class="section-label">Book introductions</h3>${contextListHtml(window.BIBLE.books.filter(b => personalIntroductions[b.id]).map(b => [`data-context-intro="${b.id}"`, displayName(b.id)]))}`);
  if (fromSettings) { dialogBack = showSettings; dialogBackSnapshot = parentView; $("contextBack").onclick = showSettings; }
}
// The OSB's study articles that sit in this chapter of the printed text.
function chapterArticles(book, chapter) {
  const prefix = `${book}:${chapter}:`;
  return personalGuides.map((g, i) => [i, g]).filter(([, g]) => g.after?.startsWith(prefix));
}
function showStudyContext(kind, id, parent) {
  const article = kind === "guide" ? personalGuides[Number(id)] : personalIntroductions[id];
  if (!article) return;
  const origin = captureDialogReturn();
  const back = origin?.show || closeDialog;
  openDialog(article.title, `<article class="essay osb-context"><button class="text-button" id="contextBack">‹ ${esc(origin?.title || (state.tab === "library" ? "Library" : "Back to reading"))}</button><p class="eyebrow">Orthodox Study Bible</p>${studyArticleHtml(article)}</article>`);
  dialogBack = origin ? back : null;
  dialogBackSnapshot = origin?.snapshot || null;
  $("contextBack").onclick = back;
}
