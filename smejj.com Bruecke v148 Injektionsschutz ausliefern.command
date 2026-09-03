#!/bin/zsh
# smejj.com — Doppelklick im Finder: Chat-Bruecke v148 mit Systemregel gegen
# eingebettete Anweisungen (Red-Team-Fund Nr. 79) ausliefern. Ruft die Kaskade
# scripts/einmal/bruecke-injektionsschutz-2026-09-03.sh auf (Patch, Tests,
# Security-Lock-Stempel, Commit, Buendel, Klon-Push, Bruecken-Neustart, Live-Beweis).
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
cd "$(dirname "$0")"
echo "smejj.com — Bruecke v148 Injektionsschutz ausliefern ($(date))"
echo
zsh "scripts/einmal/bruecke-injektionsschutz-2026-09-03.sh"
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — Bruecke v148 live, Red-Team-Probe gelaufen (Ergebnis oben)."; elif [ "$STATUS" -eq 2 ]; then echo "FAST FERTIG — bitte im Zeabur-Portal: smejj-chat-bridge -> Restart, dann diese Datei erneut doppelklicken."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
