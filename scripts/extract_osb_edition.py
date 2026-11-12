#!/usr/bin/env python3
"""Extract the owner's Orthodox Study Bible ebook into a private edition file for Reader (OSB text edition).

Input: the raw MOBI HTML of the owner's copy (Calibre's MOBI reader; links are byte offsets, `filepos`).
Output (private, never commit): JSON with every book, chapter, and verse in the OSB's own numbering,
section headings, the study notes linked from each verse, and the study articles.

Usage: python3 scripts/extract_osb_edition.py ~/Documents/reader-private/osb/osb-mobi.html ~/Documents/reader-private/osb/osb-edition.json
The output path must be outside this repository.
"""
import html, json, re, sys
from collections import Counter, defaultdict
from pathlib import Path

source, output = Path(sys.argv[1]), Path(sys.argv[2])
if output.resolve().is_relative_to(Path(__file__).resolve().parents[1]):
    raise SystemExit("Private output must stay outside the repository.")
raw = source.read_bytes()

NAMES = {"Genesis": "GEN", "Exodus": "EXO", "Leviticus": "LEV", "Numbers": "NUM", "Deuteronomy": "DEU", "Joshua": "JOS", "Judges": "JDG",
         "Ruth": "RUT", "1 Kingdoms": "1SA", "2 Kingdoms": "2SA", "3 Kingdoms": "1KI", "4 Kingdoms": "2KI", "1 Chronicles": "1CH",
         "2 Chronicles": "2CH", "1 Ezra": "1ES", "2 Ezra": "EZR", "Nehemiah": "NEH", "Tobit": "TOB", "Judith": "JDT", "Esther": "EST",
         "1 Maccabees": "1MA", "2 Maccabees": "2MA", "3 Maccabees": "3MA", "Psalm": "PSA", "Job": "JOB", "Proverbs": "PRO",
         "Ecclesiastes": "ECC", "Song of Songs": "SNG", "Wisdom of Solomon": "WIS", "Wisdom of Sirach": "SIR", "Hosea": "HOS", "Amos": "AMO",
         "Micah": "MIC", "Joel": "JOL", "Obadiah": "OBA", "Jonah": "JON", "Nahum": "NAM", "Habakkuk": "HAB", "Zephaniah": "ZEP",
         "Haggai": "HAG", "Zechariah": "ZEC", "Malachi": "MAL", "Isaiah": "ISA", "Jeremiah": "JER", "Baruch": "BAR",
         "Lamentations of Jeremiah": "LAM", "Epistle of Jeremiah": "LJE", "Ezekiel": "EZK", "Daniel": "DAN", "Matthew": "MAT", "Mark": "MRK",
         "Luke": "LUK", "John": "JHN", "Acts": "ACT", "Romans": "ROM", "1 Corinthians": "1CO", "2 Corinthians": "2CO", "Galatians": "GAL",
         "Ephesians": "EPH", "Philippians": "PHP", "Colossians": "COL", "1 Thessalonians": "1TH", "2 Thessalonians": "2TH", "1 Timothy": "1TI",
         "2 Timothy": "2TI", "Titus": "TIT", "Philemon": "PHM", "Hebrews": "HEB", "James": "JAS", "1 Peter": "1PE", "2 Peter": "2PE",
         "1 John": "1JN", "2 John": "2JN", "3 John": "3JN", "Jude": "JUD", "Revelation": "REV"}
ORDER = list(dict.fromkeys(NAMES.values()))
ORDER.insert(ORDER.index("DAN"), "SUS"); ORDER.insert(ORDER.index("DAN") + 1, "BEL")
DISPLAY = {v: k for k, v in NAMES.items()} | {"PSA": "Psalms", "SUS": "Susanna", "BEL": "Bel and the Serpent"}

TITLE = re.compile(rb'<p[^>]*align="center"><a filepos=\d+><font size="6">(?:<b>)?<font color="#0000ff">([^<]+)(?:<sup><small><a filepos=(\d+)>)?')
BLOCK = re.compile(rb'<(p|blockquote)\b([^>]*)>(.*?)</\1>', re.S)
MARK = re.compile(rb'<sup><small>(?:<a filepos=(\d+)>)?<font size="1">(?:<font color="#0000ff">|<i>)?([^<]*?)(?:</font>|</i>)?</font>(?:</a>)?</small></sup>')
PAGEBREAK = b"<mbp:pagebreak"
ANYSUP = re.compile(rb'<sup>.*?</sup>', re.S)
DIVIDER = re.compile(rb'<p[^>]*align="center"><img recindex="00021"')
stats = Counter()
oddities = []
review = []


