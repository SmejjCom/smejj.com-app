#!/bin/zsh
# smejj.com — Doppelklick im Finder: Ox Alpha auch aus dem Control-Server
# entfernen. Zeabur baut den Bauzweig automatisch.
#
# Im Menue ist es seit SW v786 schon weg. /api/health meldete es aber weiter,
# weil die Registry auf dem Bauzweig lebt und das Menue auf GitHub Pages.
#
# Was passiert (Details in scripts/einmal/ox-alpha-server-ausliefern-2026-09-06.sh):
#   1. Bauzweig holen (dein Arbeitszweig wird NICHT gewechselt)
#   2. steht Ox Alpha dort ueberhaupt noch? sonst Ende ohne Push
#   3. einen eigenen, temporaeren Arbeitsordner anlegen und den Eingriff
#      auf den JETZT aktuellen Bauzweig setzen
#   4. fuenf Nachweise, dass es WIRKLICH weg ist — Registry, EU-AI-Act-
#      Verzeichnis, Bruecken-Etikett, Menuezeile, Freischalt-Skript
#   5. die Waechter auf genau diesem Stand laufen lassen
#   6. Startzeit merken, pushen, warten bis der Server neu laeuft UND
#      Ox Alpha nicht mehr meldet
#
# ZWEITER ANLAUF: Der erste scheiterte an einer fehlenden Datei —
# 'can't open input file'. Die Sitzung hatte das Skript auf einem Zweig
# committet und das Repo danach auf einen anderen gestellt. Dieses Skript
# wechselt den Zweig darum NICHT MEHR; es arbeitet in einem eigenen Ordner,
# der danach verschwindet, und stoert damit auch keine Parallelsitzung.
#
# Bricht es ab, bleibt alles wie vorher: kein Push, dein Arbeitsordner
# unberuehrt.
#
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
echo "smejj.com — Ox Alpha auch beim Server raus ($(date))"
echo
SKRIPT="$(dirname "$0")/scripts/einmal/ox-alpha-server-ausliefern-2026-09-06.sh"
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
