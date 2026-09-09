#!/bin/zsh
# smejj.com — Kaskade 2026-09-09: "nth" im Panel auf den LIVE-Stand legen und
# ausliefern (Begruendung: maus-nth-live-2026-09-09.mjs). Laeuft aus der Sitzung.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
git fetch -q origin feature/design-v11 || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
git show origin/feature/design-v11:scripts/einmal/maus-nth-live-2026-09-09.mjs > /tmp/maus-nth-live-2026-09-09.mjs || { echo "ABBRUCH: Skript nicht im Arbeitszweig."; exit 1; }
echo "== 1. Live-Klon auf origin/main"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main && git checkout -q main && git reset -q --hard origin/main || { echo "ABBRUCH: Klon nicht auf origin/main."; exit 1; }
LIVE_SW=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
KLON_SW=$(grep -o 'smejj-shell-v[0-9]*' sw.js | head -1)
echo "live: $LIVE_SW   Klon: $KLON_SW"
[ "$LIVE_SW" = "$KLON_SW" ] || { echo "ABBRUCH: live ($LIVE_SW) und origin/main ($KLON_SW) passen nicht zusammen."; exit 1; }
echo "== 2. Fix auf den Live-Stand legen"
node /tmp/maus-nth-live-2026-09-09.mjs "$KLON" || { git checkout -q -- . ; echo "ABBRUCH: Fix nicht angewendet, Klon zurueckgesetzt."; exit 1; }
SW_NEU=$(cat /tmp/maus-nth-live-sw.txt)
echo "== 3. Committen und Fast-Forward-Push"
git add -A && git status --short | head -30
git commit -q -m "deploy(maus): benannte Wahl nth erreicht den fernen Browser, Fehlertexte 220 Zeichen; SW $SW_NEU — Quelle smejj.com-app feature/design-v11 (auf den Live-Stand gelegt)" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"
echo "== 4. Live-Beweis"
ERW=$(shasum -a 256 "$KLON/browser-pane-maus-plan.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/browser-pane-maus-plan.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  plan=$L  (erwartet $SW_NEU / $ERW)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ]; then echo; echo "FERTIG — live: Service-Worker $SW_NEU, browser-pane-maus-plan.js byte-gleich."; exit 0; fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen."; exit 1
