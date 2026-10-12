// Contents, search, and private saved passages share the active reading surface.
function closeLibraryTool(session = activeLibraryPdf, restoreScroll = true) {
  if (!session || activeLibraryPdf !== session) return;
  session.searchVersion = (session.searchVersion || 0)+1;
  session.tools = null;
  $("libraryToolPanel").hidden = true; $("libraryReadingArea").hidden = false;
  for (const button of dialog.querySelectorAll("[data-library-tool]")) button.setAttribute("aria-pressed","false");
  if (restoreScroll) {
    if(session.pausedRender) {
      const request=session.pausedRender;session.pausedRender=null;
      return renderLibraryPdfPage(session,request.page,request.options);
    }
    dialog.scrollTop=(session.scroll || 0)*Math.max(0,dialog.scrollHeight-dialog.clientHeight);
  }
}
async function showLibraryTool(kind) {
  const session=activeLibraryPdf;
  if (!session || !session.pdf && !session.epub) {notify("Wait for the book to open.");return;}
  if(session.pendingPage) {
    session.pausedRender={page:session.pendingPage,options:{...session.pendingOptions,view:session.pendingView}};
    session.version++;session.renderTask?.cancel();session.renderTask=null;
    session.pendingPage=null;session.pendingView=null;session.pendingOptions=null;
    session.ready=!!session.frameReady;
    $("libraryReadingArea").setAttribute("aria-busy","false");updateLibraryPdfControls(session);
  }
  if (kind === "notes") session.selectedQuote = librarySelectedText();
  if (!session.tools && session.frameReady) {session.scroll=libraryScrollPosition();saveLibraryPosition(session);}
  session.tools=kind; session.searchVersion=(session.searchVersion || 0)+1;
  $("libraryReadingArea").hidden=true; const panel=$("libraryToolPanel");panel.hidden=false;
  for(const button of dialog.querySelectorAll("[data-library-tool]"))button.setAttribute("aria-pressed",String(button.dataset.libraryTool===kind));
  panel.innerHTML='<button class="text-button" id="libraryCloseTool">‹ Back to book</button><div id="libraryToolBody"></div>';
  $("libraryCloseTool").onclick=()=>closeLibraryTool(session); dialog.scrollTop=0;
  if(kind==="contents")await showLibraryContents(session);
  else if(kind==="search")showLibrarySearch(session);
  else showLibraryMarks(session);
}
async function showLibraryContents(session) {
  const host=$("libraryToolBody");host.innerHTML='<h3>Contents</h3><p class="helper" role="status">Opening chapter list…</p>';
  try {
    if(!session.contents) {
      if(session.epub)session.contents=session.epub.toc;
      else {
        const outline=await session.pdf.getOutline();const contents=[];
        async function visit(items, depth=0) {
          for(const item of items || []) {
            if(activeLibraryPdf!==session || contents.length>=1000 || depth>20)return;
            let dest=item.dest;
            try {
              if(typeof dest==="string")dest=await session.pdf.getDestination(dest);
              if(Array.isArray(dest)) {
                const page=typeof dest[0]==="number" ? dest[0]+1 : await session.pdf.getPageIndex(dest[0])+1;
                if(page>0 && page<=session.pdf.numPages)contents.push({title:item.title || `Page ${page}`,page,depth});
              }
            } catch {} // Some publisher outline entries point outside this book.
            await visit(item.items,depth+1);
          }
        }
        await visit(outline);session.contents=contents;
      }
    }
    if(activeLibraryPdf!==session || session.tools!=="contents")return;
    host.innerHTML=`<h3>Contents</h3>${session.contents.length ? `<div class="library-list">${session.contents.map(item=>`<button class="result" data-library-jump="${item.page}" data-library-anchor="${esc(item.anchor || "")}"><strong>${esc(item.title)}</strong><small>${session.epub ? "Section" : "Page"} ${item.page}</small></button>`).join("")}</div>` : '<p>This PDF has no chapter list. Use the page number above to jump to a page, or save passages to return to them.</p>'}`;
  }catch {if(host.isConnected)host.innerHTML='<p>The chapter list could not be opened. Try again.</p>';}
}
function showLibrarySearch(session) {
  $("libraryToolBody").innerHTML='<h3>Search this book</h3><form id="librarySearchForm"><label for="librarySearchInput" class="helper">Word or phrase</label><input id="librarySearchInput" type="search" maxlength="120" placeholder="e.g. prayer" autocomplete="off"><button class="secondary" type="submit">Search</button></form><p class="helper" id="librarySearchStatus" role="status" aria-live="polite"></p><div class="library-list" id="librarySearchResults"></div>';
  $("librarySearchForm").onsubmit=event=>{event.preventDefault();searchLibraryBook(session,$("librarySearchInput").value);};
  $("librarySearchInput").focus({preventScroll:true});
}
function librarySearchSnippet(text, query) {
  text=text.replace(/\s+/g," ");query=query.trim().replace(/\s+/g," ");
  const index=text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if(index<0)return null;
  const start=Math.max(0,index-65),end=Math.min(text.length,index+query.length+100);
  return `${start ? "…" : ""}${text.slice(start,end)}${end<text.length ? "…" : ""}`;
}
async function searchLibraryBook(session, query) {
  const needle=query.trim(),version=++session.searchVersion;
  const status=$("librarySearchStatus"),results=$("librarySearchResults");results.innerHTML="";
  if(needle.length<2){status.textContent="Enter at least two characters.";return;}
  const matches=[],total=session.epub ? session.epub.sections.length : session.pdf.numPages;
  try {
    for(let pageNumber=1;pageNumber<=total;pageNumber++) {
      if(activeLibraryPdf!==session || session.searchVersion!==version || session.tools!=="search")return;
      let text=session.textCache.get(pageNumber);
      if(text===undefined) {
        if(session.epub)text=session.epub.sections[pageNumber-1].text;
        else {
          const page=await session.pdf.getPage(pageNumber);
          text=libraryPdfBlocks(await page.getTextContent()).map(b=>b.text).join(" ");page.cleanup();
        }
        session.textCache.set(pageNumber,text);
      }
      if(activeLibraryPdf!==session || session.searchVersion!==version)return;
      const snippet=librarySearchSnippet(text,needle);
      if(snippet)matches.push({page:pageNumber,snippet});
      if(pageNumber%5===0 || pageNumber===total || matches.length>=80) {
        status.textContent=`Searching ${session.epub ? "section" : "page"} ${pageNumber} of ${total}…`;
        results.innerHTML=matches.map(m=>`<button class="result" data-library-jump="${m.page}" data-library-query="${esc(needle)}"><strong>${session.epub ? esc(session.epub.sections[m.page-1].title) : `Page ${m.page}`}</strong><p>${esc(m.snippet)}</p></button>`).join("");
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(matches.length>=80)break;
    }
    if(activeLibraryPdf===session && session.searchVersion===version)status.textContent=matches.length
      ? `${matches.length===80 ? "First 80" : matches.length} matching ${session.epub ? "sections" : "pages"}. Tap a result to read.`
      : session.epub ? "No matches found." : "No matches in selectable text. Scanned pages without text cannot be searched.";
  }catch {if(status.isConnected)status.textContent="Search could not finish. Try again.";}
}
function jumpLibraryLocation(page, anchor="", scroll=0, query="") {
  const session=activeLibraryPdf;if(session)renderLibraryPdfPage(session,Number(page),{anchor,scroll,query});
}
function highlightLibraryMatch(query) {
  if (!query) return;
  const walker=document.createTreeWalker($("libraryPdfText"),NodeFilter.SHOW_TEXT);
  const nodes=[],runs=[];let node,previousBlock;
  while ((node=walker.nextNode())) {
    const block=node.parentElement?.closest("p,h1,h2,h3,h4,h5,h6,li,blockquote,div,td,th");
    nodes.push(node);runs.push({text:node.textContent,gap:!!previousBlock && previousBlock!==block});previousBlock=block;
  }
  const found=libraryFindTextMatch(runs,query);if(!found)return;
  let first;
  for(let index=found.start.index;index<=found.end.index;index++) {
    const node=nodes[index],start=index===found.start.index ? found.start.offset : 0;
    const end=index===found.end.index ? found.end.end : node.textContent.length;
    if(end<=start)continue;
    const match=node.splitText(start);match.splitText(end-start);
    const mark=document.createElement("mark");mark.className="library-search-hit";match.replaceWith(mark);mark.append(match);first ||= mark;
  }
  first?.scrollIntoView({block:"center"});
}
function librarySelectedText() {
  const selection=window.getSelection?.(),area=$("libraryPdfText");
  return selection && !area.hidden && area.contains(selection.anchorNode) && area.contains(selection.focusNode) ? selection.toString().trim().slice(0,5000) : "";
}
function showLibraryMarks(session, editing) {
  // A selection is captured before the reading area is hidden by the tool panel.
  const marks=libraryBooks.find(b=>b.id===session.book.id)?.marks || [];
  $("libraryToolBody").innerHTML=`<h3>${editing ? "Edit saved passage" : "Save this place"}</h3><p class="helper">${esc(libraryLocation(session.book,editing?.page || session.page))}. Select text in the book first to save a quotation.</p><form id="libraryMarkForm"><label class="helper" for="libraryMarkQuote">Quotation (optional)</label><textarea id="libraryMarkQuote" rows="3" maxlength="5000"></textarea><label class="helper" for="libraryMarkNote">Your reflection (optional)</label><textarea id="libraryMarkNote" rows="3" maxlength="10000" placeholder="What do you want to remember?"></textarea><button class="primary" type="submit">${editing ? "Save changes" : "Save passage"}</button></form><h3 class="section-label">Saved passages · ${marks.length}</h3><div class="library-list">${marks.slice().sort((a,b)=>a.page-b.page || a.createdAt-b.createdAt).map(mark=>`<article class="library-saved"><button class="text-button" data-library-jump="${mark.page}" data-library-mark-scroll="${mark.scroll || 0}">${esc(libraryLocation(session.book,mark.page))} ›</button>${mark.quote ? `<blockquote>${esc(mark.quote)}</blockquote>` : ""}${mark.note ? `<p>${esc(mark.note)}</p>` : ""}<div class="book-tools"><button class="text-button" data-library-mark="${esc(mark.id)}">Edit</button><button class="text-button" data-library-mark-remove="${esc(mark.id)}">Remove</button></div></article>`).join("") || '<p class="helper">Your bookmarks and reflections will appear here.</p>'}</div>`;
  $("libraryMarkQuote").value=editing?.quote || session.selectedQuote || "";session.selectedQuote="";
  $("libraryMarkNote").value=editing?.note || "";
  $("libraryMarkForm").onsubmit=async event=>{
    event.preventDefault();const button=event.target.querySelector('button[type="submit"]');button.disabled=true;
    const mark={id:editing?.id || crypto.randomUUID(),page:editing?.page || session.page,
      scroll:editing?.scroll ?? session.scroll ?? 0,quote:$("libraryMarkQuote").value.trim().slice(0,5000),
      note:$("libraryMarkNote").value.trim().slice(0,10000),createdAt:editing?.createdAt || Date.now()};
    try {
      await updateLibraryBook(session.book.id,book=>{
        if(!editing && (book.marks || []).length>=10000)throw new Error("This book has reached its saved-passage limit. Export a backup before removing passages.");
        return {marks:[...(book.marks || []).filter(m=>m.id!==mark.id),mark]};
      });
      if(activeLibraryPdf===session && session.tools==="notes")showLibraryMarks(session);
      notify("Passage saved");
    }catch(error){notify(error.message);if(button.isConnected)button.disabled=false;}
  };
}
function editLibraryMark(id) {
  const session=activeLibraryPdf;if(!session)return;
  const mark=libraryBooks.find(b=>b.id===session.book.id)?.marks?.find(m=>m.id===id);
  if(mark)showLibraryMarks(session,mark);
}
async function removeLibraryMark(id) {
  const session=activeLibraryPdf;if(!session)return;
  try {
    await updateLibraryBook(session.book.id,book=>({marks:(book.marks || []).filter(m=>m.id!==id)}));
    if(activeLibraryPdf===session && session.tools==="notes")showLibraryMarks(session);
    notify("Saved passage removed");
  }catch(error){notify(error.message);}
}
