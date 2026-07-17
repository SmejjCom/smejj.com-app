#!/usr/bin/env bash
# smejj.com — Control-Server-Image bauen und nach ghcr.io pushen.
# NUR lokal auf deinem Mac ausfuehren (Docker Desktop muss laufen).
# Kein Secret im Image (alles env-basiert). Free-Policy-konform: ghcr.io ist fuer
# oeffentliche Images kostenlos.
#
# Voraussetzung einmalig:  docker login ghcr.io   (Username: SmejjCom,
#   Passwort: GitHub Personal Access Token mit Scope write:packages)
#
# Aufruf:  bash scripts/deploy/build_and_push_control_image.sh
set -euo pipefail

IMAGE="ghcr.io/smejjcom/smejj-control:latest"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$REPO_ROOT"
echo "smejj.com: baue $IMAGE (Plattform linux/amd64 fuer Salad) ..."

# Salad-Nodes sind AMD64 -> explizit amd64 bauen (auch auf Apple Silicon).
docker build --platform linux/amd64 \
  -f deploy/control-server/Dockerfile \
  -t "$IMAGE" .

echo "smejj.com: lokaler Smoke-Test (Port 3000) ..."
CID="$(docker run -d -p 3000:3000 -e SMEJJ_HOST=0.0.0.0 -e PORT=3000 "$IMAGE")"
sleep 3
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  echo "smejj.com: /api/health OK"
else
  echo "smejj.com: WARNUNG /api/health nicht erreichbar — Logs:"; docker logs "$CID" || true
fi
docker rm -f "$CID" >/dev/null 2>&1 || true

echo "smejj.com: push nach ghcr.io ..."
docker push "$IMAGE"

echo
echo "FERTIG. Image liegt unter: $IMAGE"
echo "Naechster Schritt: Salad-Portal -> Container Group smejj-control -> Edit ->"
echo "  Image Source auf $IMAGE setzen, Command-Override LEEREN (Clear All),"
echo "  Env behalten (SMEJJ_HOST=::, PORT=3000, PROJECT_ROOT=/app), Save."
echo "Danach ist das Image oeffentlich? Pruefe unter:"
echo "  https://github.com/orgs/SmejjCom/packages  (Package ggf. auf public stellen)"
