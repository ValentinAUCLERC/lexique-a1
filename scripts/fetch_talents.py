"""Télécharge les audios Talents A1 (vocabulaire + évaluation) depuis la Wayback Machine.

Le site éditeur (talents.cle-international.com) est hors service : on passe par web.archive.org
en mode `id_` (fichier brut, sans la barre d'archive). Idempotent : saute les fichiers déjà présents.
Usage : .venv/bin/python scripts/fetch_talents.py
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "data/talents/catalog.json")
OUT = os.path.join(ROOT, "data/talents/audio")
BASE = "https://talents.cle-international.com"
WB = "https://web.archive.org/web/2026id_/"
UA = {"User-Agent": "Mozilla/5.0 (lexique-a1 personal study tool)"}

os.makedirs(OUT, exist_ok=True)
catalog = json.load(open(CATALOG))
manifest_path = os.path.join(OUT, "manifest.json")
manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}

todo = []
for u in catalog:
    for it in u["items"]:
        if it.get("audio"):
            todo.append(it["audio"])

print(f"{len(todo)} audios au catalogue, {len(manifest)} déjà récupérés")
fails = []
for path in todo:
    slug = path.split("/assets/")[1].split("/")[0]
    if slug in manifest and os.path.exists(os.path.join(OUT, manifest[slug]["file"])):
        continue
    url = WB + BASE + path
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                body = r.read()
                cd = r.headers.get("Content-Disposition", "")
                ctype = r.headers.get("Content-Type", "")
                final = r.geturl()
            m = re.search(r'filename="?([^";]+)', cd)
            name = m.group(1) if m else slug + ".mp3"
            if body[:15].lower().startswith((b"<!doctype", b"<html")) or "text/html" in ctype:
                raise RuntimeError(f"page HTML au lieu d'un audio (type={ctype})")
            fname = f"{slug}.mp3"
            with open(os.path.join(OUT, fname), "wb") as f:
                f.write(body)
            dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                  os.path.join(OUT, fname)], capture_output=True, text=True).stdout.strip()
            if not dur or float(dur) < 2:
                raise RuntimeError(f"audio illisible (durée={dur!r})")
            ts = re.search(r"/web/(\d{14})id_/", final)
            manifest[slug] = {"file": fname, "original_name": name, "bytes": len(body), "duration": round(float(dur), 1),
                              "wayback": ts.group(1) if ts else None}
            json.dump(manifest, open(manifest_path, "w"), ensure_ascii=False, indent=1)
            print(f"ok  {name:40s} {len(body)//1024:5d} Ko  ({slug})", flush=True)
            break
        except Exception as e:
            print(f"..  {slug} tentative {attempt+1}: {e}", flush=True)
            time.sleep(5 * (attempt + 1))
    else:
        fails.append(slug)
    time.sleep(1.5)  # rester poli avec archive.org

print(f"Terminé : {len(manifest)} fichiers, {len(fails)} échecs {fails}")
sys.exit(1 if fails else 0)
