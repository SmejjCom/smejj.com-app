#!/bin/zsh
# smejj.com — Doppelklick im Finder: UI/UX Nr. 7 (Deutsch durchgaengig) + Nr. 8 (Modell-Chips
# erklaert) ausliefern. Ruft die Kaskade scripts/einmal/deutsch-modellchips-2026-09-03.sh auf.
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
cd "$(dirname "$0")"
echo "smejj.com — Nr. 7 + Nr. 8 ausliefern ($(date))"
echo
zsh "scripts/einmal/deutsch-modellchips-2026-09-03.sh"
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — alles live. Fenster kann geschlossen werden."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
