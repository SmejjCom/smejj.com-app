#!/bin/zsh
# smejj.com — Doppelklick im Finder: 100 % Schutz aktivieren.
#
# Stempelt die zwei Sperren neu, die der Besucher-Puls (Autopilot Nr. 81)
# beruehrt hat — Adminbereich-Kette und Sicherheitskette — und laedt die
# Manifeste hoch. Vorher laufen die Tests der betroffenen Waechter; sind sie
# rot, wird NICHT gestempelt.
#
# Danach gilt wieder: jede Aenderung an diesen Dateien faellt auf.
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
echo "smejj.com — 100 Prozent Schutz aktivieren ($(date))"
echo
zsh "/private/tmp/claude-501/bau-zweig/scripts/einmal/schutz-stempeln-2026-09-04.sh"
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then
  echo "FERTIG — alle Sperren gruen und eingefroren."
else
  echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."
fi
read -k 1 "?Taste druecken zum Schliessen ..."
