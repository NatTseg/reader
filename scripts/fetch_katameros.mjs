// Precomputes Coptic Katameros reading references from the open-source Katameros API
// (https://github.com/pierresaid/katameros-api, MIT). Only book/chapter/verse references are kept, never Bible text.
// Usage: node scripts/fetch_katameros.mjs 2026-10-01 2030-12-31 data/katameros-raw.json
import fs from "node:fs";
const [from = "2026-10-01", to = "2030-12-31", output = "data/katameros-raw.json"] = process.argv.slice(2);
const store = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : {};
const pad = n => String(n).padStart(2, "0");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function compact(day) {
  return {coptic: day.copticDate || "", title: day.title || "", period: day.periodInfo || "",
    sections: (day.sections || []).map(section => ({title: section.title,
      subs: (section.subSections || []).filter(sub => sub.title !== "Synaxarium").map(sub => ({title: sub.title,
        readings: (sub.readings || []).map(reading => (reading.passages || []).map(p => ({b: p.bookId, c: p.chapter, v: (p.verses || []).map(v => v.number)})))
          .filter(passages => passages.length)})).filter(sub => sub.readings.length)})).filter(section => section.subs.length)};
}
let fetched = 0;
for (let date = new Date(`${from}T12:00:00Z`); date <= new Date(`${to}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1)) {
  const key = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  if (store[key]) continue;
  const url = `https://api.katameros.app/readings/gregorian/${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}?languageId=2`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {headers: {"User-Agent": "reader-katameros-precompute"}});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      store[key] = compact(await response.json());
      break;
    } catch (error) {
      if (attempt === 4) { console.error(`${key}: ${error.message}`); break; }
      await sleep(3000 * attempt);
    }
  }
  if (++fetched % 25 === 0) { fs.writeFileSync(output, JSON.stringify(store)); console.log(`${key} (${Object.keys(store).length} days)`); }
  await sleep(900);
}
fs.writeFileSync(output, JSON.stringify(store));
console.log(`done: ${Object.keys(store).length} days`);