def plain(fragment):
    text = html.unescape(re.sub(rb"<[^>]+>", b"", fragment).decode("utf-8", "replace")).replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


# The ebook's markup leaves a stray space before punctuation where a link, italics, or small capitals end
# ("(Ex 1:8 )", "the LORD ;"). The printed text has none. tidy() removes exactly those spaces: one before
# , ; : ! ? ) and before a full stop that is not part of a spaced ellipsis, and one after an opening parenthesis.
# Spaces between nested quotation marks are the edition's own and stay. No other character changes.
STRAY = re.compile(r" (?=[,;:!?)])|(?<![. ]) (?=\.(?![ ]?\.))|(?<=\() ")


def tidy(text):
    return STRAY.sub("", text)


def tidy_with_offsets(text):
    """-> (tidied text, function mapping an offset in the old text to the new text)."""
    removed = [m.start() for m in STRAY.finditer(text)]
    if not removed:
        return text, lambda offset: offset
    import bisect as _bisect
    return STRAY.sub("", text), lambda offset: offset - _bisect.bisect_left(removed, offset)


# The New Testament's translators' footnotes are marked in the text with a small letter, and the text uses italics
# (words the translators supplied, Old Testament quotations). Both are lifted out of the verse text, which stays
# plain, and kept as positions: letters as (offset, letter), italics as (start, end).
LIFTED = re.compile("\ue000([a-z]{1,2})\ue001|\ue002|\ue003")


def plain_marked(fragment, italic_open=False):
    """-> (text, letters, italic ranges, whether italics are still open at the end of the fragment)."""
    fragment = fragment.replace(b"<i>", "\ue002".encode()).replace(b"</i>", "\ue003".encode())
    text = html.unescape(re.sub(rb"<[^>]+>", b"", fragment).decode("utf-8", "replace")).replace("\xa0", " ")
    clean = LIFTED.sub("", text)
    collapsed = re.sub(r"\s+", " ", clean)
    lead = len(collapsed) - len(collapsed.lstrip())
    result = collapsed.strip()
    letters, italics, removed = [], [], 0
    started = 0 if italic_open else None
    for m in LIFTED.finditer(text):
        before = re.sub(r"\s+", " ", clean[: m.start() - removed])
        offset = max(0, min(len(result), len(before) - lead))
        removed += m.end() - m.start()
        if m.group(1):
            letters.append([offset, m.group(1)])
        elif m.group(0) == "\ue002":
            started = offset if started is None else started
        elif started is not None:
            italics.append([started, offset]); started = None
    if started is not None:
        italics.append([started, len(result)])
    # Trim spaces from the ends of each range and drop empty ones.
    trimmed = []
    for a, b in italics:
        while a < b and result[a] == " ":
            a += 1
        while b > a and result[b - 1] == " ":
            b -= 1
        if b > a:
            trimmed.append([a, b])
    result, at = tidy_with_offsets(result)
    letters = [[at(offset), letter] for offset, letter in letters]
    trimmed = [[at(a), at(b)] for a, b in trimmed if at(b) > at(a)]
    return result, letters, trimmed, started is not None


NEW_TESTAMENT = set("MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV".split())
SMALL = set("a an the of and in to for with on at by from as or is are his her their its into over against before after upon who not be it but nor so yet about through than".split())


def title_like(text):
    """In the New Testament the ebook prints in-chapter section headings as plain indented lines."""
    words = [w.strip("“”‘’\"'()[]") for w in text.split()]
    words = [w for w in words if w]
    if not words or len(words) > 14 or re.search(r"[.,;:]$", text.rstrip("”’\"'")):
        return False
    return all(w[0].isupper() or w[0].isdigit() or w.lower() in SMALL for w in words) and words[0][0].isupper()


