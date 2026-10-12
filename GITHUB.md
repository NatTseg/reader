# GitHub Pages and offline installation

Live: https://nattseg.github.io/reader/

Publish the repository root from `main` using Settings → Pages → Deploy from a branch.

Keep all root app assets together, including `persistence.js`, `reader-tools.js`, `library.js`, `note-alignment.js`, `cloud-config.js`, and `cloud-sync.js`, `library-formats.js`, `library-tools.js`, and `library-backup.js`, plus the `vendor/pdfjs` and `vendor/fflate` directories. The complete offline asset list is in `sw.js`.

Open the Pages URL while connected, let the first download finish, then use your browser’s “Add to Home Screen” or “Install” command. After the service worker has cached the app, it works offline. Bookmarks, comments, highlights, and progress are stored in this browser.

When changing app files, increment the cache version in `sw.js` so installed readers receive the new assets. Close and reopen the app after an update to use the new version. Do not clear site data to update: that also erases saved verses.

After the repository rename to reader, open the new URL online once to cache it for offline reading. Existing saved verses, preferences, and imported notes use the same storage keys on the same GitHub Pages origin. If a Home Screen shortcut still points to the previous address, add the new address to update its name and icon. Keep site data when updating.

## Personal study notes on your phone

Transfer your study-notes JSON file from your Mac to Files on your phone (for example, with AirDrop). Open the installed reader app, choose Reading settings → Import study notes, and select that file. Wait for the imported note count, then open a chapter. The file is stored in this device’s IndexedDB and is available after offline reloads; app-cache updates do not delete it. Import in the browser or Home Screen app you intend to use, since storage can be separate. Keep the notes file as a backup: clearing browser/site data or removing an app can remove its local data.

The existing extracted note references are preserved. The reader uses LXX2012 for the Old Testament and WEB for the New Testament. Imported OT notes can be read from the notes section below each chapter, using their original reference numbers; they are not automatically attached to LXX2012 verses. Importing notes does not replace the Bible text with the printed OSB translation.

The newer `reader-osb-complete.json` import also supplies conservatively matched source-note links. Unmatched notes remain accessible through Browse all OSB source notes, where Review verse link lets you compare the original and reader text before attaching a note. Earlier notes remain in their own archive.

## Persistence on iPhone

Open Reading settings → Storage & backup. Wait for “Bible and app files are ready for offline reading.” Use Protect device storage to request protection; the status reports whether the browser grants it. Reading changes save automatically without an account or internet connection.

Use Complete backup with Library → Back up Reader (also in Library → Backup & restore) and save the ZIP in Files or iCloud Drive. It includes original PDF/EPUB books, saved book passages, reflections, reading places, and the Bible/OSB backup. Restore checks the files and previews the replacement. Undo the last complete restore keeps a recovery copy of both the library and Bible. The archive limit is 200 MB of book files.

Back up my Bible only keeps the smaller JSON option, compatible with earlier backups, without library books or their annotations. It includes imported OSB content, annotations, reading position, history, plans, and preferences. Choose a backup to restore previews the contents before replacing device data; Undo the last restore recovers the preceding copy. Cloud credentials are never included.

Both localStorage and IndexedDB belong to the browser. Browser data clearing, device loss, or storage eviction can remove them; a file saved outside the browser is the recovery copy. Safari and an installed Home Screen app may use separate storage, so import or restore in the one you use for reading. GitHub Pages updates replace cached public assets without deleting personal data.

## Reading books

Library → Add book accepts PDFs and reflowable EPUB 2/3 files without DRM, under 50 MB. Imports remain private on the device. Open a book and use Contents, Search book, and Save / notes. Select text before Save / notes to include a quotation. Continue reading at the top of Library resumes the most recently opened book. PDF Text view preserves paragraphs where source layout allows; Page view shows the publisher layout. EPUB chapters use your Reader typography settings. Scanned PDFs without selectable text cannot be searched; fixed-layout EPUBs should use their PDF edition.

The Jesus icon uses a clear gap between the halo and hair. Launcher and iPhone PNGs are generated from `icon.svg`; versioned icon URLs request the updated artwork. PDF errors offer retry without discarding the last readable page. PDF display changes preserve the saved reading place, and page images keep their original proportions as the viewport changes.
