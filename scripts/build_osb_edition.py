#!/usr/bin/env python3
"""Build the OSB text edition of Reader from the private extraction.

Usage:
  python3 scripts/build_osb_edition.py <osb-edition.json> <earlier-private-osb.json> <public-reader-dir> <private-build-dir>

Private outputs (never commit): <private-build-dir>/bible.json and study.json (encrypt with encrypt_osb_edition.mjs).
Public outputs in this repo (reference numbers only, no Bible text): katameros-data.js, wisdom-data.js.
Prints a verification report (numbers only).
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from osb_maps import Maps, PsalmMap, targets_for  # noqa: E402
from osb_align import Corpus  # noqa: E402
import wisdom_topics  # noqa: E402

edition_path, earlier_path, public_dir, build_dir = sys.argv[1:5]
katameros_db = sys.argv[5] if len(sys.argv) > 5 else None
root = Path(__file__).resolve().parents[1]
build = Path(build_dir)
if build.resolve().is_relative_to(root):
    raise SystemExit("The private build directory must be outside the repository.")
build.mkdir(parents=True, exist_ok=True)
E = json.load(open(edition_path))
earlier = json.load(open(earlier_path))
KATAMEROS_BOOKS = {1: "GEN", 2: "EXO", 3: "LEV", 4: "NUM", 5: "DEU", 6: "JOS", 7: "JDG", 8: "RUT", 9: "1SA", 10: "2SA", 11: "1KI", 12: "2KI",
                   13: "1CH", 14: "2CH", 15: "EZR", 16: "NEH", 17: "EST", 18: "JOB", 19: "PSA", 20: "PRO", 21: "ECC", 22: "SNG", 23: "ISA",
                   24: "JER", 25: "LAM", 26: "EZK", 27: "DAN", 28: "HOS", 29: "JOL", 30: "AMO", 31: "OBA", 32: "JON", 33: "MIC", 34: "NAM",
                   35: "HAB", 36: "ZEP", 37: "HAG", 38: "ZEC", 39: "MAL", 40: "MAT", 41: "MRK", 42: "LUK", 43: "JHN", 44: "ACT", 45: "ROM",
                   46: "1CO", 47: "2CO", 48: "GAL", 49: "EPH", 50: "PHP", 51: "COL", 52: "1TH", 53: "2TH", 54: "1TI", 55: "2TI", 56: "TIT",
                   57: "PHM", 58: "HEB", 59: "JAS", 60: "1PE", 61: "2PE", 62: "1JN", 63: "2JN", 64: "3JN", 65: "JUD", 66: "REV", 67: "BAR",
                   68: "TOB", 69: "JDT", 70: "1MA", 71: "2MA", 72: "WIS", 73: "SIR", 74: "BEL", 75: "SUS"}
BOOK_NUMBER = {v: k for k, v in KATAMEROS_BOOKS.items()}
maps = Maps(E, public_dir, katameros_db, KATAMEROS_BOOKS)
psalms = PsalmMap(maps)
EDITION = "osb-saas-nkjv-v1"
NT = set("MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV".split())
report = {}

# ---------- 1. Bible text ----------
books, text, labels, preface, headings, inside = [], {}, {}, {}, {}, {}
for b in E["order"]:
    chapters = E["books"][b]
    name = E["names"][b]
    books.append({"id": b, "name": name, "title": name, "n": len(chapters), "translation": "NKJV" if b in NT else "SAAS"})
    text[b] = []
    for ci, ch in enumerate(chapters):
        text[b].append([""] + [v[1] for v in ch["verses"]])
        seq = [v[0] for v in ch["verses"]]
        if seq != [str(i + 1) for i in range(len(seq))]:
            labels[f"{b}:{ci + 1}"] = [""] + seq
        if ch["preface"]:
            preface[f"{b}:{ci + 1}"] = ch["preface"]
        for pos, hs in ch["headings"].items():
            headings[f"{b}:{ci + 1}:{pos}"] = hs
        for pos, items in ch["inside"].items():
            inside[f"{b}:{ci + 1}:{pos}"] = items
bible = {"edition": EDITION, "books": books, "t": text, "labels": labels, "preface": preface, "headings": headings, "inside": inside,
         "spans": {}, "sources": {"ot": "St. Athanasius Academy Septuagint (Orthodox Study Bible)", "nt": "New King James Version (Orthodox Study Bible)"}}
(build / "bible.json").write_text(json.dumps(bible, ensure_ascii=False, separators=(",", ":")))
report["bible"] = {"books": len(books), "chapters": sum(b["n"] for b in books), "verses": sum(len(c) - 1 for t in text.values() for c in t),
                   "headings": sum(len(h) for h in headings.values()) + sum(len(h) for items in inside.values() for _, h in items),
                   "labelledChapters": len(labels)}

# ---------- 2. Study pack: notes on their own verses, introductions, guides, articles ----------
notes = {key: {"kind": "OSB note", "title": key, "body": body, "sourceVerse": "", "see": []} for key, body in E["notes"].items()}
ids = {b["id"] for b in books}
introductions = {b: article for b, article in earlier.get("introductions", {}).items() if b in ids}
for extra in ("SUS", "BEL"):
    if extra not in introductions and "DAN" in introductions:
        introductions[extra] = introductions["DAN"]
guides = list(earlier.get("guides", []))
for article in E["articles"]:
    guides.append({"title": article["title"], "group": "Study articles", "blocks": article["blocks"]})
study = {"version": 3, "edition": EDITION, "source": "Orthodox Study Bible (personal copy)", "notes": {}, "preambles": {},
         "introductions": introductions, "guides": guides, "sourceNotes": notes,
         "alignment": {"edition": EDITION, "version": 1, "notes": {k: k for k in notes}, "verses": {}, "evidence": {}, "candidates": {}}}
(build / "study.json").write_text(json.dumps(study, ensure_ascii=False, separators=(",", ":")))
missing_notes = [k for k in notes if not maps.exists(*[k.split(":")[0], int(k.split(":")[1]), int(k.split(":")[2])])]
report["study"] = {"notes": len(notes), "notesOnMissingVerses": len(missing_notes), "introductions": len(introductions),
                   "booksWithoutIntroduction": sorted(ids - set(introductions)), "guides": len(earlier.get("guides", [])), "articles": len(E["articles"])}

# ---------- 3. Reference maps ----------
psalm_corpus = Corpus(maps.osb_verses(["PSA"]))
psalm_index = {ref: i for i, ref in enumerate(psalm_corpus.refs)}
weak, checked = [], Counter()


def verse_text(source, chapter, verse):
    chapters = source.get("PSA", [])
    return chapters[chapter - 1][verse] if chapter <= len(chapters) and verse < len(chapters[chapter - 1]) else ""


def english_psalm(chapter, verse):
    """English Psalm verse -> OSB. Three witnesses: the verse-offset rule (via LXX2012) and direct text alignment
    of the lectionary's English Bible and of the WEB. The rule wins unless a text match is clearly better."""
    source = verse_text(maps.kat, chapter, verse) or verse_text(maps.web, chapter, verse)
    rule = psalms.to_osb(chapter, verse)
    candidates = [c[:3] for c in (psalms.kat.get((chapter, verse)), psalms.web.get((chapter, verse))) if c]
    if not source:
        return rule or (candidates[0] if candidates else None), 0.0
    bag, norm = psalm_corpus.query(source)
    score = lambda ref: psalm_corpus.sim(bag, norm, psalm_index[ref]) if ref in psalm_index else 0.0
    best = max(candidates, key=score, default=None)
    agreement["psalm witnesses agree" if best == rule else "psalm witnesses differ"] += 1
    if rule and (best is None or score(best) - score(rule) <= 0.15):
        return rule, score(rule)
    return best, score(best)


