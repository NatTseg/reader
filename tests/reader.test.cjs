const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
// The Bible text and study material are private build outputs (never committed): scripts/build_osb_edition.py
// writes them outside the repository. Without them there is nothing to test.
const buildDir = process.env.OSB_BUILD_DIR || path.join(require("node:os").homedir(), "Documents/reader-private/osb/build");
if (!fs.existsSync(path.join(buildDir, "bible.json"))) {
  test("the private OSB build is required", { skip: `No build at ${buildDir}` }, () => {});
  return;
}
const bibleJson = fs.readFileSync(path.join(buildDir, "bible.json"), "utf8");
const studyJson = fs.readFileSync(path.join(buildDir, "study.json"), "utf8");
const BIBLE = JSON.parse(bibleJson);
const STUDY = JSON.parse(studyJson);
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
  context.bibleJson = bibleJson;
  context.studyJson = studyJson;
  vm.createContext(context);
  vm.runInContext("window.BIBLE = JSON.parse(bibleJson); bibleJson = null;", context);
  for (const file of [
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
  vm.runInContext("persistenceReady = true;", context);
  return (expression) => vm.runInContext(expression, context);
}
// A reader with the study pack (notes, introductions, guides, articles) open, as after start-up.
function readerWithStudy(stored = {}) {
  const run = reader(stored);
  run("loadPrefs(); applyPersonalNotes(validatePersonalNotes(JSON.parse(studyJson)))");
  return run;
}
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
  const hidden=level=>run(`fadeWords("The Lord is my shepherd; I shall lack nothing.",${level}).filter(p=>p.hidden).length`);
  assert.equal(hidden(0),0);
  assert.ok(hidden(1)>0 && hidden(1)<hidden(2));
  assert.equal(hidden(3),9);
  assert.equal(run('fadeWords("shepherd;",3)[0].after'),';');
  assert.equal(run('fadeWords("shepherd;",3)[0].hint'),'s');
});