def chapter_of(title):
    if title in ("Susanna", "Bel and the Serpent"):
        return ("SUS" if title == "Susanna" else "BEL", 1)
    m = re.match(r"(.+?)\s+(\d+)(?:\s*\(.*\))?$", title)
    return (NAMES[m.group(1)], int(m.group(2))) if m and m.group(1) in NAMES else None


titles = [(m.start(), m.end(), m.group(1).decode().strip(), int(m.group(2)) if m.group(2) else None) for m in TITLE.finditer(raw)]
chapters = []  # (book, ch, start, hard_end, title_note_target)
chapter_titles = {}  # the ebook's own chapter title where it says more than the number: "Psalm 22 (23)"
first_chapter = {}  # book -> where its first chapter begins
for i, (start, end, title, note) in enumerate(titles):
    where = chapter_of(title)
    if where:
        chapters.append((where[0], where[1], end, titles[i + 1][0] if i + 1 < len(titles) else len(raw), note))
        if "(" in title:
            chapter_titles[f"{where[0]}:{where[1]}"] = re.sub(r"\s+", " ", title)
        if where[1] == 1:
            first_chapter.setdefault(where[0], end)

# The annotations of a book begin at the first note target after its text.
targets_by_book = defaultdict(list)
for book, ch, start, end, note in chapters:
    for m in MARK.finditer(raw, start, end):
        if m.group(1) and re.fullmatch(rb"\d+[a-z]{0,2}", m.group(2).strip()):
            targets_by_book[book].append(int(m.group(1)))
    if note:
        targets_by_book[book].append(note)

import bisect
global_targets = sorted(t for ts in targets_by_book.values() for t in ts)


def next_after(sorted_list, position):
    i = bisect.bisect_right(sorted_list, position)
    return sorted_list[i] if i < len(sorted_list) else len(raw)


