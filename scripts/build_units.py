"""Relie les mots du lexique aux enregistrements « Audio - Vocabulaire » de l'éditeur.

Pour chaque mot (unité U, leçon L), cherche son passage dans la transcription Whisper de l'audio
de vocabulaire de la même leçon, puis découpe un extrait MP3 -> site/talents/clips/<id>.mp3.
Écrit aussi site/units.js (structure des unités pour le site).

Usage : .venv/bin/python scripts/build_units.py
"""
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.path.join(ROOT, "data/talents")
SITE = os.path.join(ROOT, "site")
CLIPS = os.path.join(SITE, "talents/clips")
SITE_AUDIO = os.path.join(SITE, "talents/audio")
WB = "https://web.archive.org/web/2024/https://talents.cle-international.com"
MIN_SCORE = 0.78

catalog = json.load(open(os.path.join(T, "catalog.json")))
titles = json.load(open(os.path.join(T, "titles.json")))
manifest = json.load(open(os.path.join(T, "audio/manifest.json")))
src = open(os.path.join(SITE, "words.js"), encoding="utf-8").read()
words = json.loads(src[src.index("=") + 1:].rstrip().rstrip(";"))

STOP = {"le", "la", "les", "l", "un", "une", "de", "d", "du", "des", "se", "s"}


