#!/usr/bin/env sh
set -eu

MODEL_TMP_DIR="${MODEL_TMP_DIR:-/tmp/smejj-model-files/kimi-k2-7}"
MANIFEST_PATH="${MANIFEST_PATH:-$MODEL_TMP_DIR/checksums.sha256}"

if [ ! -d "$MODEL_TMP_DIR" ]; then
  echo "MODEL_TMP_DIR does not exist: $MODEL_TMP_DIR"
  exit 1
fi

echo "Model directory: $MODEL_TMP_DIR"
du -sh "$MODEL_TMP_DIR"
find "$MODEL_TMP_DIR" -type f | wc -l | awk '{print "File count: " $1}'

echo "Writing SHA256 manifest to $MANIFEST_PATH"
find "$MODEL_TMP_DIR" -type f ! -name "$(basename "$MANIFEST_PATH")" -print0 \
  | sort -z \
  | xargs -0 shasum -a 256 > "$MANIFEST_PATH"

echo "Verifying manifest"
shasum -a 256 -c "$MANIFEST_PATH"
