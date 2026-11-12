"""English/LXX2012 reference -> OSB edition reference maps, built by text alignment (see osb_align.py)."""
import json
from collections import Counter, defaultdict
from osb_align import Corpus, align_book


def load_js(path):
    return json.loads(open(path, encoding="utf-8").read().split("=", 1)[1].rstrip(";\n"))


class Maps:
    def __init__(self, edition, public_dir, katameros_db=None, book_ids=None):
        self.E = edition
        self.web = load_js(f"{public_dir}/legacy-web-data.js")["t"]      # English numbering, Hebrew-based text
        self.lxx = load_js(f"{public_dir}/bible-data.js")["t"]            # LXX2012 numbering, Septuagint-based text
        self.kat = {}                                                      # the lectionary's own English Bible and numbering
        if katameros_db:
            import sqlite3
            rows = sqlite3.connect(katameros_db).execute("select BookId, Chapter, Number, Text from Verses where BibleId = 2").fetchall()
            for book_id, chapter, number, text in rows:
                book = (book_ids or {}).get(book_id)
                if not book:
                    continue
                chapters = self.kat.setdefault(book, [])
                while len(chapters) < chapter:
                    chapters.append([""])
                verses = chapters[chapter - 1]
                while len(verses) <= number:
                    verses.append("")
                verses[number] = text
        self.sources = {"web": self.web, "lxx": self.lxx, "kat": self.kat}
        self.cache = {}

    def osb_verses(self, books):
        return [((b, ci + 1, vi + 1), text.replace("\n", " ")) for b in books
                for ci, ch in enumerate(self.E["books"][b]) for vi, (label, text) in enumerate(ch["verses"])]

    def source_verses(self, source, book):
        return [((book, ci + 1, v), text) for ci, ch in enumerate(source[book]) for v, text in enumerate(ch) if v and text]

    def align(self, kind, book, targets):
        """kind: 'web' or 'lxx'. Returns {(ch, v): (osb_book, ch, pos, similarity)}."""
        key = (kind, book, tuple(targets))
        if key not in self.cache:
            source = self.sources[kind]
            corpus = Corpus(self.osb_verses(targets))
            result = align_book(self.source_verses(source, book), corpus)
            self.cache[key] = {(ref[1], ref[2]): (*corpus.refs[j], round(sim, 3)) for ref, j, sim in result}
        return self.cache[key]

    def corpus(self, books):
        key = ("corpus", tuple(books))
        if key not in self.cache:
            self.cache[key] = Corpus(self.osb_verses(books))
        return self.cache[key]

    def refs_in_order(self, books):
        key = ("order", tuple(books))
        if key not in self.cache:
            self.cache[key] = [ref for ref, _ in self.osb_verses(books)]
        return self.cache[key]

    def order(self, books):
        key = ("index", tuple(books))
        if key not in self.cache:
            self.cache[key] = {ref: i for i, ref in enumerate(self.refs_in_order(books))}
        return self.cache[key]

    def text(self, ref):
        b, c, p = ref[:3]
        return self.E["books"][b][c - 1]["verses"][p - 1][1]

    def exists(self, b, c, p):
        try:
            return 1 <= p <= len(self.E["books"][b][c - 1]["verses"])
        except (KeyError, IndexError):
            return False


TARGETS = {"DAN": ["SUS", "DAN", "BEL"], "DAG": ["SUS", "DAN", "BEL"], "ESG": ["EST"], "PS2": ["PSA"]}


def targets_for(book):
    return TARGETS.get(book, [book])


def psalm_to_lxx2012(chapter, verse):
    """English Psalm reference -> the bundled LXX2012's numbering (as the main Reader uses it)."""
    if chapter <= 9:
        return chapter, verse
    if chapter == 10:
        return 9, 20 + verse
    if chapter <= 146:
        return chapter - 1, verse
    if chapter == 147:
        return (146, verse) if verse <= 11 else (147, verse - 11)
    return chapter, verse


class PsalmMap:
    """English Psalm verse -> OSB Psalm verse.

    The chapter comes from aligning the bundled LXX2012 Psalms to the OSB; within a Psalm the OSB counts a
    long superscription as one or two verses, so each Psalm segment has a constant verse offset.
    """

    def __init__(self, maps):
        self.maps = maps
        self.aligned = maps.align("lxx", "PSA", ["PSA"])
        groups = defaultdict(list)
        for (c, v), (b, oc, op, sim) in self.aligned.items():
            groups[(c, oc)].append(op - v)
        self.offset = {key: Counter(offs).most_common(1)[0][0] for key, offs in groups.items()}
        self.web = maps.align("web", "PSA", ["PSA"])
        self.kat = maps.align("kat", "PSA", ["PSA"]) if "PSA" in maps.kat else {}

    def to_osb(self, chapter, verse):
        if chapter == 151:
            return ("PSA", 151, verse)
        c2, v2 = psalm_to_lxx2012(chapter, verse)
        hit = self.aligned.get((c2, v2))
        if not hit:
            return None
        oc = hit[1]
        pos = v2 + self.offset[(c2, oc)]
        if not self.maps.exists("PSA", oc, pos):
            pos = hit[2]
        return ("PSA", oc, pos)
