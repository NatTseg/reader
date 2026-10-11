const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
function reader(stored = {}) {
  const element = () => ({
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() {
      return [];
    },
    style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, *[Symbol.iterator]() {} },
    childNodes: [],
    replaceChildren(...nodes) { this.childNodes = nodes; },
    dataset: {},
  });
  const nodes = new Map();
  const document = {
    body: element(),
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, element());
      return nodes.get(id);
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return element();
    },
    addEventListener() {},
    documentElement: element(),
  };
  const context = {
    document,
    console,
    Blob,
    TextDecoder,
    TextEncoder,
    File: require("node:buffer").File,
    crypto: require("node:crypto").webcrypto,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem() {
        return JSON.stringify(stored);
      },
      setItem() {},
    },
    addEventListener() {},
  };
  context.window = context;
  vm.createContext(context);
  for (const file of [
    "bible-data.js",
    "legacy-web-data.js",
    "edition.js",
    "swipe.js",
    "study-data.js",
    "wisdom-data.js",
    "prayers-data.js",
  ])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "personal-notes.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "persistence.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "cloud-sync.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "reader-tools.js"), "utf8"), context);
  for (const file of ["vendor/fflate/fflate.js", "library-formats.js", "library.js", "library-tools.js", "library-backup.js"])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "note-alignment.js"), "utf8"), context);
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  // Bind functions and event handlers, without rendering the initial browser view.
  vm.runInContext(
    app.slice(0, app.search(/\nif\s*\(window\.BIBLE\?\.t\)/)),
    context,
  );
  return (expression) => vm.runInContext(expression, context);
}
test("Psalm 151 resolves to its separate book; invalid chapters and verses are rejected", () => {
  const run = reader();
  assert.equal(
    run('JSON.stringify(parseRef("Psalm 151"))'),
    JSON.stringify({ book: "PS2", ch: 1, v: null }),
  );
  assert.equal(run('parseRef("John 99:1")'), null);
  assert.equal(run('parseRef("John 3:999")'), null);
  assert.equal(run('parseRef("John 3:0")'), null);
  assert.equal(run('parseRef("John 3:16-15")'), null);
  assert.equal(run('parseRef("1 Corinthians 13:4").book'), "1CO");
});
test("every curated Wisdom range displays exactly its referenced verses", () => {
  const run = reader();
  const mismatches = run(
    `JSON.stringify(WISDOM.categories.flatMap(c=>c.topics).flatMap(t=>t.refs).filter(([b,c,v,end=v])=>(rangeHtml(b,c,v,end).match(/class="verse[" ]/g)||[]).length!==end-v+1))`,
  );
  assert.equal(mismatches, "[]");
});
test("legacy calendar state migrates to reading without losing saved verses", () => {
  const run = reader({
    tab: "coptic",
    book: "JHN",
    chapter: 3,
    font: 22,
    scroll: 0.45,
    bookmarks: [{ book: "JHN", chapter: 3, verse: 16, ts: 1 }],
    comments: { "JHN:3:16": "Remember <this>" },
    highlights: { "JHN:3:16": "gold" },
    prayed: { old: true },
  });
  run("loadPrefs()");
  assert.equal(run("state.tab"), "bible");
  assert.equal(run("state.chapter"), 3);
  assert.equal(run("state.scroll"), 0.45);
  assert.equal(run("state.bookmarks.length"), 1);
  assert.equal(run('state.comments["JHN:3:16"]'), "Remember <this>");
  assert.equal(run('state.highlights["JHN:3:16"]'), "gold");
  assert.equal(run("state.prayed.old"), true);
});
test("invalid persisted data cannot break reader preferences", () => {
  const run = reader({
    book: "INVALID",
    chapter: null,
    font: 999,
    bookmarks: [null, {}],
    highlights: null,
    comments: [],
  });
  run("loadPrefs()");
  assert.equal(run("state.book"), "JHN");
  assert.equal(run("state.chapter"), 1);
  assert.equal(run("state.font"), 28);
  assert.equal(run("state.bookmarks.length"), 0);
});
test("activation deletes only old reader and legacy app caches", async () => {
  const handlers = {},
    deleted = [];
  let job;
  const context = {
    self: {
      addEventListener(name, fn) {
        handlers[name] = fn;
      },
      clients: { claim() {} },
    },
    caches: {
      keys: async () => [
        "unrelated-app-v1",
        "reader-glossary-v1",
        "reader-v30",
        "reader-v31",
        "reader-v32",
        "reader-v34",
        "orthodox-bible-v13",
        "orthodox-bible-v18",
        "orthodox-bible-v20",
        "orthodox-bible-v28",
        "orthodox-bible-v29",
        "orthodox-bible-v30",
      ],
      delete: async (key) => deleted.push(key),
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "sw.js"), "utf8"),
    context,
  );
  handlers.activate({
    waitUntil(p) {
      job = p;
    },
  });
  await job;
  assert.deepEqual(deleted, ["reader-v30", "reader-v31", "reader-v32", "orthodox-bible-v13", "orthodox-bible-v18", "orthodox-bible-v20", "orthodox-bible-v28", "orthodox-bible-v29", "orthodox-bible-v30"]);
});

test("offline HTML fallback is reserved for navigation within this app", async () => {
  const handlers = {};
  const fallback = { html: true };
  const context = {
    URL,
    Response,
    self: {
      addEventListener(name, fn) {
        handlers[name] = fn;
      },
      location: { origin: "https://example.com" },
      registration: { scope: "https://example.com/reader/" },
    },
    caches: {
      open: async () => ({
        match: async (key) => (key === "./index.html" ? fallback : null),
      }),
    },
    fetch: async () => {
      throw new Error("Offline");
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "sw.js"), "utf8"),
    context,
  );
  let response;
  const fire = (url, mode) => {
    response = undefined;
    handlers.fetch({
      request: { method: "GET", url, mode },
      respondWith(value) {
        response = value;
      },
    });
    return response;
  };
  assert.equal(
    await fire("https://example.com/reader/unknown", "navigate"),
    fallback,
  );
  assert.equal(
    (await fire("https://example.com/reader/missing.js", "cors")).type,
    "error",
  );
  assert.equal(fire("https://example.com/OtherApp/", "navigate"), undefined);
});

