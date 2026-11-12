// Today: the Coptic Katameros readings for the day, a verse to carry, and spaced memorization.
// Reading references come from katameros-data.js; Scripture text always comes from this app's own Bible.
const COPTIC_MONTHS = ["Tout", "Baba", "Hatour", "Kiahk", "Toba", "Amshir", "Baramhat", "Baramouda", "Bashans", "Paona", "Epep", "Mesra", "Nasie"];
// Katameros book ids (English Bible order plus deuterocanon) to this app's book ids.
const KATAMEROS_BOOKS = {1:"GEN",2:"EXO",3:"LEV",4:"NUM",5:"DEU",6:"JOS",7:"JDG",8:"RUT",9:"1SA",10:"2SA",11:"1KI",12:"2KI",13:"1CH",14:"2CH",
  15:"EZR",16:"NEH",17:"EST",18:"JOB",19:"PSA",20:"PRO",21:"ECC",22:"SNG",23:"ISA",24:"JER",25:"LAM",26:"EZK",27:"DAN",28:"HOS",29:"JOL",
  30:"AMO",31:"OBA",32:"JON",33:"MIC",34:"NAM",35:"HAB",36:"ZEP",37:"HAG",38:"ZEC",39:"MAL",40:"MAT",41:"MRK",42:"LUK",43:"JHN",44:"ACT",
  45:"ROM",46:"1CO",47:"2CO",48:"GAL",49:"EPH",50:"PHP",51:"COL",52:"1TH",53:"2TH",54:"1TI",55:"2TI",56:"TIT",57:"PHM",58:"HEB",59:"JAS",
  60:"1PE",61:"2PE",62:"1JN",63:"2JN",64:"3JN",65:"JUD",66:"REV",67:"BAR",68:"TOB",69:"JDT",70:"1MA",71:"2MA",72:"WIS",73:"SIR"};
const LITURGY_ORDER = ["Pauline Epistle", "Catholic Epistle", "Acts of the Apostles", "Psalm & Gospel"];
const MEMORY_INTERVALS = [1, 2, 4, 7, 14, 30, 60, 120];

