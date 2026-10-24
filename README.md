# Lexique A1 · 法语 A1 词汇

Mini-site statique pour réviser le lexique du manuel *Talents A1* (871 mots) :
mot français (avec article), traduction chinoise, prononciation audio, case « je maîtrise ».

## Utiliser

Ouvrir `site/index.html` dans un navigateur (double-clic, fonctionne hors ligne, `file://` OK).
Ou servir le dossier :

```bash
python3 -m http.server -d site 8080
```

La progression est stockée dans le `localStorage` du navigateur (par appareil, pas de synchro).

## Données

- `data/lexique.pdf` : source.
- `data/raw.json` : extraction brute du PDF (`scripts/extract.py`).
- `work/out*.jsonl` : annotations (forme affichée avec article, texte TTS, catégorie, chinois corrigé, note de correction).
- `data/overrides.json` : surcharges manuelles, prioritaires (mois sans article, noms épicènes…). **C'est ici qu'on corrige un mot.**
- `site/words.js` : généré, ne pas éditer.

## Régénérer

```bash
python3 -m venv .venv && .venv/bin/pip install pdfplumber edge-tts faster-whisper
.venv/bin/python scripts/build.py          # données + audio manquant/modifié (voix fr-FR-DeniseNeural)
.venv/bin/python scripts/qa_audio.py small # contrôle : retranscrit l'audio avec Whisper, liste les écarts
```

L'audio est nommé `audio/<id>-<hash>.mp3` : seul un mot dont le texte TTS change est régénéré.
