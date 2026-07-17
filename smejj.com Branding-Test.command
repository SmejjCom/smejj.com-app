#!/bin/bash
# smejj.com — Branding-Test auf dem Mac (Doppelklick).
#
# Warum diese Datei: `npm run check:branding` prueft, ob alle Marken-Ableitungen
# (Favicons, App-Icons, Social-Bild) byte-genau aus den SVG-Quellen reproduzierbar
# sind. Dafuer braucht es @resvg/resvg-js — installiert ist nur die macOS-Variante.
# In der Linux-Umgebung einer AI-Session laeuft der Test deshalb NICHT; auf diesem
# Mac laeuft er. Er aendert nichts, er prueft nur (--check).
#
# Ergebnis:
#   OK   -> alle Marken-Dateien unveraendert und reproduzierbar
#   FEHLER -> Abweichung; NICHTS selbst reparieren, sondern melden.

cd "$(dirname "$0")" || exit 1

printf '\n=== smejj.com Branding-Test ===\n\n'
printf 'Ordner: %s\n\n' "$(pwd)"

if ! command -v npm >/dev/null 2>&1; then
  printf 'FEHLER: npm wurde nicht gefunden.\n'
  printf 'Bitte dieses Fenster abfotografieren und Claude zeigen.\n\n'
  read -r -p "Zum Schliessen Enter druecken..."
  exit 1
fi

npm run check:branding
STATUS=$?

printf '\n----------------------------------------\n'
if [ $STATUS -eq 0 ]; then
  printf 'ERGEBNIS: OK — alle Marken-Dateien sind unveraendert.\n'
  printf 'Nichts weiter zu tun. Fenster kann geschlossen werden.\n'
else
  printf 'ERGEBNIS: FEHLER (Code %s).\n' "$STATUS"
  printf 'Bitte NICHTS selbst aendern.\n'
  printf 'Dieses Fenster abfotografieren und Claude zeigen.\n'
fi
printf '----------------------------------------\n\n'

read -r -p "Zum Schliessen Enter druecken..."