books = {}
links = defaultdict(list)  # note target -> [(book, ch, pos)]
for book, ch, start, hard_end, title_note in chapters:
    end = min(hard_end, next_after(global_targets, start))
    markers = [m for m in MARK.finditer(raw, start, end) if re.fullmatch(rb"\d+[a-z]{0,2}", m.group(2).strip())]
    if markers:
        page = raw.find(PAGEBREAK, markers[-1].end(), end)
        if page >= 0:
            end = page
    verses, headings, inside, pending, preface, current = [], {}, {}, [], [], None
    parallels, pending_parallel = {}, None  # the line of parallel passages printed under a section heading
    shapes = []  # text blocks of the chapter in order: "p" paragraph, "l" poetry line, "?" unindented with space above, "h" heading
    consumed = bytearray(len(raw[start:end]))
    for block in BLOCK.finditer(raw, start, end):
        tag, attrs, inner = block.group(1).decode(), block.group(2), block.group(3)
        for i in range(block.start() - start, block.end() - start):
            consumed[i] = 1
        align = (re.search(rb'align="(\w+)"', attrs) or [None, b""])[1].decode()
        if tag == "p":
            if align == "center" and re.search(rb'<font size="7"><b>', inner):
                text = plain(inner)
                if text:
                    pending.append(text)
                    shapes.append(["h", 0])
            elif plain(inner):
                stats["unexpected paragraph in chapter text"] += 1
                oddities.append((book, ch, "paragraph", re.sub(rb">[^<]*<", b">T<", inner)[:80].decode("utf-8", "replace")))
            continue
        whole = plain(inner)
        if book in NEW_TESTAMENT and align == "justify" and b'width="1em"' in attrs and whole and not MARK.search(inner):
            if title_like(whole):
                pending.append(whole)
                shapes.append(["h", 0])
                stats["plain-line headings (New Testament)"] += 1
                continue
            review.append((book, ch, len(whole.split()), whole[-1], " ".join(whole.split()[:3])))
        if align == "center" and whole.startswith("(") and whole.endswith(")") and not MARK.search(inner):
            if pending and pending_parallel is None:
                pending_parallel = tidy(whole)
                stats["parallel-passage lines under headings"] += 1
            else:
                stats["parallel-passage lines without a heading (skipped)"] += 1
            continue
        # Drop translator-note markers first so the surrounding words stay contiguous.
        def keep(m):
            label = m.group(2).decode("utf-8", "replace").strip()
            if re.fullmatch(r"\d+[a-z]{0,2}", label):
                return m.group(0)
            if re.fullmatch(r"[a-z]{1,2}", label):
                stats["translators' note letters"] += 1
                return f"\ue000{label}\ue001".encode()
            stats[f"marker stripped: {'empty' if not label else 'other'}"] += 1
            return b""
        inner = MARK.sub(keep, inner)
        # The ebook sets a prose paragraph with a first-line indent (width) and a poetry line with none;
        # an unindented block with space above it is the first line of a stanza or the first paragraph of a section.
        indented = (re.search(rb'width="([^"]*)"', attrs) or [None, b"0pt"])[1] not in (b"0pt", b"0")
        spaced = (re.search(rb'height="([^"]*)"', attrs) or [None, b"0pt"])[1] not in (b"0pt", b"0")
        shapes.append(["p" if indented else "?" if spaced else "l", len(whole)])
        shape_index, block_has_text, italic_open = len(shapes) - 1, False, False
        for odd in ANYSUP.findall(MARK.sub(b"", inner)):
            stats["unrecognised superscripts"] += 1
            oddities.append((book, ch, re.sub(rb">[^<]*<", b">T<", odd)[:120].decode("utf-8", "replace"), plain(odd)[:12]))
        position = 0
        for m in list(MARK.finditer(inner)) + [None]:
            text, letters, italics, italic_open = plain_marked(inner[position:m.start() if m else len(inner)], italic_open)
            if letters and (current is None or not text):
                stats["translators' note letters outside a verse"] += len(letters)
            if text:
                if current is None:
                    preface.append(text)
                    if pending:
                        stats["heading before unnumbered text"] += 1
                else:
                    if pending and position == 0:
                        stats["heading inside a verse"] += 1
                        inside.setdefault(len(verses), []).append([len(current["lines"]), pending]); pending = []
                        if pending_parallel:
                            parallels[f"{len(verses)}:{len(current['lines'])}"] = pending_parallel; pending_parallel = None
                    start_of_line = sum(len(line) + 1 for line in current["lines"])
                    current["marks"] += [[start_of_line + offset, letter] for offset, letter in letters]
                    current["italics"] += [[start_of_line + a, start_of_line + b] for a, b in italics]
                    current["lines"].append(text)
                    current["shape"].append((shape_index, not block_has_text))
                block_has_text = True
            if m is None:
                break
            position = m.end()
            current = {"label": m.group(2).decode("utf-8", "replace").strip(), "lines": [], "shape": [], "marks": [], "italics": []}
            verses.append(current)
            if pending:
                headings[len(verses)] = pending; pending = []
                if pending_parallel:
                    parallels[str(len(verses))] = pending_parallel; pending_parallel = None
            if m.group(1):
                links[int(m.group(1))].append((book, ch, len(verses)))
    leftover = plain(bytes(b if not consumed[i] else 32 for i, b in enumerate(raw[start:end])))
    if leftover:
        stats["text outside blocks (chapters)"] += 1
    if pending:
        stats["heading after last verse"] += 1
    if pending_parallel:
        stats["parallel-passage lines left unattached"] += 1
    if title_note and verses:
        links[title_note].append((book, ch, 1))
    # Settle the unindented, spaced blocks: a stanza's first line if poetry lines follow (or it is a short line after
    # poetry); otherwise the first paragraph of a section.
    for i, (kind, length) in enumerate(shapes):
        if kind == "?":
            after = shapes[i + 1][0] if i + 1 < len(shapes) else None
            before = shapes[i - 1][0] if i else None
            shapes[i][0] = "s" if after == "l" or (before in ("l", "s") and length < 100) else "p"
    # Per verse, one letter per line: l poetry line, s first line of a stanza, p paragraph, c continues a paragraph.
    layout = {}
    for n, v in enumerate(verses, 1):
        codes = "".join(shapes[i][0] if at_start else ("c" if shapes[i][0] == "p" else "l") for i, at_start in v["shape"])
        if len(codes) > 1 or codes in ("l", "s"):
            layout[n] = codes
    stats["verses with poetry lines"] += sum(1 for codes in layout.values() if "l" in codes or "s" in codes)
    stats["prose verses spanning a paragraph break"] += sum(1 for codes in layout.values() if "l" not in codes and "s" not in codes)
    books.setdefault(book, {})[ch] = {"verses": [[v["label"], "\n".join(v["lines"])] for v in verses], "headings": headings, "inside": inside,
                                      "preface": " ".join(preface), "layout": layout, "parallels": parallels,
                                      "marks": {n: v["marks"] for n, v in enumerate(verses, 1) if v["marks"]},
                                      "italics": {n: v["italics"] for n, v in enumerate(verses, 1) if v["italics"]}}
    stats["italic passages"] += sum(len(v["italics"]) for v in verses)

