"""Fusionne raw.json + annotations work/out*.jsonl, génère l'audio et site/words.js.

Usage :
  .venv/bin/python scripts/build.py            # données + audio manquant
  .venv/bin/python scripts/build.py --no-audio # données seulement
"""
import asyncio
import glob
import hashlib
import json
import os
import re
import sys

import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
AUDIO_DIR = os.path.join(SITE, "audio")
# deux voix neuronales : l'apprenant entend deux timbres, et on garde une alternative si l'une prononce mal un mot
VOICES = {"f": "fr-FR-DeniseNeural", "m": "fr-FR-HenriNeural"}
RATE = "-10%"  # un peu plus lent que la normale : niveau A1
CONCURRENCY = 6
MIN_BYTES = 6000  # un mot isolé fait ~10-12 Ko ; en dessous, la synthèse a été coupée

POS_ALLOWED = {"n.m.", "n.mf.", "n.f.", "n.m.pl.", "n.f.pl.", "v.", "adj.", "adv.", "expr.", "prép.", "pron.", "conj."}


def load():
    raw = {r["id"]: r for r in json.load(open(os.path.join(ROOT, "data/raw.json")))}
    ann = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "work/out*.jsonl"))):
        for line in open(path, encoding="utf-8"):
            if line.strip():
                a = json.loads(line)
                ann[a["id"]] = a
    # surcharges manuelles (prioritaires), optionnelles
    over_path = os.path.join(ROOT, "data/overrides.json")
    overrides = json.load(open(over_path)) if os.path.exists(over_path) else {}

    missing = sorted(set(raw) - set(ann))
    if missing:
        sys.exit(f"Annotations manquantes pour {len(missing)} ids : {missing[:20]}")

    words = []
    for i in sorted(raw):
        r, a = raw[i], dict(ann[i])
        a.update(overrides.get(str(i), {}))
        assert a["pos"] in POS_ALLOWED, (i, a["pos"])
        assert "（" not in a["zh"], (i, a["zh"])
        tts = a["tts"].strip()
        audio = {}
        for key, voice in VOICES.items():
            h = hashlib.sha1(f"{voice}|{RATE}|{tts}".encode()).hexdigest()[:8]
            audio[key] = f"audio/{key}/{i}-{h}.mp3"
        words.append({
            "id": i,
            "fr": a["display"],
            "tts": tts,
            "pos": a["pos"],
            "zh": a["zh"],
            "zhOrig": re.sub(r"（[^（）]*）$", "", r["zh"]) if a.get("fix") else None,
            "fix": a.get("fix"),
            "en": r["en"],
            "unit": int(r["unit"].lstrip("U")),
            "lesson": r["lesson"],
            "audio": audio,
        })
    return words


async def synth(words):
    jobs = []  # (word, voice_key)
    for key in VOICES:
        d = os.path.join(AUDIO_DIR, key)
        os.makedirs(d, exist_ok=True)
        wanted = {os.path.basename(w["audio"][key]) for w in words}
        for f in os.listdir(d):  # nettoie les anciens fichiers (texte modifié)
            if f not in wanted:
                os.remove(os.path.join(d, f))
        jobs += [(w, key) for w in words if not os.path.exists(os.path.join(SITE, w["audio"][key]))]
    print(f"Audio : {len(jobs)} à générer / {len(words) * len(VOICES)}")
    sem = asyncio.Semaphore(CONCURRENCY)
    errors = []

    async def one(w, key):
        async with sem:
            dest = os.path.join(SITE, w["audio"][key])
            last = None
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(w["tts"], VOICES[key], rate=RATE).save(dest + ".tmp")
                    # flux parfois coupé sans exception (throttling) : fichier tronqué ~2 Ko
                    if os.path.getsize(dest + ".tmp") < MIN_BYTES:
                        raise RuntimeError(f"audio tronqué ({os.path.getsize(dest + '.tmp')} o)")
                    os.replace(dest + ".tmp", dest)
                    return
                except Exception as e:  # réseau / throttling
                    await asyncio.sleep(2 * (attempt + 1))
                    last = e
            errors.append((w["id"], key, w["tts"], repr(last)))

    await asyncio.gather(*(one(w, k) for w, k in jobs))
    if errors:
        print("ERREURS :", errors)
        sys.exit(1)


def main():
    words = load()
    if "--no-audio" not in sys.argv:
        asyncio.run(synth(words))
    with open(os.path.join(SITE, "words.js"), "w", encoding="utf-8") as f:
        f.write("// Généré par scripts/build.py — ne pas éditer à la main\n")
        f.write("window.WORDS = ")
        json.dump(words, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    fixes = sum(1 for w in words if w["fix"])
    print(f"{len(words)} mots, {fixes} traductions corrigées -> site/words.js")


if __name__ == "__main__":
    main()
