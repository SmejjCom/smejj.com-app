#!/bin/zsh
# smejj.com — Doppelklick im Finder: Vollbild am Handy ohne schwarzen Streifen ueber dem Home-Balken
# (Glas-Gefaelle auf dem Wurzelelement). Ruft die Kaskade scripts/einmal/vollbild-wurzel-2026-09-03.sh
# auf (SW-Cache +1, Start-Lock-Stempel, Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis).
# Protokoll liegt daneben als .log.
cd "$(dirname "$0")"
echo "smejj.com — Vollbild Streifen weg ausliefern ($(date))"
echo
zsh "scripts/einmal/vollbild-wurzel-2026-09-03.sh" 2>&1 | tee "scripts/einmal/vollbild-wurzel-2026-09-03.log"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — live. Am iPhone: App schliessen und neu oeffnen."; else echo "ABBRUCH mit Code $STATUS — das Protokoll liegt in scripts/einmal/vollbild-wurzel-2026-09-03.log, die Sitzung liest es selbst."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
