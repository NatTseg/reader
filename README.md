# reader

Live: https://nattseg.github.io/reader/

A simple, offline Scripture reader. LXX2012 Septuagint Old Testament with the World English Bible New Testament, original study notes, bookmarks, highlights, comments, and passages for everyday life.

- **Read:** choose any book and chapter from a vertical chapter list; tap a verse number to save or annotate it.
- **Random passage:** Books & chapters → Random passage opens a randomly selected source verse in its chapter. Go back or drag right to return to the earlier reading position. All books in the app participate; missing verse numbers are skipped.
- **Library:** PDF and EPUB books, plus guides, have their own footer tab. Add book imports private files under 50 MB; Continue reading resumes the most recently opened book at its saved page/section and scroll position. The Spiritual Man links to the church-hosted source; save that PDF to Files and import it on the book page. Original books and their notes stay in the separate `reader-library` IndexedDB database.
- **Book reading tools:** PDF Text view infers paragraphs and headings from source layout; Page view preserves the original page and its proportions, with bounded raster memory on phones. PDF page failures retain the last readable page and offer retry; readable text is used if drawing fails. Stalled PDF work has a timeout, and Contents/Search remain available during a slow page load. Mode changes retain the current scroll position and pending page. Contents uses PDF outlines or EPUB 2/3 navigation. Search book finds selectable text, highlights the first match, and opens its page/section; image-only pages cannot be searched. Save / notes bookmarks your current place and optionally stores selected text and a reflection, with editing and removal. EPUB chapters use the reading font, size, and spacing. Reflowable EPUBs without DRM are supported; fixed-layout books should use their PDF edition. Imported scripts, embedded frames, publisher styling, and remote assets are not run or loaded.
- **Complete library backup:** Library → Backup & restore → Back up Reader downloads one ZIP with the original books, their saved passages/reflections, reading places, and the complete Bible/OSB JSON backup. Restore checks file hashes, parses each book, and previews the replacement before committing; Undo the last complete restore recovers the previous library and Bible. Archives support up to 200 MB of book files. Save original to Files exports an individual book without its Reader annotations. Existing Bible JSON backups and optional cloud sync remain separate and exclude library files.
- **Kallistos Ware:** How to read Scripture is available from Library, Books & chapters, and Reading settings. An original short summary is bundled offline, with a link to the full OCA article. When the owner’s OSB import includes How to Read the Bible, the guide also links directly to that private full-text copy offline.
- **Search:** enter a reference such as John 3:16 or a phrase such as “love one another.”
- **Wisdom:** browse passages by topic.
- **Prayers:** a simple prayer book with eight prayers and Psalm text, available offline.
- **Personal study notes:** import your `reader-study-notes.json` in Reading settings to store your notes and introductions on this device for offline use. New Testament notes link from verses. Original Old Testament notes remain accessible below chapters in a reference browser; their alignment with LXX2012 is explicitly unverified.
- **OSB reading context:** the updated personal import adds the complete introductions to all 76 OSB books and ten guides, including How to Read the Bible, the book overview, glossary, and lectionary. Open a book’s introduction above its verses, or browse Reading settings → OSB guides & book introductions. The five separately displayed additions use their parent book’s introduction; 4 Maccabees has no OSB introduction. The guides retain the source edition’s references and ebook navigation instructions.
- **Saved:** filter your bookmarks, highlights, and comments.
- **Go back:** drag right from a prayer, Wisdom topic, reading guide, book picker, or linked passage. The current view slides with your finger and reveals its parent. Release beyond roughly one third of the view to go back; a short drag, reversal, or touch cancellation restores the current view.
- **Reading settings:** change text size, light/dark appearance, introductions, and notes.
- **Device persistence:** reading position, saves, history, plan progress, and preferences are mirrored into IndexedDB. Startup recovers the newer copy from localStorage or IndexedDB. Imported OSB material stays in IndexedDB across app-cache updates.
- **Storage & backup:** check offline readiness, request browser storage protection, repair missing offline files, and export a complete Reader ZIP or a smaller Bible-only JSON to Files or iCloud Drive. Restore previews the contents and keeps an undo copy; reader state and personal imports commit together.
- **Reading tools:** recent passages, three reading plans with saved completion, focus mode, font selection, line spacing, and page tone. Search can be restricted to a testament, book, study notes, or guides. Notes and related passages open in previews. Returning from a note or guide restores its search or source-note list, including filters and scroll position. Reading-plan changes retain Reading settings as their back destination.

