#!/bin/zsh
# smejj.com — Kaskade 2026-09-09 (Abend): "Treffer n" in der Fortschrittszeile
# der Maus — Arbeitszweig stempeln und pushen, dann den Live-Stand nachziehen.
#
# ANLASS: Live 09.09. stoppte ein Lauf an zwei gleichen Wikipedia-Links
# (selector_mehrdeutig). Server benennt die Wahl jetzt (nth 0, Bauzweig
# 930d6cde), das Panel reicht nth durch (live v829) — und die Zeile im Chat
# muss zeigen, dass die Wahl benannt wurde: "Klicken: Ada Lovelace (Treffer 1)".
# Betreiber-Regel "pusche selber" (08.09.): Stempel und Deploy aus der Sitzung.
set -uo pipefail
WT="${1:-/private/tmp/claude-501/design-v11-maus}"
KLON="/Users/alanbest/smejj-app-frontend"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
cd "$WT" || { echo "ABBRUCH: Worktree fehlt."; exit 1; }
git rev-parse --abbrev-ref HEAD | grep -q "feature/design-v11" || { echo "ABBRUCH: nicht auf feature/design-v11."; exit 1; }
echo "== 1. Waechter und Tests (Arbeitszweig)"
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/browser-pane-maus.test.mjs tests/maus-nth-ausdruecklich.test.mjs tests/maus-entscheidung-reparatur.test.mjs tests/maus-schritt-nachfrage.test.mjs tests/maus-engine-route.test.mjs > /tmp/maus-nth-anzeige-tests.log 2>&1 \
  || { echo "ABBRUCH: Tests rot."; tail -20 /tmp/maus-nth-anzeige-tests.log; exit 1; }
grep -E "^ℹ (pass|fail)" /tmp/maus-nth-anzeige-tests.log | tr '\n' ' '; echo
echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-09: 'Weiter' nach dem Planer-Bericht, Regel 'pusche selber' (08.09.). Umgesetzt: benannte Wahl nth vom Planer bis zum fernen Browser (Panel reicht nth durch, Fehlertexte 220 Zeichen, Fortschrittszeile zeigt 'Treffer n', Server benennt dieselbe Wahl nach selector_mehrdeutig), Marken bis zur Wurzel (browser-pane-maus 20260906-9, browser-pane, maus-absicht, maus-panel, sendepfad-nachladen, browser-nachladen, browser-pane-persistenz, app.js, index.html). Stempel aus der Sitzung per Kaskade." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock bleibt rot."; exit 1; }
echo "== 3. Committen und pushen (Arbeitszweig)"
git add -A public docs/frontend tests workers control-server scripts/einmal
git commit -q -m "fix(maus): Fortschrittszeile nennt die benannte Wahl (Treffer n); Server benennt dieselbe Wahl nach selector_mehrdeutig (nth 0) und entfernt Anfuehrungszeichen um Selektor-Werte; Marken bis zur Wurzel, Start-Lock gestempelt; Kaskade maus-nth-anzeige

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
git fetch -q origin feature/design-v11
git merge-base --is-ancestor origin/feature/design-v11 HEAD || { echo "ABBRUCH: origin ist weitergelaufen — erst rebasen."; exit 1; }
git push -q origin HEAD:feature/design-v11 || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "Arbeitszweig: $(git rev-parse --short HEAD)"
echo "== 4. Live-Klon auf origin/main"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main && git checkout -q main && git reset -q --hard origin/main || { echo "ABBRUCH: Klon nicht auf origin/main."; exit 1; }
LIVE_SW=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
KLON_SW=$(grep -o 'smejj-shell-v[0-9]*' sw.js | head -1)
echo "live: $LIVE_SW   Klon: $KLON_SW"
[ "$LIVE_SW" = "$KLON_SW" ] || { echo "ABBRUCH: live ($LIVE_SW) und origin/main ($KLON_SW) passen nicht zusammen."; exit 1; }
echo "== 5. Anzeige auf den Live-Stand legen"
node "$WT/scripts/einmal/maus-nth-anzeige-live-2026-09-09.mjs" "$KLON" || { git checkout -q -- . ; echo "ABBRUCH: Fix nicht angewendet, Klon zurueckgesetzt."; exit 1; }
SW_NEU=$(cat /tmp/maus-nth-anzeige-live-sw.txt)
git add -A && git status --short | head -20
git commit -q -m "deploy(maus): Fortschrittszeile nennt die benannte Wahl (Treffer n); SW $SW_NEU — Quelle smejj.com-app feature/design-v11 (auf den Live-Stand gelegt)" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"
echo "== 6. Live-Beweis"
ERW=$(shasum -a 256 "$KLON/browser-pane-maus-plan.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/browser-pane-maus-plan.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  plan=$L  (erwartet $SW_NEU / $ERW)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ]; then echo; echo "FERTIG — live: Service-Worker $SW_NEU, browser-pane-maus-plan.js byte-gleich."; exit 0; fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen."; exit 1