test("chapter drawer book navigation respects the displayed canon and its boundaries", () => {
  const run = reader();
  assert.equal(run('neighboringBook("GEN", -1)'), null);
  assert.equal(run('neighboringBook("REV", 1)'), null);
  assert.equal(run('neighboringBook("JHN", -1)'), "LUK");
  assert.equal(run('neighboringBook("JHN", 1)'), "ACT");
  assert.equal(run('neighboringBook("UNKNOWN", 1)'), null);
});
test("chapter swipe requires a deliberate horizontal movement", () => {
  const run = reader();
  assert.equal(run("swipeDirection(-100, 10)"), -1);
  assert.equal(run("swipeDirection(100, 10)"), 1);
  assert.equal(run("swipeDirection(-30, 0)"), 0);
  assert.equal(run("swipeDirection(-80, 100)"), 0);
  assert.equal(run("swipeDirection(-80, 60)"), 0);
});

test("viewport fit uses CSS full height except during keyboard input, preserving zoom", () => {
  const run = reader();
  run(`document.documentElement.style.setProperty = (name, value) => window.testHeight = value;
    document.documentElement.style.removeProperty = () => window.testHeight = null;
    window.innerHeight = 844; window.visualViewport = {height: 766, scale: 1}; fitViewport();`);
  assert.equal(run("window.testHeight"), null, "safe-area exclusions must not shrink the app");
  run(`document.activeElement = {tagName:'INPUT'}; window.visualViewport.height = 360; fitViewport();`);
  assert.equal(run("window.testHeight"), "360px");
  run("window.visualViewport = {height: 180, scale: 2}; fitViewport();");
  assert.equal(run("window.testHeight"), "360px", "pinch zoom leaves the layout alone");
  run("window.visualViewport = {height: 766, scale: 1}; fitViewport();");
  assert.equal(run("window.testHeight"), null, "keyboard dismissal restores CSS viewport sizing");
  run("window.visualViewport.height = 360; fitViewport(); document.activeElement = null; fitViewport();");
  assert.equal(run("window.testHeight"), null, "blur releases a stale keyboard height");
});

test('prayer book entries have unique IDs and available text', () => {
  const run = reader();
  assert.equal(run('PRAYERS.length'), 8);
  assert.equal(run('new Set(PRAYERS.map(p => p.id)).size'), 8);
  assert.equal(run('PRAYERS.every(p => p.title && (p.text?.trim() || chapterText(p.book, p.chapter).length > 1))'), true);
});

test('footer navigation always opens the main section and clears nested return state', () => {
  const run = reader();
  for (const tab of ['wisdom', 'prayers', 'library', 'saved', 'bible']) {
    run(`wisdomTopic = WISDOM.categories[0].topics[0]; selectedPrayer = PRAYERS[0].id; prayerListTop = 180; wisdomListTop = 120; savedFilter = 'comments'; returnPlace = {tab:'wisdom'}; openTab('${tab}');`);
    assert.equal(run('state.tab'), tab);
    assert.equal(run('wisdomTopic'), null);
    assert.equal(run('selectedPrayer'), null);
    assert.equal(run('savedFilter'), 'all');
    assert.equal(run('returnPlace'), null);
  }
});

test('right swipe returns from a prayer and ignores vertical scrolling, short drags, and controls', () => {
  const run = reader();
  run(`beginBackSlide = () => ({width:390,update(){},cancel(){},finish(commit, action){if(commit)action();}}); window.handlers = {}; window.surface = {addEventListener(name, fn) {handlers[name]=fn;}}; bindChapterSwipe(surface, false);
    window.swipe = (dx, dy, control=false) => {
      handlers.touchstart({touches:[{clientX:80,clientY:200}],target:{closest:()=>control}});
      handlers.touchmove({touches:[{clientX:80+dx,clientY:200+dy}],cancelable:true,preventDefault(){}});
      handlers.touchend({changedTouches:[{clientX:80+dx,clientY:200+dy}]});
    }; state.tab='prayers'; selectedPrayer=PRAYERS[0].id; prayerListTop=75;`);
  for (const gesture of ['swipe(20,0)', 'swipe(80,100)', 'swipe(150,5,true)', 'swipe(-150,5)']) {
    run(gesture);
    assert.notEqual(run('selectedPrayer'), null);
  }
  run('swipe(150,5)');
  assert.equal(run('selectedPrayer'), null);
  assert.equal(run('pane.scrollTop'), 75);
});

test('linked passages return to the originating Wisdom topic and saved filter', () => {
  const run = reader();
  run(`window.requestAnimationFrame = () => {}; state.tab='wisdom'; wisdomTopic=WISDOM.categories[0].topics[0]; pane.scrollTop=123; visitPassage('JHN',3,16); backAction()();`);
  assert.equal(run('state.tab'), 'wisdom');
  assert.equal(run('wisdomTopic.id'), run('WISDOM.categories[0].topics[0].id'));
  assert.equal(run('pane.scrollTop'), 123);
  run(`state.tab='saved'; savedFilter='comments'; pane.scrollTop=42; visitPassage('JHN',1,1); backAction()();`);
  assert.equal(run('state.tab'), 'saved');
  assert.equal(run('savedFilter'), 'comments');
  assert.equal(run('pane.scrollTop'), 42);
});

test('random passages cover the canon and select populated source verses, including range starts', () => {
  const run = reader();
  assert.equal(run('JSON.stringify(randomPassage(()=>0))'), JSON.stringify({book:'GEN',ch:1,v:1}));
  assert.equal(run('JSON.stringify(randomPassage(()=>1-Number.EPSILON))'), JSON.stringify({book:'REV',ch:22,v:21}));
  const invalid = run(`randomPassageTargets.filter(p => !bookMeta(p.book) || !chapterText(p.book,p.ch)[p.v] || sourceVerseStart(p.book,p.ch,p.v)!==p.v).length`);
  assert.equal(invalid, 0);
  assert.equal(run('new Set(randomPassageTargets.map(p=>p.book)).size'), run('bookOrder().length'));
  assert.equal(run('randomPassageTargets.some(p=>p.book==="PS2")'), true);
  assert.equal(run('randomPassageTargets.some(p=>BIBLE.spans?.[keyOf(p.book,p.ch,p.v)])'), true);
});

test('a random visit preserves annotations and returns to the earlier chapter and scroll', () => {
  const run=reader();
  run(`window.requestAnimationFrame=()=>{};loadPrefs();state.book='JHN';state.chapter=3;pane.scrollTop=240;
    state.bookmarks=[{book:'JHN',chapter:3,verse:16,ts:1}];state.comments={'JHN:3:16':'Keep this'};
    window.saved=JSON.stringify([state.bookmarks,state.comments]);randomPassage=()=>({book:'GEN',ch:1,v:1});visitRandomPassage();`);
  assert.equal(run('state.book'), 'GEN');
  assert.equal(run('$("returnReading").hidden'), false);
  run('backAction()()');
  assert.equal(run('state.book'), 'JHN');
  assert.equal(run('state.chapter'), 3);
  assert.equal(run('pane.scrollTop'), 240);
  assert.equal(run('JSON.stringify([state.bookmarks,state.comments])===saved'), true);
});

