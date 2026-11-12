// Orthodox Study Bible text edition: reference handling.
// A verse is addressed by its position in the chapter (1-based). The position is the printed verse number
// everywhere except Esther's Greek additions, whose lettered verses (1a, 17b) are listed in BIBLE.labels.
function isSeptuagint(book) {
  return window.BIBLE.books.find((b) => b.id === book)?.translation === "SAAS";
}
function migrateEdition(preferences) {
  return { ...preferences, edition: window.BIBLE.edition };
}
function sourceVerseStart(book, chapter, verse) {
  return verse;
}
// The printed verse number or letter for a position.
function sourceVerseLabel(book, chapter, verse) {
  return window.BIBLE.labels?.[`${book}:${chapter}`]?.[verse] ?? String(verse);
}
// A printed verse number or letter ("17", "17a") to its position in the chapter, or null.
function versePosition(book, chapter, label) {
  const text = String(label).trim().toLowerCase();
  const labels = window.BIBLE.labels?.[`${book}:${chapter}`];
  if (labels) {
    const index = labels.indexOf(text);
    return index > 0 ? index : null;
  }
  return /^\d+$/.test(text) && window.BIBLE.t[book]?.[chapter - 1]?.[+text] ? +text : null;
}
// Verse text on one line, for search, previews, copying, and memorizing.
function flatText(text) {
  return String(text || "").replace(/\s*\n\s*/g, " ");
}
