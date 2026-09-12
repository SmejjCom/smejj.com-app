#!/bin/zsh
# smejj.com — Kaskade 12.09.2026: App-Routen ueberleben ein echtes Neuladen.
#
# BEFUND (Android-Emulator, 12.09.): Die App wanderte im Sekundentakt
# /smejjBot -> / -> /chat-history -> / -> /browser -> /. Ursache: GitHub Pages
# liefert fuer jede App-Route HTTP 404, 404.html schickt zurueck auf "/", die
# App stellt die gemerkte Route wieder her — und beim naechsten echten Laden
# beginnt dasselbe von vorn. Der Service Worker faengt Navigationen auf
# BEKANNTE App-Routen jetzt ab und liefert die Huelle aus dem Zwischenspeicher.
# Unbekannte Pfade zeigen weiter ehrlich die 404-Seite.
#
# SCHRIFTLICHE BESTAETIGUNG DES BETREIBERS (12.09.2026, woertlich):
#   "Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live
#    weiter, bis alles stabil, sicher und zuverlaessig funktioniert."
#   "Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig."
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
SW_NEU=$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1)
echo "== 1. Waechter und Tests"
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
# VOR dem Deploy nur das VERHALTEN pruefen. Die Sperren dateisperren/
# schutz-echtheit vergleichen die AUSLIEFERUNG mit dem eingefrorenen Stand —
# sie koennen erst NACH dem Deploy gruen sein und laufen darum als Schlussbeweis.
node --test tests/sw-app-routen.test.mjs tests/offline-verhalten.test.mjs tests/platform-pwa.test.mjs tests/precache-dynamische-importe.test.mjs tests/frontend-structure.test.mjs
grep -E "^ℹ (pass|fail)" /tmp/sw-routen-tests.log | tr '\n' ' '; echo
echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-12: 'Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live weiter, bis alles stabil, sicher und zuverlaessig funktioniert.' + 'Ich gebe dir alle Rechte von A bis Z 100 %.' Umgesetzt: der Service Worker liefert bekannte App-Routen selbst aus, statt sie im 404-Kreisel enden zu lassen (Android-Befund 12.09.: die App wanderte im Sekundentakt zwischen Ansichten und /). Unbekannte Pfade zeigen weiter die 404-Seite; tests/sw-app-routen.test.mjs haelt die Routenliste im Worker und in view-routes.js deckungsgleich. Service-Worker $SW_NEU." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock bleibt rot."; exit 1; }
echo "== 3. Committen und pushen"
git add public docs/frontend tests scripts/einmal
git commit -q -m "fix(sw): bekannte App-Routen ueberleben ein echtes Neuladen — der 404-Kreisel auf Android ist beendet; $SW_NEU

Gemessen am 12.09. auf dem Android-Emulator: die App wanderte im Sekundentakt
/smejjBot -> / -> /chat-history -> / -> /browser -> /. GitHub Pages liefert fuer
jede App-Route 404, 404.html schickt zurueck auf '/', die App stellt die gemerkte
Route wieder her — und beim naechsten echten Laden beginnt dasselbe von vorn.
Der Service Worker faengt Navigationen auf BEKANNTE App-Routen jetzt ab und
liefert die Huelle aus dem Zwischenspeicher: ein Lesezeichen auf /projects wirkt
wie ein Klick in der App, online wie offline. Unbekannte Pfade zeigen weiter die
ehrliche 404-Seite. tests/sw-app-routen.test.mjs haelt die Routenliste im Worker
und in view-routes.js deckungsgleich.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || echo "(nichts zu committen)"
git push -q origin HEAD:feature/responsive-qa-2026-09-07 || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "Zweig: $(git rev-parse --short HEAD)"
echo "== 4. Live-Klon auf origin/main"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main && git checkout -q main && git reset -q --hard origin/main || { echo "ABBRUCH: Klon nicht auf origin/main."; exit 1; }
LIVE_SW=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
KLON_SW=$(grep -o 'smejj-shell-v[0-9]*' sw.js | head -1)
echo "live: $LIVE_SW   Klon: $KLON_SW"
[ "$LIVE_SW" = "$KLON_SW" ] || { echo "ABBRUCH: live ($LIVE_SW) und origin/main ($KLON_SW) passen nicht zusammen."; exit 1; }
echo "== 5. sw.js auf den Live-Stand legen"
cp "$REPO/public/sw.js" "$KLON/sw.js" || { echo "ABBRUCH: Kopie."; exit 1; }
[ -f "$KLON/assets/sw.js" ] && cp "$REPO/public/sw.js" "$KLON/assets/sw.js"
git add -A && git status --short | head -6
git commit -q -m "deploy(sw): bekannte App-Routen ueberleben ein echtes Neuladen; $SW_NEU — Quelle smejj.com-app feature/responsive-qa-2026-09-07" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"
echo "== 6. Live-Beweis"
ERW=$(shasum -a 256 "$KLON/sw.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  (erwartet $SW_NEU / $ERW)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ]; then
    echo; echo "== 7. Schlussbeweis: die Sperren gegen die AUSLIEFERUNG"
    cd "$REPO" && node --test tests/dateisperren.test.mjs tests/schutz-echtheit.test.mjs > /tmp/sw-sperren.log 2>&1 \
      && { grep -E "^ℹ (pass|fail)" /tmp/sw-sperren.log | tr '\n' ' '; echo; echo "FERTIG — live: Service-Worker $SW_NEU, sw.js byte-gleich, Sperren gruen."; exit 0; } \
      || { echo "PROBLEM: Sperren nach dem Deploy rot."; tail -12 /tmp/sw-sperren.log; exit 1; }
  fi
  sleep 6
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen."; exit 1

