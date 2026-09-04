#!/bin/zsh
# smejj.com — Doppelklick im Finder: die globale Suche funktioniert wieder (sie lud ihr Modul nie).
# Ruft scripts/einmal/suche-verdrahten-2026-09-04.sh auf (SW-Cache +1, Start-Lock-Stempel,
# Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis). Protokoll liegt daneben als .log.
cd "$(dirname "$0")"
echo "smejj.com — Suche reparieren ausliefern ($(date))"
echo
zsh "scripts/einmal/suche-verdrahten-2026-09-04.sh" 2>&1 | tee "scripts/einmal/suche-verdrahten-2026-09-04.log"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — live. Im Menue 'Im Netz suchen' oeffnen und tippen."; else echo "ABBRUCH mit Code $STATUS — Protokoll: scripts/einmal/suche-verdrahten-2026-09-04.log"; fi
read -k 1 "?Taste druecken zum Schliessen ..."