test('the Kallistos guide links to the original and the private import, and retains its parent', () => {
  const run=reader();
  run(`dialog.open=true;$('dialogTitle').textContent='Books & chapters';dialog.scrollTop=90;
    window.filter={value:'Mark'};$('dialogBody').childNodes=[filter];
    personalGuides=[{title:'How to Read the Bible',blocks:[{type:'paragraph',text:'Your private copy'}]}];
    showEssay('kallistos-reading');`);
  const html=run('$("dialogBody").innerHTML');
  assert.ok(html.includes('https://www.oca.org/reflections/misc-authors/how-to-read-the-bible'));
  assert.ok(html.includes('data-context-guide="0"'));
  assert.ok(run('searchStudyContent("Kallistos","guides")').includes('data-essay="kallistos-reading"'));
  run('dialogBack()');
  assert.equal(run('$("dialogTitle").textContent'), 'Books & chapters');
  assert.equal(run('$("dialogBody").childNodes[0].value'), 'Mark');
  assert.equal(run('dialog.scrollTop'), 90);
});

test('PDF imports reject renamed HTML and oversized files before opening the renderer', async () => {
  const run=reader();
  await assert.rejects(run(`validateLibraryPdf(new Blob(['<script>alert(1)</script>'],{type:'application/pdf'}))`), /Choose a PDF file/);
  await assert.rejects(run('validateLibraryPdf({size:51*1024*1024})'), /smaller than 50 MB/);
  await run(`validateLibraryPdf(new Blob(['%PDF-1.4 QA test only']))`);
});

test('nested dialogs use their parent action before dismissing the overlay', () => {
  const run = reader();
  run(`dialog.open=true; window.returned=false; dialogBack=()=>{window.returned=true;}; backAction()();`);
  assert.equal(run('window.returned'), true);
  run('dialogBack=null');
  assert.equal(run('backAction() === closeDialog'), true);
});

test('personal notes validate data, render safely, and leave saved verses untouched', () => {
  const run = reader({bookmarks:[{book:'JHN',chapter:3,verse:16}],comments:{'JHN:3:16':'My note'}});
  run(`loadPrefs(); window.imported = validatePersonalNotes({notes:{'JHN:1:1':{body:'<script>alert(1)</script>\\nSecond paragraph', title:'Personal note'}},preambles:{JHN:{body:'Introduction'}}}); applyPersonalNotes(imported);`);
  assert.equal(run('personalNotesCount'), 1);
  assert.equal(run('state.bookmarks.length'), 1);
  assert.equal(run('state.comments["JHN:3:16"]'), 'My note');
  assert.match(run('notesHtml()'), /&lt;script&gt;/);
  assert.match(run('verseHtml("JHN",1,1)'), /Study note for verse 1/);
  assert.throws(() => run(`validatePersonalNotes({notes:{'BAD:1:1':{body:'Invalid'}}})`));
  assert.throws(() => run(`validatePersonalNotes({notes:{}})`));
});


test('app updates bypass stale HTTP assets when filling the offline cache', async () => {
  const handlers = {};
  let job, assets;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), {
    Request: class { constructor(url, options) { this.url = url; this.cache = options.cache; } },
    self: {addEventListener(name, fn) {handlers[name] = fn;}, skipWaiting() {}},
    caches: {open: async () => ({addAll: async requests => {assets = requests;}})},
  });
  handlers.install({waitUntil(p) {job = p;}});
  await job;
  assert.ok(assets.every(request => request.cache === 'reload'));
  assert.ok(assets.some(request => request.url === './personal-notes.js'));
  assert.ok(assets.some(request => request.url === './bible-data.js'));
});

test('all Old Testament books use LXX2012 and all 27 New Testament books retain WEB', () => {
  const run = reader();
  assert.equal(run('BIBLE.books.filter(b=>b.translation === "LXX2012").length'), 55);
  assert.equal(run('BIBLE.books.filter(b=>b.translation === "WEB").length'), 27);
  assert.equal(run('bookOrder().length'), run('BIBLE.books.length'));
  assert.equal(run('new Set(bookOrder()).size'), run('BIBLE.books.length'));
  assert.equal(run('bookMeta("ESG")'), undefined);
  assert.equal(run('bookMeta("2ES")'), undefined);
  assert.match(run('verseText("GEN",5,3)'), /two hundred and thirty/i);
  assert.match(run('verseText("PSA",22,1)'), /Lord.*(tends|shepherd)/i);
  assert.match(run('verseText("PSA",50,1)'), /Have mercy/i);
  assert.match(run('verseText("JER",38,31)'), /new covenant/i);
  assert.match(run('verseText("EST",1,1)'), /saw a vision/i);
  assert.ok(run('verseText("SUS",1,1).length') > 0);
  assert.ok(run('verseText("BEL",1,1).length') > 0);
  assert.ok(run('verseText("S3Y",1,1).length') > 0);
  assert.ok(run('verseText("LJE",1,1).length') > 0);
});

test('Septuagint verse bridges render once and accept references within their range', () => {
  const run = reader();
  assert.equal(run('sourceVerseStart("GEN",37,2)'), 1);
  assert.equal(run('sourceVerseLabel("GEN",37,1)'), '1–2');
  assert.equal(run('verseText("GEN",37,2)'), run('verseText("GEN",37,1)'));
  assert.equal(run('(rangeHtml("GEN",37,1,2).match(/class="verse[" ]/g)||[]).length'), 1);
  assert.match(run('rangeHtml("GEN",37,2,2)'), /data-verse="1"/);
  assert.equal(run('parseRef("Proverbs 22:6")'), null, 'omitted source verses cannot silently resolve elsewhere');
});

