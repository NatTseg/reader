// Only text-matched or explicitly reviewed source-note links are attached to verses.
let personalSourceNotes = {}, personalNotesByVerse = {};
function validateNoteAlignment(value, sourceNotes) {
  if (!value) return null;
  if (value.edition !== window.BIBLE.edition || value.version !== 1) throw new Error('The note alignment uses a different Bible edition.');
  const result={edition:value.edition,version:1,notes:{},verses:{},candidates:{},evidence:{}};
  const validTarget=key=>{const m=typeof key==='string'&&key.match(/^([A-Z0-9]{3}):(\d+):(\d+)$/);return m&&validVerse(m[1],+m[2],+m[3])};
  for(const field of ['notes','verses'])for(const [key,target]of Object.entries(value[field]||{})){
    if(!/^[A-Z0-9]{3}:\d+:\d+$/.test(key)||!validTarget(target)||(field==='notes'&&!sourceNotes[key]))throw new Error('The study file contains an invalid note link.');
    result[field][key]=target;
  }
  for(const [key,c]of Object.entries(value.candidates||{}))if(sourceNotes[key]&&validTarget(c.target)&&Number.isFinite(c.score))result.candidates[key]={target:c.target,score:c.score};
  for(const [key,e]of Object.entries(value.evidence||{}))if(sourceNotes[key]&&e&&typeof e.method==='string')result.evidence[key]={method:e.method,score:Number(e.score)||0};
  return result;
}
function applyNoteAlignment(data) {
  personalSourceNotes=data?.sourceNotes||{};
  personalAlignment=data?.alignment||null;
  personalNotesByVerse={};
  for(const [key,target]of Object.entries(personalAlignment?.notes||{})){
    if(personalSourceNotes[key]) (personalNotesByVerse[target]||=[]).push(key);
  }
}
function sourceNoteKeysForBook(book) {
  const books=book==='S3Y'?['DAN']:book==='MAN'?['2CH']:[book];
  return Object.keys(personalSourceNotes).filter(key=>books.includes(key.split(':')[0]));
}
function alignedChapterNotesHtml() {
  const prefix=`${state.book}:${state.chapter}:`;
  const entries=Object.entries(personalNotesByVerse).filter(([key])=>key.startsWith(prefix)).sort((a,b)=>parseKey(a[0]).v-parseKey(b[0]).v);
  const count=sourceNoteKeysForBook(state.book).length;
  const attached=entries.length?`<h2 class="section-label">OSB notes for this chapter</h2>${entries.map(([target,keys])=>keys.map(key=>`<article class="footnote"><small>Verse ${parseKey(target).v} · OSB source ${esc(key)}</small><p>${esc(personalSourceNotes[key].body)}</p><button class="text-button" data-note-key="${key}" data-source-note="true">Open note &amp; references ›</button></article>`).join('')).join('')}`:'';
  return `<section class="footnotes">${attached}${count?`<button class="secondary" data-source-book="${state.book}">Browse all OSB source notes</button>`:''}<button class="text-button" data-study-book="${originalStudyBooks(state.book)[0]}">Earlier imported notes ›</button></section>`;
}
function showSourceNotes(book,chapter) {
  const keys=sourceNoteKeysForBook(book),chapters=[...new Set(keys.map(k=>parseKey(k).ch))].sort((a,b)=>a-b);
  chapter=chapters.includes(chapter)?chapter:chapters[0];
  openDialog(`OSB notes · ${displayName(book)}`,`<label for="sourceNoteChapter">OSB chapter</label><select id="sourceNoteChapter">${chapters.map(ch=>`<option ${ch===chapter?'selected':''}>${ch}</option>`).join('')}</select>${keys.filter(k=>parseKey(k).ch===chapter).map(key=>`<button class="result" data-note-key="${key}" data-source-note="true"><strong>${esc(key)} · ${personalAlignment?.notes?.[key]?'Linked':'Needs review'}</strong><p>${esc(personalSourceNotes[key].body.slice(0,180))}…</p></button>`).join('')}`);
  $('sourceNoteChapter').onchange=event=>showSourceNotes(book,+event.target.value);
  dialogRefresh=()=>showSourceNotes(book,chapter);
}
function showNoteLinkReview(key) {
  const note=personalSourceNotes[key];if(!note)return;
  const parent=captureSwipeView(dialog);
  const noteParent=studyNoteParent;
  const suggestion=personalAlignment?.notes?.[key]||personalAlignment?.candidates?.[key]?.target;
  const initial=suggestion?parseKey(suggestion):{book:state.book,ch:state.chapter,v:1};
  // The OSB verse and this Bible's verse side by side, with two equal actions.
  openDialogAs('note-sheet','Verse link',`<button class="text-button" id="reviewBack">‹ Note</button><form id="noteLinkForm" class="link-review">
    <section class="link-card"><span class="link-label">Orthodox Study Bible · ${esc(key.split(':').slice(1).join(':'))}</span><p>${esc(note.sourceVerse||'No verse text in this import.')}</p></section>
    <section class="link-card"><label class="link-label" for="noteLinkRef">This Bible</label><input id="noteLinkRef" value="${esc(refLabel(initial.book,initial.ch,initial.v))}" autocomplete="off"><p id="noteLinkText"></p></section>
    <div class="link-actions"><button class="secondary" id="removeNoteLink" type="button">Unlink</button><button class="primary" id="confirmNoteLink" type="submit">Link</button></div></form>`);
  dialogBack=()=>showStudyNote(key,true,noteParent);dialogBackSnapshot=parent;$('reviewBack').onclick=dialogBack;
  const read=()=>{const p=parseRef($('noteLinkRef').value);return p?.v?p:null};
  const preview=()=>{const p=read();$('noteLinkText').textContent=p?verseText(p.book,p.ch,p.v):'Enter a valid book, chapter, and verse.';$('confirmNoteLink').disabled=!p};
  $('noteLinkRef').oninput=preview;preview();
  const save=async target=>{
    try{
      if(persistenceBusy)throw new Error('Wait for the current restore to finish.');
      const data=await studyRead('notes');if(!data?.sourceNotes?.[key])throw new Error('Import the complete OSB file on this device first.');
      data.alignment=data.alignment||{edition:window.BIBLE.edition,version:1,notes:{},verses:{},evidence:{},candidates:{}};
      if(target){data.alignment.notes[key]=target;data.alignment.verses[key]=target;data.alignment.evidence[key]={method:'user-reviewed',score:1}}
      else {delete data.alignment.notes[key];delete data.alignment.verses[key];delete data.alignment.evidence[key]}
      await personalNotesStore('readwrite',validatePersonalNotes(data));personalNotesRevision++;applyPersonalNotes(data);queueCloudSync();showStudyNote(key,true,noteParent);notify(target?'Verse link saved.':'Note left unlinked.');
    }catch(error){notify(error.message)}
  };
  $('noteLinkForm').onsubmit=event=>{event.preventDefault();const p=read();if(p)save(keyOf(p.book,p.ch,sourceVerseStart(p.book,p.ch,p.v)))};
  $('removeNoteLink').onclick=()=>save(null);
}
