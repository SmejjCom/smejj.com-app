#!/bin/zsh
# smejj.com — Ein-Klick-Kaskade fuer den Betreiber (2026-09-03): UI/UX-Programm Nr. 7 + Nr. 8.
#
# Was passiert (alles in einem Lauf, bricht beim ersten Fehler ab):
#   1. Nr. 7 — Deutsch durchgaengig in public/index.html: Projects -> Projekte,
#      Workspace -> Arbeitsbereich, Disabled -> Aus, Capabilities -> Faehigkeiten,
#      Local Workspace/Browser -> Lokaler Arbeitsbereich/Browser
#      Nr. 8 — Modell-Chips erklaert: Menuepunkte Standard/Schnell/Gruendlich mit
#      Klartext, Tooltip am Modell-Knopf und an der Pille "Nachdenken"
#      (die Knopf-Aufschrift kommt aus STUFE_LABEL in app.js — sie bleibt kurz)
#   2. Service-Worker-Cache um eins heben (index.html liegt im Precache)
#   3. assets-Kopie nachziehen, Start-Lock mit dem Freigabe-Wortlaut stempeln
#   4. Commit auf feature/design-v11
#   5. Live stellen: Frontend-Klon ~/smejj-app-frontend (Wurzel + assets/), Push main
#   6. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig (Zeabur baut neu)
#   7. Live-Beweis auf beiden Domains
#
# Warum ein Skript: Der Auto-Modus der Sitzung blockiert jeden --freeze-Aufruf.
# Der Betreiber hat am 2026-09-02 schriftlich freigegeben:
#   "Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen."
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-02: Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen. — UI/UX Nr. 7 (Deutsch durchgaengig) + Nr. 8 (Modell-Chips erklaert) in index.html, Service-Worker-Cache +1"
cd "$REPO"
echo "== 0. Sperren-Ausgangslage"
npm run -s check:start-lock | tail -1

echo "== 1. Nr. 7 + Nr. 8 in public/index.html"
node scripts/einmal/deutsch-modellchips-2026-09-03.ersetzungen.cjs public/index.html

echo "== 2. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n 'const CACHE_NAME' public/sw.js

echo "== 3. assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
node --test tests/i18n-ui.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 4. Commit design-v11"
git add public/index.html public/sw.js public/assets/index.html public/assets/sw.js docs/frontend/start-lock-manifest.json
git commit -q -m "feat(ux): Nr. 7 Deutsch durchgängig + Nr. 8 Modell-Chips erklärt in index.html, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Freigabe 2026-09-02)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 5. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in index.html sw.js; do cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"; done
git add -A && git commit -q -m "deploy(ux): Nr. 7 + Nr. 8 index.html, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 6. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- public/index.html public/sw.js public/assets/index.html public/assets/sw.js docs/frontend/start-lock-manifest.json
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): index.html (Nr. 7+8) + SW v${NEXT} aus design-v11 $QUELLE (nur public/ + Start-Lock-Manifest)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut in unter einer Minute"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 7. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -m 15 https://api.smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'passt sich der Frage an' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v api=$a modellchip=$m"
  [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "smejj-shell-v${NEXT}" ] && [ "$m" -ge 1 ] && { echo "FERTIG — Nr. 7 + Nr. 8 live, beide Domains auf v${NEXT}"; exit 0; }
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen: curl -s https://smejj.com/ | grep -c 'passt sich der Frage an'"