test('Today state survives backups and invalid entries are dropped', () => {
  const run=reader();
  run(`window.r={today:{done:{"2026-11-11":["Liturgy|Pauline Epistle|0"],"bad":["x"]}},memory:[
    {id:"JHN:3.16",label:"John 3:16",text:"stored wording",ref:[{book:"JHN",verses:[[3,16]]}],box:2,due:"2026-11-20"},
    {id:"no-ref",label:"John 3:17",text:"only wording",box:1,due:"2026-11-20"},{id:"bad-ref",label:"x",ref:[{book:"JHN",verses:[[3,999]]}],box:1,due:"2026-11-20"},{id:1}]};normalizeToday(r);`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(Object.keys(r.today.done))')),['2026-11-11']);
  assert.equal(run('r.memory.length'),1);
  assert.equal(run('"text" in r.memory[0]'),false);
  assert.equal(run('memoryText(r.memory[0])'),run('flatText(verseText("JHN",3,16))'));
  assert.equal(run('backupReader({...r,tab:"today"}).memory.length'),1);
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

test('themes are Light, Sepia, Gray, and Dark; a saved Warm page tone becomes Sepia', () => {
  const run=reader();
  run('loadPrefs({theme:"night"});');
  assert.equal(run('state.theme'),'night');
  run('loadPrefs({theme:"light",paper:"warm"});');
  assert.equal(run('state.theme'),'sepia');
  run('loadPrefs({theme:"sepia"});');
  assert.equal(run('state.theme'),'sepia');
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


// ===== Orthodox Study Bible text edition =====
const crypto = require("node:crypto");
const editionJson = fs.readFileSync(path.join(buildDir, "..", "osb-edition.json"), "utf8");
const PUBLIC_FILES = () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  return [...sw.matchAll(/"\.\/([^"]+)"/g)].map((m) => m[1].split("?")[0]).filter(Boolean);
};
const NKJV_NT_VERSES = {MAT:1071,MRK:678,LUK:1151,JHN:879,ACT:1007,ROM:433,"1CO":437,"2CO":257,GAL:149,EPH:155,PHP:104,COL:95,"1TH":89,"2TH":47,
  "1TI":113,"2TI":83,TIT:46,PHM:25,HEB:303,JAS:108,"1PE":105,"2PE":61,"1JN":105,"2JN":13,"3JN":14,JUD:25,REV:404};

test("the canon is the Orthodox Study Bible's: 78 books in its order, SAAS Old Testament and NKJV New Testament", () => {
  const run = reader();
  assert.equal(run("BIBLE.books.length"), 78);
  assert.equal(run('BIBLE.books.filter(b=>b.translation==="SAAS").length'), 51);
  assert.equal(run('BIBLE.books.filter(b=>b.translation==="NKJV").length'), 27);
  assert.equal(run("JSON.stringify(bookOrder())"), JSON.stringify(BIBLE.books.map((b) => b.id)));
  assert.equal(run('displayName("1SA")'), "1 Kingdoms");
  assert.equal(run('displayName("1KI")'), "3 Kingdoms");
  assert.equal(run('displayName("EZR")'), "2 Ezra");
  assert.equal(run('displayName("1ES")'), "1 Ezra");
  assert.equal(run('displayName("BEL")'), "Bel and the Serpent");
  for (const gone of ["PS2", "S3Y", "MAN", "4MA", "ESG", "DAG", "2ES"]) assert.equal(run(`bookMeta("${gone}")`), undefined);
  assert.equal(run('bookMeta("PSA").n'), 151);
  assert.equal(run('isSeptuagint("GEN")'), true);
  assert.equal(run('isSeptuagint("MAT")'), false);
});
test("every verse of the edition is present: counts, no gaps, no markup or stray characters", () => {
  assert.equal(BIBLE.books.reduce((n, b) => n + b.n, 0), 1346);
  let total = 0, problems = [];
  for (const book of BIBLE.books) {
    const chapters = BIBLE.t[book.id];
    assert.equal(chapters.length, book.n, book.id);
    let count = 0;
    chapters.forEach((verses, c) => {
      assert.equal(verses[0], "", `${book.id} ${c + 1} index 0`);
      assert.ok(verses.length > 1, `${book.id} ${c + 1} is empty`);
      for (let v = 1; v < verses.length; v++) {
        const text = verses[v];
        count++;
        if (typeof text !== "string" || !text.trim() || text !== text.trim() || /[<>{}\[\]\t ﬀ-ﬄ⌃]|  |\n\n|\n | \n/.test(text) || /^\d|\s\d+\s*$/.test(text))
          problems.push(`${book.id} ${c + 1}:${v}`);
      }
    });
    if (NKJV_NT_VERSES[book.id]) assert.equal(count, NKJV_NT_VERSES[book.id], `${book.id} verse count`);
    total += count;
  }
  // Two verses legitimately carry digits or brackets: none expected beyond these.
  assert.deepEqual(problems.filter((p) => !["REV 13:18"].includes(p)), []);
  assert.equal(total, 36089);
});
test("the ebook's stray spaces before punctuation are gone from verses, notes, and articles; nested quotes keep theirs", () => {
  const stray = / [,;:!?)]|\( |[^. ] \.(?! ?\.)/;
  const offenders = [];
  for (const book of BIBLE.books) BIBLE.t[book.id].forEach((verses, c) => verses.forEach((text, v) => { if (v && stray.test(text)) offenders.push(`${book.id} ${c + 1}:${v}`); }));
  for (const [key, note] of Object.entries(STUDY.sourceNotes)) if (stray.test(note.body)) offenders.push(`note ${key}`);
  for (const [key, list] of Object.entries(STUDY.textNotes)) if (list.some(([, text]) => stray.test(text))) offenders.push(`translators' note ${key}`);
  for (const article of [...STUDY.guides, ...Object.values(STUDY.introductions)]) for (const block of article.blocks) if (block.text && stray.test(block.text)) offenders.push(`article ${article.title}`);
  for (const [key, line] of Object.entries(BIBLE.parallels)) if (stray.test(line)) offenders.push(`parallel ${key}`);
  assert.deepEqual(offenders.slice(0, 10), []);
  const nested = Object.values(BIBLE.t).flat(2).filter((text) => /[’”] [’”]/.test(text)).length;
  assert.ok(nested > 300, `${nested} verses with spaced nested closing quotes`);
});
// The source ebook (private). With it present, everything the app shows is checked to be the ebook's own words.
const ebookPath = process.env.OSB_EBOOK || path.join(buildDir, "..", "osb-mobi.html");
test("every verse, note, introduction, guide, and article is the ebook's own text, word for word", { skip: !fs.existsSync(ebookPath) && "the source ebook is not on this machine" }, () => {
  const raw = fs.readFileSync(ebookPath, "utf8");
  const edition = JSON.parse(editionJson);
  const decode = (text) => text.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    : ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[e.toLowerCase()]);
  const flat = (from, to, dropSuperscripts) => decode((dropSuperscripts ? raw.slice(from, to).replace(/<sup>[^]*?<\/sup>/g, "") : raw.slice(from, to)).replace(/<[^>]+>/g, "")).replace(/[\s\u00a0]+/g, "");
  const squeeze = (text) => text.replace(/\s+/g, "");
  const names = Object.fromEntries(BIBLE.books.map((b) => [b.name, b.id]));
  names.Psalm = "PSA";
  const starts = {};
  for (const m of raw.matchAll(/<p[^>]*align="center"><a filepos=\d+><font size="6">(?:<b>)?<font color="#0000ff">([^<]+)/g)) {
    const title = m[1].trim(), parts = title.match(/^(.+?)\s+(\d+)(?:\s*\(.*\))?$/);
    const book = parts ? names[parts[1]] : names[title];
    if (book && !(book in starts)) starts[book] = m.index;
  }
  const order = Object.entries(starts).sort((a, b) => a[1] - b[1]);
  assert.equal(order.length, 78);
  const missing = [];
  let verses = 0, pieces = 0, blocks = 0;
  order.forEach(([book, start], i) => {
    const end = i + 1 < order.length ? order[i + 1][1] : raw.length;
    // Susanna, Daniel, and Bel share one block of annotations after Bel, so notes are looked for a little further on.
    const text = flat(start, end, true), notes = flat(start, i + 3 < order.length ? order[i + 3][1] : raw.length, false);
    BIBLE.t[book].forEach((chapter, c) => chapter.forEach((verse, v) => {
      if (!v) return;
      verses++;
      if (!text.includes(squeeze(verse)) && !verse.split("\n").every((line) => text.includes(squeeze(line)))) missing.push(`${book} ${c + 1}:${v}`);
    }));
    for (const [key, parts] of Object.entries(edition.notes)) if (key.startsWith(book + ":")) for (const part of parts) { pieces++; if (!part.split("\n\n").every((p) => notes.includes(squeeze(p)))) missing.push(`note ${key}`); }
    for (const [key, list] of Object.entries(STUDY.textNotes)) if (key.startsWith(book + ":")) for (const [, note] of list) { pieces++; if (!notes.includes(squeeze(note))) missing.push(`translators' note ${key}`); }
    for (const article of STUDY.guides.filter((g) => g.after?.startsWith(book + ":"))) for (const block of article.blocks) { blocks++; if (!notes.includes(squeeze(block.text))) missing.push(`article ${article.title}`); }
    // The introduction sits on the pages before the book's first chapter (Daniel's before Susanna, which opens it).
    const before = flat(i >= 3 ? order[i - 3][1] : 0, start, false), intro = STUDY.introductions[book];
    for (const block of intro.blocks) { blocks++; if (!before.includes(squeeze(block.text))) missing.push(`introduction ${book}`); }
  });
  const matter = flat(0, order[0][1], false) + flat(order.at(-1)[1], raw.length, false);
  for (const guide of STUDY.guides.filter((g) => !g.group)) for (const block of guide.blocks) for (const text of block.text ? [block.text] : block.rows.flat()) { blocks++; if (text.trim() && !matter.includes(squeeze(text))) missing.push(`guide ${guide.title}`); }
  assert.deepEqual([...new Set(missing)].slice(0, 12), []);
  assert.equal(verses, 36089);
  assert.ok(pieces > 8000 && blocks > 3500, `${pieces} note pieces, ${blocks} blocks`);
});
test("well-known verses stand where the Orthodox Study Bible numbers them", () => {
  const run = reader();
  const at = (b, c, v) => run(`verseText("${b}",${c},${v})`);
  assert.match(at("GEN", 1, 1), /^In the beginning God made heaven/);
  assert.match(at("PSA", 22, 1), /Lord is my shepherd/);
  assert.match(at("PSA", 50, 3), /^Have mercy on me, O God/);
  assert.match(at("PSA", 109, 4), /priest forever/);
  assert.match(at("ISA", 7, 14), /virgin/);
  assert.match(at("JER", 38, 31), /new covenant/);
  assert.match(at("JHN", 3, 16), /For God so loved the world/);
  assert.match(at("MAT", 16, 13), /Who do men say/);
  assert.match(at("ROM", 8, 28), /all things work together for good/);
  assert.match(at("PHP", 4, 13), /I can do all things through Christ/);
  assert.match(at("REV", 22, 21), /Amen/);
  for (const [b, c] of [["PSA", 151], ["SIR", 2], ["TOB", 1], ["3MA", 1], ["LJE", 1], ["SUS", 1], ["BEL", 1], ["2CH", 37]]) assert.ok(at(b, c, 1).length > 0, `${b} ${c}`);
  assert.equal(run('bookMeta("MAL").n'), 3);
  assert.equal(run('chapterText("DAN",3).length-1'), 97);
});
test("lettered verses in Esther keep their printed numbers", () => {
  const run = reader();
  assert.ok(Object.keys(BIBLE.labels).every((key) => key.startsWith("EST:")));
  for (const [key, labels] of Object.entries(BIBLE.labels)) {
    const [book, ch] = key.split(":");
    assert.equal(labels.length, BIBLE.t[book][ch - 1].length, key);
    assert.equal(new Set(labels.slice(1)).size, labels.length - 1, `${key} labels are unique`);
    assert.ok(labels.slice(1).every((label) => /^\d+[a-z]{0,2}$/.test(label)), key);
  }
  assert.equal(run('sourceVerseLabel("EST",1,1)'), "1a");
  assert.equal(run('refLabel("EST",1,1)'), "Esther 1:1a");
  assert.equal(run('versePosition("EST",1,"1a")'), 1);
  assert.equal(run('versePosition("EST",4,"7")'), 6);
  assert.equal(run('versePosition("EST",4,"6")'), null);
  assert.equal(run('JSON.stringify(parseRef("Esther 4:17a"))'), JSON.stringify({ book: "EST", ch: 4, v: BIBLE.labels["EST:4"].indexOf("17a") }));
  assert.equal(run('parseRef("Esther 4:6")'), null);
  assert.match(run('verseHtml("EST",4,' + BIBLE.labels["EST:4"].indexOf("17a") + ")"), />17a<\/button>/);
  assert.equal(run('sourceVerseLabel("JHN",3,16)'), "16");
  assert.equal(run('versePosition("JHN",3,"16")'), 16);
  assert.equal(run('versePosition("JHN",3,"99")'), null);
});
test("typed references follow the OSB's names and numbering", () => {
  const run = reader();
  const ref = (text) => run(`JSON.stringify(parseRef(${JSON.stringify(text)}))`);
  assert.equal(ref("Psalm 151"), JSON.stringify({ book: "PSA", ch: 151, v: null }));
  assert.equal(ref("psalms 151:7"), JSON.stringify({ book: "PSA", ch: 151, v: 7 }));
  assert.equal(ref("Psalm 152"), "null");
  assert.equal(ref("1 Kingdoms 16:7"), JSON.stringify({ book: "1SA", ch: 16, v: 7 }));
  assert.equal(ref("1 Samuel 16:7"), JSON.stringify({ book: "1SA", ch: 16, v: 7 }));
  assert.equal(ref("3 Kingdoms 8"), JSON.stringify({ book: "1KI", ch: 8, v: null }));
  assert.equal(ref("2 Ezra 1:1"), JSON.stringify({ book: "EZR", ch: 1, v: 1 }));
  assert.equal(ref("Ezra 1:1"), JSON.stringify({ book: "EZR", ch: 1, v: 1 }));
  assert.equal(ref("1 Ezra 1:1"), JSON.stringify({ book: "1ES", ch: 1, v: 1 }));
  assert.equal(ref("Sirach 2:1-6"), JSON.stringify({ book: "SIR", ch: 2, v: 1 }));
  assert.equal(ref("Wisdom of Sirach 2:1"), JSON.stringify({ book: "SIR", ch: 2, v: 1 }));
  assert.equal(ref("Bel 1:5"), JSON.stringify({ book: "BEL", ch: 1, v: 5 }));
  assert.equal(ref("Susanna"), JSON.stringify({ book: "SUS", ch: 1, v: null }));
  assert.equal(ref("Prayer of Manasseh"), JSON.stringify({ book: "2CH", ch: 37, v: null }));
  assert.equal(ref("1 Corinthians 13:4"), JSON.stringify({ book: "1CO", ch: 13, v: 4 }));
  for (const bad of ["John 99:1", "John 3:999", "John 3:0", "John 3:16-15", "4 Maccabees 1:1", "Nowhere 1:1"]) assert.equal(ref(bad), "null", bad);
  for (const book of BIBLE.books) assert.equal(run(`parseRef(${JSON.stringify(book.name + " 1:1")}).book`), book.id, book.name);
});
test("section headings sit before existing verses; headings inside a verse fall between its lines", () => {
  const run = reader();
  let count = 0;
  for (const [key, list] of Object.entries(BIBLE.headings)) {
    const [b, c, v] = key.split(":");
    assert.ok(BIBLE.t[b]?.[c - 1]?.[v], `heading on a missing verse ${key}`);
    assert.ok(Array.isArray(list) && list.length && list.every((h) => typeof h === "string" && h.trim() && h.length <= 120 && !/[<>\n]/.test(h)), key);
    count += list.length;
  }
  for (const [key, items] of Object.entries(BIBLE.inside)) {
    const [b, c, v] = key.split(":"), lines = BIBLE.t[b][c - 1][v].split("\n").length;
    for (const [line, list] of items) { assert.ok(line >= 1 && line < lines, `${key} line ${line} of ${lines}`); count += list.length; }
  }
  assert.equal(count, 2918);
  assert.equal(BIBLE.headings["GEN:1:1"][0], "The Creation");
  assert.equal(BIBLE.headings["MAT:5:1"][0], "The Beatitudes");
  run('loadPrefs({});state.book="GEN";state.chapter=1;renderChapter(0);');
  assert.match(run("pane.innerHTML"), /<article class="verses"><h3 class="osb-heading">The Creation<\/h3><div class="verse"/);
  const [key, items] = Object.entries(BIBLE.inside)[0], [b, c, v] = key.split(":");
  const html = run(`verseHtml("${b}",${c},${v})`);
  const lines = BIBLE.t[b][c - 1][v].split("\n");
  assert.equal((html.match(/class="v[lp][ "]/g) || []).length, lines.length);
  assert.ok(html.indexOf('<h3 class="osb-heading">') > html.indexOf('class="vp"'), "the heading follows the first line");
  assert.ok(!html.includes('class="vl'), "a paragraph inside a verse is not set as poetry");
  assert.ok(html.includes(`<h3 class="osb-heading">${items[0][1][0].replace(/&/g, "&amp;").replace(/'/g, "&#39;")}</h3>`));
});
test("a verse printed on several lines keeps them, with note and comment marks after the last line", () => {
  const run = readerWithStudy();
  const lines = BIBLE.t.PSA[21][1].split("\n");
  assert.ok(lines.length > 1);
  run('state.comments["PSA:22:1"]="mine";');
  const html = run('verseHtml("PSA",22,1)');
  assert.equal((html.match(/class="v[lp][ "]/g) || []).length, lines.length);
  assert.match(html, /class="vl[^"]*">[^<]*<span class="nw">[^<]+<button class="note-link"[^]*class="comment-mark"[^]*<\/span><\/span><\/div><\/div>$/, "marks stay with the last word of the last line");
  assert.equal((run('verseHtml("PSA",22,5)').match(/class="vl"/g) || []).length, 3);
  assert.match(run('verseHtml("GEN",1,1)'), /<span>[^<]*<span class="nw">[^<]+<button class="note-link"/);
  assert.ok(!html.includes("\n"));
  const single = run('verseHtml("JHN",11,35)');
  assert.ok(!single.includes("verse-lines"));
  assert.equal(run('flatText("a\\nb \\n c")'), "a b c");
  assert.ok(!run('scriptureHtml(verseText("PSA",22,1))').includes("\n"));
});
test("every verse printed on several lines has its layout: poetry lines, stanzas, and paragraphs", () => {
  let poetry = 0, prose = 0;
  for (const book of BIBLE.books) BIBLE.t[book.id].forEach((verses, c) => verses.forEach((text, v) => {
    if (!v) return;
    const codes = BIBLE.layout[`${book.id}:${c + 1}:${v}`], lines = text.split("\n").length;
    if (lines > 1) assert.ok(codes, `${book.id} ${c + 1}:${v} has ${lines} lines and no layout`);
    if (!codes) return;
    assert.equal(codes.length, lines, `${book.id} ${c + 1}:${v}`);
    assert.match(codes, /^[clsp][lsp]*$/, `${book.id} ${c + 1}:${v}`);
    if (/[ls]/.test(codes)) poetry++; else prose++;
  }));
  assert.equal(poetry, 7641);
  assert.equal(prose, 148);
  assert.ok(Object.keys(BIBLE.layout).every((key) => { const [b, c, v] = key.split(":"); return !!BIBLE.t[b]?.[c - 1]?.[v]; }));
  const run = reader();
  run("loadPrefs({});");
  assert.match(run('verseHtml("JOB",3,3)'), /class="verse stanza"/);
  assert.ok(!run('verseHtml("JHN",3,16)').includes("stanza"));
});
test("every verse is rendered with exactly its own words, with notes on and off", () => {
  const run = readerWithStudy();
  const check = `(()=>{const bad=[];const plain=h=>h.replace(/<button class="verse-number"[^]*?<\\/button>/,"").replace(/<button class="note-link"[^]*?<\\/button>/g,"").replace(/<sup class="tn"[^>]*>[a-z]+<\\/sup>/g,"").replace(/<h3 class="osb-heading">[^<]*<\\/h3>/g,"").replace(/<[^>]+>/g,"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&");
    for(const b of BIBLE.books)BIBLE.t[b.id].forEach((verses,c)=>{for(let v=1;v<verses.length;v++){if(plain(verseHtml(b.id,c+1,v))!==verses[v].replace(/\\n/g,""))bad.push(b.id+" "+(c+1)+":"+v);}});
    return JSON.stringify(bad.slice(0,10));})()`;
  assert.equal(run(check), "[]");
  run("state.showNotes=false;");
  assert.equal(run(check), "[]");
  // A whole chapter is its verses in order, each once.
  run('state.showNotes=true;state.book="PSA";state.chapter=118;renderChapter(0);');
  const numbers = [...run("pane.innerHTML").matchAll(/data-verse="(\d+)"/g)].map((m) => +m[1]);
  assert.deepEqual(numbers, Array.from({ length: 176 }, (_, i) => i + 1));
});
test("text before a chapter's first verse is shown, and only where the OSB prints it", () => {
  const run = readerWithStudy();
  assert.deepEqual(Object.keys(BIBLE.preface), ["LJE:1"]);
  run('state.book="LJE";state.chapter=1;renderChapter(0);');
  assert.match(run("pane.innerHTML"), /<p class="chapter-preface">/);
  run('state.book="GEN";state.chapter=1;renderChapter(0);');
  assert.ok(!run("pane.innerHTML").includes("chapter-preface"));
});
test("chapters name their translation; Psalms carry the OSB's own titles; parallel passages sit under their headings", () => {
  const run = readerWithStudy();
  assert.equal(Object.keys(BIBLE.titles).length, 139);
  assert.ok(Object.entries(BIBLE.titles).every(([key, title]) => { const [b, c] = key.split(":"); return b === "PSA" && title.startsWith(`Psalm ${c} (`) && title.endsWith(")"); }));
  run('state.book="PSA";state.chapter=22;renderChapter(0);');
  assert.match(run("pane.innerHTML"), /<h1>Psalm 22 \(23\)<\/h1>/);
  run('state.book="PSA";state.chapter=1;renderChapter(0);');
  assert.match(run("pane.innerHTML"), /<h1>Psalm 1<\/h1>/);
  run('state.book="PSA";state.chapter=114;renderChapter(0);');
  assert.match(run("pane.innerHTML"), /<h1>Psalm 114 \(116:1–9\)<\/h1>/);
  assert.equal(Object.keys(BIBLE.parallels).length, 413);
  for (const [key, line] of Object.entries(BIBLE.parallels)) {
    assert.ok(BIBLE.headings[key], `a parallel line without its heading at ${key}`);
    assert.ok(/^\(.+\)$/.test(line) && line.length < 120 && !/[<>\n]/.test(line), key);
  }
  const first = Object.keys(BIBLE.parallels).find((k) => k.startsWith("MAT:")), [pb, pc] = first.split(":");
  run(`state.book="${pb}";state.chapter=${pc};renderChapter(0);`);
  assert.match(run("pane.innerHTML"), /<h3 class="osb-heading">[^<]+<\/h3><p class="osb-parallel">\([^<]+\)<\/p><div class="verse/);
  assert.equal((run("pane.innerHTML").match(/class="osb-parallel"/g) || []).length, Object.keys(BIBLE.parallels).filter((k) => k.startsWith(`${pb}:${pc}:`)).length);
  run('state.book="PSA";state.chapter=22;renderChapter(0);');
  assert.match(run("pane.innerHTML"), /St\. Athanasius Academy Septuagint/);
  run('state.book="JHN";state.chapter=3;renderChapter(0);');
  assert.match(run("pane.innerHTML"), /<h1>Chapter 3<\/h1>/);
  assert.match(run("pane.innerHTML"), /New King James Version/);
  assert.ok(!/LXX2012|World English|WEB\b/.test(run("pane.innerHTML")));
});
test("every OSB note is on the verse it names", () => {
  const edition = JSON.parse(editionJson);
  const label = (b, c, p) => BIBLE.labels[`${b}:${c}`]?.[p] ?? String(p);
  const single = new Set(BIBLE.books.filter((b) => b.n === 1).map((b) => b.id));
  let pieces = 0, unread = [];
  assert.equal(Object.keys(STUDY.sourceNotes).length, Object.keys(edition.notes).length);
  for (const [key, parts] of Object.entries(edition.notes)) {
    const [b, c, p] = key.split(":");
    assert.ok(BIBLE.t[b]?.[c - 1]?.[p], `note on a missing verse ${key}`);
    assert.equal(STUDY.sourceNotes[key].body, parts.join("\n\n"), key);
    for (const part of parts) {
      pieces++;
      const text = part.replace(/^Pss?\.?\s*(?=\d+:)/, "");
      let m = text.match(/^(\d+):(\d+[a-z]?)/);
      if (m) { assert.equal(`${m[1]}:${m[2]}`, `${c}:${label(b, +c, +p)}`, `note ${key} names another verse`); continue; }
      m = text.match(/^(?:Pss?\.?\s*)?(\d+)/);
      if (m && b === "PSA") assert.equal(`${m[1]}:1`, `${c}:${p}`, `psalm note ${key}`);
      else if (m && single.has(b)) assert.equal(m[1], label(b, +c, +p), `note ${key}`);
      else unread.push(key);
    }
  }
  assert.ok(pieces >= 6836, `${pieces} note pieces`);
  assert.deepEqual(unread, ["2CH:37:1"]);
});
test("notes open from their verse, list under their chapter, and never leak markup", () => {
  const run = readerWithStudy();
  assert.equal(run("Object.keys(personalSourceNotes).length"), Object.keys(STUDY.sourceNotes).length);
  assert.equal(run("Object.keys(personalNotesByVerse).length"), Object.keys(STUDY.sourceNotes).length);
  assert.equal(run("Object.entries(personalNotesByVerse).every(([verse,keys])=>keys.length===1&&keys[0]===verse)"), true);
  assert.equal(run('noteAt("GEN",1,1).body'), STUDY.sourceNotes["GEN:1:1"].body);
  assert.match(run('verseHtml("GEN",1,1)'), /aria-label="Study note for verse 1"><span class="note-dot"/);
  const without = Object.keys(BIBLE.t.GEN[0]).map(Number).find((v) => v > 0 && !STUDY.sourceNotes[`GEN:1:${v}`]);
  assert.equal(run(`noteAt("GEN",1,${without})`), null);
  assert.ok(!run(`verseHtml("GEN",1,${without})`).includes("note-dot"));
  run('state.book="GEN";state.chapter=1;');
  const html = run("notesHtml()");
  const expected = Object.keys(STUDY.sourceNotes).filter((k) => k.startsWith("GEN:1:")).length;
  assert.equal((html.match(/<article class="footnote">/g) || []).length, expected);
  assert.match(html, /<small>Verse 1<\/small>/);
  assert.match(html, /Study article/);
  assert.match(html, /All notes in Genesis/);
  assert.ok(!/OSB source|Needs review|Earlier imported|Original reference|undefined/.test(html));
  // Opening the note from its verse shows the whole note under the verse's own reference.
  run('dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};handleAction({target:{closest:()=>({dataset:{action:"note",key:"GEN:1:1"}})}});');
  assert.equal(run('$("dialogTitle").textContent'), "Genesis 1:1 · OSB note");
  assert.ok(run('$("dialogBody").innerHTML').includes(run('esc(personalSourceNotes["GEN:1:1"].body)')));
  run("closeDialog();state.showNotes=false;");
  assert.equal(run("notesHtml()"), "");
  assert.ok(!run('verseHtml("GEN",1,1)').includes("note-dot"));
  assert.ok(Object.values(STUDY.sourceNotes).every((n) => !/<[a-z/]/i.test(n.body)));
  run(`personalSourceNotes["GEN:1:1"]={body:"<script>x</script>"};state.showNotes=true;`);
  assert.ok(!run("notesHtml()").includes("<script>"));
});
test("the New Testament's translators' notes keep their letters in the text and their verses", () => {
  const edition = JSON.parse(editionJson);
  let letters = 0, notes = 0;
  for (const [key, marks] of Object.entries(BIBLE.marks)) {
    const [b, c, v] = key.split(":"), text = BIBLE.t[b]?.[c - 1]?.[v];
    assert.ok(text, `letters on a missing verse ${key}`);
    assert.equal(BIBLE.books.find((x) => x.id === b).translation, "NKJV", key);
    assert.ok(marks.every(([offset, letter], i) => Number.isInteger(offset) && offset >= 0 && offset <= text.length && /^[a-z]{1,2}$/.test(letter) && (!i || offset >= marks[i - 1][0])), key);
    assert.deepEqual(marks.map(([, letter]) => letter), (STUDY.textNotes[key] || []).map(([letter]) => letter), `${key}: letters and notes differ`);
    letters += marks.length;
  }
  for (const [key, list] of Object.entries(STUDY.textNotes)) {
    assert.ok(BIBLE.marks[key], `a translators' note without its letter ${key}`);
    assert.ok(list.every(([, text]) => text.trim() && !/<[a-z/]/i.test(text)), key);
    notes += list.length;
  }
  assert.equal(letters, 1297);
  assert.equal(notes, 1297);
  assert.deepEqual(edition.textNotes, STUDY.textNotes);
  const run = readerWithStudy();
  assert.equal(run("Object.keys(personalTextNotes).length"), Object.keys(STUDY.textNotes).length);
  // In the text: one small letter per note, in place, and none when study notes are switched off.
  for (const key of Object.keys(BIBLE.marks)) {
    const [b, c, v] = key.split(":");
    const html = run(`verseHtml("${b}",${c},${v})`);
    assert.equal((html.match(/<sup class="tn"/g) || []).length, BIBLE.marks[key].length, key);
    const shown = html.replace(/<button class="verse-number"[^]*?<\/button>/, "").replace(/<button class="note-link"[^]*?<\/button>/g, "").replace(/<sup class="tn"[^>]*>[a-z]+<\/sup>/g, "").replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    assert.equal(shown, BIBLE.t[b][c - 1][v].replace(/\n/g, ""), `${key}: the words of the verse changed`);
    const body = html.replace(/<button class="verse-number"[^]*?<\/button>/, "").replace(/<button class="note-link"[^]*?<\/button>/g, "");
    const before = body.split(/<sup class="tn"[^>]*>[a-z]+<\/sup>/).slice(0, -1).map((part, i, parts) => parts.slice(0, i + 1).join("").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').length);
    assert.deepEqual(before, BIBLE.marks[key].map(([offset]) => BIBLE.t[b][c - 1][v].slice(0, offset).replace(/\n/g, "").length), `${key}: a letter is out of place`);
  }
  const sample = Object.keys(BIBLE.marks)[0], [b, c, v] = sample.split(":");
  assert.equal(run(`lineHtml("ab cd", [], [[0,"<x>"],[2,"<y>"],[5,"<z>"]], "<m>")`), "<x>ab<y> <span class=\"nw\">cd<z><m></span>");
  assert.equal(run(`lineHtml("ab cd", [], [[3,"<y>"]], "")`), "ab <span class=\"nw\"><y>cd</span>");
  assert.equal(run(`lineHtml("a<b", [], [], "")`), "a&lt;b");
  // Italics: whole words, across the last-word break, and around a letter.
  assert.equal(run(`lineHtml("one two three", [[4,7]], [], "")`), "one <i>two</i> three");
  assert.equal(run(`lineHtml("one two three", [[4,13]], [], "<m>")`), "one <i>two </i><span class=\"nw\"><i>three</i><m></span>");
  assert.equal(run(`lineHtml("one two three", [[0,7]], [[4,"<y>"]], "")`), "<i>one </i><y><i>two</i> <span class=\"nw\">three</span>");
  assert.equal(run(`lineHtml("a&b", [[0,3]], [], "")`), "<i>a&amp;b</i>");
  run(`dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};showStudyNote("${sample}",true,null);`);
  const sheet = run('$("dialogBody").innerHTML');
  assert.equal((sheet.match(/class="text-note"/g) || []).length, STUDY.textNotes[sample].length);
  assert.match(run('$("dialogTitle").textContent'), STUDY.sourceNotes[sample] ? /· OSB note$/ : /· Translators’ note$/);
  run(`state.book="${b}";state.chapter=${c};`);
  const chapter = run("notesHtml()");
  const expected = Object.keys(STUDY.textNotes).filter((k) => k.startsWith(`${b}:${c}:`)).reduce((n, k) => n + STUDY.textNotes[k].length, 0);
  assert.equal((chapter.match(/class="text-note"/g) || []).length, expected);
  run("state.showNotes=false;");
  assert.ok(!run(`verseHtml("${b}",${c},${v})`).includes("<sup"));
  assert.ok(!run('verseHtml("GEN",1,1)').includes("<sup"));
});
test("the edition's italics are kept: whole ranges inside their verses, shown in the reader", () => {
  let ranges = 0;
  for (const [key, list] of Object.entries(BIBLE.italics)) {
    const [b, c, v] = key.split(":"), text = BIBLE.t[b]?.[c - 1]?.[v];
    assert.ok(text, `italics on a missing verse ${key}`);
    let previous = -1;
    for (const [start, end] of list) {
      assert.ok(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end && end <= text.length && start >= previous, `${key} ${start}-${end}`);
      assert.ok(!text.slice(start, end).includes("\n") && text[start] !== " " && text[end - 1] !== " ", `${key} ${start}-${end}`);
      previous = end;
      ranges++;
    }
  }
  assert.equal(ranges, 4394);
  const run = readerWithStudy();
  const [start, end] = BIBLE.italics["MAT:1:6"][0];
  assert.equal(BIBLE.t.MAT[0][6].slice(start, end), "who had been the wife");
  assert.match(run('verseHtml("MAT",1,6)'), /<i>who had been the wife<\/i> <sup class="tn"[^>]*>a<\/sup>of <span class="nw">Uriah\./);
  // Every italic range is rendered, and nothing else is italic.
  const mismatched = run(`(()=>{const bad=[];for(const [key,list] of Object.entries(BIBLE.italics)){const [b,c,v]=key.split(":");const html=verseHtml(b,+c,+v);
    const shown=[...html.matchAll(/<i>([^<]*)<\\/i>/g)].map(m=>m[1].replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"')).join("").replace(/\\s+/g,"");
    const expected=list.map(([s,e])=>BIBLE.t[b][c-1][v].slice(s,e)).join("").replace(/\\s+/g,"");if(shown!==expected)bad.push(key);}return JSON.stringify(bad.slice(0,8));})()`);
  assert.equal(mismatched, "[]");
  assert.ok(!run('verseHtml("GEN",1,1)').includes("<i>"));
});
test("the study pack opens whole: introductions for every book, guides, and study articles in their chapters", () => {
  const run = readerWithStudy();
  assert.equal(run("Object.keys(personalIntroductions).length"), 78);
  assert.equal(run("BIBLE.books.every(b=>personalIntroductions[b.id]?.blocks.length>0)"), true);
  assert.equal(run("personalGuides.length"), 46);
  assert.equal(run('personalGuides.filter(g=>g.group==="Study articles").length'), 36);
  assert.equal(run('personalGuides.filter(g=>g.group==="Study articles").every(g=>validVerse(...Object.values(parseKey(g.after))))'), true);
  assert.equal(run('JSON.stringify(chapterArticles("GEN",1).map(([,g])=>g.title))'), JSON.stringify(["Creation"]));
  assert.match(run("howToReadButton()"), /data-context-guide="\d+"/);
  run('dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};showContextLibrary();');
  const library = run('$("dialogBody").innerHTML');
  assert.equal((library.match(/data-context-guide=/g) || []).length, 46);
  assert.equal((library.match(/data-context-intro=/g) || []).length, 78);
  assert.match(library, /Reading guides[^]*Study articles[^]*Book introductions/);
  run('state.book="GEN";state.chapter=1;state.showPreamble=true;renderChapter(0);');
  assert.match(run("pane.innerHTML"), /Introduction to Genesis/);
  assert.throws(() => run("validatePersonalNotes({notes:{},sourceNotes:{}})"));
  assert.throws(() => run('validatePersonalNotes({notes:{},sourceNotes:{"GEN:1:1":{body:"x"}},alignment:{edition:"other",version:1,notes:{}}})'));
  assert.throws(() => run('validatePersonalNotes({notes:{},guides:[{title:"x",blocks:[{type:"html",text:"<script>"}]}],sourceNotes:{"GEN:1:1":{body:"x"}},alignment:{edition:BIBLE.edition,version:1,notes:{"GEN:1:1":"GEN:1:1"}}})'));
  const html = run(`studyArticleHtml(validateStudyArticle({title:"t",blocks:[{type:"heading",text:"<img src=x onerror=alert(1)>"},{type:"table",rows:[["<script>","v"]]}]}))`);
  assert.ok(html.includes("&lt;img") && html.includes("<table>") && !html.includes("<script>"));
});
test("searching study notes shows the verse and the matching words, escaped", () => {
  const run = readerWithStudy();
  run(`personalSourceNotes={"JHN:1:1":{body:"x".repeat(200)+" <script>beginning</script> tail"}};personalGuides=[{title:"Comparison",blocks:[{type:"table",rows:[["Orthodox","Genesis"]]}]}];`);
  const html = run('searchStudyContent("beginning","notes")');
  assert.match(html, /<strong>John 1:1<\/strong>/);
  assert.ok(html.includes("&lt;script&gt;beginning") && !html.includes("<script>"));
  assert.ok(run('searchStudyContent("Genesis","guides")').includes("Comparison"));
});
test("every lectionary reading through 2030 resolves completely in OSB numbering", () => {
  const run = reader();
  const result = JSON.parse(run(`(()=>{let total=0,verses=0,bad=[],books=new Set();
    for(const set of window.KATAMEROS.sets)for(const [,subs] of set)for(const [,readings] of subs)for(const reading of readings)for(const ref of reading){
      total++;const p=lectionaryPassage(ref);books.add(ref[0]);verses+=ref[2].length;
      // Psalm verses keep the order the lectionary sings them in; every other reading runs forward.
      if(!p||p.verses.length!==ref[2].length||new Set(ref[2]).size!==ref[2].length||(ref[0]!==19&&ref[2].some((v,i)=>i&&v<=ref[2][i-1])))bad.push(ref.slice(0,2).join(":"));
      if(ref.length>3&&(ref[0]!==19||ref[3]===ref[1]))bad.push("cited "+ref.slice(0,2).join(":"));}
    return JSON.stringify({total,verses,bad,books:[...books].filter(b=>!KATAMEROS_BOOKS[b])});})()`));
  assert.ok(result.total > 1000 && result.verses > 10000, `${result.total} passages, ${result.verses} verses`);
  assert.deepEqual(result.bad, []);
  assert.deepEqual(result.books, []);
  assert.equal(run("KATAMEROS.edition"), BIBLE.edition);
  assert.equal(run('Object.keys(KATAMEROS.days).length'), 1553);
});
test("lectionary Psalms show the Orthodox number with the English number beside it", () => {
  const run = reader();
  run('loadPrefs({});window.day=katamerosDay("2026-11-11");');
  assert.equal(run("verseToCarry(day).label"), "Psalm 109(110):4–5, 7");
  assert.match(run("verseToCarry(day).text"), /priest forever/);
  assert.ok(!run("verseToCarry(day).text").includes("\n"));
  assert.equal(run('passageLabel([lectionaryPassage([19,22,[1,2,3],23])])'), "Psalm 22(23):1–3");
  assert.equal(run('passageLabel([lectionaryPassage([19,3,[2,3]])])'), "Psalm 3:2–3");
  assert.equal(run('passageLabel([lectionaryPassage([45,4,[24,25]]),lectionaryPassage([45,5,[1,2]])])'), "Romans 4:24–25; 5:1–2");
  assert.equal(run('lectionaryPassage([74,1,[1,2]]).book'), "BEL");
  assert.equal(run('lectionaryPassage([75,1,[1]]).book'), "SUS");
  assert.match(run('lectionaryPassage([24,38,[31]]).verses[0].text'), /new covenant/);
  assert.equal(run('passageLabel(mainReading(day).sub.readings[1])'), "Matthew 16:13–19");
  run('state.memory=[];memorizeBibleVerse("EST",1,1);');
  assert.equal(run("state.memory[0].label"), "Esther 1:1a");
});
test("every Wisdom passage exists, and Psalms carry OSB numbers", () => {
  const run = reader();
  const missing = run(`JSON.stringify(wisdomTopics().flatMap(t=>t.refs).filter(([b,c,v,end=v])=>{for(let i=v;i<=end;i++)if(!verseText(b,c,i))return true;return end<v;}))`);
  assert.equal(missing, "[]");
  assert.equal(run("wisdomTopics().length"), 57);
  assert.equal(run("wisdomTopics().reduce((n,t)=>n+t.refs.length,0)"), 453);
  assert.ok(run("wisdomTopics().every(t=>t.refs.length>=6)"));
  assert.equal(run('JSON.stringify(wisdomTopics().find(t=>t.id==="anxiety").refs.find(r=>r[0]==="PSA"))'), JSON.stringify(["PSA", 54, 23]));
});
test("every Agpeya hour has its Psalms and Gospel; the Agpeya's numbers are the edition's own", () => {
  const run = reader();
  assert.equal(run("AGPEYA.hours.length"), 7);
  const missing = run(`JSON.stringify(AGPEYA.hours.flatMap(h=>[...(h.watches||[h])].flatMap(w=>[
    ...w.psalms.filter(p=>p.length!==2||!verseText("PSA",p[0],1)).map(p=>h.id+" Ps "+p[0]),
    ...w.gospel.filter(([b,c,v,e])=>!verseText(b,c,v)||!verseText(b,c,e)).map(g=>h.id+" "+g.join(" "))])))`);
  assert.equal(missing, "[]");
  assert.equal(run('chapterText("PSA",114).length-1'), 9);
  assert.match(run('verseText("PSA",115,1)'), /I believed/);
  assert.match(run('verseText("PSA",146,1)'), /Praise the Lord/);
  assert.match(run('verseText("PSA",147,1)'), /Jerusalem/);
  assert.equal(run("currentAgpeyaHour(new Date(2026,10,11,6,30)).id"), "prime");
  assert.equal(run("currentAgpeyaHour(new Date(2026,10,11,23,30)).id"), "midnight");
  assert.equal(run("currentAgpeyaHour(new Date(2026,10,11,17,0)).id"), "vespers");
  run('loadPrefs({});state.tab="prayers";selectedPrayer="hour:none";renderPrayers();');
  const html = run("pane.innerHTML");
  assert.match(html, /Psalm 114 \(116:1–9\)/);
  assert.match(html, /Psalm 115 \(116:10–19\)/);
  assert.match(html, /Luke 9:10–17/);
  assert.match(html, /Prayer of Thanksgiving/);
  assert.equal(run('PRAYERS.find(p=>p.id==="psalm51").chapter'), 50);
});
test("the chapter drawer lists the chapter's OSB sections, including one inside a verse; an hour lists its sections", () => {
  const run = reader();
  run(`dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};dialog.querySelector=()=>null;for(const id of ["closeDialog","drawerNextBook","drawerPreviousBook"])$(id).focus=()=>{};
    loadPrefs({});state.book="MAT";state.chapter=5;showChapterDrawer();`);
  const html = run('$("dialogBody").innerHTML');
  assert.match(html, /data-jump-verse="1"><span>The Beatitudes/);
  assert.equal((html.match(/data-jump-verse=/g) || []).length, Object.keys(BIBLE.headings).filter((k) => k.startsWith("MAT:5:")).length);
  assert.equal((html.match(/data-chapter=/g) || []).length, 28);
  const [key, items] = Object.entries(BIBLE.inside)[0], [b, c, v] = key.split(":");
  assert.match(run(`chapterSectionsHtml("${b}",${c})`), new RegExp(`data-jump-verse="${v}" data-jump-line="${items[0][0]}"`));
  run('state.tab="prayers";selectedPrayer="hour:terce";renderPrayers();showHourDrawer();');
  const hour = run('$("dialogBody").innerHTML');
  assert.match(hour, /Opening/);
  assert.match(hour, /data-hour-jump="hour-\d+">19</);
  assert.match(hour, /Closing/);
});
test("chapter lists, reading plans, and random passages cover the whole edition", () => {
  const run = reader();
  run(`state.book='PSA'; state.chapter=100;`);
  const html = run('chapterListHtml("PSA")');
  assert.equal((html.match(/data-chapter=/g) || []).length, 151);
  assert.equal((html.match(/aria-current/g) || []).length, 1);
  assert.ok(html.includes('aria-label="Chapter 100, reading" aria-current="true"'));
  assert.ok(html.includes(">151</button>"));
  assert.equal(run('planDays("gospels").length'), 30);
  assert.equal(run('planDays("psalms").flat().length'), 151);
  assert.equal(run('new Set(planDays("whole-bible").flat().map(p=>p.book+":"+p.ch)).size'), 1346);
  run(`state.readingPlan={id:'gospels',completed:[0,0,30,-1]};state.history=[{book:'BAD',chapter:1,scroll:0,ts:1}];normalizeReaderTools(state);`);
  assert.equal(run("JSON.stringify(state.readingPlan.completed)"), "[0]");
  assert.equal(run("state.history.length"), 0);
  assert.equal(run("JSON.stringify(randomPassage(()=>0))"), JSON.stringify({ book: "GEN", ch: 1, v: 1 }));
  assert.equal(run("JSON.stringify(randomPassage(()=>1-Number.EPSILON))"), JSON.stringify({ book: "REV", ch: 22, v: 21 }));
  assert.equal(run("randomPassageTargets.length"), 36089);
  assert.equal(run("new Set(randomPassageTargets.map(p=>p.book)).size"), 78);
});
test("backups hold reading data only and refuse another edition's verse numbers", () => {
  const run = reader();
  run(`loadPrefs(); state.bookmarks=[{book:'JHN',chapter:1,verse:1,ts:1}]; state.comments={'JHN:1:1':'Keep <this>'}; state.secret='x'; window.backup={format:'orthobible-backup',version:1,reader:backupReader(state),personal:{notes:{'JHN:1:1':{body:'Imported'}}}}; window.checked=validateBackup(backup);`);
  assert.equal(run('checked.reader.comments["JHN:1:1"]'), "Keep <this>");
  assert.equal(run("checked.personal"), null);
  assert.equal(run("checked.reader.secret"), undefined);
  assert.equal(run("checked.reader.edition"), BIBLE.edition);
  assert.match(run("backupCounts(checked)"), /1 bookmarks · 0 highlights · 1 comments · 0 memory verses/);
  run('memorizeBibleVerse("JHN",3,16); window.withMemory=validateBackup({format:"orthobible-backup",version:1,reader:backupReader(state),personal:null});');
  assert.equal(run("withMemory.reader.memory.length"), 1);
  assert.equal(run('JSON.stringify(withMemory.reader.memory[0].ref)'), JSON.stringify([{ book: "JHN", verses: [[3, 16]] }]));
  assert.ok(!/loved|begotten|text/.test(run("JSON.stringify(withMemory.reader.memory)")), "a backup holds a memory verse's reference, not its words");
  assert.match(run("memoryText(state.memory[0])"), /so loved the world/);
  assert.throws(() => run("validateBackup({...backup,version:99})"));
  assert.throws(() => run("validateBackup({...backup,reader:{...backup.reader,chapter:999}})"));
  assert.throws(() => run('validateBackup({...backup,reader:{...backup.reader,comments:{"BAD:1:1":"bad"}}})'));
  assert.throws(() => run('validateBackup({...backup,reader:{...backup.reader,edition:"lxx2012-web-v1"}})'), /different Bible edition/);
  assert.throws(() => run('validateBackup({notes:{"JHN:1:1":{body:"wrong file"}}})'));
});
test("restoring a backup replaces reading data, keeps an undo copy, and leaves the study material open", async () => {
  const run = readerWithStudy();
  run(`state.comments={'JHN:1:1':'Before'}; window.storedRecords={}; studyRead=async key=>storedRecords[key]; studyTransaction=async values=>Object.assign(storedRecords,values); rememberScroll=()=>{};
    window.restore={format:'orthobible-backup',version:1,reader:{...backupReader(state),chapter:3,comments:{'JHN:3:16':'After'}},personal:null};`);
  await run("restoreBackup(restore)");
  assert.equal(run("storedRecords.readerState.chapter"), 3);
  assert.equal(run('storedRecords.restoreRecovery.reader.comments["JHN:1:1"]'), "Before");
  assert.equal(run('state.comments["JHN:3:16"]'), "After");
  assert.equal(run("Object.keys(personalSourceNotes).length"), Object.keys(STUDY.sourceNotes).length);
  assert.equal(run("Object.keys(personalIntroductions).length"), 78);
  assert.equal(run("persistenceBusy"), false);
});
test("Reading settings offer Lock (two taps) and name the text; nothing mentions imports or other editions", async () => {
  const run = readerWithStudy();
  run('dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};showSettings();');
  const html = run('$("dialogBody").innerHTML');
  assert.match(html, /Unlocked on this device/);
  assert.match(html, /id="lockOsb">Lock</);
  assert.match(html, /St\. Athanasius Academy Septuagint/);
  assert.match(html, /New King James Version/);
  assert.ok(!/Import|passphrase|Cloud|LXX2012|World English|—/i.test(html));
  run(`window.locked=0;window.reloaded=0;window.OSB_EDITION={lock(){locked++}};window.location={pathname:"/reader-osb/",search:"",hash:"#osb=x",reload(){reloaded++}};window.history={replaceState(){}};
    window.button=$("lockOsb");button.dataset={};button.isConnected=true;button.textContent="Lock";wireOsbSettings();button.onclick();`);
  assert.equal(run("locked"), 0);
  assert.equal(run("button.textContent"), "Tap again to lock");
  await run("button.onclick()");
  assert.equal(run("locked"), 1);
  assert.equal(run("reloaded"), 1);
});
test("nothing is saved before the stored state has been read; search folds typographic quotes", async () => {
  const run = reader();
  run("window.writes=0;localStorage.setItem=()=>{writes++};persistenceReady=false;state.book='GEN';persist();");
  assert.equal(run("writes"), 0, "a save before start-up finished would replace stored data with defaults");
  run("persistenceReady=true;persist();");
  assert.equal(run("writes"), 1);
  assert.equal(run('searchFold("God’s “word”—here\\nnext")'), 'god\'s "word"-here next');
  // A query typed with a straight apostrophe finds verses printed with a curly one, across a line break too.
  const sample = BIBLE.t.PSA.flat().find((text) => /\w’s \w+\n\w/.test(text) || /\w’s \w/.test(text));
  const phrase = sample.replace(/\n/g, " ").match(/\w+’s \w+/)[0].replace("’", "'");
  run(`dialog.open=true;$("searchInput").value=${JSON.stringify(phrase)};$("searchArea").value="all";`);
  await run("runSearch()");
  assert.match(run('$("searchResults").innerHTML'), /matching verses|First 80 matches/);
  assert.ok((run('$("searchResults").innerHTML').match(/class="result"/g) || []).length >= 1, `nothing found for ${phrase.length} characters`);
  run('$("searchInput").value="zzzqqq";');
  await run("runSearch()");
  assert.match(run('$("searchResults").innerHTML'), /0 matching verses/);
});
test("this edition keeps its own storage, apart from the other Reader on the same site", () => {
  const sources = ["app.js", "boot.js", "persistence.js", "personal-notes.js", "library.js", "sw.js", "index.html", "osb-pack.js", "today.js", "reader-tools.js", "library-backup.js", "library-tools.js", "swipe.js"]
    .map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]);
  for (const [file, text] of sources) {
    assert.ok(!/["'`]obible3["'`]|orthobible-personal|["'`]reader-library["'`]|["'`]reader-osb-key["'`]|reader-v\d/.test(text), `${file} uses the other Reader's storage`);
    assert.ok(!/bible-data\.js|legacy-web-data|osb-data\.enc|cloud-sync|LEGACY_WEB|LXX2012/.test(text), `${file} refers to the other edition's files`);
  }
  const all = sources.map(([, text]) => text).join("\n");
  assert.match(all, /"reader-osb-state"/);
  assert.match(all, /indexedDB\.open\("reader-osb-personal", 1\)/);
  assert.match(all, /indexedDB\.open\("reader-osb-library", 2\)/);
  assert.match(all, /const KEY_STORE = "reader-osb-edition-key"/);
  assert.match(all, /const CACHE = "reader-osb-v\d+"/);
});
test("the service worker caches every file the app loads, refreshes them on update, and deletes only its own old caches", async () => {
  const handlers = {}, deleted = [];
  let job, assets;
  vm.runInNewContext(fs.readFileSync(path.join(root, "sw.js"), "utf8"), {
    Request: class { constructor(url, options) { this.url = url; this.cache = options.cache; } },
    self: { addEventListener(name, fn) { handlers[name] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    caches: {
      open: async () => ({ addAll: async (requests) => { assets = requests; } }),
      keys: async () => ["unrelated-app-v1", "reader-v54", "reader-v55", "orthodox-bible-v30", "unseen-warfare-v12", "reader-osb-v0", "reader-osb-v1", "reader-osb-v999", "reader-osb-notes"],
      delete: async (key) => deleted.push(key),
    },
  });
  handlers.install({ waitUntil(p) { job = p; } });
  await job;
  assert.ok(assets.every((request) => request.cache === "reload"));
  const urls = assets.map((request) => request.url.replace(/^\.\//, ""));
  for (const needed of ["boot.js", "edition.json", "bible.enc", "study.enc", "index.html", "app.js", "styles.css", "katameros-data.js", "wisdom-data.js"]) assert.ok(urls.includes(needed), `${needed} is not cached`);
  const boot = fs.readFileSync(path.join(root, "boot.js"), "utf8");
  for (const script of boot.match(/APP_SCRIPTS = \[([^\]]+)\]/)[1].match(/"[^"]+"/g).map((s) => s.slice(1, -1))) assert.ok(urls.includes(script), `${script} is loaded but not cached`);
  for (const url of urls.filter(Boolean)) assert.ok(fs.existsSync(path.join(root, url.split("?")[0])), `${url} is cached but missing`);
  assert.ok(!urls.some((url) => /bible-data|legacy|osb-data|cloud/.test(url)));
  handlers.activate({ waitUntil(p) { job = p; } });
  await job;
  const current = fs.readFileSync(path.join(root, "sw.js"), "utf8").match(/const CACHE = "(reader-osb-v\d+)"/)[1];
  assert.deepEqual(deleted.sort(), ["reader-osb-v0", "reader-osb-v1", "reader-osb-v999"].filter((key) => key !== current).sort());
});
test("no Bible or study text is published outside the encrypted packs", () => {
  // Every run of eight words in every file the site serves (and in what the repository publishes) is compared
  // with the whole private build: all chapters, notes, introductions, guides, and articles.
  const { leaks } = require(path.join(root, "scripts", "leak_scan.cjs"));
  const tracked = require("node:child_process").execSync("git ls-files", { cwd: root }).toString().split("\n").filter(Boolean);
  const names = [...new Set([...PUBLIC_FILES(), "sw.js", ...tracked.filter((file) => !file.startsWith("vendor/"))])];
  assert.deepEqual(leaks(root, names, BIBLE, STUDY), []);
  // The packs themselves are ciphertext: no readable words.
  for (const file of ["bible.enc", "study.enc"]) {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.ok(bytes.length > 500000);
    assert.ok(!bytes.includes(Buffer.from("the Lord")) && !bytes.includes(Buffer.from('"books"')), `${file} is readable`);
  }
  assert.ok(!tracked.some((file) => /bible\.json|study\.json|osb-edition\.json|\.osb-unlock-link|bible-data\.js|legacy-web-data\.js/.test(file)));
  // The unlock key appears in nothing that is served or tracked.
  const key = unlockKey();
  if (key) for (const file of names) {
    const full = path.join(root, file);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) assert.ok(!fs.readFileSync(full).includes(Buffer.from(key)), `${file} contains the unlock key`);
  }
});
test("the encrypted packs were built from exactly the tested text", () => {
  const meta = JSON.parse(fs.readFileSync(path.join(root, "edition.json"), "utf8"));
  const id = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
  assert.equal(meta.files.bible.id, id(bibleJson), "bible.enc was built from a different bible.json: run scripts/encrypt_osb_edition.mjs");
  assert.equal(meta.files.study.id, id(studyJson), "study.enc was built from a different study.json: run scripts/encrypt_osb_edition.mjs");
  assert.equal(meta.iterations, 600000);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8")).id, "/reader-osb/");
  assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /<meta name="robots" content="noindex, nofollow"/);
});
test("the packs decrypt to the tested text with the link's key and with no other", { skip: !unlockKey() && "no unlock link on this machine" }, async () => {
  const key = Buffer.from(unlockKey(), "base64url");
  assert.equal(key.length, 32);
  const open = async (file, raw) => {
    const bytes = fs.readFileSync(path.join(root, file));
    const imported = await crypto.webcrypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const zipped = await crypto.webcrypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, imported, bytes.subarray(12));
    return require("node:zlib").gunzipSync(Buffer.from(zipped)).toString("utf8");
  };
  assert.equal(await open("bible.enc", key), bibleJson);
  assert.equal(await open("study.enc", key), studyJson);
  await assert.rejects(open("bible.enc", crypto.randomBytes(32)));
});

// ----- boot.js in a small page stand-in -----
// fetch reads files from a directory (the repository, or a throwaway pack made with a known passphrase);
// scripts "load" without running. `failing` names files whose fetch rejects, as when the network is down.
function unlockKey() {
  const file = path.join(root, ".osb-unlock-link");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("#osb=")[1] : null;
}
function bootPage({ hash = "", storage = {}, dir = root, failing = [], failScript = null } = {}) {
  const store = new Map(Object.entries(storage));
  const element = (extra = {}) => ({ hidden: false, innerHTML: "", textContent: "", disabled: false, value: "", ...extra });
  const nodes = { lock: element({ hidden: true }), app: element(), pane: element(), lockStatus: element(), lockPassphrase: element(), lockForm: null };
  const loaded = [], registered = [], listeners = {};
  const submitButton = element();
  const context = {
    console, atob, btoa, TextEncoder, TextDecoder, Uint8Array, Blob, Response, DecompressionStream, crypto: crypto.webcrypto, setTimeout, clearTimeout,
    location: { hash, pathname: "/reader-osb/", search: "" },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    navigator: { serviceWorker: { register: (url) => { registered.push(url); return Promise.resolve(); } } },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    fetch: async (file) => {
      if (failing.includes(file)) throw new TypeError("Load failed");
      const full = path.join(dir, file);
      if (!fs.existsSync(full)) return { ok: false };
      const bytes = fs.readFileSync(full);
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), json: async () => JSON.parse(bytes.toString("utf8")) };
    },
    document: {
      head: { append(script) { loaded.push(script.src); Promise.resolve().then(() => (script.src === failScript ? script.onerror() : script.onload())); } },
      createElement: () => ({}),
      querySelector: (selector) => (selector === ".app" ? nodes.app : null),
      getElementById(id) {
        if (id === "lockForm") return nodes.lock.innerHTML.includes('id="lockForm"') ? (nodes.lockForm ||= { querySelector: () => submitButton }) : null;
        return nodes[id];
      },
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "boot.js"), "utf8"), context);
  const settle = async (ready) => { for (let i = 0; i < 600 && !ready(); i++) await new Promise((r) => setTimeout(r, 20)); };
  const submitPassphrase = (text) => { nodes.lockPassphrase.value = text; return nodes.lockForm.onsubmit({ preventDefault() {} }); };
  return { context, nodes, loaded, registered, store, settle, listeners, submitPassphrase, submitButton };
}
// A throwaway pack: the same format as the real one, made with a known passphrase, holding no Bible text.
let testPack;
function throwawayPack() {
  if (testPack) return testPack;
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "reader-osb-test-"));
  const passphrase = "a passphrase for tests", salt = crypto.randomBytes(16), iterations = 1000;
  const key = crypto.pbkdf2Sync(passphrase.normalize("NFKC"), salt, iterations, 32, "sha256");
  const seal = (name, value) => {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const sealed = Buffer.concat([cipher.update(require("node:zlib").gzipSync(JSON.stringify(value))), cipher.final(), cipher.getAuthTag()]);
    fs.writeFileSync(path.join(dir, `${name}.enc`), Buffer.concat([iv, sealed]));
  };
  seal("bible", { edition: "test", books: [], t: {} });
  seal("study", { notes: {}, sourceNotes: {} });
  fs.writeFileSync(path.join(dir, "edition.json"), JSON.stringify({ v: 1, iterations, salt: salt.toString("base64"), files: { bible: { file: "bible.enc" }, study: { file: "study.enc" } } }));
  const text = (bytes) => bytes.toString("base64");
  testPack = { dir, passphrase, key: text(key), link: key.toString("base64url"), other: () => crypto.randomBytes(32).toString("base64url") };
  process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  return testPack;
}
const KEY = "reader-osb-edition-key", LOCKED = "reader-osb-edition-locked";
test("without a key the app stays locked and loads nothing", async () => {
  const page = bootPage();
  await page.settle(() => !page.nodes.lock.hidden);
  assert.equal(page.nodes.lock.hidden, false);
  assert.equal(page.nodes.app.hidden, true);
  assert.match(page.nodes.lock.innerHTML, /Open your private link to read\./);
  assert.match(page.nodes.lock.innerHTML, /Use passphrase/);
  assert.ok(!/—/.test(page.nodes.lock.innerHTML));
  assert.equal(page.context.BIBLE, undefined);
  assert.deepEqual(page.loaded, []);
  assert.deepEqual(page.registered, ["./sw.js"]);
});
test("the private link opens the real text, is remembered, and loads the app in order", { skip: !unlockKey() && "no unlock link on this machine" }, async () => {
  const page = bootPage({ hash: `#osb=${unlockKey()}` });
  await page.settle(() => page.loaded.includes("app.js"));
  assert.equal(JSON.stringify(page.context.BIBLE), JSON.stringify(BIBLE));
  assert.equal(page.nodes.lock.hidden, true);
  assert.equal(page.nodes.app.hidden, false);
  assert.equal(page.loaded[0], "edition.js");
  assert.equal(page.loaded.at(-1), "app.js");
  assert.ok(page.loaded.indexOf("personal-notes.js") < page.loaded.indexOf("osb-pack.js"));
  assert.ok(page.store.get(KEY));
  assert.equal(JSON.stringify(await page.context.OSB_EDITION.study()), JSON.stringify(STUDY));
});
test("a key is remembered only once it has opened the text; a stale or foreign link never displaces a working key", async () => {
  const pack = throwawayPack();
  // The link alone opens the pack and is remembered.
  const first = bootPage({ dir: pack.dir, hash: `#osb=${pack.link}` });
  await first.settle(() => first.loaded.includes("app.js"));
  assert.equal(first.context.BIBLE.edition, "test");
  assert.equal(first.store.get(KEY), pack.key);
  // Later launches need no link.
  const later = bootPage({ dir: pack.dir, storage: { [KEY]: pack.key } });
  await later.settle(() => later.loaded.includes("app.js"));
  assert.equal(later.context.BIBLE.edition, "test");
  // A link with another key (an old link, or the other Reader's link) falls back to the remembered key and leaves it alone.
  const stale = bootPage({ dir: pack.dir, hash: `#osb=${pack.other()}`, storage: { [KEY]: pack.key } });
  await stale.settle(() => stale.loaded.includes("app.js"));
  assert.equal(stale.context.BIBLE.edition, "test");
  assert.equal(stale.store.get(KEY), pack.key);
  // A wrong link with nothing remembered: locked, with the reason, and nothing stored.
  const wrong = bootPage({ dir: pack.dir, hash: `#osb=${pack.other()}` });
  await wrong.settle(() => !wrong.nodes.lock.hidden);
  assert.match(wrong.nodes.lock.innerHTML, /This link no longer opens the text\. Use your latest link\./);
  assert.equal(wrong.context.BIBLE, undefined);
  assert.equal(wrong.store.has(KEY), false);
  assert.deepEqual(wrong.loaded, []);
  // A remembered key that no longer opens the text (after a re-key) is forgotten.
  const rekeyed = bootPage({ dir: pack.dir, storage: { [KEY]: Buffer.from(pack.other(), "base64url").toString("base64") } });
  await rekeyed.settle(() => !rekeyed.nodes.lock.hidden);
  assert.equal(rekeyed.store.has(KEY), false);
  // Pasting the right link into the locked tab opens it.
  wrong.context.location.hash = `#osb=${pack.link}`;
  wrong.listeners.hashchange();
  await wrong.settle(() => wrong.loaded.includes("app.js"));
  assert.equal(wrong.context.BIBLE.edition, "test");
  assert.equal(wrong.store.get(KEY), pack.key);
});
test("a failed download is reported as a download problem, not as a bad link or passphrase", async () => {
  const pack = throwawayPack();
  const noMeta = bootPage({ dir: pack.dir, hash: `#osb=${pack.link}`, failing: ["edition.json"] });
  await noMeta.settle(() => !noMeta.nodes.lock.hidden);
  assert.match(noMeta.nodes.lock.innerHTML, /Connect to the internet once to download the text\./);
  assert.ok(!noMeta.nodes.lock.innerHTML.includes("lockForm"));
  const noText = bootPage({ dir: pack.dir, hash: `#osb=${pack.link}`, storage: { [KEY]: pack.key }, failing: ["bible.enc"] });
  await noText.settle(() => !noText.nodes.lock.hidden);
  assert.match(noText.nodes.lock.innerHTML, /Connect to the internet once to download the text\./);
  assert.ok(!/no longer opens/.test(noText.nodes.lock.innerHTML));
  assert.equal(noText.store.get(KEY), pack.key, "a network failure must not forget a good key");
  await noText.submitPassphrase(pack.passphrase);
  assert.equal(noText.nodes.lockStatus.textContent, "Connect to the internet once to download the text.");
  assert.equal(noText.submitButton.disabled, false);
  // A browser without the needed features says so.
  const old = bootPage({ dir: pack.dir, hash: `#osb=${pack.link}` });
  await old.settle(() => old.loaded.includes("app.js"));
  const unsupported = bootPage({ dir: pack.dir, storage: {} });
  await unsupported.settle(() => !unsupported.nodes.lock.hidden);
  unsupported.context.DecompressionStream = undefined;
  await unsupported.submitPassphrase(pack.passphrase);
  assert.equal(unsupported.nodes.lockStatus.textContent, "This browser cannot open the text. Update it and try again.");
});
test("the passphrase opens the text and is remembered as a key; a wrong one says so and can be retried", async () => {
  const pack = throwawayPack();
  const page = bootPage({ dir: pack.dir });
  await page.settle(() => !page.nodes.lock.hidden);
  await page.submitPassphrase("not the passphrase");
  assert.equal(page.nodes.lockStatus.textContent, "That passphrase did not open the text.");
  assert.equal(page.submitButton.disabled, false);
  assert.equal(page.store.has(KEY), false);
  await page.submitPassphrase(pack.passphrase);
  await page.settle(() => page.loaded.includes("app.js"));
  assert.equal(page.context.BIBLE.edition, "test");
  assert.equal(page.store.get(KEY), pack.key);
  assert.equal(page.nodes.lock.hidden, true);
  // If a script cannot load after unlocking, the reader says so where it can be seen, and the key is kept.
  const broken = bootPage({ dir: pack.dir, failScript: "today.js" });
  await broken.settle(() => !broken.nodes.lock.hidden);
  await broken.submitPassphrase(pack.passphrase);
  assert.equal(broken.nodes.pane.innerHTML, '<p class="empty">Reader could not start. Reload to try again.</p>');
  assert.equal(broken.nodes.lock.hidden, true);
  assert.equal(broken.store.get(KEY), pack.key);
});
test("Lock holds: the same link, even from a Home Screen icon, stays locked until the passphrase or a new key", async () => {
  const pack = throwawayPack();
  const page = bootPage({ dir: pack.dir, hash: `#osb=${pack.link}` });
  await page.settle(() => page.loaded.includes("app.js"));
  await page.context.OSB_EDITION.lock();
  assert.equal(page.store.has(KEY), false);
  const mark = page.store.get(LOCKED);
  assert.ok(mark && !mark.includes(pack.key.slice(0, 12)), "the lock mark is not the key");
  // Relaunching from the icon whose address still carries the key: locked, and the key is not stored again.
  const relaunch = bootPage({ dir: pack.dir, hash: `#osb=${pack.link}`, storage: { [LOCKED]: mark } });
  await relaunch.settle(() => !relaunch.nodes.lock.hidden);
  assert.match(relaunch.nodes.lock.innerHTML, /Locked on this device\./);
  assert.equal(relaunch.context.BIBLE, undefined);
  assert.equal(relaunch.store.has(KEY), false);
  // The passphrase opens it again and clears the lock.
  await relaunch.submitPassphrase(pack.passphrase);
  await relaunch.settle(() => relaunch.loaded.includes("app.js"));
  assert.equal(relaunch.store.has(LOCKED), false);
  assert.equal(relaunch.store.get(KEY), pack.key);
});
