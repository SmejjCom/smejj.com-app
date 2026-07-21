#!/usr/bin/env bash
# smejj.com — Voice-Worker-Image bauen, lokal smoke-testen und nach ghcr.io pushen.
# NUR lokal auf dem Mac ausfuehren (Docker Desktop muss laufen).
# Kein Secret im Image: Router-Key, IDrive- und TTS-Werte bleiben reine Salad-Env-Werte.
#
# Voraussetzung einmalig (wie remote-browser/maus-engine/control):
#   docker login ghcr.io
#   Username: SmejjCom
#   Passwort: GitHub Personal Access Token mit Scope write:packages
#
# Aufruf:
#   bash scripts/deploy/build_and_push_voice_worker_image.sh
#
# HINWEIS ZUR BAUZEIT: Dies ist ein GPU-Image (CUDA + PyTorch + Whisper) und damit
# deutlich groesser als die bisherigen Node-Images. Auf Apple Silicon laeuft der
# amd64-Build unter Emulation und kann sehr lange dauern. Wenn der Build zu lange
# braucht oder scheitert, ist ein Build auf einer echten linux/amd64-Maschine
# der schnellere Weg — der Rest des Ablaufs bleibt identisch.
set -euo pipefail

IMAGE_V1="${SMEJJ_VOICE_WORKER_IMAGE:-ghcr.io/smejjcom/smejj-voice-worker:v1}"
IMAGE_LATEST="ghcr.io/smejjcom/smejj-voice-worker:latest"
TEST_IMAGE="smejj-voice-worker:local-preflight"
TEST_CONTAINER="smejj-voice-worker-preflight"
TEST_PORT="${SMEJJ_VOICE_WORKER_TEST_PORT:-18095}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$REPO_ROOT"

echo "smejj.com: baue Voice-Worker fuer Salad/amd64 ..."
docker build --platform linux/amd64 \
  -f workers/smejj-voice/Dockerfile \
  -t "$TEST_IMAGE" \
  -t "$IMAGE_V1" \
  -t "$IMAGE_LATEST" \
  workers/smejj-voice

cleanup() {
  docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

# --------------------------------------------------------------------------- #
# Test 1 — FAIL-CLOSED: ohne Budget-Gate darf der Worker NICHT starten.
# Das ist die Kostenbremse: kein Budget => kein Port => keine bezahlte Rechenzeit.
# --------------------------------------------------------------------------- #
echo "smejj.com: Fail-closed-Test (ohne Budget-Gate darf nicht starten) ..."
if docker run --rm --platform linux/amd64 "$TEST_IMAGE" >/dev/null 2>&1; then
  echo "FEHLER: Worker startete OHNE Budget-Gate. Fail-closed verletzt."
  exit 1
fi
echo "smejj.com: OK — Start ohne Budget-Gate wird verweigert."

# --------------------------------------------------------------------------- #
# Test 2 — HEALTH: mit gueltigem Budget-Gate muss /health antworten.
# Dummy-Werte, keine echten Secrets. Kein GPU noetig fuer den Health-Pfad.
# --------------------------------------------------------------------------- #
echo "smejj.com: Smoke-Test auf Port $TEST_PORT (Dummy-Werte, keine Secrets) ..."
docker run -d \
  --name "$TEST_CONTAINER" \
  --platform linux/amd64 \
  -p "$TEST_PORT:8080" \
  -e SMEJJ_BUDGET_MAX_USD_PER_JOB=0.05 \
  -e SMEJJ_BUDGET_MAX_RUNTIME_MINUTES=20 \
  -e SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS=1 \
  -e SMEJJ_WORKER_BUDGET_USD=0.03 \
  -e SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES=15 \
  -e SMEJJ_VOICE_IDLE_SHUTDOWN_SECONDS=600 \
  -e SMEJJ_LLM_BASE_URL=http://127.0.0.1:9/v1 \
  -e SMEJJ_LLM_API_KEY=local-preflight-key \
  -e SMEJJ_TTS_BASE_URL=http://127.0.0.1:9 \
  -e SMEJJ_WHISPER_DEVICE=cpu \
  -e SMEJJ_WHISPER_COMPUTE=int8 \
  "$TEST_IMAGE" >/dev/null

HEALTH_OK=""
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$TEST_PORT/health" | grep -q "smejj.com"; then
    HEALTH_OK="yes"
    break
  fi
  sleep 2
done
if [ -z "$HEALTH_OK" ]; then
  echo "FEHLER: /health antwortet nicht wie erwartet. Container-Log:"
  docker logs "$TEST_CONTAINER" 2>&1 | tail -40
  exit 1
fi

echo "smejj.com: Smoke-Test OK (fail-closed ohne Budget, /health mit Budget)."
echo "smejj.com: push nach ghcr.io ..."
docker push "$IMAGE_V1"
docker push "$IMAGE_LATEST"

echo
echo "FERTIG. Image liegt unter: $IMAGE_V1 (zusaetzlich :latest)"
echo "Naechster Schritt: Salad-Container-Gruppe auf genau dieses Image zeigen lassen."
