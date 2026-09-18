#!/bin/zsh
# Bauzweig-Teil der Kaskade 18.09.2026 — Offline-Band-Fix (SW v899).
#
# Der Bauzweig (api.smejj.com) liefert dieselben Frontend-Dateien als Rueckfallweg
# aus. Damit smejj.com und api.smejj.com nicht auseinanderlaufen (Befund
# "buendel_gleichheit" der Probe-Nutzer-Wache), bekommt er denselben Stand.
#
# Freigabe des Betreibers (18.09., woertlich):
#   "Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live
#    weiter, bis alles stabil, sicher und zuverlaessig funktioniert."
set -e
cd "$(dirname "$0")/../.."

BESTAETIGUNG="Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live weiter, bis alles stabil, sicher und zuverlaessig funktioniert. (Betreiber 18.09.2026 — Offline-Band-Fix, SW v899, Bauzweig)"

echo "== 1/2 Start-Lock im Bauzweig stempeln =="
node scripts/check-start-lock.mjs --freeze --confirm "$BESTAETIGUNG"

echo "== 2/2 Gegenprobe =="
node scripts/check-start-lock.mjs

echo "FERTIG — Bauzweig gestempelt."
