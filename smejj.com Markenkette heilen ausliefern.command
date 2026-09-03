#!/bin/zsh
# smejj.com — Doppelklick im Finder: Markenkette heilen (23 ?v=-Marken bis index.html, Markenkette
# einfrieren, SW-Cache +1, Start-Lock-Stempel, Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis).
# Ruft scripts/einmal/markenkette-2026-09-03.sh auf. Das Fenster bleibt am Ende offen.
cd "$(dirname "$0")"
echo "smejj.com — Markenkette heilen ausliefern ($(date))"
echo
zsh "scripts/einmal/markenkette-2026-09-03.sh"
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — alles live. Fenster kann geschlossen werden."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