Footer buttons always open their section’s main view. Preferences, saved verses, and imported study notes remain in this browser. Existing `obible3` data is preserved across the redesign. Calendar and Hours sections have been removed.

The Bible text is LXX2012 + WEB NT, not the printed Orthodox Study Bible’s SAAS/NKJV translation. Built-in introductions and verse notes are original; users can import notes from their own copy without uploading them to this repository. Copyrighted library books and the full Kallistos article are not republished here. Their source links open online, and imported private copies stay on the reading device. PDF.js 6.4.299 and fflate 0.8.3 are vendored with their licenses so book reading and backups work offline.

No account or backend is required. Cloud sync is disabled by default and its settings are hidden until configured. Optional backend code is documented in `cloud/README.md`. Device storage is not a substitute for a backup outside the browser: clearing site data or losing the phone can remove both local copies.

## Local preview

Run `python3 -m http.server 8080` in this directory, then open http://localhost:8080. No build step or external dependencies are required. Use an HTTP server rather than opening index.html as a file.

See `GITHUB.md` for GitHub Pages and offline installation. Run regression checks with `node --test tests/*.test.cjs`.

The app icon is the selected Jesus-with-halo outline. Its editable source is `icon.svg`; regenerate the phone and launcher PNGs with `python3 scripts/build_icons.py` (requires CairoSVG and Cairo; see the script for Homebrew library discovery). Inside the app, the header reads **Reader** and uses the separate fish mark in `fish.svg`.

## Text and numbering

- Old Testament: [LXX2012](https://ebible.org/eng-lxx2012/), Brenton’s Greek Septuagint translation with language updates by Michael Paul Johnson; public domain.
- New Testament: existing World English Bible text, unchanged; public domain.
- All 28,326 source verse records are preserved, including the source’s combined verse labels and omissions. No missing LXX verses are filled from WEB. Psalm 151 is a separate reader entry. Daniel’s additions and the Letter of Jeremiah retain their separate source books. The earlier Hebrew Esther duplicate and 2 Esdras are no longer in the main reader.
- Psalm numbering follows LXX2012. Wisdom references and the Psalm 50 (51) prayer were updated. A Proverbs 22:6 Wisdom reference was removed because that verse is absent from this edition.
- Existing OT bookmarks, highlights, and comments are preserved under Saved → Saved before the Septuagint update, with their original WEB wording and references. NT saves remain attached. `legacy-web-data.js` is retained solely for this offline migration and reference archive.
- Imported OSB notes are not assumed to share LXX2012 verse numbering. All original note keys and text remain available through the notes browser below OT chapters. They are not pinned to unverified LXX verses.

Rebuild with `python3 scripts/build_septuagint.py /path/to/eng-lxx2012_vpl.zip`. The source URL, SHA-256, and counts are recorded in `data/lxx2012-source.json`. The script takes the unchanged WEB NT and migration archive from commit `b42fa0d`.

To rebuild a private context import from the owner’s extracted MOBI HTML, run `python3 scripts/build_personal_context.py /path/to/book.html /path/to/reader-study-notes.json /path/outside/repo/reader-osb-context.json` (requires BeautifulSoup). The resulting JSON includes the existing notes unchanged and stays outside the published repository. Import it on each reading device; IndexedDB persists it independently of app cache updates. Older notes-only imports remain supported.

For source-linked notes, run `python3 scripts/align_personal_notes.py /path/to/book.html /path/to/reader-osb-context.json /path/outside/repo/reader-osb-complete.json`. This preserves the earlier notes and adds source verse text, conservative text matches, and review candidates. Only close, distinctive matches are attached automatically; unmatched notes remain browsable and can be linked after comparing both verses in the app. Text matching is not a scholarly verification of every verse. Output and the alignment review report contain private copyrighted material and must stay outside this repository.
