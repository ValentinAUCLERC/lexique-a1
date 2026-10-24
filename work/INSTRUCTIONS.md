# Annotation du lexique FLE A1 (manuel « Talents A1 »)

Public : apprenant·e sinophone (chinois simplifié) qui apprend le français niveau A1.
Le site affichera chaque mot français, sa traduction chinoise, et une prononciation audio
générée par une voix TTS neuronale française (Microsoft edge-tts, fr-FR-DeniseNeural).

Ton fichier d'entrée : `work/chunkN.txt` (format `id|fr|en|zh|unit`, une ligne par mot).
La colonne `en` (anglais) sert à lever les ambiguïtés de sens : c'est le sens visé par le manuel.

## Sortie attendue

Un fichier `work/outN.jsonl` : UNE ligne JSON par entrée d'entrée, même ordre, TOUTES les entrées
(aucune omise), encodage UTF-8, `ensure_ascii=False`. Clés :

```json
{"id": 12, "display": "la maison", "tts": "la maison", "pos": "n.f.", "zh": "房子", "fix": null, "tts_risk": null}
```

- `id` : identique à l'entrée.
- `pos` : catégorie normalisée, une parmi : `n.m.`, `n.f.`, `n.m.pl.`, `n.f.pl.`, `v.`, `adj.`, `adv.`, `expr.` (expressions/formules : bonjour, merci, à l'heure, ça va…), `prép.`, `pron.`, `conj.`.
  Les entrées « (n.) » sans genre : détermine le genre correct en français. « (n.m) » = `n.m.`.
  « (n.m. familier) » → `n.m.` ; « (adj. belgicisme) » → `adj.`.
- `display` : forme affichée, propre et naturelle, SANS l'étiquette grammaticale :
  - noms : avec article défini : `le`, `la`, `l'` (apostrophe droite ASCII `'`) devant voyelle ou h muet, `les` pour les pluriels.
    Attention au h aspiré (le haricot, le héros, le hockey, le hamburger, le hall, le handball, la honte, le hasard, la hauteur…) : pas d'élision.
    Les noms qui n'ont pas de sens avec article (ex. un nom de jour, un mois) prennent quand même l'article défini (le lundi, le mois de mai → selon le mot).
  - précisions entre parenthèses de l'original conservées si utiles au sens : `le train (TGV)`, `l'autobus (le bus)`, `marcher (fonctionner)`.
  - verbes pronominaux remis à l'endroit : `amuser (s')` → `s'amuser`, `lever (se)` → `se lever`.
  - formes inversées remises à l'endroit : `aise (à l')` → `à l'aise`, `bas (en)` → `en bas`, `ligne (en)` → `en ligne`, `faim (avoir)` → `avoir faim`, `besoin (avoir)` → `avoir besoin (de)`, `avoir (envie de)` → `avoir envie de`, `falloir (il faut)` → `falloir (il faut)`.
  - adjectifs : tels quels (`beau / belle`). Ne pas inventer de féminin absent.
  - corrige les coquilles évidentes du PDF (ex. `coquille SaintJacques` → `la coquille Saint-Jacques`).
  - Remplace l'apostrophe typographique `’` par `'`.
- `tts` : texte exact envoyé à la voix de synthèse pour prononcer le mot proprement :
  - en général identique à `display` ;
  - sans parenthèses ni slash : `le train (TGV)` → `le train`, `beau / belle` → `beau, belle`, `falloir (il faut)` → `falloir, il faut`, `l'autobus (le bus)` → `l'autobus`, `avoir besoin (de)` → `avoir besoin de`, `marcher (fonctionner)` → `marcher`.
  - pas de point final.
- `zh` : traduction chinoise (simplifié) du SENS VISÉ (cf. colonne `en`), mot seul, SANS l'étiquette grammaticale entre parenthèses (（阳性名词）, （动词）… sont retirées : le site affiche la catégorie à part).
  - Si la traduction du PDF est correcte → recopie-la (sans l'étiquette), éventuellement avec plusieurs sens séparés par `，` comme dans l'original.
  - Si elle est fausse, trompeuse, ou d'un autre sens que celui visé → mets la bonne traduction.
    Exemples d'erreurs connues : visiter → 餐馆 (faux, = restaurant) → 参观，游览 ; prénom → 姓 (= nom de famille) → 名字 ; portable (téléphone) → 手提收音机 → 手机 ; aborder (approach, tackle) → 登陆 → 谈及，着手处理.
  - Sois exigeant mais pas pinailleur : ne « corrige » pas une traduction acceptable juste pour une préférence de style. On corrige ce qui induirait l'apprenant en erreur.
- `fix` : `null` si `zh` reprend l'original ; sinon une explication COURTE en français (≤ 80 caractères) de la correction, ex. `"餐馆 = restaurant ; visiter = 参观"`.
- `tts_risk` : `null` en général ; une courte note si la prononciation TTS risque d'être fausse (homographe, mot rare, sigle, nombre, mot étranger, liaison ou h aspiré piégeux, ex. `le fils` /fis/, `l'est` /ɛst/, `plus`, `os`, `le hockey`). Sert à une vérification audio ciblée.

## Méthode

1. Lis tout ton chunk.
2. Écris le JSONL avec un script Python (via le terminal) ou directement avec l'outil d'écriture de fichier, mais vérifie ensuite par script : nombre de lignes = nombre d'entrées du chunk, ids identiques et dans l'ordre, JSON valide, toutes les clés présentes, `pos` dans la liste autorisée, aucun `（` dans `zh`, aucun `’` dans display/tts.
3. Ne modifie AUCUN autre fichier que `work/outN.jsonl`.

Rends en résumé final : le nombre d'entrées écrites, le nombre de corrections chinoises (`fix` non nul) avec la liste `id fr : ancien → nouveau`, et la liste des `tts_risk`.
