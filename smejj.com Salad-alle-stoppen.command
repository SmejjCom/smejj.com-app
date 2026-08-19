#!/bin/zsh
# smejj.com — Stoppt die vier ausgemusterten Salad-Container-Groups.
# NUR Stop, nichts wird geloescht. Wiederanschalten jederzeit im Salad-Portal.
# Hintergrund: Alles laeuft seit 2026-08-13 auf Zeabur (bewiesen) — die alten
# Salad-Container verbrauchen nur noch Geld. Freigabe: Betreiber 2026-08-13.
set -euo pipefail
cd "$(dirname "$0")"

ENVDATEI="$HOME/.config/smejj.com/env.local"
[ -f "$ENVDATEI" ] || { echo "FEHLER: $ENVDATEI fehlt."; exit 1; }
set -a; source "$ENVDATEI"; set +a
: "${SALAD_API_KEY:?SALAD_API_KEY fehlt in env.local}"
: "${SALAD_ORGANIZATION_NAME:?SALAD_ORGANIZATION_NAME fehlt in env.local}"
: "${SALAD_PROJECT_NAME:?SALAD_PROJECT_NAME fehlt in env.local}"

BASIS="https://api.salad.com/api/public/organizations/${SALAD_ORGANIZATION_NAME}/projects/${SALAD_PROJECT_NAME}/containers"

for GRUPPE in \
  "smejj-chat-bridge-v88b-live" \
  "smejj-control" \
  "smejj-remote-browser-bridge-live" \
  "smejj-remote-browser-live"
do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST \
    -H "Salad-Api-Key: ${SALAD_API_KEY}" "${BASIS}/${GRUPPE}/stop")
  echo "  ${GRUPPE}: Stop -> HTTP ${CODE}"
done

echo ""
echo "Fertig. Salad braucht 1-2 Minuten zum Herunterfahren."
echo "Danach in der Claude-Sitzung 'gestoppt' sagen — die Gegenprobe laeuft dann."
read -r "?Enter zum Schliessen..."