agreement = Counter()


def english_verse(book, chapter, verse, kind="web"):
    """One English (or LXX2012) reference -> (osb_book, chapter, position), or None."""
    if book in NT:
        checked["nt"] += 1
        return (book, chapter, verse) if maps.exists(book, chapter, verse) else None
    if book == "PSA":
        ref, sim = english_psalm(chapter, verse)
        checked["psalm"] += 1
        if ref and sim < 0.15:
            weak.append(("PSA", chapter, verse, ref[1], ref[2], round(sim, 2)))
        return ref
    if book == "DAN" and chapter == 14:
        return ("BEL", 1, verse) if maps.exists("BEL", 1, verse) else None
    if book == "DAN" and chapter == 13:
        return ("SUS", 1, verse) if maps.exists("SUS", 1, verse) else None
    if kind == "web" and book in maps.kat:
        kind = "kat"
    source = maps.sources[kind]
    if book not in source:
        return None
    hit = maps.align(kind, book, targets_for(book)).get((chapter, verse))
    checked["ot"] += 1
    if not hit:
        return None
    if hit[3] < 0.15:
        weak.append((book, chapter, verse, hit[1], hit[2], hit[3]))
    return hit[:3]


CHAIN_BOOKS = set("GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH NEH JOB PRO ECC SNG ISA LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL".split())


