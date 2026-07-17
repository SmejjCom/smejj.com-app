#!/usr/bin/env bash
# smejj.com — Maus-Engine-Worker-Image bauen, lokal smoke-testen und nach ghcr.io pushen.
# NUR lokal auf dem Mac ausfuehren (Docker Desktop muss laufen).
# Kein Secret im Image: Token und IDrive-Werte bleiben reine Salad-Env-Werte.
#
# Voraussetzung einmalig (wie remote-browser/control):
#   docker login ghcr.io
#   Username: SmejjCom
#   Passwort: GitHub Personal Access Token mit Scope write:packages
#
# Aufruf:
#   bash scripts/deploy/build_and_push_maus_engine_image.sh
set -euo pipefail

IMAGE_V1="${SMEJJ_MAUS_ENGINE_IMAGE:-ghcr.io/smejjcom/smejj-maus-engine:v1}"
IMAGE_LATEST="ghcr.io/smejjcom/smejj-maus-engine:latest"
TEST_IMAGE="smejj-maus-engine:local-preflight"
TEST_CONTAINER="smejj-maus-engine-preflight"
TEST_TOKEN="smejj-local-preflight-token"
TEST_PORT="${SMEJJ_MAUS_ENGINE_TEST_PORT:-18090}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$REPO_ROOT"
echo "smejj.com: baue Maus-Engine-Worker fuer Salad/amd64 ..."
docker build --platform linux/amd64 \
  -f workers/maus-engine/Dockerfile \
  -t "$TEST_IMAGE" \
  -t "$IMAGE_V1" \
  -t "$IMAGE_LATEST" .

cleanup() {
  docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

echo "smejj.com: lokaler Smoke-Test auf Port $TEST_PORT (kein Browserlauf, keine Secrets) ..."
docker run -d \
  --name "$TEST_CONTAINER" \
  -p "$TEST_PORT:8080" \
  -e SMEJJ_MAUS_ENGINE_TOKEN="$TEST_TOKEN" \
  -e SMEJJ_MAUS_EXIT_AFTER_RUN=NO \
  "$TEST_IMAGE" >/dev/null

HEALTH_OK=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$TEST_PORT/health" | grep -q "smejj.com maus-engine"; then
    HEALTH_OK="yes"
    break
  fi
  sleep 1
done
[ -n "$HEALTH_OK" ] || { echo "FEHLER: /health antwortet nicht wie erwartet."; exit 1; }

# Fail-closed-Vertrag: /run ohne Token -> 401; mit Token + ungueltigem Plan -> 422.
CODE_NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$TEST_PORT/run" \
  -H "content-type: application/json" -d '{"plan":{}}')
[ "$CODE_NOAUTH" = "401" ] || { echo "FEHLER: /run ohne Token lieferte $CODE_NOAUTH statt 401."; exit 1; }
CODE_INVALID=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$TEST_PORT/run" \
  -H "authorization: Bearer $TEST_TOKEN" \
  -H "content-type: application/json" -d '{"plan":{}}')
[ "$CODE_INVALID" = "422" ] || { echo "FEHLER: /run mit ungueltigem Plan lieferte $CODE_INVALID statt 422."; exit 1; }

echo "smejj.com: Smoke-Test OK (health, 401 fail-closed, 422 fail-closed)."
echo "smejj.com: push nach ghcr.io ..."
docker push "$IMAGE_V1"
docker push "$IMAGE_LATEST"

echo
echo "FERTIG. Image liegt unter: $IMAGE_V1 (zusaetzlich :latest)"
echo "Naechster Schritt: Salad-Portal -> neue CPU Container Group smejj-maus-engine"
echo "  Image Source: $IMAGE_V1"
echo "  Port/Gateway: 8080, Replicas 1, Autostart AUS"
echo "  Env (Werte NUR im Portal setzen):"
echo "    SMEJJ_MAUS_ENGINE_TOKEN=<neu erzeugtes starkes Secret>"
echo "    IDRIVE_E2_ENDPOINT / IDRIVE_E2_BUCKET / IDRIVE_E2_REGION"
echo "    IDRIVE_E2_ACCESS_KEY / IDRIVE_E2_SECRET_KEY"
