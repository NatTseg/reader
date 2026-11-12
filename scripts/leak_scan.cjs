// Finds readable private text in the files the site serves: any run of eight consecutive words that also occurs
// in the private build (Bible text by chapter, study notes, translators' notes, introductions, guides, articles).
// Used by the tests and by scripts/deploy_pages.sh. It reports where a run was found, never the words.
const fs = require("node:fs"), path = require("node:path");
const RUN = 8;
const words = (text) => String(text).toLowerCase().replace(/[‘’]/g, "'").match(/[a-z']+/g) || [];
const BINARY = /\.(enc|png|jpg|jpeg|gif|ico|wasm|pfb|ttf|otf|woff2?|bcmap|icc|pdf)$/i;

function privateTexts(bible, study) {
  const units = [];
  for (const book of bible.books) bible.t[book.id].forEach((chapter, c) => units.push([`${book.id} ${c + 1}`, chapter.join(" ")]));
  for (const [key, note] of Object.entries(study.sourceNotes || {})) units.push([`note ${key}`, note.body]);
  for (const [key, list] of Object.entries(study.textNotes || {})) units.push([`translators' note ${key}`, list.map(([, text]) => text).join(" . ")]);
  for (const [id, article] of Object.entries(study.introductions || {})) units.push([`introduction ${id}`, article.blocks.map((b) => b.text || "").join(" . ")]);
  (study.guides || []).forEach((guide, i) => units.push([`guide ${i}`, guide.blocks.map((b) => b.text || (b.rows || []).flat().join(" . ")).join(" . ")]));
  for (const [key, line] of Object.entries(bible.parallels || {})) units.push([`parallel ${key}`, line]);
  return units;
}
// files: [[name, text]] of served text files. Returns [{file, where}] for every shared run (one per file and place).
function scan(files, bible, study) {
  const served = new Map();
  for (const [name, text] of files) {
    const w = words(text);
    for (let i = 0; i + RUN <= w.length; i++) { const gram = w.slice(i, i + RUN).join(" "); if (!served.has(gram)) served.set(gram, name); }
  }
  const hits = new Map();
  for (const [where, text] of privateTexts(bible, study)) {
    const w = words(text);
    for (let i = 0; i + RUN <= w.length; i++) {
      const file = served.get(w.slice(i, i + RUN).join(" "));
      if (file) hits.set(`${file}|${where}`, { file, where });
    }
  }
  return [...hits.values()];
}
function servedTextFiles(dir, names) {
  return names.filter((name) => !BINARY.test(name) && fs.existsSync(path.join(dir, name)) && fs.statSync(path.join(dir, name)).isFile())
    .map((name) => [name, fs.readFileSync(path.join(dir, name), "utf8")]);
}
// Runs that are shared for a known, public reason: traditional prayers (the Lord's Prayer and other liturgical
// phrases the prayer book has and the OSB quotes), two feast titles in the public lectionary data, and an
// alphabet in the PDF library. Anything else is a leak.
const ALLOWED = new Set([
  "prayers-data.js|MAT 6", "prayers-data.js|LUK 11", "prayers-data.js|note EXO:12:51", "prayers-data.js|note PSA:69:1",
  "prayers-data.js|note 1TH:5:15", "prayers-data.js|note REV:4:8", "prayers-data.js|note REV:21:23",
  "katameros-data.js|note LUK:24:36", "katameros-data.js|guide 8", "vendor/pdfjs/pdf.worker.mjs|guide 9",
]);
// The places where served files share a run of words with the private build without a known reason.
function leaks(dir, names, bible, study) {
  return scan(servedTextFiles(dir, names), bible, study).filter((hit) => !ALLOWED.has(`${hit.file}|${hit.where}`)).map((hit) => `${hit.file}: ${hit.where}`);
}
module.exports = { scan, leaks, servedTextFiles, BINARY, RUN };