def map_run(book, chapter, verses, kind="web"):
    """A run of verses in one source chapter -> OSB references.

    Confident text matches anchor the run. A weak or far-off match follows its anchors; a weak first or last
    verse is settled by a vote between the aligner, continuity, and (for protocanonical books) the LXX2012
    verse of the same number. A consecutive run then covers every OSB verse between its ends.
    """
    if book in NT or book == "PSA" or (book == "DAN" and chapter in (13, 14)):
        return [english_verse(book, chapter, v, kind) for v in verses]
    if kind == "web" and book in maps.kat:
        kind = "kat"
    if book not in maps.sources[kind]:
        return [None for _ in verses]
    targets = targets_for(book)
    table, order, refs_in_order = maps.align(kind, book, targets), maps.order(targets), maps.refs_in_order(targets)
    hits = [table.get((chapter, v)) for v in verses]
    if any(h is None for h in hits):
        return [h[:3] if h else None for h in hits]
    index = [order[h[:3]] for h in hits]
    sims = [h[3] for h in hits]
    checked["ot"] += len(verses)
    # A confident match far from the run's centre is a coincidence, not an anchor.
    centre = sorted(index)[len(index) // 2]
    anchor = [i for i in range(len(verses)) if sims[i] >= 0.2 and abs(index[i] - centre) <= len(verses) + 12]
    chain = maps.align("lxx", book, targets) if kind != "lxx" and book in CHAIN_BOOKS and book in maps.lxx else {}
    final = list(index)
    for i, v in enumerate(verses):
        if i in anchor:
            continue
        before = max((j for j in anchor if j < i), default=None)
        after = min((j for j in anchor if j > i), default=None)
        if before is None and after is None:
            continue
        if before is not None and after is not None:
            span = index[after] - index[before]
            guess = index[before] + round((i - before) * span / (after - before))
        elif before is not None:
            guess = index[before] + (v - verses[before])
        else:
            guess = index[after] - (verses[after] - v)
        guess = min(max(guess, 0), len(refs_in_order) - 1)
        if i in (0, len(verses) - 1):
            votes = [index[i], guess]
            hit = chain.get((chapter, v))
            if hit and hit[3] >= 0.3 and hit[:3] in order:
                votes.append(order[hit[:3]])
            votes = [x for x in votes if abs(x - centre) <= len(verses) + 12] or [guess]
            top, count = Counter(votes).most_common(1)[0]
            if count >= 2:
                guess = top
            else:
                # No majority: the candidate whose words match best; on a tie, read one verse more rather than less.
                corpus = maps.corpus(targets)
                bag, norm = corpus.query(source_text(book, chapter, v))
                votes = sorted(set(votes), key=lambda x: (round(corpus.sim(bag, norm, x), 2), -x if i == 0 else x), reverse=True)
                guess = votes[0]
                endpoints.append((book, chapter, v, f"{refs_in_order[guess][1]}:{refs_in_order[guess][2]}"))
            # The first verse of a chapter starts the OSB chapter too.
            if i == 0 and v == 1 and refs_in_order[guess][2] <= 3:
                guess = order[(refs_in_order[guess][0], refs_in_order[guess][1], 1)]
        if guess != index[i]:
            smoothed[book] += 1
        final[i] = guess
    consecutive = all(b - a == 1 for a, b in zip(verses, verses[1:]))
    lo, hi = min(final), max(final)
    if consecutive and hi - lo + 1 <= len(verses) + 6 and len({refs_in_order[x][0] for x in (lo, hi)}) == 1:
        if hi - lo + 1 != len(set(final)):
            filled[book] += 1
        final = list(range(lo, hi + 1))
    for i, x in enumerate(final[: len(verses)]):
        if i < len(sims) and sims[i] < 0.15:
            weak.append((book, chapter, verses[i], refs_in_order[x][1], refs_in_order[x][2], sims[i]))
    return [refs_in_order[x] for x in final]


endpoints, filled = [], Counter()
smoothed = Counter()


def group(refs):
    """Ordered (book, chapter, position) list -> [[book, chapter, [positions]]], merging neighbours in one chapter."""
    out = []
    for ref in refs:
        if ref is None:
            continue
        if out and out[-1][0] == ref[0] and out[-1][1] == ref[1]:
            if ref[2] not in out[-1][2]:
                out[-1][2].append(ref[2])
        else:
            out.append([ref[0], ref[1], [ref[2]]])
    return out


# ---------- 4. Katameros in OSB numbering ----------
raw = json.load(open(root / "data" / "katameros-raw.json"))
synaxarium = json.load(open(root / "data" / "synaxarium.json")) if (root / "data" / "synaxarium.json").exists() else {}
unmapped, sets, index, days = [], [], {}, {}


def fix_reference(p):
    span = lambda a, b: list(range(a, b + 1))
    if p["b"] == 27 and p["c"] == 14 and not p["v"]:
        return 27, 14, span(1, 42)
    if p["b"] == 26 and p["c"] == 21 and not p["v"]:
        return 26, 21, span(28, 32)
    return p["b"], p["c"], p["v"]


def split_chapters(book, chapter, verses):
    """The source lists a reading that crosses a chapter break as one run: 20..32, 1..35. Outside the Psalms
    (whose verses may be cited out of order) a falling verse number starts the next chapter."""
    runs = [(chapter, [])]
    for v in verses:
        if book != "PSA" and runs[-1][1] and v < runs[-1][1][-1]:
            runs.append((runs[-1][0] + 1, []))
            stats_split[book] += 1
        runs[-1][1].append(v)
    return runs


stats_split = Counter()
range_checks = {}
from osb_align import tokens  # noqa: E402


def source_text(book, chapter, verse):
    for source in (maps.kat, maps.web, maps.lxx):
        chapters = source.get(book)
        if chapters and chapter <= len(chapters) and verse < len(chapters[chapter - 1]) and chapters[chapter - 1][verse]:
            return chapters[chapter - 1][verse]
    return ""


def check_range(book, chapter, run, refs):
    """Whole-passage check: the words of the cited passage and of the OSB verses chosen for it must overlap."""
    key = (book, chapter, tuple(run))
    if key in range_checks or book in NT:
        return
    a = set(tokens(" ".join(source_text(book, chapter, v) for v in run)))
    targets = list(dict.fromkeys(r for r in refs if r))
    b = set(tokens(" ".join(maps.text(r) for r in targets)))
    order = maps.order(targets_for(book) if book != "PSA" else ["PSA"])
    idx = [order[r] for r in targets if r in order]
    contiguous = all(0 <= y - x <= 1 for x, y in zip(idx, idx[1:])) if book != "PSA" else True
    range_checks[key] = {"overlap": round(len(a & b) / max(1, min(len(a), len(b))), 2), "contiguous": contiguous,
                         "to": [f"{targets[0][0]} {targets[0][1]}:{targets[0][2]}", f"{targets[-1][0]} {targets[-1][1]}:{targets[-1][2]}"] if targets else [],
                         "verses": len(run), "targets": len(targets)}


def convert_passage(p):
    b, c, verses = fix_reference(p)
    book = KATAMEROS_BOOKS.get(b)
    out = []
    for chapter, run in split_chapters(book, c, verses) if book else []:
        refs = map_run(book, chapter, run)
        check_range(book, chapter, run, refs)
        for v, ref in zip(run, refs):
            if ref is None:
                unmapped.append((book, chapter, v))
        out += [[BOOK_NUMBER[g[0]], g[1], g[2]] + ([chapter] if book == "PSA" and g[1] != chapter else []) for g in group(refs)]
    return out


for key in sorted(raw):
    day = raw[key]
    # The app shows the Liturgy, or on days without one (Holy Week) the hours: keep only what is shown.
    shown = [s for s in day["sections"] if s["title"] == "Liturgy"] or day["sections"]
    converted = [[section["title"], [[sub["title"], [[q for p in reading for q in convert_passage(p)] for reading in sub["readings"]]]
                                     for sub in section["subs"]]] for section in shown]
    ident = json.dumps(converted)
    if ident not in index:
        index[ident] = len(sets)
        sets.append(converted)
    days[key] = [index[ident], day["coptic"], day.get("title") or "", day.get("period") or ""]
keys = sorted(days)
data = {"source": "Coptic Orthodox Katameros via the open-source Katameros project (github.com/pierresaid/katameros-api, MIT). "
                  "References only, converted to Orthodox Study Bible numbering.",
        "edition": EDITION, "from": keys[0], "to": keys[-1], "sets": sets, "days": days, "synaxarium": synaxarium}
(root / "katameros-data.js").write_text("// Generated by scripts/build_osb_edition.py. Do not edit by hand.\nwindow.KATAMEROS=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
report["katameros"] = {"days": len(days), "sets": len(sets), "versesChecked": dict(checked), "unmapped": sorted(set(unmapped))[:20],
                       "unmappedCount": len(set(unmapped)), "weakMatches": len(set(weak)), "psalmWitnesses": dict(agreement),
                       "chapterBreaksRepaired": dict(stats_split), "smoothedByNeighbours": dict(smoothed),
                       "gapsFilled": dict(filled), "endpointsDecidedByWording": sorted(set(endpoints))}
ot_checks = {k: v for k, v in range_checks.items() if k[0] != "PSA"}
ps_checks = {k: v for k, v in range_checks.items() if k[0] == "PSA"}
report["katameros"]["otPassages"] = {"total": len(ot_checks), "contiguous": sum(v["contiguous"] for v in ot_checks.values()),
                                     "overlapBelow40": sorted((f"{k[0]} {k[1]}:{k[2][0]}-{k[2][-1]}", v["overlap"], v["to"]) for k, v in ot_checks.items() if v["overlap"] < 0.4),
                                     "notContiguous": sorted((f"{k[0]} {k[1]}:{k[2][0]}-{k[2][-1]}", v["overlap"], v["to"], v["verses"], v["targets"]) for k, v in ot_checks.items() if not v["contiguous"])}
report["katameros"]["psalmPassages"] = {"total": len(ps_checks),
                                        "overlapBelow40": sorted((f"PSA {k[1]}:{','.join(map(str, k[2]))}", v["overlap"], v["to"]) for k, v in ps_checks.items() if v["overlap"] < 0.4)}
katameros_weak = sorted(set(weak))
weak.clear(); checked.clear()

# ---------- 5. Wisdom topics in OSB numbering ----------
SPECIAL = {("JER", 29): 36}  # the bundled LXX2012 keeps the Septuagint chapter order in Jeremiah
wisdom, lost = [], []
for label, topics in wisdom_topics.CATEGORIES:
    category = {"label": label, "topics": []}
    for tid, title, tags, refs in topics:
        out = []
        for ref in refs:
            m = re.match(r"([1-3]?[A-Z]{2,3}) (\d+):(\d+)(?:-(\d+))?$", ref)
            book, ch, start, end = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4) or m.group(3))
            if book not in NT and book != "PSA" and (book, ch) in SPECIAL:
                ch = SPECIAL[(book, ch)]
            mapped = map_run(book, ch, list(range(start, end + 1)), "lxx")
            if any(r is None for r in mapped):
                lost.append(ref)
                continue
            if book not in NT:
                src = maps.lxx if book != "PSA" else None
                words = set(tokens(" ".join((src[book][ch - 1][v] if src else source_text(book, ch, v)) for v in range(start, end + 1))))
                found = set(tokens(" ".join(maps.text(r) for r in dict.fromkeys(mapped))))
                overlap = len(words & found) / max(1, min(len(words), len(found)))
                if overlap < 0.3:
                    lost.append(f"{ref} (overlap {overlap:.2f})")
                    continue
            for g in group(mapped):
                run = [g[2][0], g[2][0]]
                pieces = [run]
                for pos in g[2][1:]:
                    if pos == run[1] + 1:
                        run[1] = pos
                    else:
                        run = [pos, pos]; pieces.append(run)
                for a, b in pieces:
                    out.append([g[0], g[1], a] if a == b else [g[0], g[1], a, b])
        category["topics"].append({"id": tid, "title": title, "tags": tags, "refs": out})
    wisdom.append(category)
lines = ["// Wisdom: Scripture passages by topic, in Orthodox Study Bible numbering. Generated by scripts/build_osb_edition.py.",
         "// Curated reference lists only; no commentary. tags are search keywords.", "window.WISDOM = {categories: ["]
for c in wisdom:
    lines.append(f"  {{label: {json.dumps(c['label'])}, topics: [")
    for t in c["topics"]:
        lines.append(f"    {{id: {json.dumps(t['id'])}, title: {json.dumps(t['title'], ensure_ascii=False)}, tags: {json.dumps(t['tags'])}, refs: {json.dumps(t['refs'])}}},")
    lines.append("  ]},")
lines.append("]};")
(root / "wisdom-data.js").write_text("\n".join(lines) + "\n")
report["wisdom"] = {"topics": sum(len(c["topics"]) for c in wisdom), "refs": sum(len(t["refs"]) for c in wisdom for t in c["topics"]),
                    "versesChecked": dict(checked), "lost": lost, "weakMatches": len(set(weak))}
(build / "weak-matches.json").write_text(json.dumps({"katameros": katameros_weak, "wisdom": sorted(set(weak))}))
print(json.dumps(report, indent=1))
