#!/usr/bin/env python3
"""Extract English Synaxarium commemoration titles (titles only) by Coptic month and day from the
open-source Katameros database (github.com/pierresaid/katameros-api, MIT): Core/KatamerosDatabase.db.
Usage: python3 scripts/extract_synaxarium.py /path/to/KatamerosDatabase.db data/synaxarium.json
"""
import json, sqlite3, sys
db, out = sys.argv[1:3]
rows = sqlite3.connect(db).execute('select Month, Day, Title from Synaxarium where LanguageId = 2 order by Month, Day, "Order"').fetchall()
titles = {}
for month, day, title in rows:
    titles.setdefault(f"{month}-{day}", []).append(" ".join(title.split()))
json.dump(titles, open(out, "w"), ensure_ascii=False, indent=0)
print(f"{len(titles)} days, {len(rows)} commemorations -> {out}")
