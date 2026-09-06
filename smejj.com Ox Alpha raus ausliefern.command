#!/bin/zsh
# smejj.com — Doppelklick im Finder: Ox Alpha ist abgeschafft, das bereinigte
# Frontend ausliefern (GitHub Pages).
#
# Was passiert (Details in scripts/einmal/ox-alpha-raus-ausliefern-2026-09-06.sh):
#   1. pruefen, dass nichts halbfertig herumliegt
#   2. nachweisen, dass Ox Alpha WIRKLICH raus ist — Menuezeile, Registry-
#      Eintrag und Freischalt-Skript, nicht nur ausgeblendet
#   3. Start-Lock, Precache, assets-Gleichklang und 69 Tests
#   4. pruefen, dass live noch der erwartete Stand steht (v783/b149) —
#      sonst hat jemand anders ausgeliefert und es wird abgebrochen
#   5. kopieren, committen, Fast-Forward-Push
#   6. warten, bis live wirklich v785 zeigt UND die Ox-Alpha-Zeile weg ist
#
# MITFAHRER: Es gehen FUENF Dateien live, nicht nur die eine aus dieser Sitzung.
# Auf demselben Zweig hat parallel eine andere Sitzung gearbeitet (Guthaben-
# Leiste, CSP). index.html und sw.js tragen beide Staende und lassen sich nicht
# trennen. Alle fuenf sind gestempelt und damit freigegeben.
#
# Bricht das Skript ab, ist nichts gepusht und live bleibt, wie es ist.
echo "smejj.com — Ox Alpha raus: ausliefern ($(date))"
echo
SKRIPT="$(dirname "$0")/scripts/einmal/ox-alpha-raus-ausliefern-2026-09-06.sh"
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
