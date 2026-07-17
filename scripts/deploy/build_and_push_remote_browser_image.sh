#!/usr/bin/env bash
# smejj.com — Remote-Browser-Worker-Image bauen, lokal testen und nach ghcr.io pushen.
# NUR lokal auf deinem Mac ausfuehren (Docker Desktop muss laufen).
# Kein Secret im Image: Token, Budget und Worker-URL bleiben reine Env-Werte.
#
# Voraussetzung einmalig:
#   docker login ghcr.io
#   Username: SmejjCom
#   Passwort: GitHub Personal Access Token mit Scope write:packages
#
# Aufruf:
#   bash scripts/deploy/build_and_push_remote_browser_image.sh
set -euo pipefail

IMAGE="${SMEJJ_REMOTE_BROWSER_IMAGE:-ghcr.io/smejjcom/smejj-remote-browser:latest}"
TEST_IMAGE="smejj-remote-browser:local-preflight"
TEST_CONTAINER="smejj-remote-browser-preflight"
TEST_TOKEN="smejj-local-preflight-token"
TEST_PORT="${SMEJJ_REMOTE_BROWSER_TEST_PORT:-18080}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$REPO_ROOT"
echo "smejj.com: baue Remote-Browser-Worker fuer Salad/amd64 ..."
docker build --platform linux/amd64 \
  -f workers/remote-browser/Dockerfile \
  -t "$TEST_IMAGE" \
  -t "$IMAGE" .

cleanup() {
  docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

echo "smejj.com: lokaler Smoke-Test auf Port $TEST_PORT ..."
docker run -d \
  --name "$TEST_CONTAINER" \
  -p "$TEST_PORT:8080" \
  -e SMEJJ_REMOTE_BROWSER_TOKEN="$TEST_TOKEN" \
  "$TEST_IMAGE" >/dev/null

for _ in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:$TEST_PORT/health" >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS "http://127.0.0.1:$TEST_PORT/health" >/dev/null
curl -fsS -X POST "http://127.0.0.1:$TEST_PORT/render" \
  -H "authorization: Bearer $TEST_TOKEN" \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com","viewport":{"width":800,"height":600}}' \
  | grep -q '"ok": true'

echo "smejj.com: Render-Smoke OK. Pruefe interaktive Live-Session (/session) ..."
# Fail-closed-Vertrag: /session ohne Token -> 401.
CODE_NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$TEST_PORT/session" \
  -H "content-type: application/json" -d '{"url":"https://example.com"}')
[ "$CODE_NOAUTH" = "401" ] || { echo "FEHLER: /session ohne Token lieferte $CODE_NOAUTH statt 401."; exit 1; }
# Echte Session oeffnen, klicken, schliessen (beweist session-engine.js im Image).
SESSION_JSON=$(curl -fsS -X POST "http://127.0.0.1:$TEST_PORT/session" \
  -H "authorization: Bearer $TEST_TOKEN" -H "content-type: application/json" \
  -d '{"url":"https://example.com","viewport":{"width":800,"height":600}}')
echo "$SESSION_JSON" | grep -q '"ok": true' || { echo "FEHLER: /session lieferte kein ok:true."; exit 1; }
SESSION_ID=$(printf '%s' "$SESSION_JSON" | sed -n 's/.*"sessionId": *"\([a-f0-9]*\)".*/\1/p')
[ -n "$SESSION_ID" ] || { echo "FEHLER: keine sessionId erhalten."; exit 1; }
curl -fsS -X POST "http://127.0.0.1:$TEST_PORT/session/act" \
  -H "authorization: Bearer $TEST_TOKEN" -H "content-type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"action\":{\"type\":\"click\",\"xPct\":50,\"yPct\":30}}" \
  | grep -q '"ok": true' || { echo "FEHLER: /session/act click schlug fehl."; exit 1; }
curl -fsS -X POST "http://127.0.0.1:$TEST_PORT/session/close" \
  -H "authorization: Bearer $TEST_TOKEN" -H "content-type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\"}" >/dev/null

echo "smejj.com: Smoke-Test OK (Render + Live-Session)."
echo "smejj.com: push nach ghcr.io ..."
docker push "$IMAGE"

echo
echo "FERTIG. Image liegt unter: $IMAGE"
echo "Naechster Schritt: Salad-Portal -> neue CPU Container Group fuer Remote Browser"
echo "  Image Source: $IMAGE"
echo "  Port/Gateway: 8080"
echo "  Env: SMEJJ_REMOTE_BROWSER_TOKEN=<starkes Secret>"
echo "Danach Control Server Env setzen:"
echo "  SMEJJ_REMOTE_BROWSER_ENABLED=YES"
echo "  SMEJJ_REMOTE_BROWSER_WORKER_URL=https://<remote-browser-gateway>.salad.cloud"
echo "  SMEJJ_REMOTE_BROWSER_TOKEN=<gleiches Secret>"
