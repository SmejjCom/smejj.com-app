#!/bin/zsh
# smejj.com — GitHub-Login-Schluessel per Doppelklick aktivieren.
#
# Ablauf fuer den Betreiber:
#   1. Auf github.com (OAuth-App "smejj.com Login") "Generate a new client secret"
#      klicken und das neue Secret mit dem Kopier-Symbol in die Zwischenablage kopieren.
#   2. Diese Datei doppelklicken. Fertig.
#
# Das Skript liest das Secret NUR aus der Zwischenablage, zeigt es NIE an,
# sichert es in ~/.config/smejj.com/env.local und setzt per Salad-API
# SMEJJ_GITHUB_LOGIN_CLIENT_ID + SMEJJ_GITHUB_LOGIN_CLIENT_SECRET auf der
# Container Group smejj-control (Merge mit allen bestehenden Variablen —
# nichts wird geloescht oder ueberschrieben). Danach wartet es, bis der
# Server github:true meldet, und leert die Zwischenablage.
set -euo pipefail

CLIENT_ID="Ov23liSqth5JlAHAtaZV"
CONTAINER="smejj-control"
CONFIG_URL="https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/auth/config"
ENVFILE="$HOME/.config/smejj.com/env.local"

fehler() {
  osascript -e "display alert \"GitHub-Login\" message \"$1\" as critical" >/dev/null 2>&1 || true
  echo "FEHLER: $1"
  exit 1
}

[ -f "$ENVFILE" ] || fehler "Die Datei ~/.config/smejj.com/env.local wurde nicht gefunden."
source "$ENVFILE"
[ -n "${SALAD_API_KEY:-}" ] || fehler "SALAD_API_KEY fehlt in env.local."
ORG="${SALAD_ORGANIZATION_NAME:-smejjcom}"
PROJ="${SALAD_PROJECT_NAME:-default}"

# 1) Secret aus der Zwischenablage lesen (GitHub-OAuth-Secrets sind 40 Hex-Zeichen).
SECRET="$(pbpaste | tr -d '[:space:]')"
if ! print -r -- "$SECRET" | grep -Eq '^[0-9a-f]{40}$'; then
  fehler "In der Zwischenablage liegt kein GitHub Client Secret.\n\nBitte zuerst auf github.com bei der OAuth-App 'smejj.com Login' auf 'Generate a new client secret' klicken, das Secret mit dem Kopier-Symbol kopieren und dieses Skript erneut doppelklicken."
fi

# 2) In env.local sichern (idempotent: alte Eintraege ersetzen, nichts anzeigen).
TMPENV="$(mktemp)"
grep -v '^SMEJJ_GITHUB_LOGIN_CLIENT_ID=' "$ENVFILE" | grep -v '^SMEJJ_GITHUB_LOGIN_CLIENT_SECRET=' > "$TMPENV"
printf 'SMEJJ_GITHUB_LOGIN_CLIENT_ID=%s\nSMEJJ_GITHUB_LOGIN_CLIENT_SECRET=%s\n' "$CLIENT_ID" "$SECRET" >> "$TMPENV"
chmod 600 "$TMPENV"
mv "$TMPENV" "$ENVFILE"

# 3) Salad: aktuelle Variablen holen, lokal mergen, vollstaendige Map zuruecksenden.
#    (Bewusst die volle Map: funktioniert unabhaengig von Merge-Semantik, nichts geht verloren.)
BASE="https://api.salad.com/api/public/organizations/$ORG/projects/$PROJ/containers/$CONTAINER"
CURRENT="$(mktemp)"; PATCHBODY="$(mktemp)"
chmod 600 "$CURRENT" "$PATCHBODY"
curl -sf --max-time 30 -H "Salad-Api-Key: $SALAD_API_KEY" "$BASE" > "$CURRENT" \
  || { rm -f "$CURRENT" "$PATCHBODY"; fehler "Salad-API: Container Group konnte nicht gelesen werden."; }

SECRET="$SECRET" CLIENT_ID="$CLIENT_ID" /usr/bin/python3 - "$CURRENT" "$PATCHBODY" <<'PY'
import json, os, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
env = (data.get("container") or {}).get("environment_variables") or {}
if not env:
    sys.exit("Leere Variablen-Map vom Server — Abbruch, um nichts zu loeschen.")
env["SMEJJ_GITHUB_LOGIN_CLIENT_ID"] = os.environ["CLIENT_ID"]
env["SMEJJ_GITHUB_LOGIN_CLIENT_SECRET"] = os.environ["SECRET"]
with open(sys.argv[2], "w") as f:
    json.dump({"container": {"environment_variables": env}}, f)
PY

HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 -X PATCH \
  -H "Salad-Api-Key: $SALAD_API_KEY" \
  -H "Content-Type: application/merge-patch+json" \
  --data-binary @"$PATCHBODY" "$BASE")"
rm -f "$CURRENT" "$PATCHBODY"
[ "$HTTP_CODE" = "200" ] || fehler "Salad-API-Update fehlgeschlagen (HTTP $HTTP_CODE). Es wurde nichts geloescht — einfach im Chat melden."

# 4) Zwischenablage leeren — das Secret soll nirgendwo liegen bleiben.
pbcopy < /dev/null

# 5) Warten, bis der Control Server neu startet und github:true meldet (max. 6 Minuten).
echo "Variablen gesetzt. Warte auf den Neustart des Control Servers ..."
for i in {1..36}; do
  sleep 10
  STATUS="$(curl -s --max-time 10 "$CONFIG_URL" | grep -o '"github":[a-z]*' || true)"
  echo "  Versuch $i/36: ${STATUS:-Server startet ...}"
  if [ "$STATUS" = '"github":true' ]; then
    osascript -e 'display dialog "GitHub-Login ist aktiv!\n\nDer Knopf \"Mit GitHub anmelden\" erscheint jetzt auf smejj.com/auth/login.\n\nIm Chat kurz \"weiter\" schreiben — dann wird der Login live durchgetestet." buttons {"Super"} default button 1 with title "smejj.com — GitHub-Login"' >/dev/null 2>&1 || true
    echo "FERTIG: github:true — Login ist aktiv."
    exit 0
  fi
done
osascript -e 'display alert "GitHub-Login" message "Variablen sind gesetzt, aber der Server meldet noch nicht github:true. Im Chat \"weiter\" schreiben — die KI prueft und behebt das." as critical' >/dev/null 2>&1 || true
exit 1
