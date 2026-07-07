#!/bin/sh
# smejj.com — packt den Docker-Build-Kontext des Control Servers als Tarball.
# Der Tarball wird per Browser-Upload in das Build-Repo gelegt; GitHub Actions
# baut daraus das Image (siehe deploy/control-server/github-workflow-build-image.yml).
# Aufruf aus dem Projektstamm:  sh scripts/deploy/pack_control_context.sh [ZIELDATEI]
set -eu

OUT="${1:-smejj-control-context.tar.gz}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/smejj-control-context.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

for item in \
  package.json \
  src \
  control-server \
  gatekeeper \
  worker-templates \
  public \
  docs \
  Memory_Bank.md AI_Guidelines.md Project_Goals.md AGENTS.md README.md \
  .dockerignore \
  deploy/control-server/Dockerfile
do
  mkdir -p "$TMP_DIR/$(dirname "$item")"
  cp -R "$item" "$TMP_DIR/$item"
done

find "$TMP_DIR" -type d -exec chmod 755 {} +
find "$TMP_DIR" -type f -exec chmod 644 {} +
find "$TMP_DIR" -type f \( -name "*.sh" -o -name "*.command" \) -exec chmod 755 {} +

tar --exclude="*/.DS_Store" --exclude=".DS_Store" -C "$TMP_DIR" -czf "$OUT" \
  package.json \
  src \
  control-server \
  gatekeeper \
  worker-templates \
  public \
  docs \
  Memory_Bank.md AI_Guidelines.md Project_Goals.md AGENTS.md README.md \
  .dockerignore \
  deploy/control-server/Dockerfile

echo "Build-Kontext geschrieben: $OUT ($(wc -c < "$OUT") Bytes)"