test('the edition migration preserves prior Old Testament saves verbatim and is idempotent', () => {
  const run = reader({book:'PSA',chapter:23,bookmarks:[{book:'PSA',chapter:23,verse:1,ts:1},{book:'JHN',chapter:3,verse:16,ts:2}],comments:{'PSA:23:1':'My original note','ESG:1:1':'Greek Esther note'},highlights:{'PSA:23:1':'gold'}});
  run('loadPrefs()');
  assert.equal(run('state.chapter'), 22);
  assert.equal(run('state.bookmarks.length'), 1);
  assert.equal(run('state.legacySaved.length'), 2);
  assert.equal(run('state.legacySaved[0].text'), run('LEGACY_WEB.t.PSA[22][1]'));
  assert.equal(run('state.legacySaved[0].comment'), 'My original note');
  assert.equal(run('state.legacySaved[0].highlight'), 'gold');
  assert.equal(run('state.legacySaved[1].comment'), 'Greek Esther note');
  const before = run('JSON.stringify(state)');
  run('Object.assign(state,migrateEdition(state))');
  assert.equal(run('JSON.stringify(state)'), before);
});

test('unaligned original OT notes stay available without being attached to LXX verses', () => {
  const run = reader();
  run(`applyPersonalNotes(validatePersonalNotes({notes:{'PSA:23:1':{body:'Original Hebrew-numbered note'},'DAG:3:24':{body:'Daniel note'}},preambles:{}})); state.book='PSA'; state.chapter=22;`);
  assert.equal(run('personalNotesCount'), 2);
  assert.equal(run('noteAt("PSA",22,1)'), null);
  assert.match(run('notesHtml()'), /Read notes for this book/);
  assert.match(run('notesHtml()'), /has not been verified/);
  assert.equal(run('STUDY.notes["DAG:3:24"].body'), 'Daniel note');
});

test('back commit requires distance and rejects a deliberate reversal', () => {
  const run = reader();
  assert.equal(run('shouldCommitBack(60,60,390)'), false);
  assert.equal(run('shouldCommitBack(150,150,390)'), true);
  assert.equal(run('shouldCommitBack(180,260,390)'), false);
  assert.equal(run('shouldCommitBack(200,210,390)'), true);
  assert.equal(run('shouldCommitBack(150,150,1000)'), false);
});

test('sliding back previews movement and commits only after the settling callback', () => {
  const run = reader();
  run(`window.handlers={};window.distance=0;window.settled=null;
    beginBackSlide=()=>({width:390,update(x){window.distance=x;},cancel(){},finish(commit,action){window.settled={commit,action};}});
    bindChapterSwipe({addEventListener(name,fn){handlers[name]=fn;}},false);
    state.tab='prayers';selectedPrayer=PRAYERS[0].id;
    window.start=()=>handlers.touchstart({touches:[{clientX:50,clientY:100}],target:{closest:()=>false}});
    window.move=x=>handlers.touchmove({touches:[{clientX:x,clientY:103}],cancelable:true,preventDefault(){}});
    window.end=x=>handlers.touchend({changedTouches:[{clientX:x,clientY:103}]});
    start();move(250);`);
  assert.equal(run('window.distance'), 200);
  assert.notEqual(run('selectedPrayer'), null);
  run('end(250)');
  assert.equal(run('settled.commit'), true);
  assert.notEqual(run('selectedPrayer'), null);
  run('settled.action()');
  assert.equal(run('selectedPrayer'), null);
});

test('short drags, reversing, touch cancellation, and multiple fingers never navigate', () => {
  const run = reader();
  run(`window.handlers={};window.lastCommit=null;
    beginBackSlide=()=>({width:390,update(){},cancel(){},finish(commit){window.lastCommit=commit;}});
    bindChapterSwipe({addEventListener(name,fn){handlers[name]=fn;}},false);
    state.tab='prayers';selectedPrayer=PRAYERS[0].id;
    window.start=()=>handlers.touchstart({touches:[{clientX:50,clientY:100}],target:{closest:()=>false}});
    window.move=x=>handlers.touchmove({touches:[{clientX:x,clientY:103}],cancelable:true,preventDefault(){}});
    window.end=x=>handlers.touchend({changedTouches:[{clientX:x,clientY:103}]});`);
  for (const gesture of [
    'start();move(110);end(110)',
    'start();move(330);move(240);end(240)',
    'start();move(330);handlers.touchcancel()',
    'start();move(330);handlers.touchmove({touches:[{},{}]})',
  ]) {
    run(gesture);
    assert.equal(run('window.lastCommit'), false);
    assert.notEqual(run('selectedPrayer'), null);
  }
});

test('personal context imports full articles safely and preserves v1 compatibility', () => {
  const run = reader();
  run(`window.oldImport = validatePersonalNotes({notes:{'JHN:1:1':{body:'Keep this note'}},preambles:{JHN:{body:'Old introduction'}}});`);
  assert.equal(run('oldImport.guides.length'), 0);
  assert.equal(run('oldImport.preambles.JHN.body'), 'Old introduction');
  run(`window.contextImport = validatePersonalNotes({...oldImport, guides:[{title:'Guide',blocks:[{type:'heading',text:'<img src=x onerror=alert(1)>'},{type:'paragraph',text:'Full text'},{type:'table',rows:[['<script>','Value']]}]}],introductions:{JHN:{title:'John',blocks:[{type:'paragraph',text:'Book context'}]}}}); applyPersonalNotes(contextImport);`);
  assert.equal(run('personalIntroductions.JHN.blocks[0].text'), 'Book context');
  assert.equal(run('personalGuides.length'), 1);
  assert.equal(run('STUDY.notes["JHN:1:1"].body'), 'Keep this note');
  const html = run('studyArticleHtml(personalGuides[0])');
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('<table>'));
  assert.ok(!html.includes('<script>'));
  assert.throws(() => run(`validatePersonalNotes({...oldImport,guides:[{title:'Invalid',blocks:[{type:'html',text:'<script>'}]}]})`));
});

test('chapter lists cover every chapter and mark only the current book and chapter', () => {
  const run = reader();
  run(`state.book='PSA'; state.chapter=100;`);
  const html = run('chapterListHtml("PSA")');
  assert.equal((html.match(/data-chapter=/g) || []).length, 150);
  assert.equal((html.match(/aria-current/g) || []).length, 1);
  assert.ok(html.includes('Chapter 100</span><small>Reading'));
  assert.ok(!run('chapterListHtml("JHN")').includes('aria-current'));
});


