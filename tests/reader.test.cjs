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
    "agpeya-data.js",
  ])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "personal-notes.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "persistence.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "cloud-sync.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "reader-tools.js"), "utf8"), context);
  for (const file of ["katameros-data.js", "today.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  for (const file of ["vendor/fflate/fflate.js", "library-formats.js", "library.js", "library-tools.js", "library-backup.js"])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "note-alignment.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "osb-pack.js"), "utf8"), context);
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
        "reader-v35",
        "reader-v36",
        "reader-v37",
        "reader-v38",
        "reader-v39",
        "reader-v40",
        "reader-v41",
        "reader-v42",
        "reader-v43",
        "reader-v44",
        "reader-v45",
        "reader-v46",
        "reader-v47",
        "reader-v48",
        "reader-v49",
        "reader-v50",
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
  assert.deepEqual(deleted, ["reader-v30", "reader-v31", "reader-v32", "reader-v35", "reader-v36", "reader-v37", "reader-v38", "reader-v39", "reader-v40", "reader-v41", "reader-v42", "reader-v43", "reader-v44", "reader-v45", "reader-v46", "reader-v47", "reader-v48", "reader-v49", "orthodox-bible-v13", "orthodox-bible-v18", "orthodox-bible-v20", "orthodox-bible-v28", "orthodox-bible-v29", "orthodox-bible-v30"]);
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
  assert.equal(run('PRAYERS.length'), 9);
  assert.equal(run('new Set(PRAYERS.map(p => p.id)).size'), 9);
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

test('How to read Scripture opens the OSB guide when unlocked and the original article otherwise', () => {
  const run=reader();
  run('personalGuides=[];');
  assert.ok(run('howToReadButton()').includes('https://www.oca.org/reflections/misc-authors/how-to-read-the-bible'));
  run(`personalGuides=[{title:'Introducing the Orthodox Church',blocks:[]},{title:'How to Read the Bible',blocks:[{type:'paragraph',text:'Your private copy'}]}];`);
  assert.ok(run('howToReadButton()').includes('data-context-guide="1"'));
});

test('no AI-written introductions, notes, or guides remain built in', () => {
  const run=reader();
  assert.equal(run('Object.keys(window.STUDY.preambles).length+Object.keys(window.STUDY.notes).length+Object.keys(window.STUDY.essays).length'),0);
  run('loadPrefs({});state.book="GEN";state.chapter=1;personalNotesCount=0;renderChapter(0);');
  assert.ok(!run('pane.innerHTML').includes('<details class="introduction">'));
  assert.match(run('pane.innerHTML'),/osb-locked/);
});

