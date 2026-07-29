#!/bin/zsh
# smejj.com — IDrive-Zugangsdaten fuer den Dienst smejj-training-loop per Doppelklick.
#
# Warum eine EIGENE Datei neben "smejj.com Zeabur-Schluessel.command":
# Die andere Datei ist fuer die Maus-Engine gebaut und legt neun Zeilen ab,
# darunter SMEJJ_MAUS_EXIT_AFTER_RUN, den Maus-Token, PORT und SMEJJ_HOST.
# Beim Training-Loop sind PORT/SMEJJ_HOST schon gesetzt und die Maus-Zeilen
# gehoeren dort nicht hin. Diese Datei kopiert deshalb GENAU die fuenf Zeilen,
# die dem Training-Loop noch fehlen — nicht mehr.
#
# Liest ~/.config/smejj.com/env.local. Werte werden NIE angezeigt, nur in die
# Zwischenablage gelegt. Danach in Zeabur:
#   smejj-training-loop -> Variable -> Edit Raw Variables -> Cmd+V -> Speichern
#
# WICHTIG danach: Zeaburs "Restart" laedt Variablen NICHT neu (gleicher
# Container, alte Werte). Es braucht "Redeploy" oder einen neuen Commit.
set -euo pipefail
ENVFILE="$HOME/.config/smejj.com/env.local"

if [ ! -f "$ENVFILE" ]; then
  osascript -e 'display alert "env.local fehlt" message "Die Datei ~/.config/smejj.com/env.local wurde nicht gefunden." as critical'
  exit 1
fi
source "$ENVFILE"

BENOETIGT=(IDRIVE_E2_ENDPOINT IDRIVE_E2_BUCKET IDRIVE_E2_REGION IDRIVE_E2_ACCESS_KEY IDRIVE_E2_SECRET_KEY)
for v in $BENOETIGT; do
  if [ -z "${(P)v:-}" ]; then
    osascript -e "display alert \"Wert fehlt\" message \"$v fehlt in env.local. Ohne diesen Wert kann der Training-Loop seine Berichte nicht ablegen.\" as critical"
    exit 1
  fi
done

pbcopy <<EOF
IDRIVE_E2_ENDPOINT=$IDRIVE_E2_ENDPOINT
IDRIVE_E2_BUCKET=$IDRIVE_E2_BUCKET
IDRIVE_E2_REGION=$IDRIVE_E2_REGION
IDRIVE_E2_ACCESS_KEY=$IDRIVE_E2_ACCESS_KEY
IDRIVE_E2_SECRET_KEY=$IDRIVE_E2_SECRET_KEY
EOF

osascript -e 'tell application "Google Chrome" to activate' \
          -e 'display dialog "Fuenf Zeilen liegen in der Zwischenablage (Werte bleiben unsichtbar).\n\n1. In Zeabur den Dienst smejj-training-loop waehlen\n2. Reiter Variable -> Edit Raw Variables\n3. Cmd+V, dann Speichern\n4. Danach REDEPLOY druecken (Restart genuegt NICHT — es laedt die Variablen nicht neu)\n\nDanach im Chat: weiter" buttons {"Verstanden"} default button 1 with title "smejj.com — Training-Loop-Schluessel"'
