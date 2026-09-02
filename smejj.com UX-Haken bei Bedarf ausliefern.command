#!/bin/zsh
# smejj.com — Doppelklick im Finder: UX-Haken (chat-actions-menu.js) laden erst bei Bedarf —
# Handy-Stile nur am Handy, Verlauf-/Code-Helfer erst in der Ansicht. Ruft die Kaskade
# scripts/einmal/ux-haken-bei-bedarf-2026-09-03.sh auf (SW-Cache +1, Start-Lock-Stempel,
# Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis, Nachmessung).
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
cd "$(dirname "$0")"
echo "smejj.com — UX-Haken bei Bedarf ausliefern ($(date))"
echo
zsh "scripts/einmal/ux-haken-bei-bedarf-2026-09-03.sh"
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — alles live. Fenster kann geschlossen werden."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
