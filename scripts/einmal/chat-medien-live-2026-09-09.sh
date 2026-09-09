#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-09: Chat-Bilder-Fix auf den LIVE-Stand
# legen und ausliefern (Begruendung: siehe chat-medien-live-2026-09-09.mjs).
#
# WAS DRIN IST: Bildadressen werden vor dem Einfuegen geparkt (kein blockierter
# Ladeversuch mehr), fehlende Bilder zeigen einen sichtbaren Ersatz.
# Quelle: feature/design-v11, Commit d25f7ea8 (chat-medien.js, chat-store.js,
# chat-sync.js). Marken und Service-Worker werden IM LIVE-STAND hochgezaehlt.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
QUELLE_COMMIT="d25f7ea8"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Quelle aus dem Arbeitszweig holen"
git fetch -q origin feature/design-v11 || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
git merge-base --is-ancestor "$QUELLE_COMMIT" origin/feature/design-v11 || { echo "ABBRUCH: Quell-Commit $QUELLE_COMMIT nicht im Arbeitszweig."; exit 1; }
WT="/private/tmp/claude-501/kaskade-chat-medien"
git worktree remove --force "$WT" >/dev/null 2>&1 || true
git worktree add -q --detach "$WT" "$QUELLE_COMMIT" || { echo "ABBRUCH: Worktree nicht anlegbar."; exit 1; }
ln -sfn "$REPO/node_modules" "$WT/node_modules"
grep -qF 'parkeMedienAdressen' "$WT/public/chat-medien.js" || { echo "ABBRUCH: der Fix steht nicht in der Quelle."; exit 1; }

echo "== 1. Tests der Quelle"
(cd "$WT" && node --test tests/chat-medien.test.mjs tests/chat-store-selbstheilung.test.mjs > /tmp/chat-medien-kaskade.log 2>&1) \
  || { echo "ABBRUCH: Tests rot."; tail -20 /tmp/chat-medien-kaskade.log; exit 1; }
grep -E "pass |fail " /tmp/chat-medien-kaskade.log | tr '\n' ' '; echo

echo "== 2. Live-Klon auf origin/main"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
git checkout -q main && git reset -q --hard origin/main || { echo "ABBRUCH: Klon nicht auf origin/main."; exit 1; }
LIVE_SW=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
KLON_SW=$(grep -o 'smejj-shell-v[0-9]*' sw.js | head -1)
echo "live: $LIVE_SW   Klon: $KLON_SW"
[ "$LIVE_SW" = "$KLON_SW" ] || { echo "ABBRUCH: live ($LIVE_SW) und origin/main ($KLON_SW) passen nicht zusammen — erst klaeren."; exit 1; }

echo "== 3. Fix auf den Live-Stand legen (Pruefsummen-Netz im Skript)"
node "$WT/scripts/einmal/chat-medien-live-2026-09-09.mjs" "$KLON" "$WT" || { git checkout -q -- . ; echo "ABBRUCH: Fix nicht angewendet, Klon zurueckgesetzt."; exit 1; }
SW_NEU=$(cat /tmp/chat-medien-live-sw.txt)

echo "== 4. Committen und Fast-Forward-Push auf main"
git add -A
git status --short | head -40
git commit -q -m "deploy(chat-medien): Bildadressen vor dem Einfuegen geparkt, Ersatz fuer fehlende Bilder; SW $SW_NEU — Quelle smejj.com-app $QUELLE_COMMIT (auf den Live-Stand gelegt)" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 5. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$KLON/chat-medien.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/chat-medien.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  chat-medien=$L  (erwartet $SW_NEU / $ERW)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ]; then
    echo; echo "FERTIG — live: Service-Worker $SW_NEU, chat-medien.js byte-gleich."; exit 0
  fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen."; exit 1
