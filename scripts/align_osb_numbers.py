#!/usr/bin/env python3
"""Pin OSB Old Testament source notes to LXX2012 verses by number, checked against the verse text.

The OSB and LXX2012 both follow Septuagint numbering, so a note normally belongs at the same reference.
The OSB verse text stored with each note is compared with LXX2012 verses at and around that reference:
  1. same reference when it is the best (or near-best) textual match;
  2. a nearby verse when the text clearly matches it instead (verse splits and merges);
  3. otherwise the offset of the nearest confidently matched note in the same chapter, then the same number.
Notes whose reference does not exist in LXX2012 and have no textual match stay unpinned (browsable).

Private input and output: keep both outside the public repository.
Usage: python3 scripts/align_osb_numbers.py private-osb.json private-osb-aligned.json [osb-mobi.html]
With the raw HTML of the owner's OSB ebook (Calibre's MOBI reader), the OSB section headings are added too.
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

source, output = map(Path, sys.argv[1:3])
mobi_html = Path(sys.argv[3]) if len(sys.argv) > 3 else None
root = Path(__file__).resolve().parents[1]
if output.resolve().is_relative_to(root):
    raise SystemExit("Personal output must stay outside the repository.")
data = json.loads(source.read_text())
bible = json.loads((root / "bible-data.js").read_text().split("=", 1)[1].rstrip(";\n"))
T = bible["t"]

STOP = set("the and of to in a that is for with he his shall be it they them all as was on from but by not you your i my me him "
           "her their we us our o lord god will have has had who which this these those were are when then there so do did said say "
           "an at or if out up into upon".split())
OLD = {"thee": "you", "thou": "you", "thy": "your", "thine": "your", "hath": "has", "doth": "does", "saith": "said", "unto": "to",
       "shalt": "shall", "art": "are", "ye": "you"}


def stem(word):
    for suffix in ("ings", "ing", "eth", "est", "ed", "es", "s"):
        if len(word) > 4 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def words(text):
    return [stem(OLD.get(w, w)) for w in re.findall(r"[a-z]+", unicodedata.normalize("NFKD", text).lower()) if OLD.get(w, w) not in STOP]


def similarity(a, b):
    A, B = words(a), words(b)
    if not A or not B:
        return 0.0
    sa, sb = set(A), set(B)
    return 0.6 * (2 * len(sa & sb) / (len(sa) + len(sb))) + 0.4 * SequenceMatcher(None, A, B, autojunk=False).ratio()


def verse(book, ch, v):
    chapters = T.get(book, [])
    if 1 <= ch <= len(chapters) and 0 < v < len(chapters[ch - 1]):
        return chapters[ch - 1][v] or ""
    return ""


def book_for(osb_book, ch):
    # The OSB prints Susanna and Bel within Daniel and the Prayer of Manasseh after 2 Chronicles.
    return {"SUS": "SUS", "BEL": "BEL"}.get(osb_book, osb_book)


notes = data.get("sourceNotes", {})
reviewed = {k: v for k, v in (data.get("alignment") or {}).get("notes", {}).items()
            if (data["alignment"].get("evidence", {}).get(k, {}).get("method") == "user-reviewed")}
decisions = {}
strong = defaultdict(list)  # (book, chapter) -> [(verse, offset)]
for key, note in notes.items():
    book, ch, v = key.split(":")
    ch, v = int(ch), int(v)
    book = book_for(book, ch)
    text = note.get("sourceVerse", "")
    same = verse(book, ch, v)
    # Candidates: verses within 12 of the reference, and the edges of neighbouring chapters.
    candidates = {}
    chapters = T.get(book, [])
    for c in (ch - 1, ch, ch + 1):
        if not 1 <= c <= len(chapters):
            continue
        count = len(chapters[c - 1]) - 1
        for n in range(1, count + 1):
            near = abs(n - v) <= 12 if c == ch else (n <= 4 if c == ch + 1 else n > count - 4)
            t = verse(book, c, n) if near else ""
            if t:
                candidates[(c, n)] = similarity(text, t) if text else 0.0
    zero = candidates.get((ch, v), 0.0) if same else None
    best = max(candidates.items(), key=lambda item: item[1], default=(None, 0.0))
    if same and (best[0] == (ch, v) or zero >= best[1] - 0.05):
        decisions[key] = {"target": f"{book}:{ch}:{v}", "method": "number-and-text", "score": round(zero, 3)}
        if zero >= 0.3:
            strong[(book, ch)].append((v, 0))
    elif best[0] and best[1] >= 0.3 and best[1] - (zero or 0) >= 0.15:
        c, n = best[0]
        decisions[key] = {"target": f"{book}:{c}:{n}", "method": "nearby-text", "score": round(best[1], 3)}
        if c == ch:
            strong[(book, ch)].append((v, n - v))
    else:
        decisions[key] = {"pending": True, "book": book, "ch": ch, "v": v, "same": bool(same), "score": round(zero or 0, 3)}

# Weak notes follow the offset of the nearest confident note in the chapter.
for key, d in decisions.items():
    if not d.get("pending"):
        continue
    book, ch, v = d["book"], d["ch"], d["v"]
    near = sorted(strong.get((book, ch), []), key=lambda item: abs(item[0] - v))
    offset = near[0][1] if near and abs(near[0][0] - v) <= 6 else 0
    target = f"{book}:{ch}:{v + offset}" if verse(book, ch, v + offset) else (f"{book}:{ch}:{v}" if d["same"] else None)
    # A fallback is kept only when the target verse shares some wording; otherwise the note stays browsable.
    if target:
        b2, c2, v2 = target.split(":")
        fit = similarity(notes[key].get("sourceVerse", ""), verse(b2, int(c2), int(v2)))
        target = target if fit >= 0.12 else None
    decisions[key] = {"target": target, "method": "chapter-offset" if offset else "number", "score": round(fit, 3)} if target else {"target": None}

alignment = {"edition": bible["edition"], "version": 1, "notes": {}, "verses": {}, "evidence": {}, "candidates": {}}
for key, d in decisions.items():
    if d.get("target"):
        alignment["notes"][key] = d["target"]
        alignment["verses"][key] = d["target"]
        alignment["evidence"][key] = {"method": d["method"], "score": d["score"]}
for key, target in reviewed.items():
    alignment["notes"][key] = alignment["verses"][key] = target
    alignment["evidence"][key] = {"method": "user-reviewed", "score": 1}
data["alignment"] = alignment

# ----- Section headings -----
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
TOKEN = re.compile(r'<p[^>]*align="center"><a filepos=\d+><font size="6"><font color="#0000ff">(?P<title>[^<]+)</font></font></a></p>'
                   r'|<p[^>]*align="center">(?:<font size="\d">)?<b>(?P<heading>.*?)</b>'
                   r'|<sup><small>(?:<a filepos=\d+>)?<font size="1">(?:<font color="#0000ff">)?(?P<verse>\d+)<', re.S)


def plain(fragment):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", fragment)).replace("&amp;", "&").strip()


def place(book, ch, v, text):
    """Map an OSB verse to this edition's verse using number and text, like the notes."""
    if book in ("MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT",
                "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV"):
        return f"{book}:{ch}:{v}" if verse(book, ch, v) else None
    best, best_score, zero = None, 0.0, None
    for n in range(max(1, v - 4), v + 5):
        t = verse(book, ch, n)
        if t:
            score = similarity(text, t)
            if n == v:
                zero = score
            if score > best_score:
                best, best_score = n, score
    if zero is not None and zero >= best_score - 0.05:
        return f"{book}:{ch}:{v}"
    if best and best_score >= 0.3:
        return f"{book}:{ch}:{best}"
    return f"{book}:{ch}:{v}" if zero is not None else None


