"use strict";
const GROUPS = [
  { label: "The Law", ids: ["GEN", "EXO", "LEV", "NUM", "DEU"] },
  {
    label: "Historical books",
    ids: [
      "JOS",
      "JDG",
      "RUT",
      "1SA",
      "2SA",
      "1KI",
      "2KI",
      "1CH",
      "2CH",
      "1ES",
      "EZR",
      "NEH",
      "TOB",
      "JDT",
      "EST",
      "1MA",
      "2MA",
      "3MA",
    ],
  },
  {
    label: "Wisdom books",
    ids: ["PSA", "PS2", "JOB", "PRO", "ECC", "SNG", "WIS", "SIR"],
  },
  {
    label: "The Prophets",
    ids: [
      "HOS",
      "AMO",
      "MIC",
      "JOL",
      "OBA",
      "JON",
      "NAM",
      "HAB",
      "ZEP",
      "HAG",
      "ZEC",
      "MAL",
      "ISA",
      "JER",
      "BAR",
      "LAM",
      "EZK",
      "DAN",
      "LJE",
      "S3Y",
      "SUS",
      "BEL",
    ],
  },
  { label: "Appendix", ids: ["MAN", "4MA"] },
  { label: "Holy Gospels", ids: ["MAT", "MRK", "LUK", "JHN"] },
  { label: "Acts", ids: ["ACT"] },
  {
    label: "Pauline epistles",
    ids: [
      "ROM",
      "1CO",
      "2CO",
      "GAL",
      "EPH",
      "PHP",
      "COL",
      "1TH",
      "2TH",
      "1TI",
      "2TI",
      "TIT",
      "PHM",
      "HEB",
    ],
  },
  {
    label: "Catholic epistles",
    ids: ["JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD"],
  },
  { label: "Revelation", ids: ["REV"] },
];
const OSB_NAME = {
  "1SA": "1 Kingdoms",
  "2SA": "2 Kingdoms",
  "1KI": "3 Kingdoms",
  "2KI": "4 Kingdoms",
  EZR: "1 Ezra (Ezra)",
  NEH: "2 Ezra (Nehemiah)",
  "1ES": "1 Esdras",
  "2ES": "2 Esdras",
  EST: "Esther",
  ESG: "Esther (LXX)",
  SNG: "Song of Songs",
  WIS: "Wisdom of Solomon",
  SIR: "Wisdom of Sirach",
  BAR: "Baruch",
  PS2: "Psalm 151",
  MAN: "Prayer of Manasseh",
  DAG: "Daniel (LXX additions)",
  "1MA": "1 Maccabees",
  "2MA": "2 Maccabees",
  "3MA": "3 Maccabees",
  "4MA": "4 Maccabees",
};

