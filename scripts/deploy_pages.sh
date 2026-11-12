#!/bin/bash
# Publishes the OSB text edition to a public GitHub Pages repository.
# Only code, reference numbers, and the two ENCRYPTED packs are published. The readable Bible text and study
# material stay on this machine (the private build directory), and this script refuses to publish them.
# DRY_RUN=1 does everything except publish.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGES_REPO="${PAGES_REPO:-NatTseg/reader-osb}"
SITE="https://$(echo "$PAGES_REPO" | cut -d/ -f1 | tr '[:upper:]' '[:lower:]').github.io/$(echo "$PAGES_REPO" | cut -d/ -f2)"
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
touch "$OUT/.nojekyll"
# Guard: nothing readable from the private build, and no key, may be in the output. Every run of eight words in
# every published text file is compared with the whole private build.
node -e '
const fs = require("fs"), path = require("path"), out = process.argv[1], root = process.argv[2], build = process.env.OSB_BUILD_DIR;
const { leaks, BINARY } = require(path.join(root, "scripts", "leak_scan.cjs"));
const bible = JSON.parse(fs.readFileSync(path.join(build, "bible.json"), "utf8")), study = JSON.parse(fs.readFileSync(path.join(build, "study.json"), "utf8"));
const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const files = walk(out).map(file => path.relative(out, file));
const stop = message => { console.error(message + " Nothing was published."); process.exit(1); };
for (const file of files) if (/(bible|study)\.json$|osb-edition|unlock-link|bible-data\.js|\.py$|\.mjs\.map$/.test(file)) stop("Private file in the output: " + file + ".");
const found = leaks(out, files, bible, study);
if (found.length) stop("Readable Bible or study text in the output (" + found.slice(0, 5).join("; ") + ").");
for (const pack of ["bible.enc", "study.enc"]) if (fs.readFileSync(path.join(out, pack)).includes(Buffer.from("the Lord"))) stop(pack + " is not encrypted.");
const secrets = [];
const link = path.join(root, ".osb-unlock-link");
if (fs.existsSync(link)) { const key = fs.readFileSync(link, "utf8").trim().split("#osb=")[1]; if (key) secrets.push(key, Buffer.from(key, "base64url").toString("base64")); }
if (process.env.OSB_PASSPHRASE) secrets.push(process.env.OSB_PASSPHRASE);
for (const file of files) { const bytes = fs.readFileSync(path.join(out, file)); for (const secret of secrets) if (bytes.includes(Buffer.from(secret))) stop("The unlock key or passphrase is in " + file + "."); }
console.log("No readable text and no key in the output (" + files.length + " files, " + files.filter(f => !BINARY.test(f)).length + " compared word by word).");
' "$OUT" "$ROOT"
# Installed copies only update when the cache name changes: refuse to publish changed files under the same name.
LOCAL_CACHE="$(sed -n 's/^const CACHE = "\(.*\)";/\1/p' sw.js | head -1)"
LIVE_CACHE="$(curl -fsS --max-time 20 "$SITE/sw.js" 2>/dev/null | sed -n 's/^const CACHE = "\(.*\)";/\1/p' | head -1 || true)"
if [ -n "$LIVE_CACHE" ] && [ "$LIVE_CACHE" = "$LOCAL_CACHE" ]; then
  for f in index.html boot.js app.js today.js edition.js reader-tools.js styles.css edition.json katameros-data.js wisdom-data.js; do
    if ! curl -fsS --max-time 30 "$SITE/$f" 2>/dev/null | cmp -s - "$OUT/$f"; then
      echo "$f changed but CACHE in sw.js is still $LOCAL_CACHE. Raise it so installed copies update. Nothing was published."; exit 1
    fi
  done
fi
if [ -n "${DRY_RUN:-}" ]; then
  echo "Dry run: $(find "$OUT" -type f | wc -l | tr -d ' ') files, $(du -sh "$OUT" | cut -f1) ready (cache $LOCAL_CACHE; live ${LIVE_CACHE:-none}); nothing published."
  exit 0
fi
gh repo view "$PAGES_REPO" >/dev/null 2>&1 || gh repo create "$PAGES_REPO" --public --description "Encrypted reading copy (private link required)" >/dev/null
cd "$OUT" && git init -q -b main && git add -A && git commit -qm "Deploy $(date -u +%FT%TZ)"
git push -q --force "https://github.com/$PAGES_REPO.git" main
gh api "repos/$PAGES_REPO/pages" >/dev/null 2>&1 || gh api -X POST "repos/$PAGES_REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
echo "Deployed to $SITE/"
