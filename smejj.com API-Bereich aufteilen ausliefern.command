#!/bin/zsh
# smejj.com — Doppelklick im Finder: API-Bereich aufgeteilt (800-Zeilen-Regel), check:all wieder
# komplett gruen. Ruft die Kaskade scripts/einmal/api-bereich-teilen-2026-09-04.sh auf
# (SW-Cache +1, Start-Lock-Stempel, Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis).
# Protokoll liegt daneben als .log.
cd "$(dirname "$0")"
echo "smejj.com — API-Bereich aufteilen ausliefern ($(date))"
echo
zsh "scripts/einmal/api-bereich-teilen-2026-09-04.sh" 2>&1 | tee "scripts/einmal/api-bereich-teilen-2026-09-04.log"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — live. Der API-Bereich verhaelt sich unveraendert."; else echo "ABBRUCH mit Code $STATUS — das Protokoll liegt in scripts/einmal/api-bereich-teilen-2026-09-04.log, die Sitzung liest es selbst."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
