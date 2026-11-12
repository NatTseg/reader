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
  return Object.keys(personalSourceNotes).filter(key=>key.split(':')[0]===book);
}
// A verse's translators' notes, each with its letter.
function textNotesHtml(key) {
  return (personalTextNotes[key]||[]).map(([letter,text])=>`<p class="text-note"><sup>${letter}</sup> ${esc(text)}</p>`).join('');
}
// The chapter's notes in verse order, with any study article printed in this chapter.
function alignedChapterNotesHtml() {
  const prefix=`${state.book}:${state.chapter}:`;
  const verses=[...new Set([...Object.keys(personalNotesByVerse),...Object.keys(personalTextNotes)].filter(key=>key.startsWith(prefix)))].sort((a,b)=>parseKey(a).v-parseKey(b).v);
  const articles=chapterArticles(state.book,state.chapter);
  const count=sourceNoteKeysForBook(state.book).length;
  if(!verses.length&&!articles.length&&!count)return '';
  const attached=verses.length?`<h2 class="section-label">OSB notes for this chapter</h2>${verses.map(target=>`<article class="footnote"><small>Verse ${esc(sourceVerseLabel(state.book,state.chapter,parseKey(target).v))}</small>${(personalNotesByVerse[target]||[]).map(key=>`<p>${esc(personalSourceNotes[key].body)}</p>`).join('')}${textNotesHtml(target)}</article>`).join('')}`:'';
  const linked=articles.length?`<h2 class="section-label">Study article${articles.length>1?'s':''}</h2><div class="context-list">${articles.map(([i,g])=>`<button class="topic" data-context-guide="${i}"><span>${esc(g.title)}</span>${icon('right')}</button>`).join('')}</div>`:'';
  return `<section class="footnotes">${linked}${attached}${count?`<button class="secondary" data-source-book="${state.book}">All notes in ${esc(displayName(state.book))}</button>`:''}</section>`;
}
function showSourceNotes(book,chapter) {
  const keys=sourceNoteKeysForBook(book),chapters=[...new Set(keys.map(k=>parseKey(k).ch))].sort((a,b)=>a-b);
  chapter=chapters.includes(chapter)?chapter:chapters.includes(state.chapter)&&book===state.book?state.chapter:chapters[0];
  openDialog(`OSB notes · ${displayName(book)}`,`<label for="sourceNoteChapter">Chapter</label><select id="sourceNoteChapter">${chapters.map(ch=>`<option ${ch===chapter?'selected':''}>${ch}</option>`).join('')}</select>${keys.filter(k=>parseKey(k).ch===chapter).sort((a,b)=>parseKey(a).v-parseKey(b).v).map(key=>{const p=parseKey(key);return `<button class="result" data-note-key="${key}" data-source-note="true"><strong>${esc(refLabel(p.book,p.ch,p.v))}</strong><p>${esc(personalSourceNotes[key].body.slice(0,180))}${personalSourceNotes[key].body.length>180?'…':''}</p></button>`}).join('')}`);
  $('sourceNoteChapter').onchange=event=>showSourceNotes(book,+event.target.value);
  dialogRefresh=()=>showSourceNotes(book,chapter);
}
