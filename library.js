// Private PDF files and their reading positions live separately from the app cache.
const LIBRARY_FEATURED = [{
  id: "spiritual-man", title: "The Spiritual Man", author: "Pope Shenouda III",
  description: "Reflections on spiritual growth, prayer, and self-control.",
  source: "https://ukmidcopts.org/kotob/HH%20Pope%20Shenouda/The%20Spiritual%20Man.pdf",
  sourceName: "Coptic Orthodox Diocese of the Midlands, U.K.",
  edition: "English · COPT, 1998 · 211 PDF pages",
}];
let libraryBooks = [], libraryLoading = true, libraryError = "";
let activeLibraryPdf = null, pdfRendererPromise;

function libraryDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("reader-library", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("catalog", {keyPath: "id"});
      request.result.createObjectStore("files");
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other Reader tabs and try again."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
async function libraryTransaction(stores, mode, operation) {
  const db = await libraryDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    try { result = operation(tx); }
    catch (error) { tx.abort(); db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(result?.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error("Library storage is unavailable.")); };
  });
}
async function restoreLibrary() {
  try {
    libraryBooks = await libraryTransaction(["catalog"], "readonly", tx => tx.objectStore("catalog").getAll());
    libraryError = "";
  } catch { libraryError = "Saved PDFs could not be opened. Reload to try again."; }
  libraryLoading = false;
  if (state.tab === "library") renderLibrary();
}
function libraryCard(book, status) {
  return `<button class="result library-card" data-library-book="${esc(book.id)}"><strong>${esc(book.title)}</strong><small>${esc(book.author || "Your PDF")}</small><span class="helper">${esc(status)}</span></button>`;
}
function renderLibrary() {
  cancelBackSlide();
  const personal = libraryBooks.filter(book => !LIBRARY_FEATURED.some(feature => feature.id === book.id));
  pane.innerHTML = `<div class="content"><p class="eyebrow">Books &amp; reading guides</p><h1>Library</h1><p class="subtitle">A place for the readings you want to return to.</p><button class="secondary" id="libraryAddPdf">Add PDF</button><input id="libraryPdfFile" type="file" accept=".pdf,application/pdf" hidden>${libraryLoading ? '<p class="helper">Opening your library…</p>' : ""}${libraryError ? `<p class="helper" role="status">${esc(libraryError)}</p>` : ""}<h2 class="section-label">Books</h2><div class="library-list">${LIBRARY_FEATURED.map(book => {const saved = libraryBooks.find(item => item.id === book.id);return libraryCard(book, saved ? `Offline · page ${saved.page} of ${saved.pages}` : "Read online · import a PDF for offline reading");}).join("")}${personal.map(book => libraryCard(book, `Offline · page ${book.page} of ${book.pages}`)).join("")}</div><h2 class="section-label">Reading guides</h2><div class="library-list"><button class="result" data-essay="kallistos-reading"><strong>How to read Scripture</strong><small>Metropolitan Kallistos Ware · summary &amp; full guide</small></button><button class="result" data-essay="typology"><strong>How Scripture speaks of Christ</strong><small>Reader guide</small></button>${personalGuides.length ? personalGuides.map((guide, i) => `<button class="result" data-context-guide="${i}"><strong>${esc(guide.title)}</strong><small>Your Orthodox Study Bible copy · offline</small></button>`).join("") : ""}</div><p class="helper library-storage-note">Imported PDFs stay on this device. Keep their originals in Files; Bible backups do not include PDF files.</p></div>`;
  $("libraryAddPdf").onclick = () => $("libraryPdfFile").click();
  $("libraryPdfFile").onchange = event => importLibraryPdf(event.target.files?.[0]);
  pane.scrollTop = 0;
}
function showLibraryBook(id, origin = captureDialogReturn()) {
  const feature = LIBRARY_FEATURED.find(book => book.id === id);
  const saved = libraryBooks.find(book => book.id === id);
  const book = feature || saved;
  if (!book) return;
  const back = origin?.show || closeDialog;
  openDialog(book.title, `<article class="essay"><button class="text-button" id="libraryBookBack">‹ ${esc(origin?.title || "Library")}</button><p class="eyebrow">${esc(book.author || "Your PDF")}</p>${book.description ? `<p>${esc(book.description)}</p>` : ""}${book.edition ? `<p class="helper">${esc(book.edition)}</p>` : ""}${saved ? `<p class="helper">Saved offline · page ${saved.page} of ${saved.pages}</p><button class="primary" data-library-read="${esc(id)}">${saved.page > 1 ? "Continue reading" : "Read in Reader"}</button><div class="context-list"><button class="text-button" data-library-export="${esc(id)}">Save a copy to Files</button><button class="text-button" data-library-remove="${esc(id)}">Remove offline copy</button></div>` : ""}${feature ? `<p class="essay-source"><a href="${esc(feature.source)}" target="_blank" rel="noopener noreferrer">Open the full PDF ↗</a> <span class="helper">(online)</span></p><p class="helper">Source: ${esc(feature.sourceName)}</p>${!saved ? '<p class="helper">Save the PDF to Files, then import it here to read offline and keep your place.</p><button class="secondary" id="libraryImportBook">Import this PDF</button><input id="libraryBookFile" type="file" accept=".pdf,application/pdf" hidden>' : ""}` : ""}</article>`);
  dialogBack = origin ? back : null;
  dialogBackSnapshot = origin?.snapshot || null;
  dialogRefresh = () => showLibraryBook(id, origin);
  $("libraryBookBack").onclick = back;
  if (feature && !saved) {
    $("libraryImportBook").onclick = () => $("libraryBookFile").click();
    $("libraryBookFile").onchange = event => importLibraryPdf(event.target.files?.[0], id);
  }
}
function pdfAssets(folder) {
  return new URL(`./vendor/pdfjs/${folder}/`, location.href).href;
}
function pdfRenderer() {
  if (!pdfRendererPromise) pdfRendererPromise = import("./vendor/pdfjs/pdf.mjs").then(module => {
    module.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.mjs", location.href).href;
    return module;
  }).catch(error => { pdfRendererPromise = null; throw error; });
  return pdfRendererPromise;
}
function pdfOptions(buffer) {
  return {data: new Uint8Array(buffer), cMapUrl: pdfAssets("cmaps"), cMapPacked: true,
    standardFontDataUrl: pdfAssets("standard_fonts"), wasmUrl: pdfAssets("wasm"),
    isEvalSupported: false, useSystemFonts: true};
}
async function validateLibraryPdf(file) {
  if (!file || !file.size || file.size > 50 * 1024 * 1024)
    throw new Error("Choose a PDF smaller than 50 MB.");
  const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!header.includes("%PDF-")) throw new Error("Choose a PDF file.");
}
function pdfImportError(error) {
  return error?.name === "PasswordException" ? "Use a PDF without password protection."
    : error?.name === "QuotaExceededError" ? "There is not enough device storage for this PDF."
    : error?.name === "InvalidPDFException" ? "This PDF could not be read. Try another copy."
    : error?.message || "The PDF could not be saved. Try again.";
}
async function importLibraryPdf(file, featuredId) {
  if (!file) return;
  const generation = searchGeneration;
  let task;
  try {
    await validateLibraryPdf(file);
    notify("Saving PDF…");
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
    const renderer = await pdfRenderer();
    task = renderer.getDocument(pdfOptions(buffer));
    const pdf = await task.promise;
    const feature = LIBRARY_FEATURED.find(book => book.id === featuredId);
    const previous = libraryBooks.find(book => feature ? book.id === feature.id : book.hash === hash);
    const book = {id: feature?.id || previous?.id || `pdf-${hash}`, hash,
      title: feature?.title || previous?.title || file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "Untitled PDF",
      author: feature?.author || previous?.author || "", filename: file.name, size: file.size,
      pages: pdf.numPages, page: previous?.hash === hash ? previous.page : 1,
      view: previous?.view || "text", addedAt: previous?.addedAt || Date.now()};
    await libraryTransaction(["catalog", "files"], "readwrite", tx => {
      tx.objectStore("catalog").put(book);
      tx.objectStore("files").put(file, book.id);
    });
    libraryBooks = [...libraryBooks.filter(item => item.id !== book.id), book];
    libraryError = "";
    if (state.tab === "library") renderLibrary();
    if (featuredId && dialog.open && generation === searchGeneration) dialogRefresh?.();
    notify("PDF saved for offline reading");
  } catch (error) { notify(pdfImportError(error)); }
  finally { if (task) await task.destroy().catch(() => {}); }
}
function stopLibraryPdf() {
  const session = activeLibraryPdf;
  activeLibraryPdf = null;
  if (!session) return;
  session.renderTask?.cancel();
  session.task?.destroy().catch(() => {});
}
async function showLibraryPdf(id) {
  const book = libraryBooks.find(item => item.id === id);
  if (!book) return;
  const origin = captureDialogReturn();
  const back = origin?.show || closeDialog;
  openDialog(book.title, `<button class="text-button" id="libraryPdfBack">‹ ${esc(origin?.title || "Library")}</button><div class="pdf-controls"><button class="secondary" id="libraryPdfPrevious" aria-label="Previous page" disabled>‹</button><label for="libraryPdfPage">Page <input id="libraryPdfPage" type="number" inputmode="numeric" min="1" max="${book.pages}" value="${book.page}" disabled> of <span id="libraryPdfTotal">${book.pages}</span></label><button class="secondary" id="libraryPdfNext" aria-label="Next page" disabled>›</button></div><div class="pdf-view-controls" aria-label="PDF display"><button class="secondary" id="libraryPdfTextView" aria-pressed="true">Text</button><button class="secondary" id="libraryPdfPageView" aria-pressed="false">Page</button></div><p class="helper" id="libraryPdfStatus" role="status">Opening PDF…</p><div class="library-pdf-text" id="libraryPdfText"></div><canvas class="library-pdf-page" id="libraryPdfCanvas" role="img" aria-label="PDF page" hidden></canvas>`);
  dialog.classList.add("library-reader");
  dialogBack = origin ? back : null;
  dialogBackSnapshot = origin?.snapshot || null;
  $("libraryPdfBack").onclick = back;
  const session = {book, page: book.page, view: book.view || "text", version: 0};
  activeLibraryPdf = session;
  try {
    const file = await libraryTransaction(["files"], "readonly", tx => tx.objectStore("files").get(id));
    if (!file) throw new Error("This PDF is missing. Import its copy from Files again.");
    const buffer = await file.arrayBuffer();
    const renderer = await pdfRenderer();
    if (activeLibraryPdf !== session) return;
    session.task = renderer.getDocument(pdfOptions(buffer));
    session.pdf = await session.task.promise;
    if (activeLibraryPdf !== session) return;
    $("libraryPdfTotal").textContent = session.pdf.numPages;
    $("libraryPdfPage").max = session.pdf.numPages;
    $("libraryPdfPage").disabled = false;
    $("libraryPdfPrevious").onclick = () => renderLibraryPdfPage(session, session.page - 1);
    $("libraryPdfNext").onclick = () => renderLibraryPdfPage(session, session.page + 1);
    $("libraryPdfPage").onchange = event => renderLibraryPdfPage(session, Number(event.target.value));
    for (const [id, view] of [["libraryPdfTextView", "text"], ["libraryPdfPageView", "page"]])
      $(id).onclick = () => { session.view = view; renderLibraryPdfPage(session, session.page); };
    await renderLibraryPdfPage(session, book.page);
  } catch (error) {
    if (activeLibraryPdf === session) $("libraryPdfStatus").textContent = pdfImportError(error);
  }
}
function applyLibraryPdfView(session) {
  if (activeLibraryPdf !== session) return;
  const text = session.view === "text" && session.hasText;
  $("libraryPdfText").hidden = !text;
  $("libraryPdfCanvas").hidden = !!text;
  $("libraryPdfTextView").setAttribute("aria-pressed", !!text);
  $("libraryPdfPageView").setAttribute("aria-pressed", !text);
  $("libraryPdfStatus").textContent = text
    ? "Text follows the PDF’s reading order. Page view preserves its layout."
    : session.view === "text" ? "This page is an image; showing Page view." : "Original PDF layout. Pinch to zoom.";
}
async function saveLibraryPosition(session) {
  const saved = libraryBooks.find(book => book.id === session.book.id);
  if (!saved) return;
  const book = {...saved, page: session.page, view: session.view};
  libraryBooks = libraryBooks.map(item => item.id === book.id ? book : item);
  try { await libraryTransaction(["catalog"], "readwrite", tx => tx.objectStore("catalog").put(book)); }
  catch { notify("Your PDF position could not be saved. Try again."); }
}
async function renderLibraryPdfPage(session, number) {
  if (activeLibraryPdf !== session || !session.pdf) return;
  const pageNumber = Number.isFinite(number) ? Math.max(1, Math.min(session.pdf.numPages, Math.trunc(number))) : session.page;
  const version = ++session.version;
  session.renderTask?.cancel();
  $("libraryPdfStatus").textContent = "Opening page…";
  try {
    const page = await session.pdf.getPage(pageNumber);
    const text = await page.getTextContent();
    if (activeLibraryPdf !== session || version !== session.version) return;
    session.page = pageNumber;
    const words = text.items.filter(item => typeof item.str === "string").map(item => item.str).join(" ").replace(/\s+/g, " ").trim();
    session.hasText = !!words;
    $("libraryPdfText").textContent = words;
    $("libraryPdfPage").value = pageNumber;
    $("libraryPdfPrevious").disabled = pageNumber === 1;
    $("libraryPdfNext").disabled = pageNumber === session.pdf.numPages;
    // Text can be read immediately; only rasterize a page when its layout is needed.
    if (session.view === "text" && session.hasText) {
      applyLibraryPdfView(session);
      dialog.scrollTop = 0;
      await saveLibraryPosition(session);
      page.cleanup();
      return;
    }
    $("libraryPdfText").hidden = true;
    $("libraryPdfCanvas").hidden = true;
    await saveLibraryPosition(session);
    if (activeLibraryPdf !== session || version !== session.version) return;
    const canvas = $("libraryPdfCanvas");
    const width = Math.max(200, $("dialogBody").clientWidth);
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({scale: width / page.getViewport({scale: 1}).width});
    canvas.width = Math.ceil(viewport.width * scale);
    canvas.height = Math.ceil(viewport.height * scale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    session.renderTask = page.render({canvasContext: canvas.getContext("2d"), viewport,
      transform: scale === 1 ? null : [scale, 0, 0, scale, 0, 0]});
    await session.renderTask.promise;
    if (activeLibraryPdf !== session || version !== session.version) return;
    canvas.setAttribute("aria-label", `Page ${pageNumber} of ${session.pdf.numPages} · ${session.book.title}`);
    applyLibraryPdfView(session);
    dialog.scrollTop = 0;
    page.cleanup();
  } catch (error) {
    if (activeLibraryPdf === session && version === session.version && error?.name !== "RenderingCancelledException")
      $("libraryPdfStatus").textContent = pdfImportError(error);
  }
}
async function exportLibraryPdf(id) {
  try {
    const book = libraryBooks.find(item => item.id === id);
    const file = await libraryTransaction(["files"], "readonly", tx => tx.objectStore("files").get(id));
    if (!book || !file) throw new Error("This PDF is missing. Import it again from Files.");
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = book.filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { notify(pdfImportError(error)); }
}
function confirmRemoveLibraryPdf(id) {
  const book = libraryBooks.find(item => item.id === id);
  if (!book) return;
  const origin = captureDialogReturn();
  openDialog("Remove offline copy?", `<p>Remove ${esc(book.title)} and its saved page from this device?</p><p class="helper">Keep the original PDF in Files so you can import it again.</p><div class="actions"><button class="secondary" id="libraryKeepPdf">Keep</button><button class="primary" id="libraryConfirmRemove">Remove copy</button></div>`);
  dialogBack = origin?.show || closeDialog;
  dialogBackSnapshot = origin?.snapshot || null;
  $("libraryKeepPdf").onclick = dialogBack;
  $("libraryConfirmRemove").onclick = async () => {
    $("libraryConfirmRemove").disabled = true;
    try {
      await libraryTransaction(["catalog", "files"], "readwrite", tx => {
        tx.objectStore("catalog").delete(id); tx.objectStore("files").delete(id);
      });
      libraryBooks = libraryBooks.filter(item => item.id !== id);
      closeDialog();
      if (state.tab === "library") renderLibrary();
      notify("Offline copy removed");
    } catch { notify("The copy could not be removed. Try again."); $("libraryConfirmRemove").disabled = false; }
  };
}
function handleLibraryAction(button) {
  const data = button.dataset;
  if (data.libraryBook) showLibraryBook(data.libraryBook);
  else if (data.libraryRead) showLibraryPdf(data.libraryRead);
  else if (data.libraryExport) exportLibraryPdf(data.libraryExport);
  else if (data.libraryRemove) confirmRemoveLibraryPdf(data.libraryRemove);
  else return false;
  return true;
}