test('full backups preserve imports, legacy saves and preferences without credentials', () => {
  const run = reader();
  run(`loadPrefs(); state.bookmarks=[{book:'JHN',chapter:1,verse:1,ts:1}]; state.comments={'JHN:1:1':'Keep <this>'}; state.cloudToken='secret'; window.backup={format:'orthobible-backup',version:1,reader:backupReader(state),personal:{notes:{'JHN:1:1':{body:'Imported'}},guides:[{title:'Guide',blocks:[{type:'paragraph',text:'Complete text'}]}]}}; window.checked=validateBackup(backup);`);
  assert.equal(run('checked.reader.comments["JHN:1:1"]'), 'Keep <this>');
  assert.equal(run('checked.personal.guides[0].blocks[0].text'), 'Complete text');
  assert.equal(run('checked.reader.cloudToken'), undefined);
  assert.throws(() => run('validateBackup({...backup,version:99})'));
  assert.throws(() => run('validateBackup({...backup,reader:{...backup.reader,chapter:999}})'));
  assert.throws(() => run('validateBackup({...backup,reader:{...backup.reader,comments:{"BAD:1:1":"bad"}}})'));
  assert.throws(() => run('validateBackup({notes:{"JHN:1:1":{body:"wrong file"}}})'));
});

test('restore commits personal material and reading state together, retains an undo copy, and clears absent imports', async () => {
  const run = reader();
  run(`loadPrefs(); state.comments={'JHN:1:1':'Before'}; window.storedRecords={notes:{notes:{'JHN:1:1':{body:'Old import'}},preambles:{}}}; studyRead=async key=>storedRecords[key]; studyTransaction=async values=>Object.assign(storedRecords,values); rememberScroll=()=>{}; renderRestoredReader=(reader,personal)=>{Object.assign(state,reader); window.appliedPersonal=personal;}; window.restore={format:'orthobible-backup',version:1,reader:{...backupReader(state),chapter:3,comments:{'JHN:3:16':'After'}},personal:null};`);
  await run('restoreBackup(restore)');
  assert.equal(run('storedRecords.readerState.chapter'), 3);
  assert.equal(run('storedRecords.notes'), null);
  assert.equal(run('storedRecords.restoreRecovery.reader.comments["JHN:1:1"]'), 'Before');
  assert.equal(run('storedRecords.restoreRecovery.personal.notes["JHN:1:1"].body'), 'Old import');
  assert.equal(run('appliedPersonal'), null);
  assert.equal(run('persistenceBusy'), false);
});

test('a failed restore transaction leaves current reader state intact', async () => {
  const run = reader();
  run(`loadPrefs(); state.comments={'JHN:1:1':'Keep'}; studyRead=async()=>null; studyTransaction=async()=>{throw new Error('Full disk')}; rememberScroll=()=>{}; window.restore={format:'orthobible-backup',version:1,reader:{...backupReader(state),chapter:3,comments:{}},personal:null};`);
  await assert.rejects(run('restoreBackup(restore)'), /Full disk/);
  assert.equal(run('state.comments["JHN:1:1"]'), 'Keep');
  assert.equal(run('state.chapter'), 1);
  assert.equal(run('persistenceBusy'), false);
});

test('startup recovers a newer durable reader copy when the local mirror was not written', async () => {
  const run = reader({book:'JHN',chapter:1,savedAt:10});
  run(`studyRead=async()=>({book:'JHN',chapter:3,savedAt:20});`);
  assert.equal((await run('readStoredReader()')).chapter,3);
  run(`studyRead=async()=>({book:'JHN',chapter:3,savedAt:5});`);
  assert.equal((await run('readStoredReader()')).chapter,1);
  run(`localStorage.getItem=()=> '"corrupt"';`);
  assert.equal((await run('readStoredReader()')).chapter,3);
});

test('offline status identifies missing files and repair preserves other cached data', async () => {
  const handlers = {}, missing = new Set(['./app.js', './reader-tools.js']);
  const added = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), {
    self: {addEventListener: (name, fn) => handlers[name] = fn},
    Request: class { constructor(url, options) { this.url = url; this.cache = options.cache; } },
    caches: {open: async () => ({
      match: async url => !missing.has(url),
      addAll: async requests => { for (const r of requests) { assert.equal(r.cache, 'reload'); added.push(r.url); missing.delete(r.url); } }
    })}
  });
  async function message(type) {
    let work, result;
    handlers.message({data:{type},ports:[{postMessage: value => result=value}],waitUntil:p=>work=p});
    await work; return result;
  }
  const before=await message('ORTHOBIBLE_STORAGE_STATUS');
  assert.equal(before.total-before.cached, 2);
  const after=await message('ORTHOBIBLE_REPAIR_CACHE');
  assert.equal(after.missing.length, 0);
  assert.deepEqual(added, ['./app.js', './reader-tools.js']);
});


test('cloud merge combines independent changes and preserves deletions', () => {
  const run=reader();
  run(`loadPrefs(); window.base={format:'orthobible-backup',version:1,reader:backupReader(state),personal:null}; base.reader.comments={'JHN:1:1':'Original'}; window.local=JSON.parse(JSON.stringify(base)); window.remote=JSON.parse(JSON.stringify(base)); delete local.reader.comments['JHN:1:1']; local.reader.comments['JHN:1:2']='Local'; remote.reader.highlights['JHN:1:3']='gold'; remote.reader.chapter=3; window.merged=mergeCloudBackups(base,local,remote);`);
  assert.equal(run('merged.conflicts.length'),0);
  assert.equal(run('merged.backup.reader.comments["JHN:1:1"]'),undefined);
  assert.equal(run('merged.backup.reader.comments["JHN:1:2"]'),'Local');
  assert.equal(run('merged.backup.reader.highlights["JHN:1:3"]'),'gold');
  assert.equal(run('merged.backup.reader.chapter'),3);
});

test('cloud merge pauses on competing comments rather than losing either version', () => {
  const run=reader();
  run(`loadPrefs(); window.base={format:'orthobible-backup',version:1,reader:backupReader(state),personal:null}; window.local=JSON.parse(JSON.stringify(base)); window.remote=JSON.parse(JSON.stringify(base)); local.reader.comments['JHN:1:1']='Phone';remote.reader.comments['JHN:1:1']='Mac';window.merged=mergeCloudBackups(base,local,remote);`);
  assert.equal(run('merged.conflicts[0]'),'comments: JHN:1:1');
  assert.equal(run('local.reader.comments["JHN:1:1"]'),'Phone');
  assert.equal(run('remote.reader.comments["JHN:1:1"]'),'Mac');
});

