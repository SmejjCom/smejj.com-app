#!/bin/zsh
# Einmal-Kaskade 18.09.2026 — Offline-Band meldete falschen Alarm.
#
# RUNDE 1 (SW v899): offline-banner.js zeigte das rote Band allein aufgrund von
# navigator.onLine === false. Im iOS-Simulator ist dieser Wert falsch: das Netz
# lief nachweislich (example.com lud frisch), das Band klebte trotzdem unter der
# voll funktionierenden Seite. Fix: erst eine echte HEAD-Anfrage entscheidet.
#
# RUNDE 2 (SW v900): Beim Nachtest im Browser klebte das Band trotzdem weiter,
# nachdem das Netz zurueck war. Ursache: der Tab war versteckt, und Browser
# drosseln setInterval im Hintergrund auf Minutentakt — der 15-s-Takt lief nie.
# Fix: beim Wechsel nach vorn wird sofort neu geprueft (visibilitychange),
# dieselbe Vorsichtsmassnahme, die willkommen-offline.js schon trifft.
# Dazu tests/offline-banner.test.mjs, damit beide Fallen nicht zurueckkommen.
#
# Freigabe des Betreibers (18.09., woertlich):
#   "Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live
#    weiter, bis alles stabil, sicher und zuverlaessig funktioniert."
set -e
cd "$(dirname "$0")/../.."

BESTAETIGUNG="Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live weiter, bis alles stabil, sicher und zuverlaessig funktioniert. (Betreiber 18.09.2026 — Offline-Band-Fix Runde 2, SW v900)"

echo "== 1/3 Tests =="
node --test tests/offline-banner.test.mjs tests/willkommen-offline.test.mjs tests/sw-schmaler-eingang.test.mjs

echo "== 2/3 Startseiten-Lock neu stempeln =="
node scripts/check-start-lock.mjs --freeze --confirm "$BESTAETIGUNG"

echo "== 3/3 Gegenprobe =="
node scripts/check-start-lock.mjs

echo "FERTIG — Lock neu gestempelt."
