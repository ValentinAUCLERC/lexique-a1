#!/bin/bash
# Publie site/ (audios compris) sur la branche gh-pages -> GitHub Pages.
# Les audios ne sont pas dans main (.gitignore) : la branche gh-pages est un instantané orphelin, réécrit à chaque déploiement.
# Usage : scripts/deploy_pages.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REMOTE=$(git -C "$ROOT" remote get-url origin)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp -r "$ROOT/site/." "$TMP/"
touch "$TMP/.nojekyll"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="lexique-a1 deploy" -c user.email="deploy@localhost" commit -qm "Déploiement $(git -C "$ROOT" rev-parse --short HEAD) $(date -Iseconds)"
git push -q -f "$REMOTE" gh-pages
echo "gh-pages poussé ($(du -sh . | cut -f1))"
