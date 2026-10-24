"""Contrôle qualité audio : retranscrit chaque MP3 avec Whisper et compare au texte attendu.

Ce n'est pas une preuve, juste un filet : un écart signale un fichier à écouter.
Usage : .venv/bin/python scripts/qa_audio.py [model=small] [ids...]
"""
import difflib
import json
import os
import re
import sys
import unicodedata

from faster_whisper import WhisperModel

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "site/words.js"), encoding="utf-8").read()
words = json.loads(src[src.index("=") + 1:].rstrip().rstrip(";"))

model_name = sys.argv[1] if len(sys.argv) > 1 else "small"
only = {int(x) for x in sys.argv[2:]}
if only:
    words = [w for w in words if w["id"] in only]


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("’", "'").replace("œ", "oe")
    s = re.sub(r"[^a-z0-9' ]", " ", s)
    # l'article seul n'est pas l'enjeu, on ignore les petits mots
    toks = [t for t in re.split(r"[\s']+", s) if t and t not in {"le", "la", "les", "l", "s", "se", "d", "de", "un", "une"}]
    return " ".join(toks)


model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=12)


def load_audio(path):
    # décodage via ffmpeg (la version de PyAV installée est incompatible avec faster-whisper)
    import subprocess
    import numpy as np
    pcm = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(pcm, dtype=np.float32)


out = []
for w in words:
    segs, _ = model.transcribe(load_audio(os.path.join(ROOT, "site", w["audio"])), language="fr", beam_size=5,
                               condition_on_previous_text=False, vad_filter=False)
    heard = " ".join(s.text.strip() for s in segs)
    a, b = norm(w["tts"]), norm(heard)
    ratio = difflib.SequenceMatcher(None, a, b).ratio()
    out.append({"id": w["id"], "tts": w["tts"], "heard": heard, "ratio": round(ratio, 2)})
    if len(out) % 50 == 0:
        print(f"... {len(out)}/{len(words)}", flush=True)

out.sort(key=lambda x: x["ratio"])
json.dump(out, open(os.path.join(ROOT, "work/qa_audio.json"), "w"), ensure_ascii=False, indent=1)
bad = [x for x in out if x["ratio"] < 0.8]
print(f"{len(out)} fichiers, {len(bad)} écarts (ratio < 0.8)")
for x in bad:
    print(f'{x["id"]:>4} {x["ratio"]:.2f}  attendu « {x["tts"]} »  entendu « {x["heard"]} »')
