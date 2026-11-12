# Reader · OSB text edition

The same offline Reader, reading the owner's Orthodox Study Bible: the St. Athanasius Academy Septuagint
Old Testament and the New King James Version New Testament, in the OSB's own book order, names, chapter and
verse numbering, with its section headings, study notes, translators' notes, book introductions, guides, and
study articles.

The Bible text and all study material are copyrighted. They are never committed or published in readable form.
The site serves two encrypted packs (`bible.enc`, `study.enc`: gzip, then AES-256-GCM; the key derives from a
passphrase with PBKDF2-SHA256, 600,000 rounds). A private link (`#osb=<key>`) opens them on a device; the key
stays in the address bar so an iPhone Home Screen app keeps it, and is also remembered in that browser.
Without a key the app shows only a lock screen.

## What is in the app

- **Tabs:** Today (the day's Gospel from the Coptic Katameros, with the season, feast, and Synaxarium
  commemorations; the Liturgy Psalm to carry; reading plan), Read, Wisdom (57 topics), Prayers (the Agpeya hours
  and the prayer book). Library, text settings, and search are in the header.
- **Read:** verses as the OSB prints them. Poetry lines hang and stanzas are spaced; a paragraph break inside a
  verse stays a paragraph break; the edition's italics are kept; section headings sit where they fall, including
  inside a verse, with the parallel passages printed under them; Psalms carry the OSB's titles ("Psalm 22 (23)").
  A dot after a verse opens its OSB note. A small letter in the New Testament marks a translators' note.
  Notes for the chapter, and any study article printed in that chapter, are listed below it.
- **Numbering:** everything uses OSB numbering (Septuagint Psalms, 1 to 4 Kingdoms, 1 and 2 Ezra, Esther's
  lettered verses such as 4:17a). Lectionary Psalms show the Orthodox number with the English one beside it.
- **Saving, memory verses, plans, backup, the PDF/EPUB library, themes, gestures:** as in Reader.

This edition keeps its own storage (`reader-osb-state`, `reader-osb-personal`, `reader-osb-library`, caches
named `reader-osb-v*`), so it never touches the other Reader on the same site. Backups from the other Reader are
refused because their verse numbers differ.

## Build (private inputs stay outside the repository)

1. `python3 scripts/extract_osb_edition.py <osb-mobi.html> ~/Documents/reader-private/osb/osb-edition.json`
   reads the raw MOBI HTML of the owner's copy and writes the private edition file: every verse with its printed
   number, the layout of its lines, italics, translators' note letters, section headings and their parallel
   passages, chapter titles, the study notes (each placed on the verse it names, including the notes on liturgical
   use that the ebook does not link from a verse), translators' notes, book introductions, and study articles.
   Stray spaces the ebook's markup leaves before punctuation are removed; no other character changes.
   It prints counts only.
2. `python3 scripts/build_osb_edition.py <osb-edition.json> <earlier-private-osb.json> <public-reader-dir> ~/Documents/reader-private/osb/build <KatamerosDatabase.db>`
   writes the private `bible.json` and `study.json` (the ten front- and back-matter guides come from the earlier
   private extraction and are checked against the ebook by the tests), and regenerates the public reference lists
   `katameros-data.js` and `wisdom-data.js` in OSB numbering (numbers only, no text). English references are
   mapped by aligning texts, with the lectionary's own English Bible, the WEB, and LXX2012 as witnesses; the
   report lists anything unmapped or weak.
3. `node scripts/encrypt_osb_edition.mjs ~/Documents/reader-private/osb/build` writes `bible.enc`, `study.enc`,
   `edition.json`, and the git-ignored `.osb-unlock-link`. The passphrase comes from `$OSB_PASSPHRASE` or the
   macOS Keychain item `unseen-warfare-pages`; the salt is `scripts/edition-salt.txt`.
4. `node --test tests/*.test.cjs` runs against the private build (set `OSB_BUILD_DIR` if it lives elsewhere).
5. `scripts/deploy_pages.sh` runs the tests, copies only the files the app serves, checks again that no Bible or
   study text is among them, and publishes to the Pages repository.

After any change to served files, raise `CACHE` in `sw.js`.

## Checks the tests make

- With the source ebook present, every verse, note, translators' note, introduction, guide, and article is
  found in it word for word.
- Canon, book names, 1,346 chapters and 36,089 verses present; New Testament verse counts match the NKJV.
- Every verse renders with exactly its own words (notes on and off); italics and line layout cover what the
  source marks; headings sit on existing verses.
- Every study note sits on the verse its own reference names; every translators' note has its letter in the text.
- Every lectionary reading through 2030 and every Wisdom passage resolves completely.
- The encrypted packs are exactly the tested build, open only with the right key, and nothing readable is
  among the published files.

## Local preview

`python3 -m http.server 8080`, then open `http://localhost:8080/#osb=<key>` (the link in `.osb-unlock-link`,
with the host changed).

Lectionary references come from the open-source Katameros project (MIT). PDF.js and fflate are vendored with
their licenses.
