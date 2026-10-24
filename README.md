# Lexique A1 · 法语 A1 学习

Site statique pour réviser le manuel *Talents A1* (CLE International), interface français / chinois :

- **Par unité** (`#unit/N`) : pour chaque leçon, l'enregistrement « vocabulaire » de l'éditeur (avec transcription
  cliquable), puis les mots de la leçon, puis les liens vers les exercices interactifs archivés ;
  en fin d'unité, l'audio de l'**évaluation**.
- **Lexique complet** (`#lexique`) : les 871 mots, recherche et filtres.
- Chaque mot : forme avec article, traduction chinoise (corrigée si besoin), prononciation, case « je maîtrise ».
  Prononciation = **extrait de l'enregistrement de l'éditeur** (badge 原声) quand le mot y a été retrouvé,
  sinon synthèse vocale (badge AI, voix Denise ou Henri).

## Utiliser

Ouvrir `site/index.html` dans un navigateur (fonctionne hors ligne, `file://` OK), ou :

```bash
python3 -m http.server -d site 8080
```

La progression est stockée dans le `localStorage` du navigateur (par appareil, pas de synchro).

## Données

- `data/lexique.pdf` : source du lexique ; `data/raw.json` : extraction brute (`scripts/extract.py`).
- `work/out*.jsonl` : annotations (article, texte TTS, catégorie, chinois corrigé, note).
- `data/overrides.json` : surcharges manuelles prioritaires. **C'est ici qu'on corrige un mot.**
- `data/talents/catalog.json` : ressources de la plateforme Talents (extraites de la Wayback Machine, snapshot 2026-02-08).
- `data/talents/titles.json` : titres des unités/leçons en français et chinois.
- `data/talents/audio/` : MP3 de l'éditeur (non versionnés) + `manifest.json`.
- `data/talents/transcripts/` : transcriptions Whisper.
- `site/words.js`, `site/units.js`, `site/talents/` : générés, ne pas éditer.

Audios introuvables dans l'archive (jamais capturés) : vocabulaire U7 L3, vocabulaire projet U7, évaluation U7.

## Régénérer

```bash
python3 -m venv .venv && .venv/bin/pip install pdfplumber edge-tts faster-whisper
.venv/bin/python scripts/build.py               # lexique + audio TTS (Denise/Henri)
.venv/bin/python scripts/fetch_talents.py       # audios éditeur depuis web.archive.org (idempotent)
.venv/bin/python scripts/transcribe_talents.py  # transcriptions (Whisper medium, ~1 h CPU ; WHISPER_DEVICE=cuda + large-v3 sur le worker GPU : ~3 min)
.venv/bin/python scripts/build_units.py         # unités + extraits audio par mot -> site/units.js, words.js
.venv/bin/python scripts/qa_audio.py small      # contrôle de l'audio TTS
```

`build.py` réécrit `words.js` : toujours relancer `build_units.py` après.
Les mots non retrouvés dans l'audio éditeur sont listés dans `work/align_report.json`.

Audios et exercices © CLE International — usage personnel uniquement, ne pas publier le dossier `site/talents/`.

## Exposition sur le réseau local

Service systemd `lexique-a1` (`/etc/systemd/system/lexique-a1.service`) → `scripts/serve.py` sur le port 8091
(serveur stdlib avec support Range, nécessaire pour avancer dans les audios sous Chrome/Safari).

    systemctl status lexique-a1      # état
    systemctl disable --now lexique-a1   # couper
