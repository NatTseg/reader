// One portable archive contains Bible data, original books, and private library notes.
const LIBRARY_BACKUP_LIMIT = 200 * 1024 * 1024;
function validateLibraryCatalog(value) {
  const fail=()=>{throw new Error("This backup contains invalid library data.");};
  if(!Array.isArray(value) || value.length>500)fail();
  const ids=new Set();
  return value.map(source=>{
    if(!source || typeof source!=="object" || ids.has(source.id) || typeof source.id!=="string" ||
      !/^(spiritual-man|(?:pdf|epub)-[a-f0-9]{64})$/.test(source.id) || !/^[a-f0-9]{64}$/.test(source.hash || "") ||
      typeof source.title!=="string" || !source.title.trim() || source.title.length>2000 ||
      typeof source.author!=="string" || source.author.length>2000 || typeof source.filename!=="string" || source.filename.length>1000 ||
      !Number.isSafeInteger(source.size) || source.size<=0 || source.size>LIBRARY_FILE_LIMIT ||
      !Number.isInteger(source.pages) || source.pages<=0 || source.pages>100000 ||
      !Number.isInteger(source.page) || source.page<1 || source.page>source.pages)fail();
    const format=source.format || "pdf",view=source.view || "text",scroll=source.scroll ?? 0;
    if(!["pdf","epub"].includes(format) || !["text","page"].includes(view) || !Number.isFinite(scroll) || scroll<0 || scroll>1)fail();
    const marks=source.marks || [],markIds=new Set();
    if(!Array.isArray(marks) || marks.length>10000)fail();
    const checkedMarks=marks.map(mark=>{
      if(!mark || typeof mark.id!=="string" || mark.id.length>100 || markIds.has(mark.id) ||
        !/^[a-zA-Z0-9-]+$/.test(mark.id) || !Number.isInteger(mark.page) || mark.page<1 || mark.page>source.pages ||
        !Number.isFinite(mark.scroll) || mark.scroll<0 || mark.scroll>1 || typeof mark.quote!=="string" || mark.quote.length>5000 ||
        typeof mark.note!=="string" || mark.note.length>10000 || !Number.isFinite(mark.createdAt) || mark.createdAt<0)fail();
      markIds.add(mark.id);return {id:mark.id,page:mark.page,scroll:mark.scroll,quote:mark.quote,note:mark.note,createdAt:mark.createdAt};
    });
    ids.add(source.id);
    return {id:source.id,hash:source.hash,format,title:source.title,author:source.author,filename:source.filename,
      size:source.size,pages:source.pages,page:source.page,scroll,view,marks:checkedMarks,
      addedAt:Number.isFinite(source.addedAt) ? source.addedAt : 0,lastReadAt:Number.isFinite(source.lastReadAt) ? source.lastReadAt : 0};
  });
}
async function snapshotLibrary() {
  await librarySaveQueue;
  const snapshot={books:[],files:{}};
  await libraryTransaction(["catalog","files"],"readonly",tx=>{
    const request=tx.objectStore("catalog").getAll();
    request.onsuccess=()=>{
      snapshot.books=request.result;
      for(const book of snapshot.books) {
        const file=tx.objectStore("files").get(book.id);
        file.onsuccess=()=>{snapshot.files[book.id]=file.result;};
      }
    };
  });
  return snapshot;
}
async function createReaderArchive() {
  const snapshot=await snapshotLibrary(),reader=await createBackup();
  const books=validateLibraryCatalog(snapshot.books);
  if(books.reduce((size,b)=>size+b.size,0)>LIBRARY_BACKUP_LIMIT)throw new Error("This library exceeds the 200 MB archive limit. Save original books individually to Files and export your Bible backup.");
  const manifest={format:"reader-library-backup",version:1,createdAt:new Date().toISOString(),books:[]};
  const entries=Object.create(null);entries["reader.json"]=fflate.strToU8(JSON.stringify(reader));
  if(entries["reader.json"].length>40*1024*1024)throw new Error("The Bible data exceeds the 40 MB backup limit.");
  for(const [index,book] of books.entries()) {
    const file=snapshot.files[book.id];if(!file || file.size!==book.size)throw new Error(`The original file for ${book.title} is missing. Import it again before backing up.`);
    const path=`books/${String(index).padStart(4,"0")}.${book.format}`;
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(await libraryFileHash(bytes)!==book.hash)throw new Error(`The saved file for ${book.title} is damaged. Import its original before backing up.`);
    entries[path]=bytes;manifest.books.push({...book,file:path});
  }
  entries["library.json"]=fflate.strToU8(JSON.stringify(manifest));
  if(entries["library.json"].length>10*1024*1024)throw new Error("The library's saved passages exceed the 10 MB backup limit.");
  return new Blob([fflate.zipSync(entries,{level:0})],{type:"application/zip"});
}
async function readReaderArchive(file) {
  if(!file || file.size>LIBRARY_BACKUP_LIMIT+50*1024*1024)throw new Error("Choose a Reader archive smaller than 250 MB.");
  const entries=libraryZipEntries(new Uint8Array(await file.arrayBuffer()),LIBRARY_BACKUP_LIMIT+50*1024*1024,LIBRARY_FILE_LIMIT);
  if(!entries["library.json"] || !entries["reader.json"] || entries["library.json"].length>10*1024*1024)throw new Error("Choose a complete Reader ZIP backup.");
  let manifest,reader;
  try {manifest=JSON.parse(fflate.strFromU8(entries["library.json"]));reader=validateBackup(JSON.parse(fflate.strFromU8(entries["reader.json"])));}
  catch(error){throw new Error(error instanceof SyntaxError ? "This backup contains invalid JSON." : error.message);}
  if(manifest.format!=="reader-library-backup" || manifest.version!==1)throw new Error("Choose a supported Reader backup.");
  const books=validateLibraryCatalog(manifest.books),files={};const paths=new Set();
  if(books.reduce((size,b)=>size+b.size,0)>LIBRARY_BACKUP_LIMIT)throw new Error("This backup exceeds the 200 MB library limit.");
  for(const [index,book] of books.entries()) {
    const path=manifest.books[index].file;
    if(typeof path!=="string" || !/^books\/\d{4}\.(pdf|epub)$/.test(path) || paths.has(path) || !entries[path] || entries[path].length!==book.size)
      throw new Error("This backup is missing a book or contains inconsistent files.");
    paths.add(path);const bytes=entries[path];
    if(await libraryFileHash(bytes)!==book.hash)throw new Error(`The file for ${book.title} is damaged. Choose another backup.`);
    const original=new File([bytes],book.filename,{type:book.format==="epub" ? "application/epub+zip" : "application/pdf"});
    const info=await inspectLibraryFile(original,book.format);
    if(info.pages!==book.pages)throw new Error(`The saved place for ${book.title} does not match its file.`);
    files[book.id]=original;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {books,files,reader,createdAt:manifest.createdAt};
}
async function replaceLibrary(snapshot,recovery) {
  await libraryTransaction(["catalog","files","recovery"],"readwrite",tx=>{
    const catalog=tx.objectStore("catalog"),files=tx.objectStore("files");catalog.clear();files.clear();
    for(const book of snapshot.books){catalog.put(book);files.put(snapshot.files[book.id],book.id);}
    if(recovery)tx.objectStore("recovery").put(recovery,"lastRestore");
  });
}
async function restoreReaderArchive(archive) {
  if(libraryBusy || persistenceBusy)throw new Error("Wait for the current save to finish.");
  libraryBusy=true;const surface=document.querySelector(".app"),inert=surface.inert,dialogInert=dialog.inert;
  surface.inert=true;dialog.inert=true;stopLibraryPdf();
  try {
    const previous=await snapshotLibrary();previous.reader=await createBackup();
    // Commit a library undo copy with its replacement. Roll back if the Bible transaction fails.
    await replaceLibrary(archive,previous);
    try {await restoreBackup(archive.reader);}
    catch(error){await replaceLibrary(previous);throw error;}
    libraryBooks=archive.books;libraryError="";
    if(state.tab==="library")renderLibrary();
  }finally{libraryBusy=false;surface.inert=inert;dialog.inert=dialogInert;}
}
async function exportReaderArchive() {
  if(libraryBusy || persistenceBusy){notify("Wait for the current save to finish.");return;}
  const button=$("exportReaderArchive");if(button)button.disabled=true;libraryBusy=true;
  try {
    const blob=await createReaderArchive();downloadLibraryFile(blob,`reader-complete-${new Date().toISOString().slice(0,10)}.zip`);
    await studyTransaction({lastExport:new Date().toISOString()});
    notify("Complete backup prepared. Save the ZIP in Files or iCloud Drive.");
  }catch(error){notify(pdfImportError(error));}
  finally{libraryBusy=false;if(button)button.disabled=false;}
}
function showArchiveRestorePreview(archive,undo=false,origin=captureDialogReturn()) {
  const back=origin?.show || closeDialog;
  openDialog(undo ? "Undo complete restore" : "Restore Reader",`<button class="text-button" id="archiveBack">‹ Backup &amp; restore</button><p>${archive.books.length} books · ${archive.books.reduce((n,b)=>n+(b.marks || []).length,0)} saved book passages</p><p>${esc(backupCounts(archive.reader))}</p><p class="helper">This replaces your Library, Bible saves, reading places, and settings with the backup. Your current data will be kept as an undo copy. Cloud connections are not included.</p><button class="primary" id="archiveConfirmRestore">${undo ? "Undo restore" : "Restore this backup"}</button><p class="helper" id="archiveRestoreStatus" role="status"></p>`);
  dialogBack=back;dialogBackSnapshot=origin?.snapshot || null;$("archiveBack").onclick=back;
  $("archiveConfirmRestore").onclick=async()=>{
    $("archiveConfirmRestore").disabled=true;$("archiveRestoreStatus").textContent="Restoring…";
    try{await restoreReaderArchive(archive);back();notify("Reader and your Library have been restored.");}
    catch(error){if($("archiveRestoreStatus"))$("archiveRestoreStatus").textContent=pdfImportError(error);if($("archiveConfirmRestore"))$("archiveConfirmRestore").disabled=false;}
  };
}
function showLibraryBackup(origin=captureDialogReturn()) {
  const back=origin?.show || closeDialog;
  openDialog("Backup & restore",'<button class="text-button" id="libraryBackupBack">‹ Back</button><h3>Keep your whole Reader library</h3><p>One ZIP includes your original PDF and EPUB books, saved book passages, reflections, reading places, and your Bible backup with imported OSB material.</p><p class="helper">Save the ZIP in Files or iCloud Drive. It can restore Reader on another device. Cloud credentials are excluded. Archives support up to 200 MB of book files.</p><button class="primary" id="exportReaderArchive">Back up Reader</button><label class="helper" for="restoreReaderArchiveFile">Restore a complete Reader ZIP</label><input id="restoreReaderArchiveFile" type="file" accept=".zip,application/zip"><p class="helper" id="archiveReadStatus" role="status"></p><button class="text-button" id="undoReaderArchive" hidden>Undo the last complete restore</button>');
  dialogBack=origin ? back : null;dialogBackSnapshot=origin?.snapshot || null;dialogRefresh=()=>showLibraryBackup(origin);
  $("libraryBackupBack").onclick=back;$("exportReaderArchive").onclick=exportReaderArchive;
  $("restoreReaderArchiveFile").onchange=async event=>{
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    if(libraryBusy || persistenceBusy){notify("Wait for the current save to finish.");return;}
    libraryBusy=true;const status=$("archiveReadStatus"),generation=searchGeneration;status.textContent="Checking backup and book files…";
    try{const archive=await readReaderArchive(file);if(dialog.open && generation===searchGeneration)showArchiveRestorePreview(archive);}
    catch(error){if(status.isConnected)status.textContent=pdfImportError(error);}
    finally{libraryBusy=false;}
  };
  const undo=$("undoReaderArchive");
  libraryTransaction(["recovery"],"readonly",tx=>tx.objectStore("recovery").get("lastRestore")).then(value=>{
    if(!undo.isConnected || !value)return;undo.hidden=false;
    undo.onclick=()=>showArchiveRestorePreview({...value,books:validateLibraryCatalog(value.books),reader:validateBackup(value.reader)},true);
  }).catch(()=>{});
}