if mobi_html:
    raw = mobi_html.read_text(encoding="utf-8", errors="replace")
    headings, current, pending = defaultdict(list), None, []
    tokens = list(TOKEN.finditer(raw))
    for i, m in enumerate(tokens):
        if m.group("title"):
            title = m.group("title").strip()
            name = re.match(r"(.+?)\s+(\d+)(?:\s*\(.*\))?$", title)
            if title in ("Susanna", "Bel and the Serpent"):
                current = ("SUS" if title == "Susanna" else "BEL", 1)
            elif name and name.group(1) in NAMES:
                book, ch = NAMES[name.group(1)], int(name.group(2))
                current = ("PS2", 1) if book == "PSA" and ch == 151 else (book, ch)
            else:
                current = None  # introductions, annotations, articles
            pending = []
        elif m.group("heading") and current:
            text = plain(m.group("heading"))
            if text and len(text) <= 90:
                pending.append(text)
        elif m.group("verse") and current and pending:
            v = int(m.group("verse"))
            end = tokens[i + 1].start() if i + 1 < len(tokens) else m.end() + 400
            target = place(current[0], current[1], v, plain(raw[m.end():end]))
            if target:
                headings[target].extend(pending)
            pending = []
    data["headings"] = dict(headings)

methods = defaultdict(int)
for e in alignment["evidence"].values():
    methods[e["method"]] += 1
output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
print(json.dumps({"headings": sum(len(h) for h in data.get("headings", {}).values()), "sourceNotes": len(notes), "pinned": len(alignment["notes"]), "unpinned": len(notes) - len(alignment["notes"]),
                  "methods": methods, "outputBytes": output.stat().st_size}))
