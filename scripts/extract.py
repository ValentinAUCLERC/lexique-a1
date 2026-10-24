"""Extrait le tableau du PDF Lexique Talents A1 vers data/raw.json."""
import json
import re
import sys
from collections import Counter

import pdfplumber

PDF = sys.argv[1]
OUT = "data/raw.json"
KEYS = ["fr", "en", "es", "de", "zh", "unit", "lesson"]


def clean(cell: str) -> str:
    cell = (cell or "").replace("\n", " ")
    # césures du PDF : "Partner-schaft" / "fonction- ner"
    cell = re.sub(r"(\w)- (\w)", r"\1\2", cell)
    cell = re.sub(r"\s+", " ", cell).strip()
    return cell


rows = []
with pdfplumber.open(PDF) as pdf:
    for page in pdf.pages:
        for table in page.extract_tables():
            for raw in table:
                cells = [clean(c) for c in raw]
                if len(cells) != 7 or cells[0] in ("Français", ""):
                    if cells and cells[0] not in ("Français",):
                        print("SKIP", page.page_number, cells, file=sys.stderr)
                    continue
                rows.append(dict(zip(KEYS, cells)))

# Chinois : supprimer les espaces parasites introduits par les retours ligne
for r in rows:
    r["zh"] = re.sub(r"\s+", "", r["zh"])

for i, r in enumerate(rows, 1):
    r["id"] = i

json.dump(rows, open(OUT, "w"), ensure_ascii=False, indent=1)
print(len(rows), "entrées")
print(Counter(r["unit"] for r in rows))
print(Counter(r["lesson"] for r in rows))
