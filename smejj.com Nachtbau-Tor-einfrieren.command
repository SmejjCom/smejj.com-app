#!/bin/zsh
# smejj.com — Security-Lock neu einfrieren (Betreiber-Doppelklick).
#
# WARUM DIESE DATEI: Der Claude-Sicherheitsklassifizierer erlaubt der
# Assistenz-Sitzung nicht, den Security-Lock selbst neu zu stempeln.
# Genau wie beim Maus-Token führst DU den Schritt aus — die Freigabe
# dafür liegt vor (Karte "Freigeben + reparieren", 2026-08-13).
#
# WAS SIE TUT: friert public/chat-bridge.js & Co. auf dem heutigen,
# freigegebenen Stand ein (v134 + v135 + Auslagerung auf 604 Zeilen).
set -e
cd "$(dirname "$0")"
echo "Ordner: $(pwd)"
node scripts/check-security-lock.mjs --freeze --confirm "Freigeben + reparieren (Betreiber-Karte 2026-08-13): deckt 8c45b11 v134, ba4025a v135 und die Auslagerung von chat-bridge.js auf 604 Zeilen (8cb0ffe)"
echo ""
echo "Kontrolle:"
node scripts/check-security-lock.mjs
echo ""
echo "FERTIG — Fenster kann geschlossen werden."