# ----- Notes and study articles -----
all_targets = sorted(links)
title_starts = sorted(t[0] for t in titles)
dividers = sorted(m.start() for m in DIVIDER.finditer(raw))
def paragraphs(start, end):
    out = []
    for block in BLOCK.finditer(raw, start, end):
        text = plain(block.group(3))
        if text:
            align = (re.search(rb'align="(\w+)"', block.group(2)) or [None, b""])[1].decode()
            out.append((block.group(1).decode(), align, text))
    return out


pagebreaks = sorted(m.start() for m in re.finditer(PAGEBREAK, raw))


def note_paragraphs(start, end):
    pieces = re.split(rb"</p>|</blockquote>", raw[start:end])
    return [text for text in (tidy(plain(piece)) for piece in pieces) if text]


# A note begins with a link back to its verse whose label is the reference ("5:7–17", "Ps 3"). Most notes are
# also linked from a verse number in the text; some are not (above all the notes on liturgical use, marked with
# a service icon). Every note is placed on the verse its own reference names, so none rides along with the note
# before it. A note whose reference cannot be read stays where the ebook links it.
SPACE = rb'(?:\s|\xc2\xa0|&nbsp;)*'
REFTEXT = rb'(?:Pss?\.?' + SPACE + rb')?\d+(?::\d+)?[a-z]?(?:' + SPACE + rb'(?:\xe2\x80\x93|\xe2\x80\x94|,|;|-)' + SPACE + rb'\d+(?::\d+)?[a-z]?)*'
NOTE_START = re.compile(rb'<a filepos=\d+\s*><font size="1"><font color="#0000ff">' + SPACE + rb'(' + REFTEXT + rb')' + SPACE + rb'</font></font></a>')
BOUNDARY = re.compile(rb'(?:<a></a>|<(?:p|blockquote)\b[^>]*>)(?:\s|\xc2\xa0|&nbsp;|<font size="1">|</font>|<img recindex="00023"[^>]*></img>)*$')
SINGLE = {b for b, chs in books.items() if len(chs) == 1}


def note_starts(start, end):
    """Byte offsets where a note begins inside [start, end), with the note's own reference label."""
    found = []
    for m in NOTE_START.finditer(raw, start, end):
        if raw[m.start() - 12:m.start()] == b"<sup><small>":
            continue
        boundary = BOUNDARY.search(raw, max(start, m.start() - 300), m.start())
        if boundary:
            found.append((boundary.start(), m.group(1).decode("utf-8", "replace").replace("\xa0", " ").strip()))
    return found


def place(book, label):
    """The verse a note's own reference names: (chapter, position), or None when it cannot be read."""
    m = re.match(r"(?:Pss?\.?\s*)?(\d+)(?::(\d+[a-z]?))?", label)
    if not m:
        return None
    first, verse = int(m.group(1)), m.group(2)
    if verse is None:
        if book == "PSA" or label.startswith("Ps"):
            chapter, verse = first, "1"
        elif book in SINGLE:
            chapter, verse = 1, str(first)
        else:
            return None
    else:
        chapter = first
    chapter_data = books.get(book, {}).get(chapter)
    if not chapter_data:
        return None
    labels_here = [v[0] for v in chapter_data["verses"]]
    return (chapter, labels_here.index(verse) + 1) if verse in labels_here else None