test('cloud merge retains unchanged imported guides and detects conflicting removals', () => {
  const run=reader();
  run(`loadPrefs();window.base={format:'orthobible-backup',version:1,reader:backupReader(state),personal:validatePersonalNotes({notes:{'JHN:1:1':{body:'One'}}})}; window.local=JSON.parse(JSON.stringify(base));window.remote=JSON.parse(JSON.stringify(base));local.personal=null; remote.personal.notes['JHN:1:2']={body:'Two'};window.merged=mergeCloudBackups(base,local,remote);`);
  assert.equal(run('merged.conflicts.length'),1);
  assert.equal(run('merged.conflicts[0]'),'Imported study material');
});

test('each reading plan covers its chapters exactly once and saves completion', () => {
  const run=reader();
  assert.equal(run('planDays("gospels").length'),30);
  assert.equal(run('planDays("psalms").flat().length'),150);
  assert.equal(run('new Set(planDays("whole-bible").flat().map(p=>p.book+":"+p.ch)).size'),run('BIBLE.books.reduce((n,b)=>n+b.n,0)'));
  run(`state.readingPlan={id:'gospels',completed:[0,0,30,-1]};state.history=[{book:'BAD',chapter:1,scroll:0,ts:1}];normalizeReaderTools(state);`);
  assert.equal(run('JSON.stringify(state.readingPlan.completed)'),'[0]');
  assert.equal(run('state.history.length'),0);
});

test('recent history deduplicates chapters while retaining reading position', () => {
  const run=reader();
  run(`recordHistory('JHN',1,.25);recordHistory('GEN',2,.6);recordHistory('JHN',1,.7);`);
  assert.equal(run('state.history.length'),2);
  assert.equal(run('state.history[0].scroll'),.7);
  assert.equal(run('state.history[1].book'),'GEN');
});

test('reading-plan changes retain the settings destination for sliding back', () => {
  const run=reader();
  run(`loadPrefs(); dialog.open=true; window.captures=0; captureSwipeView=()=>({label:'Reading settings',n:++captures}); showReadingPlan();`);
  for(const dataset of [{startPlan:'gospels'},{planDay:'2'},{completePlan:'2'},{choosePlan:'true'},{startPlan:'psalms'}]) {
    run(`handleReaderToolAction({dataset:${JSON.stringify(dataset)}})`);
    assert.equal(run('dialogBackSnapshot.label'),'Reading settings');
    assert.equal(run('dialogBack === showSettings'),true);
  }
  assert.equal(run('captures'),1,'changes within a plan must not replace its parent with a previous day');
});

test('returning to a dialog retains input values, handlers, focus, and scroll', () => {
  const run=reader();
  run(`dialog.open=true; $('dialogTitle').textContent='Search Scripture'; dialog.scrollTop=240;
    window.changed=0; window.input={value:'love',oninput:()=>changed++,isConnected:true,focus:()=>window.refocused=true};
    $('dialogBody').childNodes=[input]; document.activeElement=input;
    window.back=()=>{}; dialogBack=back; window.route=captureDialogReturn();
    openDialog('Study note','Note'); $('dialogBody').childNodes=[]; route.show();
    $('dialogBody').childNodes[0].oninput();`);
  assert.equal(run('$("dialogTitle").textContent'),'Search Scripture');
  assert.equal(run('$("dialogBody").childNodes[0].value'),'love');
  assert.equal(run('changed'),1);
  assert.equal(run('refocused'),true);
  assert.equal(run('dialog.scrollTop'),240);
  assert.equal(run('dialogBack === back'),true);
});

test('passage previews retain the source-note browser as the note parent', () => {
  const run=reader();
  run(`loadPrefs(); dialog.open=true;
    personalSourceNotes={'JHN:1:1':{title:'Source note',body:'Personal test note',sourceVerse:'In the beginning',see:['JHN:1:2']}};
    window.returns=0;window.origin={title:'OSB notes · John',snapshot:{label:'source-list'},show:()=>returns++};
    showStudyNote('JHN:1:1',true,origin); showPassagePreview('JHN:1:2','JHN:1:1',true); dialogBack();`);
  assert.equal(run('dialogBackSnapshot.label'),'source-list');
  assert.equal(run('studyNoteParent === origin'),true);
  assert.ok(run('$('+'"dialogBody"'+').innerHTML').includes('OSB notes · John'));
  run('dialogBack()');
  assert.equal(run('returns'),1);
});

test('OSB guides opened from search restore the query and result position', () => {
  const run=reader();
  run(`dialog.open=true; $('dialogTitle').textContent='Search Scripture';dialog.scrollTop=170;
    window.query={value:'Scripture'}; $('dialogBody').childNodes=[query];
    personalGuides=[{title:'Test guide',blocks:[{type:'paragraph',text:'Guide text'}]}];
    showStudyContext('guide',0); $('dialogBody').childNodes=[]; dialogBack();`);
  assert.equal(run('$("dialogTitle").textContent'),'Search Scripture');
  assert.equal(run('$('+'"dialogBody"'+').childNodes[0].value'),'Scripture');
  assert.equal(run('dialog.scrollTop'),170);
});

test('source notes attach only through a valid matching-edition alignment', () => {
  const run=reader();
  run(`loadPrefs();window.personal=validatePersonalNotes({notes:{'PSA:23:1':{body:'Original archive'}},sourceNotes:{'PSA:22:1':{body:'Source note',sourceVerse:'The Lord is my shepherd',see:[]}},alignment:{edition:BIBLE.edition,version:1,notes:{'PSA:22:1':'PSA:22:1'},verses:{'PSA:22:1':'PSA:22:1'}}});applyPersonalNotes(personal);`);
  assert.equal(run('noteAt("PSA",22,1).body'),'Source note');
  assert.equal(run('noteAt("PSA",23,1)'),null);
  assert.equal(run('STUDY.notes["PSA:23:1"].body'),'Original archive');
  assert.throws(()=>run(`validatePersonalNotes({...personal,alignment:{edition:'another-edition',version:1}})`));
  assert.throws(()=>run(`validatePersonalNotes({...personal,alignment:{edition:BIBLE.edition,version:1,notes:{'PSA:22:1':'PSA:999:1'}}})`));
});

test('search covers imported guide tables and escapes note previews', () => {
  const run=reader();
  run(`personalGuides=[{title:'Comparison',blocks:[{type:'table',rows:[['Orthodox','Genesis']]}]}];STUDY.notes={'JHN:1:1':{body:'<script>beginning</script>'}};`);
  assert.ok(run('searchStudyContent("Genesis","guides")').includes('Comparison'));
  const html=run('searchStudyContent("beginning","notes")');
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});

