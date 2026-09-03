#!/bin/zsh
# smejj.com — Doppelklick im Finder: Sprachwelle LIVE, Browser-Teil (Sprache-zu-Sprache ueber den
# eigenen Relay zur Gemini Live API; ohne Schluessel auf dem Server aendert sich live nichts).
# Ruft die Kaskade scripts/einmal/sprachwelle-live-2026-09-03.sh auf (SW-Cache +1, Start-Lock-Stempel,
# Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis). Protokoll liegt daneben als .log.
cd "$(dirname "$0")"
echo "smejj.com — Sprachwelle LIVE ausliefern ($(date))"
echo
zsh "scripts/einmal/sprachwelle-live-2026-09-03.sh" 2>&1 | tee "scripts/einmal/sprachwelle-live-2026-09-03.log"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — Browser-Teil live. Naechster Handgriff: SMEJJ_VOICE_LIVE_API_KEY im Zeabur-Portal (smejj-control) eintragen + Redeploy."; else echo "ABBRUCH mit Code $STATUS — das Protokoll liegt in scripts/einmal/sprachwelle-live-2026-09-03.log, die Sitzung liest es selbst."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