pieces = defaultdict(list)  # "BOOK:ch:pos" -> [(byte offset, text)]
for target in all_targets:
    end = min(next_after(all_targets, target), next_after(title_starts, target), next_after(dividers, target), next_after(pagebreaks, target))
    book = links[target][0][0]
    starts = note_starts(target, end)
    own = next((label for at, label in starts if at - target <= 150), None)
    cuts = [at for at, label in starts if at - target > 150]
    labels_at = {at: label for at, label in starts}
    bounds = [target] + cuts + [end]
    carried = None  # the verse of the piece before, for a note whose reference cannot be read
    for i, (a, b) in enumerate(zip(bounds, bounds[1:])):
        body = "\n\n".join(note_paragraphs(a, b))
        if not body:
            stats["empty notes"] += i == 0
            continue
        where = place(book, own if i == 0 else labels_at[a]) if (i > 0 or own) else None
        if i == 0:
            linked = [(bk, ch, pos) for bk, ch, pos in links[target]]
            # The ebook's own link stands unless the note names another verse of the same chapter.
            if where and len(linked) == 1 and linked[0][0] == book and linked[0][1] == where[0] and linked[0][2] != where[1]:
                stats["linked notes moved to the verse they name"] += 1
                linked = [(book, where[0], where[1])]
            for bk, ch, pos in linked:
                pieces[f"{bk}:{ch}:{pos}"].append((a, body))
            carried = linked[0]
        else:
            stats["unlinked notes"] += 1
            if where:
                stats["unlinked notes placed on the verse they name"] += 1
                pieces[f"{book}:{where[0]}:{where[1]}"].append((a, body))
                carried = (book, where[0], where[1])
            else:
                stats["unlinked notes kept with the note before them"] += 1
                pieces[f"{carried[0]}:{carried[1]}:{carried[2]}"].append((a, body))
notes = {key: [text for _, text in sorted(items)] for key, items in pieces.items()}
# ----- Translators' footnotes (New Testament): "Notes for <book>", one entry per letter in the text -----
FOOTNOTE = re.compile(rb'<blockquote[^>]*>\s*<a filepos=\d+\s*><font size="1"><font color="#0000ff">([a-z]{1,2})</font></font></a>(.*?)</blockquote>', re.S)
NOTES_FOR = [(m.start(), m.group(1).decode("utf-8", "replace").strip()) for m in
             re.finditer(rb'<p[^>]*align="center"><a filepos=\d+><font size="6">(?:<b>)?<font color="#0000ff">Notes for ([^<]+)', raw)]
text_notes = defaultdict(list)
for m in FOOTNOTE.finditer(raw):
    section = [name for at, name in NOTES_FOR if at < m.start()]
    book = NAMES.get(section[-1]) if section else None
    body = plain(m.group(2))
    ref = re.match(r"(?:(\d+):)?(\d+)\s*(.*)$", body, re.S)  # one entry prints its reference without a space
    stats["translators' notes"] += 1
    if not book or not ref or (ref.group(1) is None and book not in SINGLE):
        stats["translators' notes without a readable reference"] += 1
        continue
    chapter = int(ref.group(1) or 1)
    labels_here = [v[0] for v in books.get(book, {}).get(chapter, {"verses": []})["verses"]]
    if ref.group(2) not in labels_here:
        stats["translators' notes on a missing verse"] += 1
        continue
    position = labels_here.index(ref.group(2)) + 1
    letters_here = [letter for _, letter in books[book][chapter]["marks"].get(position, [])]
    if m.group(1).decode() not in letters_here:
        stats["translators' notes with no letter in the verse"] += 1
        continue
    text_notes[f"{book}:{chapter}:{position}"].append([m.group(1).decode(), tidy(ref.group(3).strip())])
for book, chapters in books.items():
    for chapter, data in chapters.items():
        for position, marks in data["marks"].items():
            noted = [letter for letter, _ in text_notes.get(f"{book}:{chapter}:{position}", [])]
            stats["letters without a translators' note"] += sum(1 for _, letter in marks if letter not in noted)
            stats["verses whose letters and translators' notes differ in order"] += [l for _, l in marks] != noted

# Anything between a page break and the next note, divider, or title would be lost: count it.
for page in pagebreaks:
    stop = min(next_after(all_targets, page), next_after(title_starts, page), next_after(dividers, page), next_after(pagebreaks, page))
    before = [t for t in all_targets if t < page]
    if before and next_after(title_starts, before[-1]) > page and plain(raw[page:stop]):
        stats["text after a page break inside annotations"] += 1
        oddities.append(("annotations", page, "after-pagebreak", plain(raw[page:stop])[:14]))