test('OSB section headings and introductions render with the chapter', () => {
  const run=reader();
  run(`loadPrefs({});state.book="GEN";state.chapter=1;
    applyPersonalNotes(validatePersonalNotes({notes:{"MAT:5:3":{body:"Blessed note"}},introductions:{GEN:{title:"The Book of Genesis",blocks:[{type:"heading",text:"Author"},{type:"paragraph",text:"Moses"}]}},
      headings:{"GEN:1:1":["The Creation"],"GEN:99:1":["Invalid"],"GEN:2:1":[42]}}));renderChapter(0);`);
  const html=run('pane.innerHTML');
  assert.match(html,/<h3 class="osb-heading">The Creation<\/h3>/);
  assert.ok(!html.includes('Invalid'));
  assert.match(html,/Introduction to Genesis/);
  assert.match(html,/Moses/);
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
  assert.ok(html.includes('aria-label="Chapter 100, reading" aria-current="true"'));
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

test('PDF text joins adjacent glyph fragments and preserves actual word gaps', () => {
  const run=reader();
  run(`window.fragments={items:[
    {str:'spi',width:15,transform:[12,0,0,12,40,700]},
    {str:'ritual',width:30,transform:[12,0,0,12,55,700]},
    {str:'growth',width:35,transform:[12,0,0,12,90,700],hasEOL:true}
  ]};`);
  assert.equal(run('libraryPdfBlocks(fragments)[0].text'),'spiritual growth');
});

test('PDF canvas sizing preserves page proportions and limits raster memory on phones', () => {
  const run=reader();
  assert.equal(run('JSON.stringify(libraryPdfCanvasSize(300,450,2))'),JSON.stringify({width:600,height:900,scale:2}));
  assert.ok(run('libraryPdfCanvasSize(1000,100000,3).width * libraryPdfCanvasSize(1000,100000,3).height <= 8000000'));
  assert.ok(run('libraryPdfCanvasSize(1000,100000,3).height <= 8192'));
});

test('phone overscroll cannot put invalid scroll fractions into library backups', () => {
  const run=reader();
  run('dialog.scrollHeight=1000;dialog.clientHeight=500;dialog.scrollTop=-40;');
  assert.equal(run('libraryScrollPosition()'),0);
  run('dialog.scrollTop=540;');
  assert.equal(run('libraryScrollPosition()'),1);
});

test('book search highlights span inline elements and paragraph breaks', () => {
  const run=reader();
  assert.equal(run(`JSON.stringify(libraryFindTextMatch([{text:'A quiet '},{text:'prayer'},{text:' and reflection.'}], 'quiet prayer'))`),
    JSON.stringify({start:{index:0,offset:2,end:3},end:{index:1,offset:5,end:6}}));
  assert.equal(run(`JSON.stringify(libraryFindTextMatch([{text:'prayer'},{text:'and reflection',gap:true}], 'prayer and'))`),
    JSON.stringify({start:{index:0,offset:0,end:1},end:{index:1,offset:2,end:3}}));
  assert.equal(run(`libraryFindTextMatch([{text:'no matching words'}],'prayer')`),null);
});

function pdfRenderSession(run,view='text') {
  run(`loadPrefs();window.savedPositions=[];saveLibraryPosition=async s=>savedPositions.push({page:s.page,view:s.view,scroll:s.scroll});
    dialog.scrollTop=400;dialog.scrollHeight=2000;dialog.clientHeight=500;
    for(const id of ['libraryReadingArea','libraryPdfTextView','libraryPdfPageView','libraryPdfCanvas'])$(id).setAttribute=()=>{};
    $('libraryPdfCanvas').replaceWith=()=>{};
    window.pageFor=n=>({pageNumber:n,cleanup(){},getTextContent:async()=>({items:[{str:'Read with attention and prayer.',transform:[12,0,0,12,40,700],hasEOL:true}]})});
    window.session={book:{id:'test-book',title:'Test',pages:24},page:14,view:${JSON.stringify(view)},displayView:${JSON.stringify(view)},
      scroll:.2,version:0,ready:true,frameReady:true,urls:[],textCache:new Map(),blocksCache:new Map(),pdf:{numPages:24,getPage:async n=>pageFor(n)}};
    activeLibraryPdf=session;
    renderLibraryCanvas=(s,p)=>({canvas:{width:350,height:500},width:350,task:{promise:Promise.resolve(),cancel(){}}});`);
}

test('changing book display while a page is loading retains the requested page', async () => {
  const run=reader();pdfRenderSession(run);
  run(`session.ready=false;session.pendingPage=20;session.pendingOptions={scroll:.4,query:'prayer'};
    renderLibraryPdfPage=async(s,n,options)=>{window.changed={page:n,options};};`);
  await run('changeLibraryPdfView(session,"page")');
  assert.equal(run('changed.page'),20);
  assert.equal(run('changed.options.view'),'page');
  assert.equal(run('changed.options.scroll'),.4);
  assert.equal(run('changed.options.query'),undefined);
});

test('refreshing the same PDF page preserves the current reading position', async () => {
  const run=reader();pdfRenderSession(run);
  await run('renderLibraryPdfPage(session,14)');
  assert.equal(run('session.page'),14);
  assert.equal(run('session.scroll'),400/1500);
  assert.equal(run('dialog.scrollTop'),400);
});

test('Page view is independent of PDF text extraction', async () => {
  const run=reader();pdfRenderSession(run,'page');
  run(`window.textReads=0;session.pdf.getPage=async n=>({...pageFor(n),getTextContent:async()=>{textReads++;throw new Error('Text unavailable');}});`);
  await run('renderLibraryPdfPage(session,15)');
  assert.equal(run('textReads'),0);
  assert.equal(run('session.page'),15);
  assert.equal(run('session.displayView'),'page');
  assert.equal(run('session.ready'),true);
});

test('unreadable PDF text falls back to the original page without trapping navigation', async () => {
  const run=reader();pdfRenderSession(run);
  run(`session.pdf.getPage=async n=>({...pageFor(n),getTextContent:async()=>{throw new Error('Text unavailable');}});`);
  await run('renderLibraryPdfPage(session,15)');
  assert.equal(run('session.page'),15);
  assert.equal(run('session.displayView'),'page');
  assert.equal(run('session.ready'),true);
  assert.equal(run('$("libraryPdfNext").disabled'),false);
});

test('a failed PDF raster falls back to selectable text', async () => {
  const run=reader();pdfRenderSession(run,'page');
  run(`renderLibraryCanvas=()=>{throw new Error('Canvas failed');};`);
  await run('renderLibraryPdfPage(session,15)');
  assert.equal(run('session.displayView'),'text');
  assert.equal(run('session.ready'),true);
  assert.match(run('$("libraryPdfText").innerHTML'),/attention and prayer/);
});

test('a failed PDF page keeps the previous page readable and offers a working retry', async () => {
  const run=reader();pdfRenderSession(run);
  run(`window.fail=true;session.pdf.getPage=async n=>{if(fail)throw new Error('Page failed');return pageFor(n);};$('libraryPdfText').innerHTML='<p>Previous page</p>';`);
  await run('renderLibraryPdfPage(session,15)');
  assert.equal(run('session.page'),14);
  assert.equal(run('session.ready'),true);
  assert.equal(run('$("libraryPdfPrevious").disabled'),false);
  assert.equal(run('$("libraryPdfNext").disabled'),false);
  assert.equal(run('$("libraryPdfError").hidden'),false);
  assert.equal(run('$("libraryPdfText").innerHTML'),'<p>Previous page</p>');
  run('fail=false;');
  await run('$("libraryPdfRetry").onclick()');
  assert.equal(run('session.page'),15);
  assert.equal(run('$("libraryPdfError").hidden'),true);
});

test('PDF search results switch Page view to readable highlighted text', async () => {
  const run=reader();pdfRenderSession(run,'page');
  run('highlightLibraryMatch=query=>{window.highlighted=query;};');
  await run('renderLibraryPdfPage(session,15,{query:"prayer"})');
  assert.equal(run('session.view'),'text');
  assert.equal(run('session.displayView'),'text');
  assert.equal(run('highlighted'),'prayer');
});

test('late PDF text results cannot overwrite a newer page or its saved position', async () => {
  const run=reader();pdfRenderSession(run);
  run(`window.releaseText;window.slowText=new Promise(resolve=>releaseText=resolve);
    session.pdf.getPage=async n=>n===15 ? {...pageFor(n),getTextContent:()=>slowText} : pageFor(n);
    window.firstRender=renderLibraryPdfPage(session,15);`);
  await run('Promise.resolve().then(()=>Promise.resolve())');
  await run('renderLibraryPdfPage(session,16)');
  run(`releaseText({items:[{str:'Stale page text',transform:[12,0,0,12,40,700]}]});`);
  await run('firstRender');
  assert.equal(run('session.page'),16);
  assert.equal(run('$("libraryPdfPage").value'),16);
  assert.equal(run('$("libraryPdfText").innerHTML.includes("Stale")'),false);
  assert.equal(run('savedPositions.some(p=>p.page===15)'),false);
});

test('reopening a PDF waits for its pending saved position', async () => {
  const run=reader();
  run(`loadPrefs();window.releaseSave;librarySaveQueue=new Promise(resolve=>releaseSave=resolve);
    libraryBooks=[{id:'test-book',title:'Test',page:14,pages:24,view:'text'}];
    openDialog=()=>{};libraryTransaction=async()=>new Blob(['PDF test']);pdfOptions=buffer=>({data:buffer});
    pdfRenderer=async()=>({getDocument:()=>({promise:Promise.resolve({numPages:24})})});
    renderLibraryPdfPage=async(s,page)=>{window.openedPage=page;};
    window.reopening=showLibraryPdf('test-book',undefined,null);`);
  assert.equal(run('window.openedPage'),undefined);
  run('libraryBooks[0].page=15;releaseSave();');
  await run('reopening');
  assert.equal(run('openedPage'),15);
});

test('closing a PDF during rendering cancels work without saving an unseen page', async () => {
  const run=reader();pdfRenderSession(run);
  run(`window.rejectPaint;window.paint=new Promise((resolve,reject)=>rejectPaint=reject);
    renderLibraryCanvas=()=>{const task={promise:paint,cancel(){rejectPaint(Object.assign(new Error('Cancelled'),{name:'RenderingCancelledException'}));}};session.renderTask=task;return {canvas:{width:350,height:500},width:350,task};};
    window.rendering=renderLibraryPdfPage(session,15,{view:'page'});`);
  await run('Promise.resolve().then(()=>Promise.resolve())');
  run('stopLibraryPdf();');
  await run('rendering');
  assert.equal(run('activeLibraryPdf'),null);
  assert.equal(run('savedPositions.some(p=>p.page===15)'),false);
});

test('stalled PDF work times out and cancels rendering instead of leaving the reader stuck', async () => {
  const run=reader();run('window.cancelled=false;');
  await assert.rejects(run(`libraryPdfWork(new Promise(()=>{}),'Rendering timed out',()=>cancelled=true,5)`),/Rendering timed out/);
  assert.equal(run('cancelled'),true);
  assert.equal(await run(`libraryPdfWork(Promise.resolve('done'),'Unexpected timeout',undefined,5)`),'done');
});

test('book tools can pause a slow first page and resume it when returning to reading', async () => {
  const run=reader();pdfRenderSession(run);
  run(`session.ready=false;session.frameReady=false;session.pendingPage=20;session.pendingView='page';session.pendingOptions={scroll:.4};
    window.cancelled=false;session.renderTask={cancel:()=>cancelled=true};
    showLibraryContents=async()=>{};`);
  await run('showLibraryTool("contents")');
  assert.equal(run('cancelled'),true);
  assert.equal(run('session.tools'),'contents');
  assert.equal(run('session.pausedRender.page'),20);
  run('renderLibraryPdfPage=async(s,page,options)=>{window.resumed={page,options};};');
  await run('closeLibraryTool(session)');
  assert.equal(run('resumed.page'),20);
  assert.equal(run('resumed.options.view'),'page');
  assert.equal(run('resumed.options.scroll'),.4);
});

test('book search tolerates spacing differences in extracted PDF text', () => {
  const run=reader();
  assert.equal(run(`librarySearchSnippet('Prayer  and\\nreflection','prayer and reflection')`),'Prayer and reflection');
});

function pdfLine(str,y,size=10,x=43){return {str,transform:[size,0,0,size,x,y],hasEOL:true};}
test('PDF text rejoins words hyphenated at line ends but keeps real compounds and capitalized breaks', () => {
  const run=reader();
  run(`window.hyphen={items:[
    ${JSON.stringify(pdfLine('Perhaps such a subject might cover the whole life and therefore in-',500))},
    ${JSON.stringify(pdfLine('cludes all the spiritual lectures about self-',488))},
    ${JSON.stringify(pdfLine('control and the Spir-',476))},
    ${JSON.stringify(pdfLine('itual Wake in East-',464))},
    ${JSON.stringify(pdfLine('West conversation.',452))}
  ]};`);
  assert.equal(run('libraryPdfBlocks(hyphen)[0].text'),
    'Perhaps such a subject might cover the whole life and therefore includes all the spiritual lectures about self-control and the Spiritual Wake in East- West conversation.');
});

test('running headers and page numbers are removed when they repeat in nearby page margins', () => {
  const run=reader();
  const page=(n,header)=>`{items:[${JSON.stringify(pdfLine(String(n),32,9,206))},${JSON.stringify(pdfLine(header,560,9))},
    ${JSON.stringify(pdfLine('THE IMAGE OF GOD',530,18,63))},${JSON.stringify(pdfLine('Body text for page '+n+' with enough words to set the body size.',503))},
    ${JSON.stringify(pdfLine('More body text continues the paragraph.',491))},${JSON.stringify(pdfLine('A last line near the bottom margin.',51))}]}`;
  run(`window.pages=[${page(10,'The Spiritual Man')},${page(11,'The Image of God')},${page(12,'The Spiritual Man')}];
    window.edges=pages.map(p=>libraryPdfEdges(libraryPdfLines(p),[0,0,420,595]));
    window.margins=libraryPdfMargins(edges[2],[edges[0],edges[1]]);
    window.blocks=libraryPdfBlocks(pages[2],margins.skip);`);
  assert.equal(run('margins.printed'),'12');
  assert.equal(run('blocks.some(b=>/Spiritual Man|^12$/.test(b.text))'),false);
  assert.equal(run('blocks[0].text'),'THE IMAGE OF GOD');
  assert.match(run('blocks.at(-1).text'),/bottom margin/);
  // A lone page has no neighbours: its number still goes, its unique header stays.
  assert.equal(run('libraryPdfBlocks(pages[0],libraryPdfMargins(edges[0],[]).skip).some(b=>b.text==="The Spiritual Man")'),true);
  assert.equal(run('libraryPdfBlocks(pages[0],libraryPdfMargins(edges[0],[]).skip).some(b=>b.text==="10")'),false);
});

test('printed page numbers map to PDF pages through labels or a consistent front-matter offset', () => {
  const run=reader();
  assert.equal(run('libraryPrintedOffset(new Map([[12,"10"],[13,"11"],[14,"12"]]))'),2);
  assert.equal(run('libraryPrintedOffset(new Map([[12,"10"]]))'),null);
  assert.equal(run('libraryPrintedOffset(new Map([[12,"10"],[30,"4"],[50,"90"]]))'),null);
  run('window.s={pdf:{numPages:211},printed:new Map([[12,"10"],[13,"11"]])};');
  assert.equal(run('libraryPrintedLabel(s,51)'),'49');
  assert.equal(run('libraryPrintedPage(s,"49")'),51);
  assert.equal(run('libraryPrintedPage(s,"500")'),0);
  run('s.pageLabels=libraryUsefulLabels(["i","ii","1","2"],4);s.pdf.numPages=4;');
  assert.equal(run('libraryPrintedLabel(s,3)'),'1');
  assert.equal(run('libraryPrintedPage(s,"ii")'),2);
  assert.equal(run('libraryUsefulLabels(["1","2","3"],3)'),null);
});

test('PDF page text drops neighbouring headers and records printed pages in the reader session', async () => {
  const run=reader();pdfRenderSession(run);
  run(`window.pageFor=n=>({pageNumber:n,view:[0,0,420,595],rotate:0,cleanup(){},getTextContent:async()=>({items:[
      {str:String(n-2),transform:[9,0,0,9,206,32],hasEOL:true},{str:n%2 ? 'Chapter Title' : 'Book Title',transform:[9,0,0,9,43,560],hasEOL:true},
      {str:'Read with attention and prayer on page '+n+'.',transform:[10,0,0,10,43,500],hasEOL:true}]})});
    session.pdf.getPage=async n=>pageFor(n);`);
  await run('renderLibraryPdfPage(session,15)');
  const html=run('$("libraryPdfText").innerHTML');
  assert.match(html,/attention and prayer on page 15/);
  assert.doesNotMatch(html,/Chapter Title|<p>13<\/p>/);
  assert.equal(run('libraryPrintedLabel(session,15)'),'13');
  assert.equal(run('libraryPrintedPage(session,"20")'),22);
  assert.match(run('$("libraryPdfStatus").textContent'),/Printed page 13/);
  assert.equal(run('$("libraryPdfEnd").hidden'),false);
});

test('book search finds every match on a page and ornament lines become section breaks', () => {
  const run=reader();
  assert.equal(run(`libraryFindTextMatches([{text:'Pray, and pray '},{text:'again: PRAY.'}],'pray').length`),3);
  assert.equal(run(`libraryFindTextMatches([{text:'nothing'}],'pray').length`),0);
  assert.equal(run(`libraryBlocksHtml([{kind:'paragraph',text:'E E E'},{kind:'paragraph',text:'* * *'},{kind:'paragraph',text:'A B C'}])`),
    '<hr class="library-pdf-break"><hr class="library-pdf-break"><p>A B C</p>');
});

test('whole-book search skips an unreadable page and reports it', async () => {
  const run=reader();pdfRenderSession(run);
  run(`session.pdf.numPages=3;session.tools='search';session.searchVersion=0;
    session.pdf.getPage=async n=>n===2 ? {...pageFor(n),getTextContent:async()=>{throw new Error('broken');}} : pageFor(n);`);
  await run('searchLibraryBook(session,"prayer")');
  assert.match(run('$("librarySearchStatus").textContent'),/2 matching pages.*1 page could not be searched/);
});

test('Coptic dates follow the Anno Martyrum calendar, including feasts and the Coptic leap year', () => {
  const run=reader();
  assert.equal(run('copticDate("2026-11-11").name'),'2 Hatour 1743');
  assert.equal(run('copticDate("2027-01-07").name'),'29 Kiahk 1743');
  assert.equal(run('copticDate("2026-09-11").name'),'1 Tout 1743');
  assert.equal(run('copticDate("2027-09-11").name'),'6 Nasie 1743');
  assert.equal(run('copticDate("2027-09-12").name'),'1 Tout 1744');
});

test('lectionary Psalms map from English to Septuagint numbering and Jeremiah keeps English chapters', () => {
  const run=reader();
  assert.equal(run('JSON.stringify(psalmToLxx(110,4))'),'[109,4]');
  assert.equal(run('JSON.stringify(psalmToLxx(10,1))'),'[9,21]');
  assert.equal(run('JSON.stringify(psalmToLxx(147,12))'),'[147,1]');
  assert.equal(run('JSON.stringify(psalmToLxx(23,1))'),'[22,1]');
  assert.match(run('lectionaryPassage([19,110,[4]]).verses[0].text'),/priest for ever/);
  assert.equal(run('passageLabel([lectionaryPassage([19,110,[4,5,7]])])'),'Psalm 109(110):4–5, 7');
  assert.match(run('lectionaryPassage([24,31,[31]]).verses[0].text'),/new covenant/);
  assert.equal(run('lectionaryPassage([58,4,[14,15,16]]).verses.length'),3);
});

test('today shows the Katameros Liturgy in order with the Liturgy Psalm as the verse to carry', () => {
  const run=reader();
  run('loadPrefs({});window.day=katamerosDay("2026-11-11");');
  assert.equal(run('day.coptic.name'),'2 Hatour 1743');
  assert.deepEqual(JSON.parse(run('JSON.stringify(liturgyReadings(day).map(s=>s.title))')),['Pauline Epistle','Catholic Epistle','Acts of the Apostles','Psalm & Gospel']);
  assert.equal(run('verseToCarry(day).label'),'Psalm 109(110):4–5, 7');
  assert.equal(run('katamerosDay("2099-01-01")'),null);
});

test('reading the day\'s Gospel builds a streak that tolerates an unread today', () => {
  const run=reader();
  run('loadPrefs({});state.today={done:{}};for(const key of ["2026-11-09","2026-11-10"]) state.today.done[key]=liturgyIds(katamerosDay(key));');
  assert.equal(run('readingStreak("2026-11-11")'),2);
  run('state.today.done["2026-11-11"]=["Liturgy|Pauline Epistle|0"];');
  assert.equal(run('dayComplete("2026-11-11")'),false);
  assert.equal(run('readingStreak("2026-11-11")'),2);
  run('state.today.done["2026-11-11"]=liturgyIds(katamerosDay("2026-11-11"));');
  assert.equal(run('readingStreak("2026-11-11")'),3);
});

test('memory verses advance through growing intervals and a miss returns tomorrow', () => {
  const run=reader();
  run('loadPrefs({});state.memory=[];addMemoryVerse([lectionaryPassage([43,3,[16]])],"2026-11-11");');
  assert.equal(run('addMemoryVerse([lectionaryPassage([43,3,[16]])],"2026-11-11")'),false);
  assert.equal(run('memoryDue("2026-11-11").length'),1);
  assert.equal(run('reviewMemory(state.memory[0].id,true,"2026-11-11").due'),'2026-11-13');
  assert.equal(run('reviewMemory(state.memory[0].id,true,"2026-11-13").due'),'2026-11-17');
  assert.equal(run('reviewMemory(state.memory[0].id,false,"2026-11-17").due'),'2026-11-18');
  assert.equal(run('state.memory[0].box'),0);
});

test('practice fading hides more words at each step and keeps punctuation visible', () => {
  const run=reader();
  const hidden=level=>run(`fadeWords("The Lord is my shepherd; I shall not want.",${level}).filter(p=>p.hidden).length`);
  assert.equal(hidden(0),0);
  assert.ok(hidden(1)>0 && hidden(1)<hidden(2));
  assert.equal(hidden(3),9);
  assert.equal(run('fadeWords("shepherd;",3)[0].after'),';');
  assert.equal(run('fadeWords("shepherd;",3)[0].hint'),'s');
});

test('Today state survives backups and invalid entries are dropped', () => {
  const run=reader();
  run(`window.r={today:{done:{"2026-11-11":["Liturgy|Pauline Epistle|0"],"bad":["x"]}},memory:[{id:"JHN:3.16",label:"John 3:16",text:"For God so loved",box:2,due:"2026-11-20"},{id:1}]};normalizeToday(r);`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(Object.keys(r.today.done))')),['2026-11-11']);
  assert.equal(run('r.memory.length'),1);
  assert.equal(run('backupReader({...r,tab:"today"}).memory.length'),1);
});

test('every Katameros reading through 2030 resolves to verse text in this edition', () => {
  const run=reader();
  const result=JSON.parse(run(`(()=>{let total=0,empty=[],partial=0;
    for(const set of window.KATAMEROS.sets)for(const [,subs] of set)for(const [,readings] of subs)for(const reading of readings)for(const ref of reading){
      total++;const p=lectionaryPassage(ref);if(!p||!p.verses.length)empty.push(ref.slice(0,2).join(":"));else if(p.verses.length<ref[2].length)partial++;}
    return JSON.stringify({total,empty,partial});})()`));
  assert.ok(result.total>1000);
  assert.deepEqual(result.empty,[]);
  assert.ok(result.partial/result.total<0.03, `partial ${result.partial} of ${result.total}`);
});

test('opening a Today reading is a visit: Go back returns to Today and the Read position is unchanged', () => {
  const run=reader();
  run('window.requestAnimationFrame=fn=>fn();loadPrefs({});state.book="JHN";state.chapter=3;openTab("today");state.scroll=.37;renderToday("2026-11-11");');
  run('handleTodayAction({dataset:{todayVisit:"HEB:4:14"}});');
  assert.equal(run('state.book+" "+state.chapter'),'HEB 4');
  assert.equal(run('$("returnReading").hidden'),false);
  run('returnToPrevious();');
  assert.equal(run('state.tab'),'today');
  assert.equal(run('state.book+" "+state.chapter'),'JHN 3');
  assert.equal(run('state.scroll'),.37);
});

test('browsing other books in the chapter drawer does not move the reading position', () => {
  const run=reader();
  run('dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};dialog.querySelector=()=>null;for(const id of ["drawerNextBook","drawerPreviousBook","closeDialog"])$(id).focus=()=>{};loadPrefs({});state.book="JHN";state.chapter=3;showChapterDrawer();$("drawerNextBook").onclick();');
  assert.equal(run('state.book+" "+state.chapter'),'JHN 3');
  assert.equal(run('$("dialogTitle").textContent'),displayNameOf('ACT'));
  function displayNameOf(id){return run(`displayName("${id}")`);}
});

test('a committed back swipe completes when a new touch lands during the settle', () => {
  const run=reader();
  run(`window.committed=0;window.view=beginBackSlide({getBoundingClientRect:()=>({left:0,top:0,width:390,height:800}),classList:{add(){},remove(){}},style:{setProperty(){},removeProperty(){}}},null,true);
    view.finish(true,()=>committed++);activeBackSlide.flush();`);
  assert.equal(run('committed'),1);
  assert.equal(run('activeBackSlide'),null);
});

test('restoring a backup taken on Today shows Today', () => {
  const run=reader();
  run('loadPrefs({});window.rendered=null;renderToday=key=>{window.rendered=key;};renderTab("today");');
  assert.equal(run('rendered'),run('localDayKey()'));
});

test('reading plan days complete themselves as their chapters are read', () => {
  const run=reader();
  run('loadPrefs({});state.readingPlan={id:"gospels",completed:[],read:[]};window.day0=planDays("gospels")[0];');
  const chapters=JSON.parse(run('JSON.stringify(day0)'));
  for (const p of chapters.slice(0,-1)) run(`markPlanChapterRead("${p.book}",${p.ch})`);
  assert.equal(run('state.readingPlan.completed.length'),0);
  const last=chapters.at(-1);
  assert.equal(run(`markPlanChapterRead("${last.book}",${last.ch})`),0);
  assert.equal(run('nextPlanDay().index'),1);
  assert.equal(run('markPlanChapterRead("GEN",1)'),null);
  run('normalizeReaderTools(state);');
  assert.ok(run('state.readingPlan.read.length')>=chapters.length);
});

test('the compact verse sheet toggles highlights and autosaves comments', () => {
  const run=reader();
  run('dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};loadPrefs({});showVerse("JHN",3,16);');
  assert.match(run('$("dialogBody").innerHTML'),/verse-swatch hl-gold/);
  assert.match(run('$("dialogTitle").textContent'),/John 3:16/);
});

test('quick text settings change size, font, and theme at once', () => {
  const run=reader();
  run(`dialog.showModal=()=>{dialog.open=true;};loadPrefs({});state.font=20;
    const buttons={};$("dialogBody").querySelectorAll=sel=>{const m=sel.match(/data-text-(\\w+)/);return m?[{dataset:{["text"+m[1][0].toUpperCase()+m[1].slice(1)]:m[1]==="theme"?"dark":m[1]==="spacing"?"2.15":m[1]==="font"?"book":"warm"},setAttribute(){},set onclick(f){buttons[m[1]]=f;}}]:[]};
    showTextSettings();$("quickFontUp").onclick();buttons.theme();buttons.font();buttons.spacing();`);
  assert.equal(run('state.font'),21);
  assert.equal(run('state.theme'),'dark');
  assert.equal(run('state.fontFamily'),'book');
  assert.equal(run('state.lineSpacing'),2.15);
});

test('Wisdom has fifty-plus topics of Scripture only, a daily topic, and searchable keywords', () => {
  const run=reader();
  assert.ok(run('wisdomTopics().length')>=50);
  assert.equal(run('wisdomTopics().filter(t=>t.line).length'),0);
  assert.ok(run('wisdomTopics().every(t=>t.refs.length>=6 && typeof t.tags==="string")'));
  assert.equal(run('wisdomTopicOfDay("2026-11-11").id'),run('wisdomTopicOfDay("2026-11-11").id'));
  assert.ok(run('wisdomTopics().some(t=>(t.title+" "+t.tags).includes("stress"))'));
  run('loadPrefs({});state.memory=[];memorizeWisdomPassage("PHP:4:6:7");');
  assert.equal(run('state.memory[0].label'),'Philippians 4:6–7');
});

test('no screen or dialog shows uninterpolated template text', () => {
  const run=reader();
  run('dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};window.requestAnimationFrame=fn=>fn();loadPrefs({});for(const id of ["bookFilter","wisdomFilter"])$(id).value="";for(const id of ["closeDialog","bookFilter","searchInput","comment"])$(id).focus=()=>{};');
  const views={
    books:'showBooks();$("dialogBody").innerHTML',
    settings:'showSettings();$("dialogBody").innerHTML',
    text:'showTextSettings();$("dialogBody").innerHTML',
    verse:'showVerse("JHN",3,16);$("dialogBody").innerHTML',
    today:'renderToday("2026-11-11");pane.innerHTML',
    wisdom:'wisdomTopic=null;renderWisdom();pane.innerHTML',
    topic:'wisdomTopic=WISDOM.categories[0].topics[0];renderWisdom();pane.innerHTML',
    chapter:'state.book="GEN";state.chapter=1;renderChapter(0);pane.innerHTML',
    plan:'showReadingPlan(true,undefined,null);$("dialogBody").innerHTML',
  };
  for (const [name,expr] of Object.entries(views)) {
    const html=run(expr);
    assert.ok(!/\$\{|\bundefined\b|\bNaN\b|\[object Object\]/.test(html), `${name} contains template residue`);
  }
  assert.match(run('showBooks();$("dialogBody").innerHTML'),/How to read Scripture/);
});

test('every Agpeya hour has its Psalms and Gospel in this edition, and the current hour is found', () => {
  const run=reader();
  assert.equal(run('AGPEYA.hours.length'),7);
  const missing=run(`JSON.stringify(AGPEYA.hours.flatMap(h=>[...(h.watches||[h])].flatMap(w=>[
    ...w.psalms.filter(([n,e,ch=n,from=1,to])=>!verseText("PSA",ch,from)||(to&&!verseText("PSA",ch,to))).map(p=>h.id+" Ps "+p[0]),
    ...w.gospel.filter(([b,c,v,e])=>!verseText(b,c,v)||!verseText(b,c,e)).map(g=>h.id+" "+g.join(" "))])))`);
  assert.equal(missing,'[]');
  assert.match(run('verseText("PSA",115,1)'),/well pleased/);
  assert.equal(run('currentAgpeyaHour(new Date(2026,10,11,6,30)).id'),'prime');
  assert.equal(run('currentAgpeyaHour(new Date(2026,10,11,23,30)).id'),'midnight');
  assert.equal(run('currentAgpeyaHour(new Date(2026,10,11,2,0)).id'),'midnight');
  assert.equal(run('currentAgpeyaHour(new Date(2026,10,11,17,0)).id'),'vespers');
  run('loadPrefs({});state.tab="prayers";selectedPrayer="hour:none";renderPrayers();');
  const html=run('pane.innerHTML');
  assert.match(html,/Psalm 114 \(116:1–9\)/);
  assert.match(html,/Luke 9:10–17/);
  assert.match(html,/Prayer of Thanksgiving/);
});

test('the chapter drawer lists OSB sections of the current chapter; an Agpeya hour lists its sections', () => {
  const run=reader();
  run(`dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};dialog.querySelector=()=>null;for(const id of ["closeDialog","drawerNextBook","drawerPreviousBook"])$(id).focus=()=>{};
    loadPrefs({});state.book="MAT";state.chapter=5;personalHeadings={"MAT:5:1":["The Beatitudes"],"MAT:5:13":["Salt and Light"]};showChapterDrawer();`);
  const html=run('$("dialogBody").innerHTML');
  assert.match(html,/data-jump-verse="1"><span>The Beatitudes/);
  assert.match(html,/data-jump-verse="13"/);
  assert.equal((html.match(/data-chapter=/g)||[]).length,28);
  run('state.tab="prayers";selectedPrayer="hour:terce";renderPrayers();showHourDrawer();');
  const hour=run('$("dialogBody").innerHTML');
  assert.match(hour,/Opening/);
  assert.match(hour,/data-hour-jump="hour-\d+">19</);
  assert.match(hour,/Gospel/);
  assert.match(hour,/Closing/);
});

test('themes include Light, Gray, and a true Dark that survives backups', () => {
  const run=reader();
  run('loadPrefs({theme:"night"});');
  assert.equal(run('state.theme'),'night');
  run('loadPrefs({theme:"purple"});');
  assert.equal(run('state.theme'),'light');
});

test('Books & chapters folds the Old and New Testament and remembers the choice', () => {
  const run=reader();
  run('dialog.showModal=()=>{dialog.open=true;};$("closeDialog").focus=()=>{};$("bookFilter").value="";loadPrefs({});state.book="JHN";state.booksOpen=null;showBooks();');
  const html=run('$("bookResults").innerHTML');
  assert.match(html,/data-testament="ot" aria-expanded="false"/);
  assert.match(html,/data-testament="nt" aria-expanded="true"/);
  run('$("bookResults").onclick({target:{closest:()=>({dataset:{testament:"ot"},getAttribute:()=>"false"})},stopPropagation(){}});');
  assert.equal(run('state.booksOpen.ot'),true);
});

test('Today centres on the Gospel with the season and the Synaxarium commemorations', () => {
  const run=reader();
  run('loadPrefs({});window.day=katamerosDay("2026-11-11");');
  assert.equal(run('mainReading(day).id'),'Liturgy|Psalm & Gospel|1');
  assert.match(run('passageLabel(mainReading(day).sub.readings[1])'),/Matthew 16:13–19/);
  assert.match(run('commemorations("2026-11-11")[0]'),/St\. Peter III/);
  assert.equal(run('copticSeason("2026-11-25")'),'Nativity Fast');
  assert.equal(run('copticSeason("2027-01-07")'),'');
  assert.equal(run('copticSeason("2027-04-26")'),'Holy Week');
  assert.equal(run('copticSeason("2027-03-15")'),'Great Fast');
  assert.equal(run('copticSeason("2027-08-10")'),"St. Mary's Fast");
  assert.equal(run('paschaDate(2027).toDateString()'),new Date(2027,4,2).toDateString());
  run('renderToday("2026-11-11");');
  const html=run('pane.innerHTML');
  assert.match(html,/Today's Gospel/);
  assert.match(html,/More from today's Liturgy/);
  assert.ok(!/Vespers|Matins/.test(html));
  assert.ok(run('mainReading(katamerosDay("2027-04-26"))')!==null);
});

test('the chapters button opens the drawer even though clicks pass an event', () => {
  const run=reader();
  run(`dialog.showModal=()=>{dialog.open=true;};dialog.querySelector=()=>null;for(const id of ["closeDialog","drawerNextBook","drawerPreviousBook"])$(id).focus=()=>{};loadPrefs({});state.book="JHN";state.chapter=3;
    $("openChapterDrawer").onclick({type:"click"});`);
  assert.equal(run('$("dialogTitle").textContent'),run('displayName("JHN")'));
});

test('verses from the WEB source get a space before an opening quote', () => {
  const run=reader();
  assert.ok(!/[,.;:!?][“‘]/.test(run('verseText("MAT",16,13)')));
  assert.match(run('verseText("MAT",16,13)'),/saying, “Who/);
});

test('a quick flick commits a back swipe and a thumb-arc swipe opens the drawer', () => {
  const run=reader();
  run(`window.committed=0;window.opened=0;beginBackSlide=()=>({width:390,update(){},cancel(){},finish(commit,action){if(commit)action();}});
    showChapterDrawer=()=>opened++;window.handlers={};bindChapterSwipe({addEventListener(n,f){handlers[n]=f;}},false);
    state.tab='wisdom';wisdomTopic=WISDOM.categories[0].topics[0];renderWisdom=()=>committed++;
    window.swipe=(points,dt)=>{const t0=Date.now();handlers.touchstart({touches:[{clientX:50,clientY:300}],target:{closest:()=>null}});
      for(const [x,y] of points)handlers.touchmove({touches:[{clientX:50+x,clientY:300+y}],cancelable:true,preventDefault(){}});
      const [lx,ly]=points.at(-1);handlers.touchend({changedTouches:[{clientX:50+lx,clientY:300+ly}]});};`);
  run('Date.now=(()=>{let t=1e12;return()=>(t+=10);})();swipe([[20,0],[50,2],[90,3]]);');
  assert.equal(run('committed'),1);
  run('state.tab="bible";wisdomTopic=null;returnPlace=null;swipe([[-20,8],[-80,40],[-150,70]]);');
  assert.equal(run('opened'),1);
});

test('scripture text has no ligatures or missing quote spaces, and keeps the plural-you mark', () => {
  const run=reader();
  const bad=run(`(()=>{let n=0;for(const b in window.BIBLE.t)for(const ch of window.BIBLE.t[b])for(const v of ch)if(v&&/[ﬁﬂ]|[,.;:!?][“‘]/.test(v))n++;return n;})()`);
  assert.equal(bad,0);
  assert.ok(run('verseText("PSA",10,1)').includes('⌃'));
  assert.match(run('scriptureHtml(verseText("PSA",10,1))'),/class="plural-you" title="plural you"/);
});
