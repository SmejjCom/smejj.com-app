#!/bin/zsh
# smejj.com — Doppelklick im Finder: Sicherheitsrichtlinie (CSP) erlaubt wss://api.smejj.com,
# damit die Sprachwelle LIVE im Browser verbinden darf. Ruft die Kaskade
# scripts/einmal/csp-wss-sprachwelle-2026-09-03.sh auf (SW-Cache +1, Start-Lock-Stempel,
# Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis). Protokoll liegt daneben als .log.
cd "$(dirname "$0")"
echo "smejj.com — Sprachwelle CSP freigeben ausliefern ($(date))"
echo
zsh "scripts/einmal/csp-wss-sprachwelle-2026-09-03.sh" 2>&1 | tee "scripts/einmal/csp-wss-sprachwelle-2026-09-03.log"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — CSP live. Am iPhone: App schliessen, neu oeffnen, Welle starten und sprechen."; else echo "ABBRUCH mit Code $STATUS — das Protokoll liegt in scripts/einmal/csp-wss-sprachwelle-2026-09-03.log, die Sitzung liest es selbst."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