function cloudHarness() {
  const run=reader();
  run(`loadPrefs();window.navigator={onLine:true};cloudEnabled=true;queueCloudSync=()=>{window.queued=true};window.local={format:'orthobible-backup',version:1,reader:backupReader(state),personal:null};window.remote=JSON.parse(JSON.stringify(local));remote.reader.comments={'JHN:1:1':'From Mac'};window.baseline=JSON.parse(JSON.stringify(local));window.records={};window.user={user:'u',project:'p',access_token:'test'};records[cloudMetaKey(user)]={revision:1,studyRevision:1,base:baseline};window.revision=2;window.uploads=[];cloudSession=async()=>user;studyRead=async k=>records[k];studyTransaction=async v=>Object.assign(records,v);createBackup=async()=>JSON.parse(JSON.stringify(local));restoreBackup=async b=>{local=JSON.parse(JSON.stringify(b))};cloudRequest=async(path,options)=>{if(path.includes('rpc')){const payload=JSON.parse(options.body);if(payload.expected_revision!==revision)throw new Error('conflict');uploads.push(payload);remote={...remote,reader:payload.next_reader,personal:payload.next_personal?payload.next_personal.data:remote.personal};revision++;if(window.editWhileUploading){local.reader.comments['JHN:1:3']='Typed during sync';window.editWhileUploading=false;}return {revision,study_revision:1};}if(path.includes('select=personal'))return [{personal:{data:remote.personal}}];return [{revision,study_revision:1,reader:remote.reader}];};`);
  return run;
}

test('cloud sync merges independent saves and does not re-upload unchanged study material',async()=>{
  const run=cloudHarness();
  run(`local.reader.highlights['JHN:1:2']='gold';`);
  await run('syncCloud()');
  assert.equal(run('local.reader.comments["JHN:1:1"]'),'From Mac');
  assert.equal(run('remote.reader.highlights["JHN:1:2"]'),'gold');
  assert.equal(run('uploads[0].next_personal'),null);
  assert.equal(run('records[cloudMetaKey(user)].revision'),3);
});

test('edits made during an upload survive and do not turn unapplied remote additions into deletions',async()=>{
  const run=cloudHarness();
  run(`local.reader.highlights['JHN:1:2']='gold';window.editWhileUploading=true;`);
  await run('syncCloud()');
  assert.equal(run('local.reader.comments["JHN:1:3"]'),'Typed during sync');
  assert.equal(run('records[cloudMetaKey(user)].revision'),1);
  await run('syncCloud()');
  assert.equal(run('remote.reader.comments["JHN:1:1"]'),'From Mac');
  assert.equal(run('remote.reader.comments["JHN:1:3"]'),'Typed during sync');
  assert.equal(run('local.reader.comments["JHN:1:1"]'),'From Mac');
});

test('offline sync never calls the server and conflicting comments do not upload',async()=>{
  const run=cloudHarness();
  run(`navigator.onLine=false;`);await run('syncCloud()');assert.equal(run('uploads.length'),0);
  run(`navigator.onLine=true;local.reader.comments['JHN:1:1']='From phone';`);await run('syncCloud()');
  assert.equal(run('uploads.length'),0);assert.equal(run('cloudConflict.conflicts.length'),1);
});

test('PDF text preserves heading and paragraph boundaries without changing the words', () => {
  const run=reader();
  run(`window.content={items:[
    {str:'A heading',transform:[18,0,0,18,40,700],hasEOL:true},
    {str:'This first paragraph has enough ordinary body text to establish the normal size.',transform:[12,0,0,12,40,670],hasEOL:true},
    {str:'Its next line continues the same paragraph and preserves the wording.',transform:[12,0,0,12,40,654],hasEOL:true},
    {str:'This is a separate paragraph after a larger gap, with more ordinary text.',transform:[12,0,0,12,40,622],hasEOL:true},
    {str:'<script> must stay literal text.',transform:[12,0,0,12,40,606],hasEOL:true}
  ]};window.blocks=libraryPdfBlocks(content);`);
  assert.equal(run('blocks.length'),3);
  assert.equal(run('blocks[0].kind'),'heading');
  assert.match(run('blocks[1].text'),/size\. Its next line/);
  assert.equal(run('libraryBlocksHtml(blocks).includes("<script>")'),false);
  assert.match(run('libraryBlocksHtml(blocks)'),/&lt;script&gt;/);
  assert.equal(run('libraryPdfBlocks({items:[]}).length'),0);
});

test('archive paths resolve EPUB relatives and reject remote or escaping resources', () => {
  const run=reader();
  assert.equal(run('libraryArchivePath("OPS/text/ch1.xhtml","../images/picture.png")'),'OPS/images/picture.png');
  assert.equal(run('libraryArchivePath("OPS/text/ch1.xhtml","ch2.xhtml#note")'),'OPS/text/ch2.xhtml');
  for(const href of ['https://example.com/picture.png','javascript:alert(1)','//example.com/a','../../../secret','..%2f..%2f..%2fsecret','x\\y'])
    assert.equal(run(`libraryArchivePath('OPS/text/ch1.xhtml',${JSON.stringify(href)})`),null,href);
});

test('ZIP imports reject traversal, oversized entries, and excessive expansion before decompression', () => {
  const run=reader();
  run(`window.good=fflate.zipSync({'mimetype':fflate.strToU8('application/epub+zip')});`);
  assert.equal(run('fflate.strFromU8(libraryZipEntries(good).mimetype)'),'application/epub+zip');
  run(`window.bad=fflate.zipSync({'../outside':new Uint8Array([1])});`);
  assert.throws(()=>run('libraryZipEntries(bad)'),/invalid entries/);
  run(`window.large=fflate.zipSync({'a':new Uint8Array(500),'b':new Uint8Array(500)});`);
  assert.throws(()=>run('libraryZipEntries(large,2000,100)'),/too large/);
  assert.throws(()=>run('libraryZipEntries(large,800,600)'),/too large/);
});

function seedLibraryBackup(run) {
  run(`loadPrefs();rememberScroll=()=>{};studyRead=async()=>null;
    window.pdfBytes=new TextEncoder().encode('%PDF-1.7\\nPrivate backup test file');
    window.file=new File([pdfBytes],'my-book.pdf',{type:'application/pdf'});`);
  return run(`(async()=>{
    const hash=await libraryFileHash(pdfBytes);
    window.book={id:'pdf-'+hash,hash,format:'pdf',title:'My book',author:'An author',filename:'my-book.pdf',size:file.size,
      pages:24,page:14,scroll:.45,view:'text',marks:[{id:'test-mark',page:14,scroll:.45,quote:'Remember this',note:'My reflection',createdAt:10}],addedAt:1,lastReadAt:20};
    libraryBooks=[book];snapshotLibrary=async()=>({books:[book],files:{[book.id]:file}});
    inspectLibraryFile=async()=>({pages:24});
  })()`);
}