const ALIASES = {
  genesis: "GEN",
  exodus: "EXO",
  exo: "EXO",
  leviticus: "LEV",
  lev: "LEV",
  numbers: "NUM",
  num: "NUM",
  deuteronomy: "DEU",
  deut: "DEU",
  joshua: "JOS",
  josh: "JOS",
  judges: "JDG",
  ruth: "RUT",
  "1samuel": "1SA",
  "1sam": "1SA",
  "1sa": "1SA",
  "1kingdoms": "1SA",
  "2samuel": "2SA",
  "2sam": "2SA",
  "2kingdoms": "2SA",
  "1kings": "1KI",
  "3kingdoms": "1KI",
  "2kings": "2KI",
  "4kingdoms": "2KI",
  "1chronicles": "1CH",
  "1chr": "1CH",
  "2chronicles": "2CH",
  ezra: "EZR",
  nehemiah: "NEH",
  neh: "NEH",
  esther: "EST",
  job: "JOB",
  psalm: "PSA",
  psalms: "PSA",
  ps: "PSA",
  proverbs: "PRO",
  pro: "PRO",
  ecclesiastes: "ECC",
  song: "SNG",
  songofsongs: "SNG",
  songofsolomon: "SNG",
  isaiah: "ISA",
  isa: "ISA",
  jeremiah: "JER",
  jer: "JER",
  lamentations: "LAM",
  ezekiel: "EZK",
  eze: "EZK",
  daniel: "DAN",
  dan: "DAN",
  hosea: "HOS",
  joel: "JOL",
  amos: "AMO",
  obadiah: "OBA",
  jonah: "JON",
  micah: "MIC",
  nahum: "NAM",
  habakkuk: "HAB",
  zephaniah: "ZEP",
  haggai: "HAG",
  zechariah: "ZEC",
  malachi: "MAL",
  matthew: "MAT",
  matt: "MAT",
  mat: "MAT",
  mark: "MRK",
  luke: "LUK",
  luk: "LUK",
  john: "JHN",
  acts: "ACT",
  romans: "ROM",
  rom: "ROM",
  "1corinthians": "1CO",
  "1cor": "1CO",
  "1co": "1CO",
  "2corinthians": "2CO",
  "2cor": "2CO",
  galatians: "GAL",
  ephesians: "EPH",
  philippians: "PHP",
  phil: "PHP",
  colossians: "COL",
  "1thessalonians": "1TH",
  "2thessalonians": "2TH",
  "1timothy": "1TI",
  "2timothy": "2TI",
  titus: "TIT",
  philemon: "PHM",
  hebrews: "HEB",
  heb: "HEB",
  james: "JAS",
  "1peter": "1PE",
  "2peter": "2PE",
  "1john": "1JN",
  "2john": "2JN",
  "3john": "3JN",
  jude: "JUD",
  revelation: "REV",
  rev: "REV",
  tobit: "TOB",
  judith: "JDT",
  wisdom: "WIS",
  sirach: "SIR",
  ecclesiasticus: "SIR",
  baruch: "BAR",
  "1maccabees": "1MA",
  "2maccabees": "2MA",
  "3maccabees": "3MA",
  "4maccabees": "4MA",
  "1esdras": "1ES",
  "2esdras": "2ES",
  manasseh: "MAN",
  psalm151: "PS2",
};
const $ = (id) => document.getElementById(id);
const pane = $("pane");
const dialog = $("dialog");
const icons = {
  prayer: '<path d="M12 3v18M6 8h12"/>',
  chapters:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M7 8h4M7 12h4M7 16h4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  book: '<path d="M12 5v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2z"/>',
  library: '<path d="M4 4v16h4V4zM10 4v16h4V4zM17 4l4 15-4 1-4-15z"/>',
  settings:
    '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  compass:
    '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  note: '<path d="M20 13v7H4V4h7m3 0 3-3 6 6-3 3-6-6Zm0 0-6 6-1 7 7-1 6-6"/>',
};
function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ""}</svg>`;
}
document
  .querySelectorAll("[data-icon]")
  .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const state = {
  tab: "bible",
  book: "JHN",
  chapter: 1,
  font: 20,
  scroll: 0,
  bookmarks: [],
  highlights: {},
  comments: {},
  showNotes: true,
  showPreamble: true,
  theme: "light",
  fontFamily: "serif", lineSpacing: 1.85, paper: "original", history: [], readingPlan: null,
};
let savedFilter = "all",
  wisdomTopic = null,
  returnPlace = null,
  saveTimer,
  toastTimer,
  searchGeneration = 0,
  storageWarned = false;
function bookMeta(id) {
  return window.BIBLE.books.find((b) => b.id === id);
}
function displayName(id) {
  return OSB_NAME[id] || bookMeta(id)?.name || id;
}
function chapterText(book, ch) {
  return window.BIBLE.t[book]?.[ch - 1] || [];
}
function verseText(book, ch, v) {
  return chapterText(book, ch)[sourceVerseStart(book, ch, v)] || "";
}
function keyOf(book, ch, v) {
  return `${book}:${ch}:${v}`;
}
function refLabel(book, ch, v) {
  return `${displayName(book)}${book === "PS2" ? "" : " " + ch}${v ? ":" + v : ""}`;
}
function parseKey(key) {
  const [book, ch, v] = key.split(":");
  return { book, ch: +ch, v: +v };
}
function validVerse(book, ch, v) {
  return !!verseText(book, ch, v);
}
function bookmarked(book, ch, v) {
  return state.bookmarks.some(
    (b) => b.book === book && b.chapter === ch && b.verse === v,
  );
}
function noteAt(book, ch, v) {
  const sourceKey = typeof personalNotesByVerse !== "undefined" && personalNotesByVerse[keyOf(book,ch,v)]?.[0];
  if (sourceKey) return {...personalSourceNotes[sourceKey], sourceKey};
  if (typeof personalSourceNotes !== "undefined" && Object.keys(personalSourceNotes).length) return null;
  if (isSeptuagint(book)) return null;
  return window.STUDY?.notes?.[keyOf(book, ch, v)];
}
function notify(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3200);
}
function persist() {
  if (typeof persistenceBusy !== "undefined" && persistenceBusy) return;
  if (typeof recordHistory === "function" && state.tab === "bible") recordHistory();
  state.savedAt = Math.max(Date.now(), (Number(state.savedAt) || 0) + 1);
  try {
    localStorage.setItem("obible3", JSON.stringify(state));
  } catch {
    if (!storageWarned) {
      notify(
        "Your browser could not save changes. Storage may be full or disabled.",
      );
      storageWarned = true;
    }
  }
  if (typeof saveReaderCopy === "function") saveReaderCopy();
  if (typeof queueCloudSync === "function") queueCloudSync();
}
function loadPrefs(override) {
  try {
    const stored = override === undefined ? JSON.parse(localStorage.getItem("obible3") || "{}") : override;
    if (stored && typeof stored === "object") Object.assign(state, migrateEdition(stored));
  } catch {}
  if (!Array.isArray(state.legacySaved)) state.legacySaved = [];
  if (!bookMeta(state.book)) state.book = "JHN";
  if (
    !Number.isInteger(state.chapter) ||
    state.chapter < 1 ||
    state.chapter > bookMeta(state.book).n
  )
    state.chapter = 1;
  state.font = Math.min(28, Math.max(16, Number(state.font) || 20));
  state.scroll = Math.min(1, Math.max(0, Number(state.scroll) || 0));
  state.bookmarks = Array.isArray(state.bookmarks)
    ? state.bookmarks.filter((b) => b && validVerse(b.book, b.chapter, b.verse))
    : [];
  for (const name of ["highlights", "comments"]) {
    if (
      !state[name] ||
      typeof state[name] !== "object" ||
      Array.isArray(state[name])
    )
      state[name] = {};
    for (const [key, value] of Object.entries(state[name])) {
      const p = parseKey(key);
      if (
        !validVerse(p.book, p.ch, p.v) ||
        typeof value !== "string" ||
        (name === "highlights" && !["gold", "paper", "rose"].includes(value))
      )
        delete state[name][key];
    }
  }
  if (["bookmarks", "marks"].includes(state.tab)) state.tab = "saved";
  if (!["bible", "wisdom", "prayers", "library", "saved"].includes(state.tab))
    state.tab = "bible";
  state.theme = state.theme === "dark" ? "dark" : "light";
  if (typeof normalizeReaderTools === "function") normalizeReaderTools(state);
  applyAppearance();
  persist();
}
function applyAppearance() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.setProperty("--fs", state.font + "px");
  if (typeof applyReaderToolsAppearance === "function") applyReaderToolsAppearance();
}
function rememberScroll() {
  if (state.tab === "bible") {
    const max = pane.scrollHeight - pane.clientHeight;
    state.scroll = max > 0 ? pane.scrollTop / max : 0;
  }
}
function selectTab(tab) {
  state.tab = tab;
  $("chapterBar").hidden = tab !== "bible";
  $("chapterTools").hidden = tab !== "bible";
  document.querySelectorAll("[data-tab]").forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}
function openTab(tab) {
  if (typeof setFocusReading === "function") setFocusReading(false);
  cancelBackSlide();
  wisdomTopic = null;
  wisdomListTop = 0;
  selectedPrayer = null;
  prayerListTop = 0;
  savedFilter = "all";
  rememberScroll();
  closeDialog();
  returnPlace = null;
  $("returnReading").hidden = true;
  selectTab(tab);
  if (tab === "bible") renderChapter(state.scroll);
  else if (tab === "wisdom") renderWisdom();
  else if (tab === "prayers") renderPrayers();
  else if (tab === "library") renderLibrary();
  else renderSaved();
  persist();
}
function goChapter(book, ch, verse = null) {
  cancelBackSlide();
  if (!bookMeta(book) || ch < 1 || ch > bookMeta(book).n) return;
  rememberScroll();
  if (typeof recordHistory === "function") recordHistory();
  state.book = book;
  state.chapter = ch;
  state.scroll = 0;
  returnPlace = null;
  $("returnReading").hidden = true;
  selectTab("bible");
  closeDialog();
  renderChapter(0);
  persist();
  if (verse) verse = sourceVerseStart(book, ch, verse);
  if (verse)
    requestAnimationFrame(() =>
      pane
        .querySelector(`[data-verse="${verse}"]`)
        ?.scrollIntoView({ block: "center" }),
    );
}
function bookOrder() {
  return GROUPS.flatMap((g) => g.ids).filter((id) => bookMeta(id));
}
function adjacent(direction) {
  const { book, chapter } = state;
  const n = chapter + direction;
  if (n >= 1 && n <= bookMeta(book).n) return { book, ch: n };
  const order = bookOrder(),
    id = order[order.indexOf(book) + direction];
  return id ? { book: id, ch: direction === 1 ? 1 : bookMeta(id).n } : null;
}
function nextChapter(direction) {
  const next = adjacent(direction);
  if (next) goChapter(next.book, next.ch);
}
function verseHtml(book, ch, v) {
  v = sourceVerseStart(book, ch, v);
  const text = verseText(book, ch, v);
  if (!text) return "";
  const key = keyOf(book, ch, v),
    color = state.highlights[key],
    bm = bookmarked(book, ch, v),
    note = state.showNotes && noteAt(book, ch, v);
  return `<div class="verse${color ? " hl-" + color : ""}${bm ? " bookmarked" : ""}" data-key="${key}" data-verse="${v}"><button class="verse-number" data-action="verse" data-key="${key}" aria-label="Actions for ${esc(refLabel(book, ch, v))}${bm ? ", bookmarked" : ""}${color ? ", highlighted" : ""}" title="Save, highlight, or comment">${sourceVerseLabel(book, ch, v)}</button><span>${esc(text)}</span>${note ? `<button class="note-link" data-action="note" data-key="${key}" aria-label="Study note for verse ${v}">Note</button>` : ""}${state.comments[key] ? `<button class="note-link" data-action="verse" data-key="${key}" aria-label="Your comment on verse ${v}">Comment</button>` : ""}</div>`;
}
function rangeHtml(
  book,
  ch,
  start = 1,
  end = chapterText(book, ch).length - 1,
) {
  let html = "";
  const seen = new Set();
  for (let v = start; v <= Math.min(end, chapterText(book, ch).length - 1); v++) {
    const first = sourceVerseStart(book, ch, v);
    if (!seen.has(first)) html += verseHtml(book, ch, first);
    seen.add(first);
  }
  return html;
}
function notesHtml() {
  if (!state.showNotes) return "";
  if (typeof personalSourceNotes !== "undefined" && Object.keys(personalSourceNotes).length) return alignedChapterNotesHtml();
  if (isSeptuagint(state.book)) return legacyStudyNotesHtml(state.book);
  const entries = Object.entries(window.STUDY?.notes || {})
    .filter(([k]) => k.startsWith(`${state.book}:${state.chapter}:`))
    .sort((a, b) => parseKey(a[0]).v - parseKey(b[0]).v);
  if (!entries.length) return "";
  return `<section class="footnotes"><h2 class="section-label">${personalNotesCount ? "Orthodox Study Bible · personal notes" : "Study notes"}</h2>${entries
    .map(
      ([key, n]) =>
        `<article class="footnote" id="note-${key}"><small>Verse ${parseKey(key).v} · ${esc(n.kind || "Note")}</small><h3>${esc(n.title || "")}</h3><p>${esc(n.body)}</p>${(
          n.see || []
        )
          .map((k) => {
            const p = parseKey(k);
            if (isSeptuagint(p.book) || window.LEGACY_WEB?.t[p.book]) return `<span class="helper">Original reference: ${esc(originalBookName(p.book))} ${p.ch}:${p.v} (previous numbering)</span>`;
            return `<button class="text-button" data-action="jump" data-key="${k}">${esc(refLabel(p.book, p.ch, p.v))}</button>`;
          })
          .join("")}</article>`,
    )
    .join("")}</section>`;
}
function renderChapter(scroll = 0) {
  cancelBackSlide();
  $("reference").textContent = refLabel(state.book, state.chapter);
  $("previous").disabled = !adjacent(-1);
  $("next").disabled = !adjacent(1);
  const p = window.STUDY?.preambles?.[state.book];
  const intro =
    personalIntroductions[state.book] && state.showPreamble
      ? `<div class="introduction"><button class="text-button" data-context-intro="${state.book}">Read the OSB introduction to ${esc(displayName(state.book))} ›</button></div>`
      : p && state.showPreamble
      ? `<details class="introduction"><summary>About ${esc(displayName(state.book))}</summary><p>${esc(p.body)}</p><p><strong>Author.</strong> ${esc(p.author)}<br><strong>Setting.</strong> ${esc(p.date)}<br><strong>Theme.</strong> ${esc(p.theme)}</p><p>${esc(p.outline)}</p></details>`
      : "";
  pane.innerHTML = `<div class="content"><p class="eyebrow">${esc(displayName(state.book))}</p><div class="chapter-heading"><h1>${state.book === "PS2" ? "Psalm 151" : "Chapter " + state.chapter}</h1><span>Tap a verse number to save</span></div><p class="translation-label">${isSeptuagint(state.book) ? "Septuagint · LXX2012" : "World English Bible · New Testament"}</p>${intro}<article class="verses">${rangeHtml(state.book, state.chapter)}</article><div class="chapter-end"><button class="secondary" data-direction="-1" ${!adjacent(-1) ? "disabled" : ""}>Previous</button><button class="secondary" data-direction="1" ${!adjacent(1) ? "disabled" : ""}>Next chapter</button></div>${notesHtml()}</div>`;
  pane.scrollTop = scroll * (pane.scrollHeight - pane.clientHeight);
}
let wisdomListTop = 0;
function returnToTopics() {
  wisdomTopic = null;
  renderWisdom();
  pane.scrollTop = wisdomListTop;
}
function renderWisdom() {
  cancelBackSlide();
  if (!wisdomTopic) {
    pane.innerHTML = `<div class="content"><p class="eyebrow">Scripture for everyday life</p><h1>Wisdom</h1><p class="subtitle">Find a passage for what’s on your mind.</p>${window.WISDOM.categories.map((c) => `<h2 class="section-label">${esc(c.label)}</h2><div class="topic-grid">${c.topics.map((t) => `<button class="topic" data-topic="${t.id}">${esc(t.title)}${icon("right")}</button>`).join("")}</div>`).join("")}</div>`;
  } else {
    const t = wisdomTopic;
    pane.innerHTML = `<div class="content"><button class="text-button" id="allTopics">‹ All topics</button><h1>${esc(t.title)}</h1><p class="subtitle">${esc(t.line)}</p>${t.refs.map(([b, c, v, end = v]) => `<section class="passage"><div class="passage-head"><span>${esc(refLabel(b, c, v))}${end !== v ? "–" + end : ""}</span><button class="text-button" data-action="jump" data-key="${keyOf(b, c, v)}">Read chapter ›</button></div><article class="verses">${rangeHtml(b, c, v, end)}</article></section>`).join("")}</div>`;
    $("allTopics").onclick = returnToTopics;
  }
  pane.scrollTop = 0;
}
let selectedPrayer = null;
let prayerListTop = 0;
function renderPrayers() {
  cancelBackSlide();
  const prayer = window.PRAYERS.find((p) => p.id === selectedPrayer);
  if (!prayer) {
    pane.innerHTML = `<div class="content"><p class="eyebrow">Daily prayer</p><h1>Prayer Book</h1><p class="subtitle">A collection of prayers to return to each day.</p><div class="prayer-list">${window.PRAYERS.map((p) => `<button class="topic" data-prayer="${p.id}"><span>${esc(p.title)}</span>${icon("right")}</button>`).join("")}</div></div>`;
    pane.scrollTop = prayerListTop;
    return;
  }
  const text = prayer.book
    ? chapterText(prayer.book, prayer.chapter)
        .slice(1)
        .filter(Boolean)
        .join("\n\n")
    : prayer.text;
  pane.innerHTML = `<div class="content"><button class="text-button" id="allPrayers">‹ All prayers</button><p class="eyebrow">Prayer Book</p><h1>${esc(prayer.title)}</h1><article class="prayer-text">${esc(text)}</article></div>`;
  pane.scrollTop = 0;
  $("allPrayers").onclick = () => {
    selectedPrayer = null;
    renderPrayers();
  };
}
function renderSaved() {
  cancelBackSlide();
  const bookmarkKeys = state.bookmarks
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .map((b) => keyOf(b.book, b.chapter, b.verse));
  const keys = [
    ...new Set([
      ...bookmarkKeys,
      ...Object.keys(state.highlights),
      ...Object.keys(state.comments),
    ]),
  ].filter(
    (k) =>
      savedFilter === "all" ||
      (savedFilter === "bookmarks"
        ? bookmarkKeys.includes(k)
        : savedFilter === "highlights"
          ? !!state.highlights[k]
          : !!state.comments[k]),
  );
  pane.innerHTML = `<div class="content"><p class="eyebrow">Your collection</p><h1>Saved verses</h1><p class="subtitle">Saved passages and the thoughts you leave with them.</p><div class="filters" aria-label="Filter saved verses">${[
    ["all", "All"],
    ["bookmarks", "Bookmarks"],
    ["highlights", "Highlights"],
    ["comments", "Comments"],
  ]
    .map(
      ([id, label]) =>
        `<button data-filter="${id}" aria-pressed="${savedFilter === id}">${label}</button>`,
    )
    .join("")}</div>${
    keys.length
      ? keys
          .map((key) => {
            const p = parseKey(key);
            return `<button class="result ${state.highlights[key] ? "hl-" + state.highlights[key] : ""}" data-action="jump" data-key="${key}"><strong>${esc(refLabel(p.book, p.ch, p.v))}</strong><p>${esc(verseText(p.book, p.ch, p.v))}</p>${state.comments[key] ? `<small>Your note: ${esc(state.comments[key])}</small>` : ""}</button>`;
          })
          .join("")
      : (state.legacySaved || []).length ? "" : `<div class="empty">${icon("bookmark")}<h2>${savedFilter === "all" ? "Your collection starts here." : "Nothing here yet."}</h2><p>Tap a verse number while reading to bookmark,<br>highlight, or leave a comment.</p><button class="secondary" id="startReading">Return to reading</button></div>`
  }</div>`;
  pane.querySelector(".content")?.insertAdjacentHTML("beforeend", legacySavedHtml());
  if ($("startReading")) $("startReading").onclick = () => openTab("bible");
  pane.scrollTop = 0;
}
function closeDialog() {
  stopLibraryPdf();
  cancelBackSlide();
  searchGeneration++;
  if (dialog.open) dialog.close();
  if (state.tab === "library" && !libraryLoading) {
    const top = pane.scrollTop;
    renderLibrary();
    pane.scrollTop = top;
  }
}
let dialogBack = null, dialogBackSnapshot = null, dialogRefresh = null;
let wisdomBackSnapshot = null, prayerBackSnapshot = null;
function openDialog(title, html, back = null) {
  stopLibraryPdf();
  cancelBackSlide();
  dialogBackSnapshot = null;
  dialogBack = back;
  dialogRefresh = null;
  dialog.classList.remove("chapter-drawer", "note-sheet", "library-reader");
  searchGeneration++;
  $("dialogTitle").textContent = title;
  $("dialogBody").innerHTML = html;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function captureDialogReturn() {
  if (!dialog.open) return null;
  const title = $("dialogTitle").textContent;
  const nodes = [...$("dialogBody").childNodes];
  const classes = [...dialog.classList].filter(name => !name.startsWith("swipe-"));
  const top = dialog.scrollTop;
  const back = dialogBack, backSnapshot = dialogBackSnapshot;
  const refresh = dialogRefresh, focus = document.activeElement;
  const snapshot = captureSwipeView(dialog);
  return {title, snapshot, show() {
    if (refresh) refresh();
    else {
      openDialog(title, "");
      $("dialogBody").replaceChildren(...nodes);
      dialog.classList.add(...classes);
    }
    dialogBack = back; dialogBackSnapshot = backSnapshot;
    if (focus?.isConnected) focus.focus({preventScroll:true});
    dialog.scrollTop = top;
  }};
}
function showBooks() {
  openDialog(
    "Books & chapters",
    '<div class="book-tools"><button class="secondary" data-random-passage="true">Random passage</button><button class="text-button" data-essay="kallistos-reading">How to read Scripture ›</button></div><label class="helper" for="bookFilter">Find a book</label><input id="bookFilter" placeholder="e.g. John, Psalms, Sirach" autocomplete="off"><div id="bookResults"></div>',
  );
  const render = () => {
    const query = $("bookFilter").value.trim().toLowerCase();
    $("bookResults").innerHTML =
      GROUPS.map((g) => {
        const books = g.ids.filter(
          (id) =>
            bookMeta(id) &&
            `${displayName(id)} ${bookMeta(id).name} ${id}`
              .toLowerCase()
              .includes(query),
        );
        return books.length
          ? `<h3 class="section-label">${esc(g.label)}</h3><div class="book-grid">${books.map((id) => `<button class="book-button" data-book="${id}" ${state.book === id ? 'aria-current="true"' : ""}>${esc(displayName(id))}</button>`).join("")}</div>`
          : "";
      }).join("") || '<p class="empty">No matching books.</p>';
  };
  $("bookFilter").oninput = render;
  render();
  $("closeDialog").focus({ preventScroll: true });
}
function neighboringBook(book, direction) {
  const order = bookOrder();
  const index = order.indexOf(book);
  return index < 0 ? null : order[index + direction] || null;
}
function chapterListHtml(book) {
  return `<div class="chapter-list">${Array.from({ length: bookMeta(book).n }, (_, i) => {
    const current = state.book === book && state.chapter === i + 1;
    return `<button data-chapter="${i + 1}" data-chapter-book="${book}" ${current ? 'aria-current="true"' : ""}><span>Chapter ${i + 1}</span>${current ? '<small>Reading</small>' : icon("right")}</button>`;
  }).join("")}</div>`;
}
function showChapterDrawer() {
  const book = state.book;
  const previous = neighboringBook(book, -1),
    next = neighboringBook(book, 1);
  openDialog(
    displayName(book),
    `<p class="helper drawer-position">Chapter ${state.chapter} of ${bookMeta(book).n}</p><div class="drawer-books"><button class="secondary" id="drawerPreviousBook" ${previous ? "" : "disabled"}><span>‹ Previous book</span><small>${previous ? esc(displayName(previous)) : "First book"}</small></button><button class="secondary" id="drawerNextBook" ${next ? "" : "disabled"}><span>Next book ›</span><small>${next ? esc(displayName(next)) : "Last book"}</small></button></div><h3 class="section-label">Chapters</h3>${chapterListHtml(book)}<button class="text-button" id="drawerAllBooks">Browse all books ›</button>`,
  );
  dialog.classList.add("chapter-drawer");
  const changeBook = (id, focusId) => {
    if (!id) return;
    goChapter(id, 1);
    showChapterDrawer();
    const button = $(focusId);
    (button.disabled ? $("closeDialog") : button).focus({
      preventScroll: true,
    });
  };
  $("drawerPreviousBook").onclick = () =>
    changeBook(previous, "drawerPreviousBook");
  $("drawerNextBook").onclick = () => changeBook(next, "drawerNextBook");
  $("drawerAllBooks").onclick = showBooks;
  dialog
    .querySelector('[aria-current="true"]')
    ?.scrollIntoView({ block: "nearest" });
  $("closeDialog").focus({ preventScroll: true });
}
// Direction must be clearly horizontal; vertical scrolling and short movements do nothing.
function swipeDirection(dx, dy) {
  return Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy) * 1.6
    ? Math.sign(dx)
    : 0;
}
function backAction() {
  if (dialog.open) return dialogBack || closeDialog;
  if (returnPlace) return returnToPrevious;
  if (state.tab === "wisdom" && wisdomTopic) return returnToTopics;
  if (state.tab === "prayers" && selectedPrayer)
    return () => {
      selectedPrayer = null;
      renderPrayers();
    };
  return null;
}
bindChapterSwipe(pane, false);
bindChapterSwipe(dialog, true);
function showChapters(book) {
  const parentView = captureSwipeView(dialog);
  openDialog(
    displayName(book),
    `<button class="text-button" id="backBooks">‹ All books</button><p class="helper">Choose a chapter</p>${chapterListHtml(book)}`,
  );
  dialogBack = showBooks;
  dialogBackSnapshot = parentView;
  $("backBooks").onclick = showBooks;
}
function parseRef(raw) {
  const s = raw.trim().toLowerCase();
  if (/^psalms?\s*151(?:\s*:\s*\d+)?$/.test(s)) {
    const verse = s.includes(":") ? +s.split(":")[1] : null;
    return verse && !validVerse("PS2", 1, verse)
      ? null
      : { book: "PS2", ch: 1, v: verse };
  }
  const match = s.match(/^(.+?)\s+(\d+)(?::(\d+)(?:[-–](\d+))?)?$/);
  const name = (match ? match[1] : s).replace(/[.\s]/g, "");
  const book =
    ALIASES[name] ||
    window.BIBLE.books.find((b) =>
      [b.id, b.name, displayName(b.id)].some(
        (n) => n.toLowerCase().replace(/[.\s]/g, "") === name,
      ),
    )?.id;
  if (!book) return null;
  if (!bookMeta(book)) return null;
  const ch = match ? +match[2] : 1,
    v = match?.[3] ? +match[3] : null,
    end = match?.[4] ? +match[4] : v;
  if (
    ch < 1 ||
    ch > bookMeta(book).n ||
    (v !== null &&
      (!validVerse(book, ch, v) || end < v || !validVerse(book, ch, end)))
  )
    return null;
  return { book, ch, v };
}
function showSearch() {
  openDialog(
    "Search Scripture",
    `<form class="search-form" id="searchForm"><input id="searchInput" type="search" aria-label="Passage or words" placeholder="John 3:16 or love one another" autocomplete="off"><button class="primary" type="submit">Search</button></form>${searchToolsHtml()}<p class="helper">Enter a passage, book name, or a phrase from Scripture.</p><div id="searchResults" aria-live="polite"></div>`,
  );
  $("searchForm").onsubmit = (e) => {
    e.preventDefault();
    runSearch();
  };
  $("searchInput").oninput = () => {
    searchGeneration++;
  };
  $("searchArea").onchange = () => { $("searchBook").hidden = $("searchArea").value !== "book"; searchGeneration++; if ($("searchInput").value.trim()) runSearch(); };
  $("searchBook").onchange = runSearch;
  $("searchInput").focus();
}
async function runSearch() {
  const query = $("searchInput").value.trim(),
    generation = ++searchGeneration,
    results = $("searchResults");
  if (!query) return;
  const area = $("searchArea")?.value || "all";
  if (area === "notes" || area === "guides") { results.innerHTML = query.length < 3 ? '<p class="helper">Use at least three letters.</p>' : searchStudyContent(query,area); return; }
  const ref = parseRef(query);
  if (ref) {
    visitPassage(ref.book, ref.ch, ref.v);
    return;
  }
  if (/\d\s*:\s*\d/.test(query) || /^psalms?\s+\d+$/i.test(query)) {
    results.innerHTML =
      '<p class="helper">That passage was not found. Check the chapter and verse numbers.</p>';
    return;
  }
  if (query.length < 3) {
    results.innerHTML =
      '<p class="helper">Use at least three letters to search for words.</p>';
    return;
  }
  results.innerHTML = '<p class="helper">Searching…</p>';
  const found = [],
    needle = query.toLowerCase();
  for (const book of bookOrder()) {
    if ((area === "ot" && !isSeptuagint(book)) || (area === "nt" && isSeptuagint(book)) || (area === "book" && book !== $("searchBook").value)) continue;
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (generation !== searchGeneration || !dialog.open) return;
    const chapters = window.BIBLE.t[book];
    for (let c = 0; c < chapters.length && found.length < 80; c++)
      for (let v = 1; v < chapters[c].length && found.length < 80; v++)
        if (chapters[c][v]?.toLowerCase().includes(needle))
          found.push({ book, ch: c + 1, v });
    if (found.length >= 80) break;
  }
  results.innerHTML =
    `<p class="helper">${found.length === 80 ? "First 80 matches — narrow your phrase to see more." : found.length + " matching verses"}</p>` +
    found
      .map(
        (p) =>
          `<button class="result" data-action="jump" data-key="${keyOf(p.book, p.ch, p.v)}"><strong>${esc(refLabel(p.book, p.ch, p.v))}</strong><p>${esc(verseText(p.book, p.ch, p.v))}</p></button>`,
      )
      .join("");
}
function refreshAnnotations() {
  const top = pane.scrollTop;
  pane.querySelectorAll(".verse[data-key]").forEach((el) => {
    const p = parseKey(el.dataset.key);
    el.outerHTML = verseHtml(p.book, p.ch, p.v);
  });
  pane.scrollTop = top;
}
function showVerse(book, ch, v) {
  const key = keyOf(book, ch, v);
  openDialog(
    refLabel(book, ch, v),
    `<blockquote>${esc(verseText(book, ch, v))}</blockquote><div class="actions"><button class="secondary" id="bookmarkVerse">${icon("bookmark")}${bookmarked(book, ch, v) ? "Unsave" : "Bookmark"}</button><button class="secondary" id="copyVerse">${icon("copy")}Copy verse</button></div><p class="section-label">Highlight</p><div class="highlight-picker">${[
      ["gold", "Gold"],
      ["paper", "Sage"],
      ["rose", "Rose"],
      ["", "Clear"],
    ]
      .map(
        ([color, label]) =>
          `<button class="${color ? "hl-" + color : ""}" data-color="${color}" aria-pressed="${(state.highlights[key] || "") === color}">${label}</button>`,
      )
      .join(
        "",
      )}</div><label class="section-label" style="display:block" for="comment">Your comment</label><textarea id="comment" placeholder="Something to remember…">${esc(state.comments[key] || "")}</textarea><div class="actions"><button class="primary" id="saveComment">Save comment</button><button class="secondary" id="deleteComment" ${!state.comments[key] ? "disabled" : ""}>Remove comment</button></div>`,
  );
  const related = relatedPassagesHtml(book,ch,v);
  if (related) $("dialogBody").insertAdjacentHTML("beforeend", `<h3 class="section-label">Related passages</h3><div class="context-list">${related}</div>`);
  $("bookmarkVerse").onclick = () => {
    const idx = state.bookmarks.findIndex(
      (b) => b.book === book && b.chapter === ch && b.verse === v,
    );
    if (idx >= 0) state.bookmarks.splice(idx, 1);
    else state.bookmarks.push({ book, chapter: ch, verse: v, ts: Date.now() });
    persist();
    refreshAnnotations();
    $("bookmarkVerse").innerHTML =
      icon("bookmark") + (idx >= 0 ? "Bookmark" : "Unsave");
    notify(idx >= 0 ? "Bookmark removed" : "Verse bookmarked");
  };
  $("dialogBody")
    .querySelectorAll("[data-color]")
    .forEach(
      (btn) =>
        (btn.onclick = () => {
          if (btn.dataset.color) state.highlights[key] = btn.dataset.color;
          else delete state.highlights[key];
          persist();
          refreshAnnotations();
          $("dialogBody")
            .querySelectorAll("[data-color]")
            .forEach((b) => b.setAttribute("aria-pressed", b === btn));
        }),
    );
  $("saveComment").onclick = () => {
    const text = $("comment").value.trim();
    if (text) state.comments[key] = text;
    else delete state.comments[key];
    persist();
    refreshAnnotations();
    closeDialog();
    notify(text ? "Comment saved" : "Comment removed");
  };
  $("deleteComment").onclick = () => {
    delete state.comments[key];
    persist();
    refreshAnnotations();
    closeDialog();
    notify("Comment removed");
  };
  $("copyVerse").onclick = async () => {
    try {
      await navigator.clipboard.writeText(
        refLabel(book, ch, v) + " — " + verseText(book, ch, v),
      );
      notify("Verse copied");
    } catch {
      notify("Copy unavailable. Select the verse text to copy it.");
    }
  };
}
function visitPassage(book, ch, v) {
  const previous = {
    book: state.book,
    ch: state.chapter,
    top: pane.scrollTop,
    tab: state.tab,
    previous: returnPlace,
    snapshot: captureSwipeView(pane),
  };
  goChapter(book, ch, v);
  returnPlace = previous;
  $("returnReading").hidden = false;
}
function jumpNote(book, ch, v) {
  const priorReturn = returnPlace;
  returnPlace = {
    book: state.book,
    ch: state.chapter,
    top: pane.scrollTop,
    tab: state.tab,
    previous: priorReturn,
    snapshot: captureSwipeView(pane),
  };
  const previous = returnPlace;
  if (state.tab !== "bible" || state.book !== book || state.chapter !== ch) {
    goChapter(book, ch);
    returnPlace = previous;
  }
  document
    .getElementById("note-" + keyOf(book, ch, v))
    ?.scrollIntoView({ block: "start" });
  $("returnReading").hidden = false;
}
function showSettings() {
  openDialog(
    "Reading settings",
    `<div class="setting"><span>Text size</span><div class="stepper"><button class="secondary" id="fontDown" aria-label="Decrease text size">A−</button><span id="fontValue">${state.font}</span><button class="secondary" id="fontUp" aria-label="Increase text size">A+</button></div></div><div class="setting"><span>Appearance</span><button class="secondary" id="themeToggle" aria-label="Dark mode" aria-pressed="${state.theme === "dark"}">${state.theme === "dark" ? "Dark" : "Light"}</button></div>${[
      ["showPreamble", "Book introductions"],
      ["showNotes", "Study notes"],
    ]
      .map(
        ([id, label]) =>
          `<div class="setting"><span>${label}</span><button class="secondary" data-setting="${id}" aria-label="${label}" aria-pressed="${!!state[id]}">${state[id] ? "On" : "Off"}</button></div>`,
      )
      .join(
        "",
      )}${readerToolsSettingsHtml()}<h3 class="section-label">Your data</h3><button class="text-button" id="openStorage">Storage &amp; backup ›</button><br><button class="text-button" id="openCloudSync">Cloud sync ›</button><h3 class="section-label">Personal study notes</h3><p class="helper" id="personalNotesStatus">${personalContextStatus()}</p><label class="text-button" for="personalNotesFile">Import study notes</label><input id="personalNotesFile" type="file" accept=".json,application/json"><p class="helper">Choose your study-notes JSON file. It stays on this device.</p><h3 class="section-label">Reading guides</h3><button class="text-button" data-essay="kallistos-reading">Kallistos Ware: how to read Scripture ›</button><br><button class="text-button" data-context-library="true">OSB guides &amp; book introductions ›</button><br><button class="text-button" data-essay="how-to-read">How to read the Bible ›</button><br><button class="text-button" data-essay="typology">How Scripture speaks of Christ ›</button><p class="helper">Old Testament: LXX2012, Brenton’s Greek Septuagint translation with language updates. New Testament: World English Bible. Psalm numbers follow the Septuagint; source verse ranges and gaps are preserved. Imported OSB notes retain their original references, which have not all been aligned to LXX2012. Both Bible translations are public domain. <a href="https://ebible.org/eng-lxx2012/" target="_blank" rel="noopener">LXX2012 source</a> · <a href="https://ebible.org/engwebu/" target="_blank" rel="noopener">WEB source</a>. Bookmarks, highlights, and comments are saved in this browser.</p>`,
  );
  bindReaderToolsSettings();
  $("personalNotesFile").onchange = importPersonalNotes;
  $("openStorage").onclick = showStorage;
  $("openCloudSync").hidden = !cloudConfig();
  $("openCloudSync").onclick = showCloudSync;
  const font = (delta) => {
    rememberScroll();
    state.font = Math.max(16, Math.min(28, state.font + delta));
    applyAppearance();
    $("fontValue").textContent = state.font;
    persist();
  };
  $("fontDown").onclick = () => font(-1);
  $("fontUp").onclick = () => font(1);
  $("themeToggle").onclick = () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyAppearance();
    persist();
    $("themeToggle").textContent = state.theme === "dark" ? "Dark" : "Light";
    $("themeToggle").setAttribute("aria-pressed", state.theme === "dark");
  };
  $("dialogBody")
    .querySelectorAll("[data-setting]")
    .forEach(
      (btn) =>
        (btn.onclick = () => {
          rememberScroll();
          state[btn.dataset.setting] = !state[btn.dataset.setting];
          btn.textContent = state[btn.dataset.setting] ? "On" : "Off";
          btn.setAttribute("aria-pressed", !!state[btn.dataset.setting]);
          if (state.tab === "bible") renderChapter(state.scroll);
          else if (state.tab === "wisdom") {
            const top = pane.scrollTop;
            renderWisdom();
            pane.scrollTop = top;
          }
          persist();
        }),
    );
}
function showEssay(id) {
  const e = window.STUDY?.essays?.[id];
  if (!e) return;
  const parent = captureDialogReturn();
  const back = parent?.show || closeDialog;
  const importedGuide = e.personalGuideTitle
    ? personalGuides.findIndex(g => g.title.trim().toLocaleLowerCase() === e.personalGuideTitle.toLocaleLowerCase()) : -1;
  openDialog(
    e.title,
    `<div class="essay"><button class="text-button" id="backSettings">‹ ${esc(parent?.title || (state.tab === "library" ? "Library" : "Back to reading"))}</button>${e.byline ? `<p class="helper essay-attribution">${esc(e.byline)}</p>` : ""}<p>${esc(e.lead)}</p>${e.sections.map((s) => `<h3>${esc(s.h)}</h3><p>${esc(s.p)}</p>`).join("")}${importedGuide >= 0 ? `<button class="text-button" data-context-guide="${importedGuide}">Read the full guide from your OSB copy ›</button>` : ""}${e.source ? `<p class="helper essay-source"><a href="${esc(e.source.url)}" target="_blank" rel="noopener noreferrer">${esc(e.source.label)} ↗</a> (online)</p>` : ""}</div>`,
  );
  dialogBack = parent ? back : null;
  dialogBackSnapshot = parent?.snapshot || null;
  $("backSettings").onclick = back;
}
function handleAction(event) {
  const button = event.target.closest("button");
  if (!button) return;
  if (handleLibraryAction(button)) return;
  if (handleReaderToolAction(button)) return;
  if (button.dataset.contextLibrary) { showContextLibrary(); return; }
  if (button.dataset.contextGuide !== undefined) { showStudyContext("guide", button.dataset.contextGuide, button.dataset.contextParent); return; }
  if (button.dataset.contextIntro) { showStudyContext("intro", button.dataset.contextIntro, button.dataset.contextParent); return; }
  if (button.dataset.legacyKey) { showLegacySaved(button.dataset.legacyKey); return; }
  if (button.dataset.studyBook) { showOriginalStudyNotes(button.dataset.studyBook); return; }
  if (button.dataset.prayer) {
    prayerBackSnapshot = captureSwipeView(pane);
    prayerListTop = pane.scrollTop;
    selectedPrayer = button.dataset.prayer;
    renderPrayers();
    return;
  }
  if (button.dataset.action) {
    const p = parseKey(button.dataset.key);
    if (button.dataset.action === "verse") showVerse(p.book, p.ch, p.v);
    else if (button.dataset.action === "jump") visitPassage(p.book, p.ch, p.v);
    else { const note=noteAt(p.book,p.ch,p.v); showStudyNote(note?.sourceKey || keyOf(p.book,p.ch,p.v),!!note?.sourceKey); }
  } else if (button.dataset.book) showChapters(button.dataset.book);
  else if (button.dataset.chapter)
    goChapter(button.dataset.chapterBook, +button.dataset.chapter);
  else if (button.dataset.topic) {
    wisdomBackSnapshot = captureSwipeView(pane);
    wisdomListTop = pane.scrollTop;
    wisdomTopic = window.WISDOM.categories
      .flatMap((c) => c.topics)
      .find((t) => t.id === button.dataset.topic);
    renderWisdom();
  } else if (button.dataset.filter) {
    savedFilter = button.dataset.filter;
    renderSaved();
  } else if (button.dataset.direction) nextChapter(+button.dataset.direction);
  else if (button.dataset.essay) showEssay(button.dataset.essay);
}
pane.addEventListener("click", handleAction);
$("dialogBody").addEventListener("click", handleAction);
pane.addEventListener(
  "scroll",
  () => {
    if (state.tab !== "bible") return;
    rememberScroll();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  },
  { passive: true },
);
window.addEventListener("pagehide", () => {
  rememberScroll();
  persist();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && persistenceReady) {
    clearTimeout(saveTimer);
    rememberScroll();
    persist();
  }
});
$("exitFocus").onclick = () => setFocusReading(false);
pane.addEventListener("click", event => { if (focusReading && !event.target.closest("button,a,input,summary") && !window.getSelection()?.toString()) setFocusReading(false); });
$("home").onclick = (e) => {
  e.preventDefault();
  openTab("bible");
};
$("search").onclick = showSearch;
$("settings").onclick = showSettings;
$("books").onclick = showBooks;
$("openChapterDrawer").onclick = showChapterDrawer;
$("previous").onclick = () => nextChapter(-1);
$("next").onclick = () => nextChapter(1);
$("closeDialog").onclick = closeDialog;
dialog.addEventListener("close", () => searchGeneration++);
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeDialog();
  }
});
document
  .querySelectorAll("[data-tab]")
  .forEach((button) => (button.onclick = () => openTab(button.dataset.tab)));
function returnToPrevious() {
  const r = returnPlace;
  if (!r) return;
  returnPlace = r.previous || null;
  $("returnReading").hidden = !returnPlace;
  if (r.tab === "wisdom") {
    selectTab("wisdom");
    renderWisdom();
  } else if (r.tab === "saved") {
    selectTab("saved");
    renderSaved();
  } else if (r.tab === "prayers") {
    selectTab("prayers");
    renderPrayers();
  } else if (r.tab === "library") {
    selectTab("library");
    renderLibrary();
  } else {
    state.book = r.book;
    state.chapter = r.ch;
    selectTab("bible");
    renderChapter();
  }
  pane.scrollTop = r.top;
  rememberScroll();
  persist();
}
$("returnReading").onclick = returnToPrevious;
document.addEventListener("keydown", (e) => {
  if (
    dialog.open ||
    state.tab !== "bible" ||
    ["INPUT", "TEXTAREA", "BUTTON", "A", "SUMMARY"].includes(
      e.target.tagName,
    ) ||
    e.altKey ||
    e.metaKey ||
    e.ctrlKey
  )
    return;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    nextChapter(-1);
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    nextChapter(1);
  }
});
// CSS follows browser chrome and standalone safe areas. Only override its height
// when an on-screen keyboard visibly reduces the viewport. Do not resize for zoom.
function fitViewport() {
  const viewport = window.visualViewport;
  if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
  const active = document.activeElement;
  const editing = active &&
    (["INPUT", "TEXTAREA"].includes(active.tagName) || active.isContentEditable);
  if (viewport && editing && window.innerHeight - viewport.height > 120) {
    document.documentElement.style.setProperty("--app-height", `${viewport.height}px`);
  } else {
    document.documentElement.style.removeProperty("--app-height");
  }
}
let viewportSettleTimer;
function syncViewport() {
  fitViewport();
  clearTimeout(viewportSettleTimer);
  viewportSettleTimer = setTimeout(fitViewport, 300);
}
window.addEventListener("resize", syncViewport);
window.addEventListener("orientationchange", syncViewport);
window.addEventListener("pageshow", syncViewport);
window.visualViewport?.addEventListener("resize", syncViewport);
window.visualViewport?.addEventListener("scroll", syncViewport);
document.addEventListener("visibilitychange", syncViewport);
document.addEventListener("focusin", syncViewport);
document.addEventListener("focusout", syncViewport);
fitViewport();
if (window.BIBLE?.t) {
  (async () => {
  document.querySelector(".app").inert = true;
  const storedReader = await readStoredReader();
  persistenceReady = true;
  loadPrefs(storedReader || {});
  selectTab(state.tab);
  if (state.tab === "bible") renderChapter(state.scroll);
  else if (state.tab === "wisdom") renderWisdom();
  else if (state.tab === "prayers") renderPrayers();
  else if (state.tab === "library") renderLibrary();
  else renderSaved();
  await restorePersonalNotes();
  await restoreLibrary();
  document.querySelector(".app").inert = false;
  initializeCloudSync();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  })().catch(() => { document.querySelector(".app").inert = false; notify("Could not restore saved data. Please reload before making changes."); });
} else
  pane.innerHTML =
    '<p class="empty">Scripture could not load. Reconnect and refresh to download the Bible.</p>';