function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function shiftDayKey(key, days) {
  const [y, m, d] = key.split("-").map(Number), date = new Date(y, m - 1, d + days);
  return localDayKey(date);
}
// Gregorian date -> Coptic (Anno Martyrum) date, via Julian Day Numbers. 1 Tout 1 A.M. is JDN 1825030.
function copticDate(key) {
  const [y, m, d] = key.split("-").map(Number), a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  const year = Math.floor((4 * (jdn - 1825030) + 1463) / 1461), start = 1825030 + 365 * (year - 1) + Math.floor(year / 4), doy = jdn - start;
  const month = Math.floor(doy / 30) + 1, day = doy % 30 + 1;
  return {day, month, year, name: `${day} ${COPTIC_MONTHS[month - 1]} ${year}`};
}
function dayKeyDate(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function daysBetween(a, b) { return Math.round((dayKeyDate(b) - dayKeyDate(a)) / 86400000); }

// Hebrew/English Psalm numbers (as the Katameros cites them) to this edition's Septuagint numbering.
function psalmToLxx(chapter, verse) {
  if (chapter <= 9) return [chapter, verse];
  if (chapter === 10) return [9, 20 + verse];
  if (chapter <= 146) return [chapter - 1, verse];
  if (chapter === 147) return verse <= 11 ? [146, verse] : [147, verse - 11];
  return [chapter, verse];
}
// One cited passage -> verses with text from this app. Jeremiah's Septuagint chapter order differs from the
// English order the lectionary uses, so its text comes from the retained WEB Old Testament.
function lectionaryPassage([bookId, chapter, verses]) {
  const book = KATAMEROS_BOOKS[bookId];
  if (!book) return null;
  const list = [];
  // Daniel 14 (Bel and the Dragon) is its own book in this edition.
  if (book === "DAN" && chapter === 14) {
    for (const verse of verses) { const text = verseText("BEL", 1, verse); if (text) list.push({book: "BEL", ch: 1, v: verse, text, label: String(verse)}); }
    return {book: "BEL", chapter: 1, cited: 14, verses: list, source: "LXX", openable: !!list.length};
  }
  if (book === "JER" && window.LEGACY_WEB?.t?.JER) {
    for (const verse of verses) {
      const text = window.LEGACY_WEB.t.JER[chapter - 1]?.[verse];
      if (text) list.push({book, ch: chapter, v: verse, text, label: String(verse)});
    }
    return {book, chapter, cited: chapter, verses: list, source: "WEB", openable: false};
  }
  for (const verse of verses) {
    const [ch, v] = book === "PSA" ? psalmToLxx(chapter, verse) : [chapter, verse];
    const text = verseText(book, ch, v);
    if (text && !list.some(item => item.ch === ch && item.v === sourceVerseStart(book, ch, v)))
      list.push({book, ch, v: sourceVerseStart(book, ch, v), text, label: sourceVerseLabel(book, ch, v)});
  }
  return {book, chapter: list[0]?.ch ?? chapter, cited: chapter, verses: list, source: isSeptuagint(book) ? "LXX" : "WEB", openable: !!list.length};
}
function verseRuns(numbers) {
  const runs = [];
  for (const n of numbers) {
    const last = runs.at(-1);
    if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]);
  }
  return runs.map(([a, b]) => a === b ? String(a) : `${a}–${b}`).join(", ");
}
function passageLabel(passages) {
  const parts = [];
  let lastBook = null;
  for (const p of passages) {
    if (!p || !p.verses.length) continue;
    const byChapter = new Map();
    for (const verse of p.verses) { if (!byChapter.has(verse.ch)) byChapter.set(verse.ch, []); byChapter.get(verse.ch).push(Number(verse.v)); }
    for (const [ch, numbers] of byChapter) {
      // Psalms follow the Orthodox convention: Septuagint number with the English number in parentheses.
      const english = p.book === "PSA" && p.cited !== ch ? `(${p.cited})` : "";
      const name = p.book === lastBook ? "" : `${p.book === "PSA" ? "Psalm" : displayName(p.book)} `;
      parts.push(`${name}${p.book === "PS2" ? "" : `${p.book === lastBook && p.book === "PSA" ? "" : ""}${ch}${english}:`}${verseRuns(numbers)}`);
      lastBook = p.book;
    }
  }
  return parts.join("; ");
}
function katamerosDay(key) {
  const data = window.KATAMEROS, entry = data?.days?.[key];
  if (!entry) return null;
  const [setIndex, , title, period] = entry;
  return {key, coptic: copticDate(key), title, period,
    sections: data.sets[setIndex].map(([sectionTitle, subs]) => ({title: sectionTitle || "Readings",
      subs: subs.map(([subTitle, readings]) => ({title: subTitle || sectionTitle || "Reading", readings: readings.map(reading => reading.map(lectionaryPassage).filter(Boolean))}))}))};
}
function liturgyReadings(day) {
  const liturgy = day.sections.find(section => section.title === "Liturgy");
  if (!liturgy) return [];
  return liturgy.subs.slice().sort((a, b) => (LITURGY_ORDER.indexOf(a.title) + 1 || 99) - (LITURGY_ORDER.indexOf(b.title) + 1 || 99));
}
// The Liturgy Psalm is short and sung daily, which makes it the natural verse to carry.
function verseToCarry(day) {
  const psalmGospel = liturgyReadings(day).find(sub => sub.title.startsWith("Psalm"));
  const psalm = psalmGospel?.readings[0]?.filter(p => p.verses.length);
  if (psalm?.length) return {passages: psalm, label: passageLabel(psalm), text: psalm.flatMap(p => p.verses.map(v => v.text)).join(" "), liturgy: true};
  for (const section of day.sections) for (const sub of section.subs) for (const reading of sub.readings) {
    const found = reading.filter(p => p.book === "PSA" && p.verses.length);
    if (found.length) return {passages: found, label: passageLabel(found), text: found.flatMap(p => p.verses.map(v => v.text)).join(" ")};
  }
  return null;
}
function readingId(sectionTitle, subTitle, index) { return `${sectionTitle}|${subTitle}|${index}`; }
function dayDone(key) { return state.today?.done?.[key] || []; }
function liturgyIds(day) {
  return liturgyReadings(day).flatMap(sub => sub.readings.map((reading, i) => reading.some(p => p.verses.length) ? readingId("Liturgy", sub.title, i) : null)).filter(Boolean);
}
function dayComplete(key) {
  const day = katamerosDay(key);
  if (!day) return false;
  const done = new Set(dayDone(key)), ids = liturgyIds(day);
  // Holy Week days without a Liturgy count once any of their readings is read.
  if (!ids.length) return done.size > 0;
  return ids.every(id => done.has(id));
}
function readingStreak(today = localDayKey()) {
  let key = dayComplete(today) ? today : shiftDayKey(today, -1), streak = 0;
  while (dayComplete(key) && streak < 4000) { streak++; key = shiftDayKey(key, -1); }
  return streak;
}

