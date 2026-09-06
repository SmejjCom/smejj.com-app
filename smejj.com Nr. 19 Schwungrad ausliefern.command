#!/bin/zsh
# smejj.com — Doppelklick im Finder: den Schwungrad-Fix (Autopilot Nr. 19)
# in den Bauzweig pushen. Zeabur baut den Control-Server daraus automatisch.
#
# Was passiert (Details in scripts/einmal/nr19-schwungrad-ausliefern-2026-09-06.sh):
#   1. offene Aenderungen beiseitelegen, Bauzweig holen
#   2. den Fix auf den JETZT aktuellen Bauzweig setzen (er laeuft weiter)
#   3. nachweisen, dass nur der Control-Server betroffen ist (public/ unberuehrt)
#   4. die Waechter auf genau diesem Stand laufen lassen — rot heisst Abbruch
#   5. Startzeit des laufenden Servers merken, pushen
#   6. warten, bis Zeabur neu gebaut hat (gestartetAm wechselt) — 2 bis 6 Minuten
#
# Bricht das Skript ab, bleibt alles wie vorher: kein Push, offene Aenderungen
# zurueckgeholt, Arbeitszweig wiederhergestellt.
#
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
echo "smejj.com — Nr. 19 Schwungrad ausliefern ($(date))"
echo
SKRIPT="$(dirname "$0")/scripts/einmal/nr19-schwungrad-ausliefern-2026-09-06.sh"
if [ ! -f "$SKRIPT" ]; then
  echo "ABBRUCH: $SKRIPT fehlt."
  read -k 1 "?Taste druecken zum Schliessen …"
  exit 1
fi
/bin/zsh "$SKRIPT"
RC=$?
echo
if [ "$RC" -eq 0 ]; then
  echo "ERGEBNIS: FERTIG (Code 0)"
else
  echo "ERGEBNIS: ABBRUCH oder OFFEN (Code $RC) — Ausgabe oben lesen."
fi
read -k 1 "?Fenster mit beliebiger Taste schliessen …"