articles = []
for i, divider in enumerate(dividers):
    end = min(dividers[i + 1] if i + 1 < len(dividers) else len(raw), next_after(title_starts, divider))
    blocks = paragraphs(divider, end)
    if not blocks or blocks[0][:2] != ("blockquote", "center"):
        if blocks and not any(divider < t < end for t in all_targets):
            stats["untargeted text after a divider"] += 1
        continue
    # An article ends where the next targeted note begins.
    cut = min([end] + [t for t in all_targets if divider < t < end])
    blocks = paragraphs(divider, cut)
    content = []
    for tag, align, text in blocks[1:]:
        if align == "right":
            stats["article navigation lines skipped"] += 1
            continue
        content.append({"type": "heading" if align == "center" else "paragraph", "text": tidy(text)})
    before = [t for t in all_targets if t < divider]
    anchor = links[before[-1]][0] if before else None
    articles.append({"title": blocks[0][2], "blocks": content, "after": f"{anchor[0]}:{anchor[1]}:{anchor[2]}" if anchor else None})

# ----- Book introductions: the page (or pages) before a book's first chapter, headed by the book's title -----
INTRO_HEADINGS = {"Author", "Authors", "Date", "Major Theme", "Major Themes", "Theme", "Background", "Outline"}
introductions = {}
for book, position in first_chapter.items():
    page = bisect.bisect_left(pagebreaks, position) - 1
    found = None
    for back in range(1, 4):
        if page - back < 0:
            break
        blocks = [(m.group(1).decode(), m.group(2), m.group(3), plain(m.group(3))) for m in BLOCK.finditer(raw, pagebreaks[page - back], pagebreaks[page])]
        if len(blocks) > 3 and b'align="center"' in blocks[0][1] and any(text in ("Author", "Authors") for *_, text in blocks[1:4]):
            found = blocks
            break
    if not found:
        continue
    content = []
    for tag, attrs, inner, text in found[1:]:
        if text:
            heading = text in INTRO_HEADINGS or (tag == "blockquote" and b'align="left"' in attrs and b"<b>" in inner and len(text) < 40)
            content.append({"type": "heading" if heading else "paragraph", "text": tidy(text)})
    introductions[book] = {"title": found[0][3].rstrip("†").strip(), "blocks": content}
# Susanna and Bel are printed as the opening and close of Daniel and share its introduction.
for part in ("SUS", "BEL"):
    if "DAN" in introductions:
        introductions[part] = introductions["DAN"]
stats["book introductions"] = len(introductions)

edition = {"order": [b for b in ORDER if b in books], "names": DISPLAY, "introductions": introductions,
           "books": {b: [books[b][c] for c in sorted(books[b])] for b in books},
           "chapterNumbers": {b: sorted(books[b]) for b in books}, "chapterTitles": chapter_titles, "notes": notes, "textNotes": dict(text_notes), "articles": articles}
output.write_text(json.dumps(edition, ensure_ascii=False))

# ----- Report (numbers only) -----
labels = Counter()
for b, chs in books.items():
    for c, ch in chs.items():
        seq = [v[0] for v in ch["verses"]]
        if seq != [str(i + 1) for i in range(len(seq))]:
            labels[b] += 1
        if ch["preface"]:
            stats["chapters with unnumbered opening text"] += 1
        stats["empty verses"] += sum(1 for v in ch["verses"] if not v[1])
print(json.dumps({"books": len(books), "chapters": sum(len(c) for c in books.values()),
                  "verses": sum(len(ch["verses"]) for c in books.values() for ch in c.values()),
                  "headings": sum(len(h) for c in books.values() for ch in c.values() for h in ch["headings"].values()),
                  "notes": len(notes), "noteTargets": len(all_targets), "articles": len(articles),
                  "chaptersWithIrregularLabels": dict(labels), "stats": dict(stats),
                  "oddSuperscripts": oddities[:8], "ntUnmarkedParagraphsKeptAsText": len(review), "ntUnmarkedSample": review[:60], "estherLabels": {c: [v[0] for v in ch["verses"]][:26] for c, ch in books.get("EST", {}).items() if [v[0] for v in ch["verses"]] != [str(i + 1) for i in range(len(ch["verses"]))]},
                  "missingChapters": {b: [n for n in range(1, max(c) + 1) if n not in c] for b, c in books.items() if len(c) != max(c)}}, indent=1))