// ----- Memory verses: Leitner boxes with growing intervals -----
function memoryId(passages) { return passages.map(p => `${p.book}:${p.verses.map(v => `${v.ch}.${v.v}`).join(",")}`).join(";"); }
function addMemoryVerse(passages, today = localDayKey()) {
  state.memory ||= [];
  const id = memoryId(passages);
  if (state.memory.some(item => item.id === id)) return false;
  state.memory.push({id, label: passageLabel(passages), text: passages.flatMap(p => p.verses.map(v => v.text)).join(" "),
    ref: passages.map(p => ({book: p.book, verses: p.verses.map(v => [v.ch, Number(v.v)])})), box: 0, due: today, added: Date.now(), reviews: 0});
  return true;
}
function memoryDue(today = localDayKey()) { return (state.memory || []).filter(item => item.due <= today); }
function reviewMemory(id, remembered, today = localDayKey()) {
  const item = (state.memory || []).find(entry => entry.id === id);
  if (!item) return null;
  item.box = remembered ? Math.min(MEMORY_INTERVALS.length - 1, item.box + 1) : 0;
  item.due = shiftDayKey(today, remembered ? MEMORY_INTERVALS[item.box] : 1);
  item.reviews = (item.reviews || 0) + 1; item.last = today;
  return item;
}
// Word fading for practice: level 0 shows every word, 1–2 hide a growing share, 3 shows first letters, 4 hides all.
function fadeWords(text, level, seed = 7) {
  const words = text.split(/(\s+)/);
  let index = 0;
  return words.map(part => {
    if (/^\s+$/.test(part) || !part) return {space: part};
    const i = index++, match = part.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’-]*)(.*)$/u);
    if (!match) return {text: part, hidden: false};
    const hidden = level >= 3 || (level === 1 && (i * 5 + seed) % 3 === 0) || (level === 2 && (i * 5 + seed) % 3 !== 1);
    return {before: match[1], word: match[2], after: match[3], hidden, hint: level === 4 ? "" : match[2][0]};
  });
}

