#!/bin/zsh
# smejj.com — Doppelklick im Finder: Chat am Handy, drei iPhone-Befunde (Schreibfeld ueber dem
# Home-Balken, Frage-Blase ohne Ueberdeckung, Tabellen ohne Riesenzeilen). Ruft die Kaskade
# scripts/einmal/chat-handy-drei-fixes-2026-09-03.sh auf (Buendel bauen, SW-Cache +1,
# Start-Lock-Stempel, Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis).
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
cd "$(dirname "$0")"
echo "smejj.com — Chat am Handy, drei Fixes ausliefern ($(date))"
echo
zsh "scripts/einmal/chat-handy-drei-fixes-2026-09-03.sh" 2>&1 | tee "scripts/einmal/chat-handy-drei-fixes-2026-09-03.log"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — alles live. Am iPhone die App schliessen und neu oeffnen."; else echo "ABBRUCH mit Code $STATUS — das Protokoll liegt in scripts/einmal/chat-handy-drei-fixes-2026-09-03.log, die Sitzung liest es selbst."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
