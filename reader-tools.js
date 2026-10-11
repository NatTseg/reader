const READER_TOOL_DEFAULTS = {fontFamily:'serif', lineSpacing:1.85, paper:'original', history:[], readingPlan:null};
let focusReading = false;
let studyNoteParent = null;
let randomPassageTargets;
function randomPassage(random = Math.random) {
  randomPassageTargets ||= bookOrder().flatMap(book => window.BIBLE.t[book].flatMap((chapter, i) =>
    chapter.flatMap((text, v) => v > 0 && text ? [{book, ch: i + 1, v}] : [])));
  return randomPassageTargets[Math.floor(random() * randomPassageTargets.length)];
}
function visitRandomPassage() {
  const passage = randomPassage();
  if (!passage) return;
  visitPassage(passage.book, passage.ch, passage.v);
  notify(`Random passage · ${refLabel(passage.book, passage.ch, passage.v)}`);
}
function normalizeReaderTools(reader) {
  reader.fontFamily=['serif','sans','book'].includes(reader.fontFamily)?reader.fontFamily:'serif';
  reader.lineSpacing=Number.isFinite(reader.lineSpacing)?Math.max(1.4,Math.min(2.4,reader.lineSpacing)):1.85;
  reader.paper=['original','warm','neutral'].includes(reader.paper)?reader.paper:'original';
  reader.history=(Array.isArray(reader.history)?reader.history:[]).filter(x=>x && bookMeta(x.book) && Number.isInteger(x.chapter) && x.chapter>=1 && x.chapter<=bookMeta(x.book).n && Number.isFinite(x.scroll) && x.scroll>=0 && x.scroll<=1 && Number.isFinite(x.ts)).slice(0,50);
  const plan=reader.readingPlan;
  reader.readingPlan=plan && ['gospels','psalms','whole-bible'].includes(plan.id) && Array.isArray(plan.completed)
    ? {id:plan.id,completed:[...new Set(plan.completed.filter(n=>Number.isInteger(n)&&n>=0&&n<(plan.id==='whole-bible'?365:30)))]}:null;
}
function applyReaderToolsAppearance() {
  const fonts={serif:'Georgia, "Times New Roman", serif',sans:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',book:'Palatino, "Palatino Linotype", Georgia, serif'};
  document.documentElement.style.setProperty('--reading-font',fonts[state.fontFamily]||fonts.serif);
  document.documentElement.style.setProperty('--reading-leading',String(state.lineSpacing||1.85));
  document.documentElement.dataset.paper=state.paper||'original';
  syncViewportTheme();
}
function syncViewportTheme() {
  const scheme=state.theme==='dark'?'dark':'light';
  const color=scheme==='dark'?'#191c1b':state.paper==='warm'?'#f2e7ce':state.paper==='neutral'?'#ffffff':'#f8f6f0';
  // Keep Safari's under-page background and older browsers' theme metadata in sync.
  // Give browser chrome the same concrete color as the rendered page edges.
  document.documentElement.style.backgroundColor=color;
  document.body.style.backgroundColor=color;
  document.documentElement.style.colorScheme=scheme;
  document.querySelector('meta[name="theme-color"]').content=color;
  const meta=document.querySelector('meta[name="color-scheme"]');
  if(meta)meta.content=scheme;
}
function recordHistory(book=state.book,chapter=state.chapter,scroll=state.scroll) {
  if (!bookMeta(book)) return;
  state.history=[{book,chapter,scroll:Math.max(0,Math.min(1,scroll||0)),ts:Date.now()},...(state.history||[]).filter(x=>x.book!==book||x.chapter!==chapter)].slice(0,50);
}
function readerToolsSettingsHtml() {
  return `<div class="setting"><label for="readingFont">Reading font</label><select id="readingFont">${[['serif','Georgia'],['book','Palatino'],['sans','System sans']].map(([id,name])=>`<option value="${id}" ${state.fontFamily===id?'selected':''}>${name}</option>`).join('')}</select></div><div class="setting"><label for="readingSpacing">Line spacing</label><input id="readingSpacing" type="range" min="1.4" max="2.4" step="0.05" value="${state.lineSpacing||1.85}"></div><div class="setting"><label for="readingPaper">Page tone</label><select id="readingPaper">${[['original','Original'],['warm','Warm'],['neutral','White']].map(([id,name])=>`<option value="${id}" ${state.paper===id?'selected':''}>${name}</option>`).join('')}</select></div><h3 class="section-label">Reading tools</h3><div class="context-list"><button class="text-button" id="recentPassages">Recent passages ›</button><button class="text-button" id="readingPlan">Reading plan ›</button><button class="text-button" id="focusReading">Enter focus mode ›</button></div>`;
}
function bindReaderToolsSettings() {
  for (const [id,key] of [['readingFont','fontFamily'],['readingSpacing','lineSpacing'],['readingPaper','paper']]) $(id).onchange=event=>{rememberScroll();state[key]=key==='lineSpacing'?Number(event.target.value):event.target.value;applyReaderToolsAppearance();if(state.tab==='bible')renderChapter(state.scroll);persist()};
  $('recentPassages').onclick=showReadingHistory;
  $('readingPlan').onclick=()=>showReadingPlan();
  $('focusReading').onclick=()=>{openTab('bible');setFocusReading(true)};
}
function setFocusReading(on) {
  const ratio=state.scroll;
  focusReading=on;
  document.querySelector('.app').classList.toggle('focus-reading',on);
  $('exitFocus').hidden=!on;
  if(state.tab==='bible')pane.scrollTop=ratio*(pane.scrollHeight-pane.clientHeight);
}
function showReadingHistory() {
  const parent=captureSwipeView(dialog);
  openDialog('Recent passages',`<button class="text-button" id="toolsBack">‹ Reading settings</button><p class="helper">Your last 50 chapters, with their saved reading positions.</p>${(state.history||[]).map((item,i)=>`<button class="result" data-history-index="${i}"><strong>${esc(refLabel(item.book,item.chapter))}</strong><small>${esc(new Date(item.ts).toLocaleDateString())}</small></button>`).join('')||'<p>No recent passages yet.</p>'}`);
  dialogBack=showSettings;dialogBackSnapshot=parent;$('toolsBack').onclick=showSettings;
}
function planDays(id) {
  const books=id==='gospels'?['MAT','MRK','LUK','JHN']:id==='psalms'?['PSA']:bookOrder();
  const chapters=books.flatMap(book=>Array.from({length:bookMeta(book).n},(_,i)=>({book,ch:i+1})));
  const days=id==='whole-bible'?365:30;
  return Array.from({length:days},(_,i)=>chapters.slice(Math.floor(i*chapters.length/days),Math.floor((i+1)*chapters.length/days)));
}
function planName(id) {return {'gospels':'The Gospels in 30 days','psalms':'Psalms in 30 days','whole-bible':'The Bible in 365 days'}[id]}
function showReadingPlan(choose=false,day,parent=captureSwipeView(dialog)) {
  const plan=state.readingPlan;
  let html='<button class="text-button" id="toolsBack">‹ Reading settings</button>';
  if(!plan||choose) html+=`<p>Choose a daily reading plan. Progress is saved offline and included in backups.</p>${plan?'<p class="helper">Choosing a plan starts its progress again.</p>':''}${['gospels','psalms','whole-bible'].map(id=>`<button class="result" data-start-plan="${id}"><strong>${planName(id)}</strong></button>`).join('')}`;
  else {
    const days=planDays(plan.id),next=days.findIndex((_,i)=>!plan.completed.includes(i));
    const selected=Number.isInteger(day)?Math.max(0,Math.min(days.length-1,day)):next<0?days.length-1:next;
    html+=`<h3>${planName(plan.id)}</h3><p>${plan.completed.length} of ${days.length} days complete.</p><progress value="${plan.completed.length}" max="${days.length}" aria-label="Reading plan progress"></progress><div class="plan-navigation"><button class="secondary" data-plan-day="${selected-1}" ${selected===0?'disabled':''}>Previous day</button><strong>Day ${selected+1}</strong><button class="secondary" data-plan-day="${selected+1}" ${selected===days.length-1?'disabled':''}>Next day</button></div>${days[selected].map(p=>`<button class="result" data-chapter-book="${p.book}" data-chapter="${p.ch}">${esc(refLabel(p.book,p.ch))} ›</button>`).join('')}<button class="primary" data-complete-plan="${selected}">${plan.completed.includes(selected)?'Mark this day unread':'Mark this day complete'}</button><br><button class="text-button" data-choose-plan="true">Choose another plan</button>`;
  }
  openDialog('Reading plan',html);dialogBack=showSettings;dialogBackSnapshot=parent;$('toolsBack').onclick=showSettings;
}
function showStudyNote(key,source=false,parent=captureDialogReturn()) {
  const note=source?personalSourceNotes[key]:window.STUDY?.notes?.[key];if(!note)return;
  studyNoteParent=parent;
  const p=parseKey(key),target=source?personalAlignment?.notes?.[key]:verifiedNoteTarget(key);
  const refs=(note.see||[]).map(ref=>{const mapped=verifiedReferenceTarget(ref);return mapped?`<button class="text-button" data-preview-ref="${mapped}" data-preview-note="${esc(key)}" ${source?'data-preview-source="true"':''}>${esc(refLabel(...Object.values(parseKey(mapped))))} ›</button>`:`<span class="helper">OSB reference: ${esc(ref)}</span>`}).join(' ');
  openDialog(note.title||'Study note',`${parent?`<button class="text-button" id="noteBack">‹ ${esc(parent.title)}</button>`:''}<article class="footnote"><p class="helper">${personalNotesCount?'Orthodox Study Bible · personal copy':'Study note'} · ${target?'Linked to '+esc(refLabel(...Object.values(parseKey(target))))+' · OSB '+esc(key):'Original reference '+esc(key)}</p><p>${esc(note.body)}</p>${source?`<button class="text-button" data-review-note="${key}">${target?"Review or change verse link":"Review verse link"} ›</button>`:""}${refs?`<h3 class="section-label">Related passages</h3><div class="context-list">${refs}</div>`:''}</article>`);
  dialog.classList.add('note-sheet');
  if(parent){dialogBack=parent.show;dialogBackSnapshot=parent.snapshot;$('noteBack').onclick=parent.show;}
}
function verifiedNoteTarget(key) {
  const p=parseKey(key);
  if(!isSeptuagint(p.book)&&validVerse(p.book,p.ch,p.v)) return key;
  return null;
}
function verifiedReferenceTarget(key) {
  const p=parseKey(key);
  if(!isSeptuagint(p.book)&&validVerse(p.book,p.ch,p.v))return key;
  return personalAlignment?.verses?.[key]||null;
}
function showPassagePreview(key,parentNote,source=false,parentVerse) {
  const p=parseKey(key);if(!validVerse(p.book,p.ch,p.v))return;
  const parent=dialog.open?captureSwipeView(dialog):null;
  const noteParent=studyNoteParent;
  openDialog(refLabel(p.book,p.ch,p.v),`${parentNote||parentVerse?`<button class="text-button" id="previewBack">‹ ${parentNote?"Study note":"Verse"}</button>`:""}<blockquote>${esc(verseText(p.book,p.ch,p.v))}</blockquote><button class="text-button" data-action="jump" data-key="${key}">Read chapter ›</button>`);
  dialog.classList.add('note-sheet');
  if(parentNote||parentVerse){dialogBack=parentNote?()=>showStudyNote(parentNote,source,noteParent):()=>{const p=parseKey(parentVerse);showVerse(p.book,p.ch,p.v)};dialogBackSnapshot=parent;$('previewBack').onclick=dialogBack;}
}
function relatedPassagesHtml(book,ch,v) {
  const refs=new Set();
  for(const c of window.WISDOM.categories)for(const t of c.topics) {
    if(t.refs.some(([b,n,start,end=start])=>b===book&&n===ch&&v>=start&&v<=end))for(const [b,n,start]of t.refs)if(b!==book||n!==ch||start!==v)refs.add(`${b}:${n}:${start}`);
  }
  return [...refs].slice(0,8).map(key=>{const p=parseKey(key);return `<button class="text-button" data-preview-ref="${key}" data-preview-origin="${book}:${ch}:${v}">${esc(refLabel(p.book,p.ch,p.v))} ›</button>`}).join('');
}
function searchToolsHtml() {
  return `<div class="search-filters"><label for="searchArea">Search in</label><select id="searchArea"><option value="all">All Scripture</option><option value="ot">Old Testament</option><option value="nt">New Testament</option><option value="book">One book</option><option value="notes">Study notes</option><option value="guides">Guides &amp; introductions</option></select><select id="searchBook" aria-label="Book to search" hidden>${bookOrder().map(id=>`<option value="${id}" ${state.book===id?'selected':''}>${esc(displayName(id))}</option>`).join('')}</select></div>`;
}
function searchStudyContent(query,area) {
  const needle=query.toLocaleLowerCase(),found=[];
  const contains=text=>String(text||'').toLocaleLowerCase().includes(needle);
  if(area==='notes')for(const [key,note]of Object.entries(Object.keys(personalSourceNotes).length?personalSourceNotes:window.STUDY.notes||{})){
    if(contains(note.body)||contains(note.title)){found.push(`<button class="result" data-note-key="${esc(key)}" ${Object.keys(personalSourceNotes).length?'data-source-note="true"':''}><strong>${esc(note.title||key)}</strong><small>Original reference: ${esc(key)}</small><p>${esc(note.body.slice(0,180))}…</p></button>`);if(found.length===80)break;}
  } else {
    const entries=[...personalGuides.map((g,i)=>({article:g,attr:`data-context-guide="${i}"`})),...Object.entries(personalIntroductions).map(([id,g])=>({article:g,attr:`data-context-intro="${id}"`}))];
    for(const {article,attr}of entries)if(contains(article.title)||article.blocks.some(b=>contains(b.text)||b.rows?.some(row=>row.some(contains))))found.push(`<button class="result" ${attr}><strong>${esc(article.title)}</strong></button>`);
    for(const [id,e]of Object.entries(window.STUDY.essays||{}))if(contains(e.title)||contains(e.lead)||e.sections.some(s=>contains(s.h)||contains(s.p)))found.push(`<button class="result" data-essay="${id}"><strong>${esc(e.title)}</strong></button>`);
  }
  return `<p class="helper">${found.length===80?'First 80 matches':found.length+' matches'}</p>`+found.join('');
}
function handleReaderToolAction(button) {
  const d=button.dataset;
  if(d.randomPassage)visitRandomPassage();
  else if(d.historyIndex!==undefined){const item={...state.history[+d.historyIndex]};goChapter(item.book,item.chapter);state.scroll=item.scroll;renderChapter(item.scroll);persist();}
  else if(d.startPlan){state.readingPlan={id:d.startPlan,completed:[]};persist();showReadingPlan(false,undefined,dialogBackSnapshot);}
  else if(d.choosePlan)showReadingPlan(true,undefined,dialogBackSnapshot);
  else if(d.planDay!==undefined)showReadingPlan(false,+d.planDay,dialogBackSnapshot);
  else if(d.completePlan!==undefined){const day=+d.completePlan,c=state.readingPlan.completed;state.readingPlan.completed=c.includes(day)?c.filter(n=>n!==day):[...c,day];persist();showReadingPlan(false,day,dialogBackSnapshot);}
  else if(d.noteKey)showStudyNote(d.noteKey,!!d.sourceNote);
  else if(d.sourceBook)showSourceNotes(d.sourceBook);
  else if(d.reviewNote)showNoteLinkReview(d.reviewNote);
  else if(d.previewRef)showPassagePreview(d.previewRef,d.previewNote,!!d.previewSource,d.previewOrigin);
  else return false;
  return true;
}
