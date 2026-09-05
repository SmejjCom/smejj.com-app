#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-05):
# smejj 1.1 messen — Basismodell nackt und Basismodell + Adapter gegen die
# smejj-Suite (evals/suites/smejj-chat-core-v1.json, 14 Faelle, 3 Wiederholungen).
#
# WAS PASSIERT: Ein Salad-Knoten holt das Basismodell (Qwen3-4B-Instruct-2507)
# und den trainierten Adapter aus e2, beantwortet 84 Fragen und legt die
# Antworten unter smejj/evals/ ab. Benotet wird danach HIER auf dem Mac mit
# derselben Messstrecke wie der Qualitaets-Job (kein Modell-als-Richter).
#
# WAS ES KOSTET: hoechstens rund 0,10 USD (60 Minuten Grenze, 24-GB-Karte, batch).
#
# WAS NICHT PASSIERT: Der con-Autopilot wird nicht angefasst — eigene Gruppe
# smejj-training. Es wird nichts befoerdert und nichts ausgeliefert.
#
# Danach: dieses Skript mit der Job-Id noch einmal aufrufen, oder
#   node scripts/training/smejj-1-1-messen.mjs --bewerten <jobId>
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

if [ "${1:-}" != "" ]; then
  echo "Bewertung fuer Job $1 ..."
  node scripts/training/smejj-1-1-messen.mjs --bewerten "$1"
  exit $?
fi

echo "2/3 Vorpruefung: liegt der Adapter bereit, ist die Gruppe frei? ..."
node scripts/training/smejj-1-1-messen.mjs || { echo "ABBRUCH: Vorpruefung fehlgeschlagen"; exit 3; }

echo
echo "3/3 Messjob starten ..."
node scripts/training/smejj-1-1-messen.mjs --starten
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then
  echo "Der Messjob ist gestartet. Fortschritt jederzeit:"
  echo "  node scripts/training/smejj-1-1-messen.mjs --stand"
  echo "Nach dem Ende benoten:"
  echo "  node scripts/training/smejj-1-1-messen.mjs --bewerten <jobId>"
else
  echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."
fi
exit "$STATUS"
