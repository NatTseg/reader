// Private books and their annotations live separately from the app cache.
const LIBRARY_FEATURED = [{
  id: "spiritual-man", title: "The Spiritual Man", author: "Pope Shenouda III",
  description: "Reflections on spiritual growth, prayer, and self-control.",
  source: "https://ukmidcopts.org/kotob/HH%20Pope%20Shenouda/The%20Spiritual%20Man.pdf",
  sourceName: "Coptic Orthodox Diocese of the Midlands, U.K.",
  edition: "English · COPT, 1998 · 211 PDF pages",
}];
let libraryBooks = [], libraryLoading = true, libraryError = "", libraryBusy = false;
let activeLibraryPdf = null, pdfRendererPromise, librarySaveQueue = Promise.resolve(), libraryOpenVersion = 0;
function libraryDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("reader-library", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("catalog")) request.result.createObjectStore("catalog", {keyPath: "id"});
      if (!request.result.objectStoreNames.contains("files")) request.result.createObjectStore("files");
      if (!request.result.objectStoreNames.contains("recovery")) request.result.createObjectStore("recovery");
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other Reader tabs and try again."));
    request.onsuccess = () => {
      const db = request.result; db.onversionchange = () => db.close(); resolve(db);
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
  } catch { libraryError = "Saved books could not be opened. Reload to try again."; }
  libraryLoading = false;
  if (state.tab === "library") renderLibrary();
}
function libraryLocation(book, page = book.page) {
  return `${book.format === "epub" ? "Section" : "Page"} ${page} of ${book.pages}`;
}
function libraryCard(book, status) {
  return `<button class="result library-card" data-library-book="${esc(book.id)}"><strong>${esc(book.title)}</strong><small>${esc(book.author || "Your book")}</small><span class="helper">${esc(status)}</span></button>`;
}
function renderLibrary() {
  cancelBackSlide();
  const personal = libraryBooks.filter(book => !LIBRARY_FEATURED.some(feature => feature.id === book.id));
  const recent = libraryBooks.filter(book => book.lastReadAt).sort((a,b) => b.lastReadAt-a.lastReadAt)[0];
  pane.innerHTML = `<div class="content"><p class="eyebrow">Books &amp; reading guides</p><h1>Library</h1><p class="subtitle">A place for the readings you want to return to.</p>${recent ? `<button class="result library-continue" data-library-read="${esc(recent.id)}"><small>Continue reading</small><strong>${esc(recent.title)}</strong><span class="helper">${esc(libraryLocation(recent))} ›</span></button>` : ""}<div class="book-tools"><button class="secondary" id="libraryAddPdf">Add book</button><button class="text-button" data-library-backup="true">Backup &amp; restore</button></div><input id="libraryPdfFile" type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" hidden>${libraryLoading ? '<p class="helper">Opening your library…</p>' : ""}${libraryError ? `<p class="helper" role="status">${esc(libraryError)}</p>` : ""}<h2 class="section-label">Books</h2><div class="library-list">${LIBRARY_FEATURED.map(book => {const saved = libraryBooks.find(item => item.id === book.id);return libraryCard(book, saved ? `Offline · ${libraryLocation(saved).toLowerCase()}` : "Read online · import a PDF for offline reading");}).join("")}${personal.map(book => libraryCard(book, `Offline · ${libraryLocation(book).toLowerCase()}`)).join("")}</div><h2 class="section-label">Reading guides</h2><div class="library-list"><button class="result" data-essay="kallistos-reading"><strong>How to read Scripture</strong><small>Metropolitan Kallistos Ware · summary &amp; full guide</small></button><button class="result" data-essay="typology"><strong>How Scripture speaks of Christ</strong><small>Reader guide</small></button>${personalGuides.length ? personalGuides.map((guide, i) => `<button class="result" data-context-guide="${i}"><strong>${esc(guide.title)}</strong><small>Your Orthodox Study Bible copy · offline</small></button>`).join("") : ""}</div><p class="helper library-storage-note">Add PDF or EPUB books to read offline. Back up Reader to keep your books, notes, and reading places in Files or iCloud Drive.</p></div>`;
  $("libraryAddPdf").onclick = () => $("libraryPdfFile").click();
  $("libraryPdfFile").onchange = event => importLibraryPdf(event.target.files?.[0]);
  pane.scrollTop = 0;
}
function showLibraryBook(id, origin = captureDialogReturn()) {
  const feature = LIBRARY_FEATURED.find(book => book.id === id), saved = libraryBooks.find(book => book.id === id);
  const book = feature || saved; if (!book) return;
  const back = origin?.show || closeDialog;
  openDialog(book.title, `<article class="essay"><button class="text-button" id="libraryBookBack">‹ ${esc(origin?.title || "Library")}</button><p class="eyebrow">${esc(book.author || "Your book")}</p>${book.description ? `<p>${esc(book.description)}</p>` : ""}${book.edition ? `<p class="helper">${esc(book.edition)}</p>` : ""}${saved ? `<p class="helper">Saved offline · ${esc(libraryLocation(saved).toLowerCase())} · ${(saved.marks || []).length} saved passages</p><button class="primary" data-library-read="${esc(id)}">${saved.lastReadAt || saved.page > 1 ? "Continue reading" : "Read in Reader"}</button><div class="context-list"><button class="text-button" data-library-export="${esc(id)}">Save original to Files</button><button class="text-button" data-library-remove="${esc(id)}">Remove offline copy</button></div>` : ""}${feature ? `<p class="essay-source"><a href="${esc(feature.source)}" target="_blank" rel="noopener noreferrer">Open the full PDF ↗</a> <span class="helper">(online)</span></p><p class="helper">Source: ${esc(feature.sourceName)}</p>${!saved ? '<p class="helper">Save the PDF to Files, then import it here to read offline and keep your place.</p><button class="secondary" id="libraryImportBook">Import this PDF</button><input id="libraryBookFile" type="file" accept=".pdf,application/pdf" hidden>' : ""}` : ""}</article>`);
  dialogBack = origin ? back : null; dialogBackSnapshot = origin?.snapshot || null;
  dialogRefresh = () => showLibraryBook(id, origin); $("libraryBookBack").onclick = back;
  if (feature && !saved) {
    $("libraryImportBook").onclick = () => $("libraryBookFile").click();
    $("libraryBookFile").onchange = event => importLibraryPdf(event.target.files?.[0], id);
  }
}
function pdfAssets(folder) { return new URL(`./vendor/pdfjs/${folder}/`, location.href).href; }
function pdfRenderer() {
  if (!pdfRendererPromise) pdfRendererPromise = import("./vendor/pdfjs/pdf.mjs").then(module => {
    module.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.mjs", location.href).href; return module;
  }).catch(error => { pdfRendererPromise = null; throw error; });
  return pdfRendererPromise;
}
function pdfOptions(buffer) {
  return {data: new Uint8Array(buffer), cMapUrl: pdfAssets("cmaps"), cMapPacked: true,
    standardFontDataUrl: pdfAssets("standard_fonts"), wasmUrl: pdfAssets("wasm"), isEvalSupported: false, useSystemFonts: true};
}
async function validateLibraryPdf(file) {
  if (!file || !file.size || file.size > LIBRARY_FILE_LIMIT) throw new Error("Choose a PDF smaller than 50 MB.");
  if (!new TextDecoder().decode(await file.slice(0,1024).arrayBuffer()).includes("%PDF-")) throw new Error("Choose a PDF file.");
}
function pdfImportError(error) {
  return error?.name === "PasswordException" ? "Use a PDF without password protection."
    : error?.name === "QuotaExceededError" ? "There is not enough device storage. Export a backup before removing books."
    : error?.name === "InvalidPDFException" ? "This PDF could not be read. Try another copy."
    : error?.message || "The book could not be saved. Try again.";
}
async function libraryFileHash(buffer) {
  const digest = await crypto.subtle.digest("SHA-256",buffer);
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,"0")).join("");
}
async function inspectLibraryFile(file, format) {
  if (!file || !file.size || file.size > LIBRARY_FILE_LIMIT) throw new Error("Choose a book smaller than 50 MB.");
  if (format === "epub") {
    const epub = parseLibraryEpub(new Uint8Array(await file.arrayBuffer()));
    return {pages:epub.sections.length,title:epub.title,author:epub.author};
  }
  await validateLibraryPdf(file);
  const renderer = await pdfRenderer(), task = renderer.getDocument(pdfOptions(await file.arrayBuffer()));
  try {
    const pdf = await task.promise;
    const metadata = await pdf.getMetadata().catch(() => null);
    return {pages:pdf.numPages,title:metadata?.info?.Title || "",author:metadata?.info?.Author || ""};
  } finally { await task.destroy().catch(() => {}); }
}
async function importLibraryPdf(file, featuredId) {
  if (!file || libraryBusy) return;
  const generation = searchGeneration;
  libraryBusy = true;
  try {
    notify("Saving book…");
    const format = !featuredId && (/\.epub$/i.test(file.name) || file.type === "application/epub+zip") ? "epub" : "pdf";
    const info = await inspectLibraryFile(file,format);
    const hash = await libraryFileHash(await file.arrayBuffer());
    await librarySaveQueue;
    const feature = LIBRARY_FEATURED.find(book => book.id === featuredId);
    const previous = libraryBooks.find(book => feature ? book.id === feature.id : book.hash === hash);
    const same = previous?.hash === hash;
    const book = {id:feature?.id || previous?.id || `${format}-${hash}`,hash,format,
      title:(feature?.title || previous?.title || String(info.title || "").trim() || file.name.replace(/\.(pdf|epub)$/i,"").replace(/[_-]+/g," ").trim() || "Untitled book").slice(0,2000),
      author:String(feature?.author || previous?.author || info.author || "").slice(0,2000),filename:file.name,size:file.size,pages:info.pages,
      page:same ? previous.page : 1,scroll:same ? previous.scroll || 0 : 0,
      view:previous?.view || "text",marks:same ? previous.marks || [] : [],
      lastReadAt:same ? previous.lastReadAt || 0 : 0,addedAt:previous?.addedAt || Date.now()};
    await libraryTransaction(["catalog","files"],"readwrite",tx => {
      tx.objectStore("catalog").put(book); tx.objectStore("files").put(file,book.id);
    });
    libraryBooks = [...libraryBooks.filter(item => item.id !== book.id),book]; libraryError = "";
    if (state.tab === "library") renderLibrary();
    if (featuredId && dialog.open && generation === searchGeneration) dialogRefresh?.();
    notify("Book saved for offline reading");
  } catch(error) { notify(pdfImportError(error)); }
  finally { libraryBusy = false; }
}
function updateLibraryBook(id, change) {
  const result = librarySaveQueue.then(async () => {
    const previous = libraryBooks.find(b => b.id === id); if (!previous) throw new Error("This book is no longer in Library.");
    const book = {...previous,...(typeof change === "function" ? change(previous) : change)};
    await libraryTransaction(["catalog"],"readwrite",tx => tx.objectStore("catalog").put(book));
    libraryBooks = libraryBooks.map(b => b.id === id ? book : b);
    if(state.tab==="library" && !dialog.open && !libraryLoading) {
      const top=pane.scrollTop;renderLibrary();pane.scrollTop=top;
    }
    return book;
  });
  librarySaveQueue = result.catch(() => {}); return result;
}
function libraryScrollPosition() {
  const maximum = Math.max(1, (Number(dialog.scrollHeight) || 0) - (Number(dialog.clientHeight) || 0));
  return Math.max(0, Math.min(1, (Number(dialog.scrollTop) || 0) / maximum));
}
function stopLibraryPdf() {
  const session = activeLibraryPdf;
  if (!session) return;
  clearTimeout(session.scrollTimer);
  if (session.frameReady || session.ready) {
    if (!session.tools) session.scroll = libraryScrollPosition();
    saveLibraryPosition(session);
  }
  activeLibraryPdf = null; session.version++; session.searchVersion = (session.searchVersion || 0)+1;
  session.renderTask?.cancel(); session.task?.destroy().catch(() => {});
  for (const url of session.urls || []) URL.revokeObjectURL(url);
}
async function showLibraryPdf(id, locationOverride, originOverride) {
  const origin = originOverride === undefined ? captureDialogReturn() : originOverride, back = origin?.show || closeDialog;
  const generation=searchGeneration,opening=++libraryOpenVersion;
  await librarySaveQueue;
  if(opening!==libraryOpenVersion || generation!==searchGeneration)return;
  const book = libraryBooks.find(b => b.id === id); if (!book) return;
  const epub = book.format === "epub";
  openDialog(book.title, `<button class="text-button" id="libraryPdfBack">‹ ${esc(origin?.title || "Library")}</button><div class="pdf-controls"><button class="secondary" id="libraryPdfPrevious" aria-label="Previous ${epub ? "section" : "page"}" disabled>‹</button><label for="libraryPdfPage">${epub ? "Section" : "Page"} <input id="libraryPdfPage" type="number" inputmode="numeric" min="1" max="${book.pages}" value="${book.page}" disabled> of <span id="libraryPdfTotal">${book.pages}</span></label><button class="secondary" id="libraryPdfNext" aria-label="Next ${epub ? "section" : "page"}" disabled>›</button></div>${epub ? "" : '<div class="pdf-view-controls" aria-label="Book display"><button class="secondary" id="libraryPdfTextView" aria-pressed="true" disabled>Text</button><button class="secondary" id="libraryPdfPageView" aria-pressed="false" disabled>Page</button></div>'}<div class="library-reader-tools"><button class="text-button" data-library-tool="contents">Contents</button><button class="text-button" data-library-tool="search">Search book</button><button class="text-button" data-library-tool="notes">Save / notes</button></div><section id="libraryToolPanel" hidden></section><div class="library-pdf-error" id="libraryPdfError" hidden role="alert"><p id="libraryPdfErrorText"></p><button class="secondary" id="libraryPdfRetry">Try again</button></div><div id="libraryReadingArea"><p class="helper" id="libraryPdfStatus" role="status">Opening book…</p><article class="library-pdf-text" id="libraryPdfText"></article><canvas class="library-pdf-page" id="libraryPdfCanvas" role="img" aria-label="PDF page" hidden></canvas></div>`);
  dialog.classList.add("library-reader"); dialogBack = origin ? back : null; dialogBackSnapshot = origin?.snapshot || null;
  $("libraryPdfBack").onclick = back;
  const session = {book,page:book.page,scroll:book.scroll || 0,view:book.view || "text",version:0,urls:[],textCache:new Map(),blocksCache:new Map(),frameReady:false};
  activeLibraryPdf = session;
  try {
    const file = await libraryTransaction(["files"],"readonly",tx => tx.objectStore("files").get(id));
    if (!file) throw new Error("This book is missing. Import its original from Files again.");
    const buffer = await file.arrayBuffer();
    if (activeLibraryPdf !== session) return;
    if (epub) session.epub = parseLibraryEpub(new Uint8Array(buffer));
    else {
      const renderer = await pdfRenderer(); if (activeLibraryPdf !== session) return;
      session.task = renderer.getDocument(pdfOptions(buffer));
      session.pdf = await libraryPdfWork(session.task.promise,"The book took too long to open. Try again.",()=>session.task.destroy().catch(()=>{}));
    }
    if (activeLibraryPdf !== session) return;
    $("libraryPdfPage").disabled = false;
    $("libraryPdfPrevious").onclick = () => renderLibraryPdfPage(session,(session.pendingPage || session.page)-1);
    $("libraryPdfNext").onclick = () => renderLibraryPdfPage(session,(session.pendingPage || session.page)+1);
    $("libraryPdfPage").onchange = event => renderLibraryPdfPage(session,Number(event.target.value));
    $("libraryPdfPage").onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); event.target.blur(); } };
    if (!epub) for (const [control,view] of [["libraryPdfTextView","text"],["libraryPdfPageView","page"]])
      { $(control).disabled=false; $(control).onclick = () => changeLibraryPdfView(session,view); }
    dialogRefresh = () => showLibraryPdf(id,{page:session.page,scroll:session.scroll},origin);
    await renderLibraryPdfPage(session,locationOverride?.page || book.page,{scroll:locationOverride?.scroll ?? book.scroll ?? 0});
  } catch(error) {
    if (activeLibraryPdf === session) {
      $("libraryPdfStatus").textContent="This book could not be opened.";
      showLibraryPdfError(pdfImportError(error),()=>showLibraryPdf(id,locationOverride,origin));
    }
  }
}
function applyLibraryPdfView(session) {
  if (activeLibraryPdf !== session) return;
  const text = session.epub || session.displayView === "text";
  $("libraryPdfText").hidden = !text; $("libraryPdfCanvas").hidden = !!text;
  if (!session.epub) {
    $("libraryPdfTextView").setAttribute("aria-pressed",String(!!text)); $("libraryPdfPageView").setAttribute("aria-pressed",String(!text));
  }
  $("libraryPdfStatus").textContent = session.renderNotice || (session.epub ? session.epub.sections[session.page-1].title
    : text ? "Text preserves paragraphs where possible. Page view shows the original layout."
    : session.view === "text" ? "This page is an image; showing Page view." : "Original PDF layout. Pinch to zoom.");
  $("libraryPdfStatus").hidden=!!session.epub && !!$("libraryPdfText").querySelector("h1,h2,h3");
}
function showLibraryPdfError(message,retry) {
  $("libraryPdfError").hidden=false; $("libraryPdfErrorText").textContent=message;
  $("libraryPdfRetry").onclick=retry;
}
function updateLibraryPdfControls(session,loading=false) {
  const total=session.epub ? session.epub.sections.length : session.pdf?.numPages || session.book.pages;
  $("libraryPdfPrevious").disabled=loading || session.page<=1;
  $("libraryPdfNext").disabled=loading || session.page>=total;
  $("libraryPdfPage").value=session.pendingPage || session.page;
}
function changeLibraryPdfView(session,view) {
  if (activeLibraryPdf !== session) return;
  const options={...(session.pendingOptions || {}),view};
  if(view==="page")delete options.query;
  if (session.ready) options.scroll=session.tools ? session.scroll : libraryScrollPosition();
  return renderLibraryPdfPage(session,session.pendingPage || session.page,options);
}
async function saveLibraryPosition(session) {
  const position={page:session.page,view:session.view,scroll:Math.max(0,Math.min(1,session.scroll || 0)),lastReadAt:Date.now()};
  try { await updateLibraryBook(session.book.id,position); }
  catch { notify("Your reading place could not be saved. Try again."); }
}
async function libraryPageBlocks(session,page) {
  session.blocksCache ||= new Map();
  if (!session.blocksCache.has(page.pageNumber)) {
    const blocks=libraryPdfBlocks(await libraryPdfWork(page.getTextContent(),"Text took too long to load."));
    session.blocksCache.set(page.pageNumber,blocks);
    session.textCache.set(page.pageNumber,blocks.map(b=>b.text).join(" "));
  }
  return session.blocksCache.get(page.pageNumber);
}
function libraryPdfWork(promise,message,onTimeout,timeout=20000) {
  let timer;
  const deadline=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>{reject(new Error(message));onTimeout?.();},timeout);
  });
  return Promise.race([promise,deadline]).finally(()=>clearTimeout(timer));
}
function renderLibraryCanvas(session,page) {
  const canvas=document.createElement("canvas"); canvas.id="libraryPdfCanvas";canvas.className="library-pdf-page";
  canvas.setAttribute("role","img");canvas.setAttribute("aria-label",`Page ${page.pageNumber} of ${session.pdf.numPages} · ${session.book.title}`);
  const width=Math.max(1,$("libraryReadingArea").clientWidth || $("dialogBody").clientWidth-40 || 200);
  const viewport=page.getViewport({scale:width/page.getViewport({scale:1}).width});
  const size=libraryPdfCanvasSize(viewport.width,viewport.height,window.devicePixelRatio || 1);
  canvas.width=size.width;canvas.height=size.height;canvas.style.width="100%";canvas.style.height="auto";
  canvas.style.aspectRatio=`${viewport.width} / ${viewport.height}`;
  const task=page.render({canvasContext:canvas.getContext("2d"),viewport,transform:size.scale===1 ? null : [size.scale,0,0,size.scale,0,0]});
  session.renderTask=task;
  return {canvas,task,width};
}
async function renderLibraryPdfPage(session, number, options = {}) {
  if (activeLibraryPdf !== session || !session.pdf && !session.epub) return;
  const total=session.epub ? session.epub.sections.length : session.pdf.numPages;
  const pageNumber=Number.isFinite(number) ? Math.max(1,Math.min(total,Math.trunc(number))) : session.page;
  const view=options.query ? "text" : options.view || session.pendingView || session.view;
  const previousReady=session.frameReady || session.ready;
  if(session.ready && !session.tools) {session.scroll=libraryScrollPosition();saveLibraryPosition(session);}
  const scroll=options.scroll ?? (pageNumber===session.page ? session.scroll || 0 : 0);
  const version=++session.version;session.ready=false;clearTimeout(session.scrollTimer);session.renderTask?.cancel();session.renderTask=null;
  session.pausedRender=null;
  session.pendingPage=pageNumber;session.pendingView=view;session.pendingOptions={...options,scroll};
  closeLibraryTool(session,false);$("libraryPdfError").hidden=true;
  $("libraryPdfStatus").hidden=false;$("libraryPdfStatus").textContent=`Opening ${session.epub ? "section" : "page"} ${pageNumber}…`;
  $("libraryReadingArea").setAttribute("aria-busy","true");updateLibraryPdfControls(session,true);
  let page,render,blocks=[],html="",hasText=false,displayView="text",notice="",committed=false;
  const urls=[];
  try {
    if(session.epub) {
      const section=session.epub.sections[pageNumber-1];html=libraryEpubHtml(session.epub,section,urls);hasText=true;
      session.textCache.set(pageNumber,section.text);
    } else {
      page=await libraryPdfWork(session.pdf.getPage(pageNumber),"The page took too long to load. Try again.");
      if(activeLibraryPdf!==session || version!==session.version)return;
      if(view==="text") {
        try {blocks=await libraryPageBlocks(session,page);hasText=blocks.some(b=>b.text.trim());}
        catch {notice="Text is unavailable; showing the original page.";}
      }
      if(activeLibraryPdf!==session || version!==session.version)return;
      if(view!=="text" || !hasText) {
        displayView="page";
        try {
          render=renderLibraryCanvas(session,page);
          await libraryPdfWork(render.task.promise,"The page took too long to draw. Try again.",()=>render.task.cancel());
        } catch(error) {
          if(error?.name==="RenderingCancelledException" || activeLibraryPdf!==session || version!==session.version)throw error;
          // A readable text copy remains available when a page cannot be rasterized.
          if(view!=="text")blocks=await libraryPageBlocks(session,page);
          hasText=blocks.some(b=>b.text.trim());
          if(!hasText)throw error;
          displayView="text";notice="Page view could not be drawn; showing text. Tap Page to retry.";
        }
      }
      if(displayView==="text")html=libraryBlocksHtml(blocks);
    }
    if(activeLibraryPdf!==session || version!==session.version)return;
    for(const url of session.urls || [])URL.revokeObjectURL(url);session.urls=urls;
    $("libraryPdfText").innerHTML=html;
    if(render && displayView==="page") {
      const oldCanvas=$("libraryPdfCanvas");oldCanvas.replaceWith(render.canvas);oldCanvas.width=oldCanvas.height=0;
      session.canvasWidth=render.width;
    }
    session.page=pageNumber;session.view=view;session.displayView=displayView;session.hasText=hasText;
    committed=true;
    session.renderNotice=notice;session.scroll=Math.max(0,Math.min(1,scroll));
    applyLibraryPdfView(session);dialog.scrollTop=session.scroll*Math.max(0,dialog.scrollHeight-dialog.clientHeight);
    if(options.anchor)document.getElementById(`epub-${options.anchor}`)?.scrollIntoView({block:"start"});
    if(options.query && displayView==="text")highlightLibraryMatch(options.query);
    session.scroll=libraryScrollPosition();session.ready=true;session.frameReady=true;
    await saveLibraryPosition(session);
  } catch(error) {
    if(activeLibraryPdf===session && version===session.version && error?.name!=="RenderingCancelledException") {
      session.ready=!!previousReady;
      if(previousReady)applyLibraryPdfView(session);else $("libraryPdfStatus").textContent="This page could not be opened.";
      showLibraryPdfError(`Could not open ${session.epub ? "section" : "page"} ${pageNumber}. ${pdfImportError(error)}`,
        ()=>renderLibraryPdfPage(session,pageNumber,{...options,view,scroll}));
    }
  } finally {
    page?.cleanup();
    if(!committed)for(const url of urls)URL.revokeObjectURL(url);
    if(render && $("libraryPdfCanvas")!==render.canvas)render.canvas.width=render.canvas.height=0;
    if(activeLibraryPdf===session && version===session.version) {
      session.pendingPage=null;session.pendingView=null;session.pendingOptions=null;
      if(session.renderTask===render?.task)session.renderTask=null;
      $("libraryReadingArea").setAttribute("aria-busy","false");updateLibraryPdfControls(session);
    }
  }
}
function downloadLibraryFile(blob, filename) {
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url; link.download=filename; document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function exportLibraryPdf(id) {
  try {
    const book=libraryBooks.find(b=>b.id===id),file=await libraryTransaction(["files"],"readonly",tx=>tx.objectStore("files").get(id));
    if (!book || !file) throw new Error("This book is missing. Import it again from Files.");
    downloadLibraryFile(file,book.filename);
  } catch(error) {notify(pdfImportError(error));}
}
function confirmRemoveLibraryPdf(id) {
  const book=libraryBooks.find(b=>b.id===id); if (!book) return;
  const origin=captureDialogReturn();
  openDialog("Remove offline copy?",`<p>Remove ${esc(book.title)}, its reading place, and its saved passages from this device?</p><p class="helper">Back up Reader first to keep your notes. The original book can be imported again from Files.</p><div class="actions"><button class="secondary" id="libraryKeepPdf">Keep</button><button class="primary" id="libraryConfirmRemove">Remove copy</button></div>`);
  dialogBack=origin?.show || closeDialog; dialogBackSnapshot=origin?.snapshot || null; $("libraryKeepPdf").onclick=dialogBack;
  $("libraryConfirmRemove").onclick=async()=>{
    if (libraryBusy) return; libraryBusy=true; $("libraryConfirmRemove").disabled=true;
    try {
      await librarySaveQueue;
      await libraryTransaction(["catalog","files"],"readwrite",tx=>{tx.objectStore("catalog").delete(id);tx.objectStore("files").delete(id);});
      libraryBooks=libraryBooks.filter(b=>b.id!==id);closeDialog();if(state.tab==="library")renderLibrary();notify("Offline copy removed");
    } catch {notify("The copy could not be removed. Try again.");if($("libraryConfirmRemove"))$("libraryConfirmRemove").disabled=false;}
    finally {libraryBusy=false;}
  };
}
function handleLibraryAction(button) {
  const data=button.dataset;
  if(data.libraryBook)showLibraryBook(data.libraryBook);
  else if(data.libraryRead)showLibraryPdf(data.libraryRead);
  else if(data.libraryExport)exportLibraryPdf(data.libraryExport);
  else if(data.libraryRemove)confirmRemoveLibraryPdf(data.libraryRemove);
  else if(data.libraryBackup)showLibraryBackup();
  else if(data.libraryTool)showLibraryTool(data.libraryTool);
  else if(data.libraryJump)jumpLibraryLocation(data.libraryJump,data.libraryAnchor,Number(data.libraryMarkScroll) || 0,data.libraryQuery);
  else if(data.libraryMark)editLibraryMark(data.libraryMark);
  else if(data.libraryMarkRemove)removeLibraryMark(data.libraryMarkRemove);
  else return false;
  return true;
}
function setupLibraryReader() {
  dialog.addEventListener("scroll",()=>{
    const session=activeLibraryPdf;
    if(!session?.ready || session.tools)return;
    clearTimeout(session.scrollTimer);
    session.scrollTimer=setTimeout(()=>{
      if(activeLibraryPdf!==session || !session.ready || session.tools)return;
      session.scroll=libraryScrollPosition();saveLibraryPosition(session);
    },350);
  });
  dialog.addEventListener("click",event=>{
    const link=event.target.closest("a[data-library-section]");
    if(link){event.preventDefault();jumpLibraryLocation(link.dataset.librarySection,link.dataset.libraryAnchor);}
  });
  const flush=()=>{
    const session=activeLibraryPdf;
    if(!session?.frameReady)return;
    clearTimeout(session.scrollTimer);
    if(!session.tools)session.scroll=libraryScrollPosition();
    saveLibraryPosition(session);
  };
  window.addEventListener("pagehide",flush);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)flush();});
  let resizeTimer;
  window.addEventListener("resize",()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{
      const session=activeLibraryPdf;
      if(!session?.ready || session.tools || session.epub || session.displayView!=="page")return;
      const width=$("libraryReadingArea").clientWidth;
      if(Math.abs(width-session.canvasWidth)>1)renderLibraryPdfPage(session,session.page,{scroll:libraryScrollPosition()});
    },250);
  });
}
