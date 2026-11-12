"""Verse alignment between an English-numbered Bible text (WEB) and the OSB edition's own numbering.

The lectionary, Wisdom topics, and English Psalm references use English (Hebrew-based) numbering; the OSB
follows the Septuagint. align_book() maps every English verse to an OSB verse by wording, preferring runs
of consecutive verses, so chapter and verse shifts are found from the text itself.
"""
import math
import re
import unicodedata
from collections import Counter, defaultdict

STOP = set("the and of to in a that is for with he his shall be it they them all as was on from but by not you your i my me him her "
           "their we us our o will have has had who which this these those were are when then there so do did said say an at or if "
           "out up into upon unto also now shall may let one".split())
SAME = {"thee": "you", "thou": "you", "thy": "your", "thine": "your", "hath": "has", "doth": "does", "saith": "said", "ye": "you",
        "yahweh": "lord", "jehovah": "lord", "behold": "look"}


def stem(word):
    for suffix in ("ings", "ing", "eth", "est", "ed", "es", "s"):
        if len(word) > 4 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def tokens(text):
    words = re.findall(r"[a-z]+", unicodedata.normalize("NFKD", text).lower())
    return [stem(SAME.get(w, w)) for w in words if SAME.get(w, w) not in STOP]


class Corpus:
    """OSB verses of one or more books, in reading order, with an inverted index."""

    def __init__(self, verses):
        self.refs = [ref for ref, _ in verses]
        self.bags = [Counter(tokens(text)) for _, text in verses]
        df = Counter(w for bag in self.bags for w in bag)
        n = max(1, len(self.bags))
        self.idf = defaultdict(lambda: math.log(n + 1), {w: math.log((n + 1) / (c + 0.5)) for w, c in df.items()})
        self.norm = [math.sqrt(sum((self.idf[w]) ** 2 for w in bag)) or 1.0 for bag in self.bags]
        self.index = defaultdict(list)
        for i, bag in enumerate(self.bags):
            for w in bag:
                self.index[w].append(i)

    def sim(self, bag, norm, j):
        other = self.bags[j]
        shared = sum(self.idf[w] ** 2 for w in bag if w in other)
        return shared / (norm * self.norm[j])

    def query(self, text):
        bag = Counter(tokens(text))
        return bag, math.sqrt(sum(self.idf[w] ** 2 for w in bag)) or 1.0

    def top(self, bag, norm, k=6):
        scores = Counter()
        for w in bag:
            postings = self.index.get(w, ())
            if len(postings) <= 400:
                for j in postings:
                    scores[j] += self.idf[w] ** 2
        return [j for j, _ in sorted(((j, s / (norm * self.norm[j])) for j, s in scores.items()), key=lambda x: -x[1])[:k]]


def align_book(english, corpus, stay=0.22, jump=0.30, keep=14):
    """english: [(ref, text)] in English order. Returns [(ref, osb_index or None, similarity)]."""
    if not corpus.refs:
        return [(ref, None, 0.0) for ref, _ in english]
    previous = {}  # osb index -> (score, backpointer path id)
    history = []
    queries = [corpus.query(text) for _, text in english]
    for i, (bag, norm) in enumerate(queries):
        candidates = set(corpus.top(bag, norm))
        for j in previous:
            for step in (0, 1, 2):
                if j + step < len(corpus.refs):
                    candidates.add(j + step)
        if not candidates:
            candidates = {0}
        current = {}
        for j in candidates:
            emit = corpus.sim(bag, norm, j)
            best, back = emit, None
            for pj, (pscore, _) in previous.items():
                move = stay if j == pj + 1 else stay * 0.5 if j in (pj, pj + 2) else -jump
                if pscore + emit + move > best:
                    best, back = pscore + emit + move, pj
            current[j] = (best, back)
        # keep the strongest states only
        current = dict(sorted(current.items(), key=lambda item: -item[1][0])[:keep])
        history.append(current)
        previous = current
    # backtrack
    result = [None] * len(english)
    j = max(previous, key=lambda state: previous[state][0])
    for i in range(len(english) - 1, -1, -1):
        result[i] = j
        back = history[i][j][1]
        if back is None and i > 0:
            back = max(history[i - 1], key=lambda state: history[i - 1][state][0])
        j = back if back is not None else j
    out = []
    for (ref, _), (bag, norm), j in zip(english, queries, result):
        out.append((ref, j, corpus.sim(bag, norm, j)))
    return out
