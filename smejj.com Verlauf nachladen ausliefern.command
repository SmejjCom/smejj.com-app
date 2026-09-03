#!/bin/zsh
# smejj.com — Doppelklick im Finder: Verlaufs-Text, Karten-Bausteine und Titel-Automatik laden
# erst bei sichtbarem Verlauf (19 KB weniger auf jeder Startseite). Ruft die Kaskade
# scripts/einmal/verlauf-nachladen-2026-09-03.sh auf (chat-merkmale.js in den Precache, SW-Cache +1,
# Start-Lock-Stempel, Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis, Nachmessung).
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
cd "$(dirname "$0")"
echo "smejj.com — Verlauf nachladen ausliefern ($(date))"
echo
zsh "scripts/einmal/verlauf-nachladen-2026-09-03.sh"
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — alles live. Fenster kann geschlossen werden."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
