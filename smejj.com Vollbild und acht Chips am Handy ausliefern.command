#!/bin/zsh
# smejj.com — Doppelklick im Finder: Vollbild am Handy (Glas bis in die Statusleiste) und alle
# acht Werkzeug-Chips in einer wischbaren Zeile. Ruft die Kaskade
# scripts/einmal/vollbild-chips-mobil-2026-09-03.sh auf (Buendel bauen, SW-Cache +1,
# Start-Lock-Stempel, Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis).
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
cd "$(dirname "$0")"
echo "smejj.com — Vollbild und acht Chips am Handy ausliefern ($(date))"
echo
zsh "scripts/einmal/vollbild-chips-mobil-2026-09-03.sh"
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — alles live. Danach am iPhone: PWA entfernen und neu zum Home-Bildschirm hinzufuegen."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
