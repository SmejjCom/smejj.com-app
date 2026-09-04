#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-05):
# Ersten Trainingslauf fuer smejj 1.1 starten.
#
# Alle sieben Tore des Modell-Evolutions-Takts sind offen. Dieser Klick ist der
# Betreiber-Klick, hinter dem der GPU-Start bewusst steht (Rote Liste).
#
# WAS PASSIERT: Ein Salad-Knoten holt das gespiegelte Basismodell
# (Qwen3-4B-Instruct-2507, 7,5 GB) und den Datensatz (16.234 Paare) aus e2 und
# trainiert einen QLoRA-Adapter. Zwischenstaende gehen alle paar Minuten nach
# e2; auch ein an der Zeitgrenze abgebrochener Lauf hinterlaesst einen
# brauchbaren Adapter.
#
# WAS ES KOSTET: hoechstens rund 0,28 USD (170 Minuten auf einer 24-GB-Karte,
# Prioritaet "batch", 0,09-0,10 USD je Stunde). Monatsdeckel 10 USD, davon sind
# bisher 2,85 verbraucht.
#
# WAS NICHT PASSIERT: Der con-Autopilot wird nicht angefasst — eigene Gruppe
# smejj-training. Und der Adapter wird NICHT ausgeliefert: er muss erst gegen
# dieselbe Suite gemessen werden, die heute schon misst, und die Befoerderung
# braucht eine eigene Freigabe.
#
# KEINE RUECKFRAGE MEHR: Die Fassung vom 04.09. fragte im Fenster nach einem
# getippten "ja" — der Betreiber hatte geklickt, das Fenster wartete
# 26 Minuten unbemerkt. Wer diese Datei doppelklickt, hat entschieden.
set -u

BAUM="/private/tmp/claude-501/bau-zweig"
UMGEBUNG="$HOME/.config/smejj.com"

[ -e "$BAUM/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $BAUM"; exit 2; }
cd "$BAUM" || exit 2

echo "1/3 Zugangsdaten laden ..."
set -a
[ -f "$UMGEBUNG/env.local" ] && . "$UMGEBUNG/env.local"
[ -f "$UMGEBUNG/autopilot-keys.env" ] && . "$UMGEBUNG/autopilot-keys.env"
set +a

echo "2/3 Vorpruefung: liegen Basismodell und Datensatz bereit? ..."
node scripts/training/smejj-1-1-trainieren.mjs || { echo "ABBRUCH: Vorpruefung fehlgeschlagen"; exit 3; }

echo
echo "3/3 Trainingslauf starten ..."
node scripts/training/smejj-1-1-trainieren.mjs --starten
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then
  echo "Der Lauf ist gestartet. Fortschritt jederzeit:"
  echo "  node scripts/training/smejj-1-1-trainieren.mjs --stand"
  echo
  echo "Er laeuft hoechstens 170 Minuten und schaltet sich selbst ab."
else
  echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."
fi
exit "$STATUS"
