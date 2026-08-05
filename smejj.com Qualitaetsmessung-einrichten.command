#!/bin/bash
# smejj.com — Qualitaetsmessung automatisch laufen lassen. EIN Doppelklick.
#
# Betreiber-Freigabe 2026-08-04: „einen zeitgesteuerten Lauf auf meinem Mac
# einrichten, der die Qualitaetsmessung regelmaessig gegen die Live-Kette faehrt,
# das Ergebnis auf der Qualitaetsseite veroeffentlicht und hochlaedt."
#
# WAS DANACH PASSIERT
#   Zweimal taeglich (07:10 und 19:10) misst dein Mac die Antwortkette von
#   smejj.com mit 14 festen Aufgaben, veroeffentlicht das Ergebnis auf
#   smejj.com/verlauf.html und laedt es hoch. Dauer je Lauf rund vier Minuten.
#   Der Mac muss dabei an sein; verpasste Laeufe werden nicht nachgeholt.
#
# KOSTEN: keine neue Kostenposition. Die Aufrufe laufen ueber die bereits
#   eingerichteten Modell-Zugaenge (Groq-Gratiskontingent fuer die schnellen
#   Faelle, Kimi fuer die Coding-Faelle). Rund 84 Aufrufe pro Tag.
#
# SICHER: Ein technisch gescheiterter Lauf veroeffentlicht NICHTS. Steht die
#   Seite dann laenger still, weist sie ihre Zahlen selbst als veraltet aus.
#
# RUECKGAENGIG: Diese Datei erneut doppelklicken und "entfernen" waehlen.
set -u

APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
# WICHTIG: Der zeitgesteuerte Lauf darf NICHT im Google-Drive-Ordner liegen.
# macOS verweigert jedem Hintergrunddienst das Lesen daraus ("Operation not
# permitted" — am 2026-08-05 mit cron UND launchd gemessen). Deshalb wird die
# Vorlage aus dem Projekt nach ~/.local/share kopiert, und der Zeitplan ruft
# die Kopie auf. Die Kopie holt sich das Projekt bei jedem Lauf frisch von
# GitHub, kann also nicht veralten.
VORLAGE="$APP/scripts/verlauf/messlauf-geplant.sh"
BASIS="$HOME/.local/share/smejj-qualitaet"
SKRIPT="$BASIS/messlauf.sh"
PROTOKOLL="$HOME/Library/Logs/smejj-qualitaetsmessung.log"
KENNUNG="smejj-qualitaetsmessung"

cd "$APP" || { echo "Arbeitsordner nicht gefunden."; exit 1; }

echo "smejj.com — Qualitaetsmessung automatisch"
echo "========================================="
echo

VORHANDEN=$(crontab -l 2>/dev/null | grep -c "$KENNUNG" || true)

if [ "$VORHANDEN" -gt 0 ]; then
  echo "Die automatische Messung ist bereits eingerichtet:"
  crontab -l 2>/dev/null | grep "$KENNUNG" | sed 's/^/  /'
  echo
  echo "  [1] so lassen"
  echo "  [2] entfernen"
  echo
  read -r -p "Auswahl (1 oder 2): " WAHL
  if [ "${WAHL:-1}" = "2" ]; then
    crontab -l 2>/dev/null | grep -v "$KENNUNG" | crontab -
    echo
    echo "Entfernt. Es wird nicht mehr automatisch gemessen."
    echo "Die Qualitaetsseite weist ihre Zahlen weiterhin selbst als alt aus."
  else
    echo
    echo "Unveraendert gelassen."
  fi
  echo
  read -r -p "Fenster mit Enter schliessen. " _
  exit 0
fi

echo "Eingerichtet wird:"
echo "  - zweimal taeglich um 07:10 und 19:10"
echo "  - 14 Aufgaben je 3 Durchgaenge gegen die echte Antwortkette"
echo "  - Ergebnis geht auf smejj.com/verlauf.html"
echo "  - Protokoll: $PROTOKOLL"
echo
echo "Keine neuen Kosten: die Aufrufe laufen ueber deine vorhandenen Zugaenge."
echo
read -r -p "Einrichten? Weiter mit Enter, abbrechen mit Strg+C. " _

if [ ! -f "$VORLAGE" ]; then
  echo "ABBRUCH: $VORLAGE fehlt. Nichts geaendert."
  read -r -p "Fenster mit Enter schliessen. " _
  exit 1
fi
mkdir -p "$BASIS"
cp "$VORLAGE" "$SKRIPT" || { echo "ABBRUCH: Kopieren nach $BASIS fehlgeschlagen."; read -r -p "Fenster mit Enter schliessen. " _; exit 1; }
chmod +x "$SKRIPT"
echo "Lauf-Datei ausserhalb von Google Drive abgelegt: $SKRIPT"

# Bestehende Eintraege bleiben unangetastet — es wird nur ergaenzt.
{ crontab -l 2>/dev/null; \
  echo "10 7,19 * * * /bin/bash \"$SKRIPT\" >> \"$PROTOKOLL\" 2>&1 # $KENNUNG"; \
} | crontab -

echo
if crontab -l 2>/dev/null | grep -q "$KENNUNG"; then
  echo "FERTIG. Der naechste Lauf startet um 07:10 oder 19:10."
  echo
  echo "Willst du ihn gleich einmal ausprobieren? Das dauert rund vier Minuten."
  read -r -p "Jetzt testen? [j/N]: " TEST
  if [ "${TEST:-n}" = "j" ] || [ "${TEST:-n}" = "J" ]; then
    echo
    echo "Laeuft — bitte warten ..."
    /bin/bash "$SKRIPT" 2>&1 | tail -20
  fi
else
  echo "ABBRUCH: Der Eintrag konnte nicht gesetzt werden. Nichts geaendert."
fi

echo
read -r -p "Fenster mit Enter schliessen. " _
