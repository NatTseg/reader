#!/bin/bash
# Publishes the OSB text edition to a public GitHub Pages repository.
# Only code, reference numbers, and the two ENCRYPTED packs are published. The readable Bible text and study
# material stay on this machine (the private build directory), and this script refuses to publish them.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGES_REPO="${PAGES_REPO:-NatTseg/reader-osb}"
export OSB_BUILD_DIR="${OSB_BUILD_DIR:-$HOME/Documents/reader-private/osb/build}"
cd "$ROOT"
[ -f "$OSB_BUILD_DIR/bible.json" ] || { echo "No private build at $OSB_BUILD_DIR"; exit 1; }
echo "Running tests…"
node --test tests/*.test.cjs > /dev/null || { echo "Tests failed; nothing was published."; exit 1; }
OUT="$(mktemp -d)"; trap 'rm -rf "$OUT"' EXIT
# Exactly the files the service worker caches, plus the worker itself and the maskable icon the manifest names.
node -e '
const fs = require("fs"), path = require("path"), out = process.argv[1];
const files = new Set([...fs.readFileSync("sw.js", "utf8").matchAll(/"\.\/([^"]+)"/g)].map(m => m[1].split("?")[0]).filter(Boolean));
for (const extra of ["sw.js", "icon-maskable-512.png"]) files.add(extra);
for (const file of files) { fs.mkdirSync(path.dirname(path.join(out, file)), {recursive: true}); fs.copyFileSync(file, path.join(out, file)); }
console.log(files.size + " files");
' "$OUT"
printf 'User-agent: *\nDisallow: /\n' > "$OUT/robots.txt"; touch "$OUT/.nojekyll"
# Guard: nothing readable from the private build may be in the output.
node -e '
const fs = require("fs"), path = require("path"), out = process.argv[1], build = process.env.OSB_BUILD_DIR;
const bible = JSON.parse(fs.readFileSync(path.join(build, "bible.json"), "utf8")), study = JSON.parse(fs.readFileSync(path.join(build, "study.json"), "utf8"));
const samples = [];
for (const book of bible.books) for (const c of [0, Math.floor(book.n / 2), book.n - 1]) { const v = bible.t[book.id][c].filter(t => t.length >= 70); if (v.length) samples.push(v[Math.floor(v.length / 2)].replace(/\n/g, " ").slice(8, 58)); }
Object.values(study.sourceNotes).forEach((n, i) => { if (i % 40 === 0 && n.body.length > 120) samples.push(n.body.slice(40, 90)); });
const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
for (const file of walk(out)) {
  if (/(bible|study)\.json$|osb-edition|unlock-link|bible-data\.js/.test(file)) { console.error("Private file in output: " + file); process.exit(1); }
  if (/\.(enc|png|wasm|pfb|ttf|bcmap|icc)$/.test(file)) continue;
  const text = fs.readFileSync(file, "utf8").replace(/\s+/g, " ");
  for (const s of samples) if (text.includes(s.replace(/\s+/g, " "))) { console.error("Readable Bible or study text in " + file); process.exit(1); }
}
for (const pack of ["bible.enc", "study.enc"]) if (fs.readFileSync(path.join(out, pack)).includes(Buffer.from("the Lord"))) { console.error(pack + " is not encrypted"); process.exit(1); }
console.log("No readable text in the output (" + samples.length + " passages checked).");
' "$OUT"
gh repo view "$PAGES_REPO" >/dev/null 2>&1 || gh repo create "$PAGES_REPO" --public --description "Encrypted reading copy (private link required)" >/dev/null
cd "$OUT" && git init -q -b main && git add -A && git commit -qm "Deploy $(date -u +%FT%TZ)"
git push -q --force "https://github.com/$PAGES_REPO.git" main
gh api "repos/$PAGES_REPO/pages" >/dev/null 2>&1 || gh api -X POST "repos/$PAGES_REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
echo "Deployed to https://$(echo "$PAGES_REPO" | cut -d/ -f1 | tr '[:upper:]' '[:lower:]').github.io/$(echo "$PAGES_REPO" | cut -d/ -f2)/"
