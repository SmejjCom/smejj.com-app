#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-04):
# Basismodell Qwen3-4B-Instruct nach IDrive e2 spiegeln.
#
# Damit faellt Tor 5 von sieben (Basismodell) im Modell-Evolutions-Takt.
#
# WAS PASSIERT: Ein Salad-Knoten laedt die rund 8 GB direkt von Hugging Face
# und legt sie nach e2 unter models/staging/qwen3-4b-instruct. Nicht ueber
# diesen Mac — bei 1,5 Mbit/s waeren das zwoelf Stunden, und der Mac ist fuer
# Modellarbeit tabu.
#
# WAS ES KOSTET: Ein Spiegel braucht keine Grafikkarte (job.py verlangt CUDA nur
# bei Messung und Training). Salad rechnet stundenweise ab, Prioritaet "batch"
# ist die guenstigste Stufe. Erwartung: deutlich unter einem Dollar. Die
# Salad-Freigabe steht bereits, der Monatsdeckel liegt bei 10 USD, verbraucht
# sind bisher 2,85.
#
# WAS NICHT PASSIERT: Der con-Autopilot wird NICHT angefasst. Der Spiegel laeuft
# in einer eigenen Gruppe (smejj-spiegel); con-job behaelt seinen laufenden
# Trainingslauf.
#
# Zeitgrenze 60 Minuten, Selbstabschaltung an. Ohne beides startet nichts.
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

echo "2/3 Probelauf — was wuerde passieren?"
node scripts/training/smejj-1-1-basis-spiegeln.mjs || { echo "ABBRUCH: Probelauf fehlgeschlagen"; exit 3; }

echo
echo "3/3 Jetzt wirklich starten? Das kostet Salad-Zeit (Erwartung: unter 1 USD)."
printf "   Zum Starten 'ja' eingeben, alles andere bricht ab: "
read -r ANTWORT
if [ "$ANTWORT" != "ja" ]; then
  echo "Abgebrochen — nichts gestartet."
  exit 0
fi

node scripts/training/smejj-1-1-basis-spiegeln.mjs --starten
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then
  echo "Der Spiegel laeuft. Fortschritt jederzeit abfragen:"
  echo "  node scripts/training/smejj-1-1-basis-spiegeln.mjs --stand"
  echo
  echo "Wenn er fertig ist, im Zeabur-Portal beim Dienst smejj-control setzen:"
  echo "  SMEJJ_LORA_BASIS_PREFIX=models/staging/qwen3-4b-instruct/"
  echo "und den Dienst NEU BAUEN (ein Neustart zieht keine neue Umgebung)."
else
  echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."
fi
exit "$STATUS"
