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
for i, (start, end, title, note) in enumerate(titles):
    where = chapter_of(title)
    if where:
        chapters.append((where[0], where[1], end, titles[i + 1][0] if i + 1 < len(titles) else len(raw), note))

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
            elif plain(inner):
                stats["unexpected paragraph in chapter text"] += 1
                oddities.append((book, ch, "paragraph", re.sub(rb">[^<]*<", b">T<", inner)[:80].decode("utf-8", "replace")))
            continue
        whole = plain(inner)
        if book in NEW_TESTAMENT and align == "justify" and b'width="1em"' in attrs and whole and not MARK.search(inner):
            if title_like(whole):
                pending.append(whole)
                stats["plain-line headings (New Testament)"] += 1
                continue
            review.append((book, ch, len(whole.split()), whole[-1], " ".join(whole.split()[:3])))
        if align == "center" and whole.startswith("(") and whole.endswith(")") and not MARK.search(inner):
            stats["cross-reference lines skipped"] += 1
            continue
        # Drop translator-note markers first so the surrounding words stay contiguous.
        def keep(m):
            label = m.group(2).decode("utf-8", "replace").strip()
            if re.fullmatch(r"\d+[a-z]{0,2}", label):
                return m.group(0)
            stats[f"marker stripped: {'letter' if re.fullmatch(r'[a-z]{1,2}', label) else 'empty' if not label else 'other'}"] += 1
            return b""
        inner = MARK.sub(keep, inner)
        for odd in ANYSUP.findall(MARK.sub(b"", inner)):
            stats["unrecognised superscripts"] += 1
            oddities.append((book, ch, re.sub(rb">[^<]*<", b">T<", odd)[:120].decode("utf-8", "replace"), plain(odd)[:12]))
        position = 0
        for m in list(MARK.finditer(inner)) + [None]:
            text = plain(inner[position:m.start() if m else len(inner)])
            if text:
                if current is None:
                    preface.append(text)
                    if pending:
                        stats["heading before unnumbered text"] += 1
                else:
                    if pending and position == 0:
                        stats["heading inside a verse"] += 1
                        inside.setdefault(len(verses), []).append([len(current["lines"]), pending]); pending = []
                    current["lines"].append(text)
            if m is None:
                break
            position = m.end()
            current = {"label": m.group(2).decode("utf-8", "replace").strip(), "lines": []}
            verses.append(current)
            if pending:
                headings[len(verses)] = pending; pending = []
            if m.group(1):
                links[int(m.group(1))].append((book, ch, len(verses)))
    leftover = plain(bytes(b if not consumed[i] else 32 for i, b in enumerate(raw[start:end])))
    if leftover:
        stats["text outside blocks (chapters)"] += 1
    if pending:
        stats["heading after last verse"] += 1
    if title_note and verses:
        links[title_note].append((book, ch, 1))
    books.setdefault(book, {})[ch] = {"verses": [[v["label"], "\n".join(v["lines"])] for v in verses], "headings": headings, "inside": inside, "preface": " ".join(preface)}

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
    return [text for text in (plain(piece) for piece in pieces) if text]


notes = {}
for target in all_targets:
    end = min(next_after(all_targets, target), next_after(title_starts, target), next_after(dividers, target), next_after(pagebreaks, target))
    body = "\n\n".join(note_paragraphs(target, end))
    if not body:
        stats["empty notes"] += 1
        continue
    for book, ch, pos in links[target]:
        key = f"{book}:{ch}:{pos}"
        notes[key] = notes[key] + "\n\n" + body if key in notes else body
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
        content.append({"type": "heading" if align == "center" else "paragraph", "text": text})
    before = [t for t in all_targets if t < divider]
    anchor = links[before[-1]][0] if before else None
    articles.append({"title": blocks[0][2], "blocks": content, "after": f"{anchor[0]}:{anchor[1]}:{anchor[2]}" if anchor else None})

edition = {"order": [b for b in ORDER if b in books], "names": DISPLAY,
           "books": {b: [books[b][c] for c in sorted(books[b])] for b in books},
           "chapterNumbers": {b: sorted(books[b]) for b in books}, "notes": notes, "articles": articles}
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