test('complete archives round-trip original book bytes, notes, progress, and Bible saves without credentials', async () => {
  const run=reader();await seedLibraryBackup(run);
  run(`state.comments={'JHN:1:1':'Keep my Bible note'};state.accessToken='never export';`);
  const archive=await run('createReaderArchive()');
  run(`window.archiveInput=new Blob([]);`);
  // Pass data through the reader's own Blob wrapper without depending on a filesystem.
  const bytes=new Uint8Array(await archive.arrayBuffer());
  run(`window.archiveInput=new Blob([new Uint8Array(${JSON.stringify([...bytes])})]);`);
  const restored=await run('readReaderArchive(archiveInput)');
  assert.equal(restored.books[0].page,14);
  assert.equal(restored.books[0].scroll,.45);
  assert.equal(restored.books[0].marks[0].note,'My reflection');
  assert.equal(restored.reader.reader.comments['JHN:1:1'],'Keep my Bible note');
  assert.equal(restored.reader.reader.accessToken,undefined);
  assert.deepEqual(new Uint8Array(await restored.files[restored.books[0].id].arrayBuffer()),new TextEncoder().encode('%PDF-1.7\nPrivate backup test file'));
});

test('complete restore rejects a damaged file before any storage mutation', async () => {
  const run=reader();await seedLibraryBackup(run);
  const blob=await run('createReaderArchive()');
  run(`window.raw=new Uint8Array(${JSON.stringify([...new Uint8Array(await blob.arrayBuffer())])});window.entries=libraryZipEntries(raw);entries['books/0000.pdf'][0]=0;window.broken=new Blob([fflate.zipSync(entries)]);`);
  await assert.rejects(run('readReaderArchive(broken)'),/damaged/);
  assert.equal(run('libraryBooks[0].page'),14);
});

test('library metadata validation rejects invalid page positions and unsafe marker identifiers', async () => {
  const run=reader();await seedLibraryBackup(run);
  assert.equal(run('validateLibraryCatalog([book])[0].marks.length'),1);
  run('window.invalid={...book,page:25}');
  assert.throws(()=>run('validateLibraryCatalog([invalid])'),/invalid library/);
  run(`invalid={...book,marks:[{...book.marks[0],id:'" onclick="bad'}]}`);
  assert.throws(()=>run('validateLibraryCatalog([invalid])'),/invalid library/);
  run('invalid={...book,scroll:2}');
  assert.throws(()=>run('validateLibraryCatalog([invalid])'),/invalid library/);
});

test('queued library notes and reading-position writes preserve each other', async () => {
  const run=reader();await seedLibraryBackup(run);
  run('libraryTransaction=async()=>{};');
  await run(`Promise.all([updateLibraryBook(book.id,{page:15,scroll:.1}),updateLibraryBook(book.id,b=>({marks:[...b.marks,{id:'second'}]}))])`);
  assert.equal(run('libraryBooks[0].page'),15);
  assert.equal(run('libraryBooks[0].marks.length'),2);
});

test('a failed library write leaves in-memory notes intact', async () => {
  const run=reader();await seedLibraryBackup(run);
  run(`libraryTransaction=async()=>{throw new Error('Full disk')};`);
  await assert.rejects(run('updateLibraryBook(book.id,{marks:[]})'),/Full disk/);
  assert.equal(run('libraryBooks[0].marks.length'),1);
});

test('complete restore rolls the library back when the Bible transaction fails', async () => {
  const run=reader();await seedLibraryBackup(run);
  run(`window.replacements=[];replaceLibrary=async(snapshot,recovery)=>replacements.push({title:snapshot.books[0].title,recovery:!!recovery});
    restoreBackup=async()=>{throw new Error('Bible write failed')};
    window.archive={books:[{...book,title:'Restored book'}],files:{},reader:{}};`);
  await assert.rejects(run('restoreReaderArchive(archive)'),/Bible write failed/);
  assert.equal(run('JSON.stringify(replacements)'),JSON.stringify([{title:'Restored book',recovery:true},{title:'My book',recovery:false}]));
  assert.equal(run('libraryBooks[0].title'),'My book');
  assert.equal(run('libraryBusy'),false);
});

test('library search matches literal phrases regardless of letter case and does not interpret markup', () => {
  const run=reader();
  assert.match(run('librarySearchSnippet("A quiet moment of prayer and reflection.","PRAYER")'),/prayer/);
  assert.equal(run('librarySearchSnippet("No words here","missing")'),null);
  assert.equal(run('librarySearchSnippet("Literal <script> text","<script>")'),'Literal <script> text');
});

test('old PDF catalog records retain their position and acquire safe defaults for complete backups', async () => {
  const run=reader();await seedLibraryBackup(run);
  run('window.old={...book};delete old.format;delete old.marks;delete old.scroll;delete old.lastReadAt;');
  assert.equal(run('validateLibraryCatalog([old])[0].page'),14);
  assert.equal(run('validateLibraryCatalog([old])[0].format'),'pdf');
  assert.equal(run('validateLibraryCatalog([old])[0].marks.length'),0);
});

test('library result actions retain the search query and bookmarked scroll position', () => {
  const run=reader();
  run('window.jumps=[];jumpLibraryLocation=(...args)=>jumps.push(args);');
  run(`handleLibraryAction({dataset:{libraryJump:'17',libraryQuery:'prayer'}});handleLibraryAction({dataset:{libraryJump:'14',libraryMarkScroll:'.45'}});`);
  assert.equal(run('jumps[0][0]'),'17');
  assert.equal(run('jumps[0][3]'),'prayer');
  assert.equal(run('jumps[1][2]'),.45);
});

test('backup export detects a damaged stored original instead of producing an unusable archive', async () => {
  const run=reader();await seedLibraryBackup(run);
  run(`pdfBytes[0]=0;window.damagedFile=new File([pdfBytes],book.filename,{type:'application/pdf'});snapshotLibrary=async()=>({books:[book],files:{[book.id]:damagedFile}});`);
  await assert.rejects(run('createReaderArchive()'),/saved file.*damaged/);
  assert.equal(run('libraryBooks[0].marks[0].note'),'My reflection');
});