def norm_tokens(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("œ", "oe").replace("’", "'")
    s = re.sub(r"\(.*?\)", " ", s)
    toks = [t for t in re.split(r"[^a-z0-9]+", s) if t]
    return toks


def content(toks):
    return [t for t in toks if t not in STOP] or toks


def fine_score(tts, segs, i, j):
    """Similarité accents compris, sans retirer « là » etc. (départage des ex aequo)."""
    if i is None:
        return 0
    clean = lambda s: re.sub(r"[^\w' -]", "", s.lower().replace("’", "'")).strip()
    a = re.sub(r"^(le|la|les|l'|un|une) ?", "", clean(tts))
    b = clean(" ".join(x["text"] for x in segs[i:j]))
    return difflib.SequenceMatcher(None, a, b).ratio()


def lesson_key(title):
    m = re.match(r"\s*Le[cç]on\s+(\d)", title)
    if m:
        return "L" + m.group(1)
    if title.lower().startswith("projet"):
        return "Pr"
    return None


# ---------- structure ----------
units = []
for u in catalog[:10]:
    n = int(re.search(r"\d+", u["title"]).group())
    lessons, evals, exercises = [], [], []
    for it in u["items"]:
        cat = (it.get("cat") or [""])[0]
        if cat == "Audio - Vocabulaire":
            slug = it["audio"].split("/assets/")[1].split("/")[0]
            lessons.append({"key": lesson_key(it["title"]), "slug": slug, "titleFr": titles["lessons"][slug]["fr"],
                            "titleZh": titles["lessons"][slug]["zh"]})
        elif cat == "Audio - Évaluation":
            slug = it["audio"].split("/assets/")[1].split("/")[0]
            evals.append({"slug": slug, "title": it["title"]})
        elif cat == "Exercices interactifs":
            m = re.match(r"Unité\s*(\d+)\s*-\s*Le[cç]on\s*(\d)\s*-\s*(.+)", re.sub(r"\s+", " ", it["title"]).strip())
            typ = m.group(3).strip().capitalize() if m else it["title"]
            typ = {"Compréhension écrite": "Compréhension écrite"}.get(typ, typ)
            exercises.append({"lesson": "L" + m.group(2) if m else None, "type": typ,
                              "typeZh": titles["exercise_types"].get(typ, ""),
                              "url": WB + it["links"][0]})
    units.append({"n": n, "titleFr": titles["units"][str(n)]["fr"], "titleZh": titles["units"][str(n)]["zh"],
                  "lessons": lessons, "evals": evals, "exercises": exercises})

# ---------- audio : copie dans le site + transcription ----------
os.makedirs(SITE_AUDIO, exist_ok=True)
os.makedirs(CLIPS, exist_ok=True)


def transcript(slug):
    p = os.path.join(T, "transcripts", slug + ".json")
    return json.load(open(p)) if os.path.exists(p) else None


for un in units:
    for item in un["lessons"] + un["evals"]:
        meta = manifest.get(item["slug"])
        if not meta:
            item["audio"] = None
            continue
        dst = os.path.join(SITE_AUDIO, meta["file"])
        if not os.path.exists(dst):
            shutil.copy(os.path.join(T, "audio", meta["file"]), dst)
        item["audio"] = "talents/audio/" + meta["file"]
        item["duration"] = meta.get("duration")
        tr = transcript(item["slug"])
        item["transcript"] = [{"s": s["start"], "e": s["end"], "t": s["text"]} for s in tr["segments"]] if tr else None

# ---------- alignement mot du lexique <-> passage de l'audio ----------
by_ul = {}
for w in words:
    by_ul.setdefault((w["unit"], w["lesson"]), []).append(w)

for w in words:  # repartir de zéro à chaque build (words.js est réécrit)
    for k in ("native", "nativeScore", "nativeHeard"):
        w.pop(k, None)

stats = {"matched": 0, "total": 0, "nolesson": 0}
report = []
for un in units:
    for les in un["lessons"]:
        cands = by_ul.get((un["n"], les["key"]), [])
        tr = transcript(les["slug"])
        if not tr:
            continue
        # segments = un mot / une expression chacun (découpage sur les silences)
        segs = [x for x in tr["segments"] if x["text"].strip()]
        # ignorer l'annonce « Unité N. Leçon N. Vocabulaire. » (et seulement elle :
        # « unité », « leçon », « vocabulaire » sont aussi des mots du lexique U0)
        skip = 0
        if segs and re.match(r"\s*unit[ée]", segs[0]["text"], re.I):
            for i, x in enumerate(segs[:4]):
                if re.search(r"vocabulaire", x["text"], re.I):
                    skip = i + 1
                    break
        segs = segs[skip:]
        stoks = [" ".join(content(norm_tokens(x["text"]))) for x in segs]
        scored = []
        for w in cands:
            stats["total"] += 1
            tgt = " ".join(content(norm_tokens(w["tts"])))
            best = (0, None, None)
            for L in (1, 2, 3):
                for i in range(0, max(0, len(segs) - L + 1)):
                    r = difflib.SequenceMatcher(None, tgt, " ".join(stoks[i:i + L])).ratio()
                    r -= 0.03 * (L - 1)  # à score égal, préférer un seul segment
                    if r > best[0]:
                        best = (r, i, i + L)
            scored.append((best[0], fine_score(w["tts"], segs, best[1], best[2]), w, best[1], best[2]))
        # affectation gloutonne sans chevauchement, meilleurs scores d'abord
        # (départage avec accents : « la pâte » vs « le pâté », « bas » vs « là-bas »)
        used = set()
        for score, _fine, w, i, j in sorted(scored, key=lambda x: (-x[0], -x[1])):
            if score < MIN_SCORE or i is None or any(k in used for k in range(i, j)):
                report.append((un["n"], les["key"], w["id"], w["tts"], round(score, 2),
                               segs[i]["text"] if i is not None else None))
                continue
            used.update(range(i, j))
            # bornes : marge, sans déborder sur les segments voisins
            start = segs[i]["start"] - 0.25
            end = segs[j - 1]["end"] + 0.35
            if i > 0:
                start = max(start, (segs[i - 1]["end"] + segs[i]["start"]) / 2)
            if j < len(segs):
                end = min(end, (segs[j - 1]["end"] + segs[j]["start"]) / 2)
            start = max(0, start)
            h = hashlib.sha1(f"{les['slug']}|{start:.2f}|{end:.2f}".encode()).hexdigest()[:6]
            clip = f"talents/clips/{w['id']}-{h}.mp3"
            dst = os.path.join(SITE, clip)
            if not os.path.exists(dst):
                subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-ss", f"{start:.2f}", "-to", f"{end:.2f}",
                                "-i", os.path.join(T, "audio", manifest[les["slug"]]["file"]),
                                "-af", "afade=t=in:d=0.03,areverse,afade=t=in:d=0.08,areverse",
                                "-ac", "1", "-b:a", "64k", dst], check=True)
            w["native"] = clip
            w["nativeScore"] = round(score, 2)
            w["nativeHeard"] = " ".join(x["text"] for x in segs[i:j])
            stats["matched"] += 1

# nettoyage des extraits orphelins
wanted = {os.path.basename(w["native"]) for w in words if w.get("native")}
for f in os.listdir(CLIPS):
    if f not in wanted:
        os.remove(os.path.join(CLIPS, f))

with open(os.path.join(SITE, "units.js"), "w", encoding="utf-8") as f:
    f.write("// Généré par scripts/build_units.py — ne pas éditer à la main\nwindow.UNITS = ")
    json.dump(units, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
with open(os.path.join(SITE, "words.js"), "w", encoding="utf-8") as f:
    f.write("// Généré par scripts/build.py + build_units.py — ne pas éditer à la main\nwindow.WORDS = ")
    json.dump(words, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
json.dump(report, open(os.path.join(ROOT, "work/align_report.json"), "w"), ensure_ascii=False, indent=0)
print(f"Unités : {len(units)} | mots reliés à l'audio éditeur : {stats['matched']}/{stats['total']}")
