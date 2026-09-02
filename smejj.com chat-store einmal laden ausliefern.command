#!/bin/zsh
# smejj.com — Doppelklick im Finder: chat-store.js nur noch einmal laden (Seitengewicht
# 324 -> ~311 KB, zweite Modulinstanz weg). Ruft die Kaskade
# scripts/einmal/einmal-instanz-chat-store-2026-09-03.sh auf (SW-Cache +1, Start-Lock-Stempel,
# Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis, Nachmessung).
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
cd "$(dirname "$0")"
echo "smejj.com — chat-store.js einmal laden ausliefern ($(date))"
echo
zsh "scripts/einmal/einmal-instanz-chat-store-2026-09-03.sh"
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — alles live. Fenster kann geschlossen werden."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
