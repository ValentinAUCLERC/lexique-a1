"""Transcrit les audios Talents -> data/talents/transcripts/<slug>.json

- Audios « vocabulaire » (liste de mots isolés) : découpe sur les silences (ffmpeg silencedetect),
  puis transcription segment par segment, avec la liste des mots de la leçon en invite
  (Whisper « saute » sinon les mots isolés séparés par de longs silences).
- Audios « évaluation » (dialogues) : transcription d'un bloc.
Usage : .venv/bin/python scripts/transcribe_talents.py [model=medium] [--force]
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.path.join(ROOT, "data/talents")
AUD = os.path.join(T, "audio")
OUT = os.path.join(T, "transcripts")
os.makedirs(OUT, exist_ok=True)
args = [a for a in sys.argv[1:] if not a.startswith("--")]
model_name = args[0] if args else "medium"
FORCE = "--force" in sys.argv
SR = 16000


def load_audio(path):
    pcm = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(pcm, dtype=np.float32)


def speech_chunks(path, total):
    """Intervalles non silencieux [(start, end)]."""
    err = subprocess.run(["ffmpeg", "-nostdin", "-i", path, "-af", "silencedetect=noise=-35dB:d=0.35", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    chunks, cur = [], 0.0
    for s, e in zip(starts, ends + [total] * (len(starts) - len(ends))):
        if s - cur > 0.15:
            chunks.append((cur, s))
        cur = e
    if total - cur > 0.15:
        chunks.append((cur, total))
    return chunks


# slug -> liste de mots de la leçon (pour l'invite Whisper)
catalog = json.load(open(os.path.join(T, "catalog.json")))
src = open(os.path.join(ROOT, "site/words.js"), encoding="utf-8").read()
words = json.loads(src[src.index("=") + 1:].rstrip().rstrip(";"))
lesson_words = {}
for u in catalog[:10]:
    n = int(re.search(r"\d+", u["title"]).group())
    for it in u["items"]:
        if (it.get("cat") or [""])[0] != "Audio - Vocabulaire":
            continue
        slug = it["audio"].split("/assets/")[1].split("/")[0]
        m = re.match(r"\s*Le[cç]on\s+(\d)", it["title"])
        key = "L" + m.group(1) if m else "Pr"
        lesson_words[slug] = [w["tts"] for w in words if w["unit"] == n and w["lesson"] == key]

manifest = json.load(open(os.path.join(AUD, "manifest.json")))
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")  # "cuda" sur le worker GPU
model = WhisperModel(model_name, device=DEVICE, compute_type="float16" if DEVICE == "cuda" else "int8", cpu_threads=14)
for slug, meta in manifest.items():
    dest = os.path.join(OUT, slug + ".json")
    if os.path.exists(dest) and not FORCE:
        continue
    path = os.path.join(AUD, meta["file"])
    audio = load_audio(path)
    total = len(audio) / SR
    data = []
    if slug in lesson_words:
        prompt = "Unité, leçon, vocabulaire. " + ", ".join(lesson_words[slug]) + "."
        for a, b in speech_chunks(path, total):
            pad = 0.25
            seg = audio[int(max(0, a - pad) * SR):int(min(total, b + pad) * SR)]
            segs, _ = model.transcribe(seg, language="fr", beam_size=5, initial_prompt=prompt,
                                       condition_on_previous_text=False, vad_filter=False, without_timestamps=True)
            text = " ".join(s.text.strip() for s in segs).strip()
            if text:
                data.append({"start": round(a, 2), "end": round(b, 2), "text": text})
        kind = "vocab"
    else:
        segs, _ = model.transcribe(audio, language="fr", beam_size=5, vad_filter=False, condition_on_previous_text=True)
        data = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segs]
        kind = "dialogue"
    json.dump({"slug": slug, "model": model_name, "kind": kind, "segments": data}, open(dest, "w"), ensure_ascii=False, indent=1)
    print(f"{slug}: {kind} {len(data)} segments", flush=True)
