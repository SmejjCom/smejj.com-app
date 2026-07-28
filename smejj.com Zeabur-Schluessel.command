#!/bin/zsh
# smejj.com — Zeabur-Variablen fuer die Maus-Engine per Doppelklick.
# Liest ~/.config/smejj.com/env.local, legt 9 Zeilen in die Zwischenablage
# (Werte werden NIE angezeigt), holt Chrome nach vorn und sagt, was zu tun ist.
# Danach in Zeabur ins Feld "Key" klicken und Cmd+V druecken.
set -euo pipefail
ENVFILE="$HOME/.config/smejj.com/env.local"
if [ ! -f "$ENVFILE" ]; then
  osascript -e 'display alert "env.local fehlt" message "Die Datei ~/.config/smejj.com/env.local wurde nicht gefunden." as critical'
  exit 1
fi
source "$ENVFILE"

# Token: vorhandenen wiederverwenden, sonst neu erzeugen und ablegen.
if [ -z "${SMEJJ_MAUS_ENGINE_TOKEN:-}" ]; then
  SMEJJ_MAUS_ENGINE_TOKEN="$(openssl rand -hex 32)"
  printf '\nSMEJJ_MAUS_ENGINE_TOKEN=%s\n' "$SMEJJ_MAUS_ENGINE_TOKEN" >> "$ENVFILE"
fi

for v in IDRIVE_E2_ENDPOINT IDRIVE_E2_BUCKET IDRIVE_E2_REGION IDRIVE_E2_ACCESS_KEY IDRIVE_E2_SECRET_KEY; do
  if [ -z "${(P)v:-}" ]; then
    osascript -e "display alert \"Wert fehlt\" message \"$v fehlt in env.local.\" as critical"
    exit 1
  fi
done

pbcopy <<EOF
SMEJJ_MAUS_EXIT_AFTER_RUN=NO
SMEJJ_HOST=0.0.0.0
PORT=8080
SMEJJ_MAUS_ENGINE_TOKEN=$SMEJJ_MAUS_ENGINE_TOKEN
IDRIVE_E2_ENDPOINT=$IDRIVE_E2_ENDPOINT
IDRIVE_E2_BUCKET=$IDRIVE_E2_BUCKET
IDRIVE_E2_REGION=$IDRIVE_E2_REGION
IDRIVE_E2_ACCESS_KEY=$IDRIVE_E2_ACCESS_KEY
IDRIVE_E2_SECRET_KEY=$IDRIVE_E2_SECRET_KEY
EOF

osascript -e 'tell application "Google Chrome" to activate' \
          -e 'display dialog "Zwischenablage ist gefuellt (Werte bleiben unsichtbar).\n\nJetzt im Zeabur-Fenster in das Feld KEY klicken und Cmd+V druecken.\n\nDanach im Chat: weiter" buttons {"Verstanden"} default button 1 with title "smejj.com — Zeabur-Schluessel"'
