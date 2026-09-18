#!/bin/zsh
# Einmal-Kaskade 18.09.2026 — Offline-Band meldete falschen Alarm (iOS-Livetest).
#
# Befund: offline-banner.js zeigte das rote Band allein aufgrund von
# navigator.onLine === false. Im iOS-Simulator ist dieser Wert falsch: das Netz
# lief nachweislich (example.com lud frisch), das Band klebte trotzdem unter der
# voll funktionierenden Seite. Die App-Shell (auth-gate.js) hatte keine eigene
# Netzprobe — dort war der blinde Wert die einzige Quelle.
#
# Fix: Das Band erscheint erst nach einer echten HEAD-Anfrage (laeuft am Service
# Worker vorbei, der behandelt nur GET) und fragt im Takt nach, bis das Netz
# zurueck ist. SW-Version v898 -> v899, weil offline-banner.js im Precache liegt.
#
# Freigabe des Betreibers (18.09., woertlich):
#   "Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live
#    weiter, bis alles stabil, sicher und zuverlaessig funktioniert."
set -e
cd "$(dirname "$0")/../.."

BESTAETIGUNG="Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live weiter, bis alles stabil, sicher und zuverlaessig funktioniert. (Betreiber 18.09.2026 — Offline-Band-Fix, SW v899)"

echo "== 1/2 Startseiten-Lock neu stempeln =="
node scripts/check-start-lock.mjs --freeze --confirm "$BESTAETIGUNG"

echo "== 2/2 Gegenprobe =="
node scripts/check-start-lock.mjs

echo "FERTIG — Lock neu gestempelt."