// ----- View -----
let todayKey = null;
function renderToday(key = todayKey || localDayKey()) {
  todayKey = key;
  const today = localDayKey(), day = katamerosDay(key), streak = readingStreak(today), due = memoryDue(today);
  const date = dayKeyDate(key).toLocaleDateString(undefined, {weekday: "long", month: "long", day: "numeric", year: "numeric"});
  let html = `<div class="content today"><div class="today-nav"><button class="icon-button" data-today-shift="-1" aria-label="Previous day">${icon("left")}</button>
    <div><p class="eyebrow">${key === today ? "Today" : esc(date.split(",")[0])}</p><h1>${esc(date.replace(/^[^,]+,\s*/, ""))}</h1>
    ${day ? `<p class="coptic-date">${esc(day.coptic.name)} A.M.${day.title ? ` · <strong>${esc(day.title)}</strong>` : day.period ? ` · ${esc(day.period)}` : ""}</p>` : ""}</div>
    <button class="icon-button" data-today-shift="1" aria-label="Next day">${icon("right")}</button></div>
    ${key !== today ? `<button class="text-button today-return" data-today-shift="0">Back to today ›</button>` : ""}`;
  if (!day) {
    html += `<p class="empty">Readings for this date are not in this version of the app yet. Update the app to get more years of the Katameros.</p></div>`;
    pane.innerHTML = html; return;
  }
  const carry = verseToCarry(day);
  if (carry) html += `<section class="carry"><p class="eyebrow">Verse to carry today</p><blockquote>${esc(carry.text)}</blockquote>
    <p class="carry-ref">${esc(carry.label)}</p><div class="actions"><button class="primary" data-carry-practice="true">Practice</button>
    <button class="secondary" data-carry-memorize="true">${(state.memory || []).some(item => item.id === memoryId(carry.passages)) ? "✓ In memory" : "Add to memory"}</button></div>
    <p class="helper">${carry.liturgy ? "The Psalm of today's Liturgy" : "A Psalm from today's readings"}. Read it slowly, then say it from memory a few times during the day.</p></section>`;
  html += `<div class="today-stats"><span><strong>${streak}</strong> day${streak === 1 ? "" : "s"} in a row</span><button class="text-button" data-memory-review="true" ${due.length ? "" : "disabled"}>${due.length ? `Review ${due.length} memory verse${due.length === 1 ? "" : "s"} ›` : `${(state.memory || []).length} memory verses · none due`}</button></div>`;
  const done = new Set(dayDone(key));
  const readingCard = (sectionTitle, sub, reading, index) => {
    const id = readingId(sectionTitle, sub.title, index), passages = reading.filter(p => p.verses.length);
    if (!passages.length) return "";
    const isPsalm = passages.every(p => p.book === "PSA"), title = sub.title === "Psalm & Gospel" ? (isPsalm ? "Psalm" : "Gospel") : sub.title.replace(/s$/, "") === "Prophecie" ? "Prophecy" : sub.title;
    const minutes = Math.max(1, Math.round(passages.reduce((n, p) => n + p.verses.reduce((m, v) => m + v.text.split(/\s+/).length, 0), 0) / 200));
    const first = passages.find(p => p.openable);
    return `<details class="reading-card${done.has(id) ? " is-done" : ""}"><summary><span class="reading-check" aria-hidden="true">${done.has(id) ? "✓" : ""}</span>
      <span><small>${esc(title)}</small><strong>${esc(passageLabel(passages))}</strong></span><span class="reading-min">${minutes} min</span></summary>
      <div class="reading-text">${passages.map(p => `${p.source === "WEB" && p.book === "JER" ? `<p class="helper">Jeremiah ${p.cited} in English numbering (World English Bible).</p>` : ""}${p.verses.map(v => `<p><sup>${esc(v.label)}</sup> ${esc(v.text)}</p>`).join("")}`).join("")}
      <div class="actions"><button class="${done.has(id) ? "secondary" : "primary"}" data-reading-done="${esc(id)}">${done.has(id) ? "Mark unread" : "Done reading"}</button>
      ${first ? `<button class="text-button" data-chapter-book="${first.book}" data-chapter="${first.chapter}" data-verse="${first.verses[0].v}">Open in ${esc(displayName(first.book))} ${first.book === "PS2" ? "" : first.chapter} ›</button>` : ""}
      <button class="text-button" data-memorize-reading="${esc(id)}">Memorize a verse…</button></div></div></details>`;
  };
  const liturgy = liturgyReadings(day);
  if (liturgy.length) {
    const ids = liturgyIds(day), complete = ids.length && ids.every(id => done.has(id));
    html += `<h2 class="section-label">Liturgy readings${complete ? ' <span class="complete-badge">✓ Complete</span>' : ""}</h2><div class="reading-list">${liturgy.map(sub => sub.readings.map((reading, i) => readingCard("Liturgy", sub, reading, i)).join("")).join("")}</div>`;
  }
  const others = day.sections.filter(section => section.title !== "Liturgy");
  if (others.length && !liturgy.length) html += others.map(section => `<h2 class="section-label">${esc(section.title)}</h2><div class="reading-list">${section.subs.map(sub => sub.readings.map((reading, i) => readingCard(section.title, sub, reading, i)).join("")).join("")}</div>`).join("");
  else if (others.length) html += `<details class="other-hours"><summary>${others.map(s => esc(s.title)).join(" & ")} readings</summary>${others.map(section => `<h3 class="section-label">${esc(section.title)}</h3><div class="reading-list">${section.subs.map(sub => sub.readings.map((reading, i) => readingCard(section.title, sub, reading, i)).join("")).join("")}</div>`).join("")}</details>`;
  html += `<p class="helper today-source">Readings follow the Coptic Orthodox Katameros (via the open-source Katameros project). Text: ${"LXX2012 Septuagint and World English Bible"}; Psalms use Septuagint numbering.</p>
    <label class="today-pref"><input type="checkbox" id="openTodayFirst" ${state.openTodayFirst !== false ? "checked" : ""}> Open Today first each day</label></div>`;
  pane.innerHTML = html;
  $("openTodayFirst").onchange = event => { state.openTodayFirst = event.target.checked; persist(); };
}
function readingById(key, id) {
  const day = katamerosDay(key), [sectionTitle, subTitle, index] = id.split("|");
  return day?.sections.find(s => s.title === sectionTitle)?.subs.find(s => s.title === subTitle)?.readings[Number(index)]?.filter(p => p.verses.length) || null;
}
function toggleReadingDone(id) {
  state.today ||= {done: {}};
  const list = new Set(dayDone(todayKey));
  if (list.has(id)) list.delete(id); else list.add(id);
  state.today.done[todayKey] = [...list];
  // Keep about two years of history.
  const keys = Object.keys(state.today.done).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 800))) delete state.today.done[old];
  const wasComplete = dayComplete(todayKey);
  persist();
  const top = pane.scrollTop; renderToday(todayKey); pane.scrollTop = top;
  pane.querySelector(`[data-reading-done="${CSS.escape(id)}"]`)?.closest("details")?.removeAttribute("open");
  if (list.has(id) && wasComplete) notify("Today's Liturgy readings are complete");
}
function chooseMemoryVerse(id) {
  const passages = readingById(todayKey, id);
  if (!passages) return;
  openDialog("Choose a verse to memorize", `<p class="helper">Tap one verse, or a verse and its neighbours, then add them.</p><div class="pick-verses">${passages.flatMap((p, pi) => p.verses.map((v, vi) => `<button class="pick-verse" data-pick="${pi}:${vi}" aria-pressed="false"><sup>${esc(v.label)}</sup> ${esc(v.text)}</button>`)).join("")}</div><div class="actions"><button class="primary" id="addPicked" disabled>Add to memory</button></div>`);
  const picked = new Set();
  $("dialogBody").querySelectorAll("[data-pick]").forEach(button => button.onclick = () => {
    if (picked.has(button.dataset.pick)) picked.delete(button.dataset.pick); else picked.add(button.dataset.pick);
    button.setAttribute("aria-pressed", String(picked.has(button.dataset.pick)));
    $("addPicked").disabled = !picked.size;
  });
  $("addPicked").onclick = () => {
    const chosen = passages.map((p, pi) => ({...p, verses: p.verses.filter((v, vi) => picked.has(`${pi}:${vi}`))})).filter(p => p.verses.length);
    const added = addMemoryVerse(chosen); persist(); closeDialog();
    notify(added ? `Added ${passageLabel(chosen)} to memory` : "Already in your memory verses");
    if (state.tab === "today") renderToday(todayKey);
  };
}
function practiceHtml(text, level) {
  return fadeWords(text, level).map(part => part.space !== undefined ? part.space : part.word === undefined ? esc(part.text)
    : `<span class="fw">${esc(part.before)}${part.hidden ? `<button class="fade-word" data-reveal="true" aria-label="Reveal word"><span>${esc(part.hint) || "&nbsp;"}</span><span hidden>${esc(part.word)}</span></button>` : esc(part.word)}${esc(part.after)}</span>`).join("");
}
const PRACTICE_LEVELS = ["Read it through", "A few words hidden", "Most words hidden", "First letters only", "From memory"];
function showPractice(label, text, level = 0) {
  openDialog(label, `<p class="eyebrow">Step ${level + 1} of 5 · ${PRACTICE_LEVELS[level]}</p><div class="practice-text">${practiceHtml(text, level)}</div>
    <p class="helper">${level ? "Say it aloud. Tap a hidden word to peek." : "Read it slowly, aloud if you can."}</p>
    <div class="actions">${level ? '<button class="secondary" id="practiceEasier">‹ Easier</button>' : ""}${level < 4 ? '<button class="primary" id="practiceHarder">Next step ›</button>' : '<button class="primary" id="practiceDone">I can say it</button>'}<button class="text-button" id="practiceReveal">Show all</button></div>`);
  $("dialogBody").querySelectorAll("[data-reveal]").forEach(button => button.onclick = () => {
    button.firstElementChild.hidden = true; button.lastElementChild.hidden = false; button.classList.add("revealed");
  });
  $("practiceReveal").onclick = () => $("dialogBody").querySelectorAll("[data-reveal]").forEach(button => button.click());
  if ($("practiceEasier")) $("practiceEasier").onclick = () => showPractice(label, text, level - 1);
  if ($("practiceHarder")) $("practiceHarder").onclick = () => showPractice(label, text, level + 1);
  if ($("practiceDone")) $("practiceDone").onclick = () => { closeDialog(); notify("Well done. Come back to it later today."); };
}
function showMemoryReview(queue = memoryDue().map(item => item.id), index = 0, correct = 0) {
  const item = (state.memory || []).find(entry => entry.id === queue[index]);
  if (!item) {
    openDialog("Review complete", `<p>You reviewed ${queue.length} verse${queue.length === 1 ? "" : "s"} and remembered ${correct}.</p><p class="helper">Verses you remember come back after longer gaps: 1, 2, 4, 7, 14, 30, 60, then 120 days. Ones you miss come back tomorrow.</p><div class="actions"><button class="primary" id="reviewClose">Done</button><button class="text-button" id="reviewList">All memory verses ›</button></div>`);
    $("reviewClose").onclick = () => { closeDialog(); if (state.tab === "today") renderToday(todayKey); };
    $("reviewList").onclick = () => showMemoryList();
    return;
  }
  openDialog(`Review ${index + 1} of ${queue.length}`, `<p class="eyebrow">${esc(item.label)}</p><div class="practice-text" id="reviewText">${practiceHtml(item.text, 3)}</div>
    <p class="helper">Say the verse from the first letters, then check yourself.</p><div class="actions" id="reviewActions"><button class="primary" id="reviewShow">Show the verse</button></div>`);
  $("dialogBody").querySelectorAll("[data-reveal]").forEach(button => button.onclick = () => { button.firstElementChild.hidden = true; button.lastElementChild.hidden = false; button.classList.add("revealed"); });
  $("reviewShow").onclick = () => {
    $("reviewText").textContent = item.text;
    $("reviewActions").innerHTML = '<button class="secondary" id="reviewMissed">Not yet</button><button class="primary" id="reviewGot">I knew it</button>';
    $("reviewMissed").onclick = () => { reviewMemory(item.id, false); persist(); showMemoryReview(queue, index + 1, correct); };
    $("reviewGot").onclick = () => { reviewMemory(item.id, true); persist(); showMemoryReview(queue, index + 1, correct + 1); };
  };
}
function showMemoryList() {
  const items = (state.memory || []).slice().sort((a, b) => a.due.localeCompare(b.due));
  const today = localDayKey();
  openDialog("Memory verses", items.length ? `<div class="memory-list">${items.map(item => `<article class="memory-item"><strong>${esc(item.label)}</strong><p>${esc(item.text)}</p>
    <small>${item.due <= today ? "Due today" : `Next review in ${daysBetween(today, item.due)} day${daysBetween(today, item.due) === 1 ? "" : "s"}`} · ${item.reviews || 0} reviews</small>
    <div class="actions"><button class="text-button" data-memory-practice="${esc(item.id)}">Practice</button><button class="text-button" data-memory-remove="${esc(item.id)}">Remove</button></div></article>`).join("")}</div>`
    : '<p>No memory verses yet. Use "Add to memory" on the verse to carry, or tap a verse number while reading and choose Memorize.</p>');
  $("dialogBody").querySelectorAll("[data-memory-practice]").forEach(button => button.onclick = () => {
    const item = state.memory.find(entry => entry.id === button.dataset.memoryPractice); if (item) showPractice(item.label, item.text);
  });
  $("dialogBody").querySelectorAll("[data-memory-remove]").forEach(button => button.onclick = () => {
    state.memory = state.memory.filter(entry => entry.id !== button.dataset.memoryRemove); persist(); showMemoryList();
    if (state.tab === "today") renderToday(todayKey);
  });
}
function handleTodayAction(button) {
  const data = button.dataset;
  if (data.todayShift !== undefined) {
    const shift = Number(data.todayShift);
    renderToday(shift === 0 ? localDayKey() : shiftDayKey(todayKey || localDayKey(), shift)); pane.scrollTop = 0;
  } else if (data.readingDone) toggleReadingDone(data.readingDone);
  else if (data.memorizeReading) chooseMemoryVerse(data.memorizeReading);
  else if (data.carryPractice || data.carryMemorize) {
    const carry = verseToCarry(katamerosDay(todayKey));
    if (!carry) return true;
    if (data.carryPractice) showPractice(carry.label, carry.text);
    else { const added = addMemoryVerse(carry.passages); persist(); notify(added ? "Added to your memory verses" : "Already in your memory verses"); renderToday(todayKey); }
  } else if (data.memoryReview) { if (memoryDue().length) showMemoryReview(); else showMemoryList(); }
  else return false;
  return true;
}
// Memorize a single verse from the Bible reader's verse dialog.
function memorizeBibleVerse(book, ch, v) {
  const text = verseText(book, ch, v);
  if (!text) return false;
  const added = addMemoryVerse([{book, chapter: ch, verses: [{book, ch, v, text, label: sourceVerseLabel(book, ch, v)}]}]);
  persist();
  return added;
}
function normalizeToday(reader) {
  const done = reader.today?.done && typeof reader.today.done === "object" ? reader.today.done : {};
  reader.today = {done: Object.fromEntries(Object.entries(done).filter(([key, ids]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && Array.isArray(ids))
    .map(([key, ids]) => [key, ids.filter(id => typeof id === "string" && id.length < 200).slice(0, 40)]).slice(-800))};
  reader.memory = (Array.isArray(reader.memory) ? reader.memory : []).filter(item => item && typeof item.id === "string" && typeof item.text === "string" &&
    typeof item.label === "string" && Number.isInteger(item.box) && item.box >= 0 && item.box < MEMORY_INTERVALS.length && /^\d{4}-\d{2}-\d{2}$/.test(item.due || ""))
    .slice(0, 1000).map(item => ({id: item.id.slice(0, 500), label: item.label.slice(0, 300), text: item.text.slice(0, 5000), ref: Array.isArray(item.ref) ? item.ref : [],
      box: item.box, due: item.due, added: Number(item.added) || 0, reviews: Number(item.reviews) || 0, ...(item.last ? {last: String(item.last).slice(0, 10)} : {})}));
  reader.openTodayFirst = reader.openTodayFirst !== false;
  if (typeof reader.lastOpenDay !== "string") delete reader.lastOpenDay;
}
