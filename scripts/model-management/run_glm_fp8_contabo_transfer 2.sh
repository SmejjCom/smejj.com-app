#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$ROOT_DIR"

if [ -f "scripts/model-management/load_local_env.sh" ]; then
  # shellcheck disable=SC1091
  . "scripts/model-management/load_local_env.sh"
  load_model_transfer_env
fi

missing=""
for name in IDRIVE_E2_ENDPOINT IDRIVE_E2_ACCESS_KEY IDRIVE_E2_SECRET_KEY IDRIVE_E2_BUCKET; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    missing="$missing $name"
  fi
done

if [ -n "$missing" ]; then
  echo "Missing required IDrive e2 environment values:$missing" >&2
  echo "Put them in ~/.config/smejj.com/env.local (mode 600) on the transfer server." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required on the transfer server." >&2
  exit 1
fi

export CONFIRM_STREAM_MODEL_UPLOAD="${CONFIRM_STREAM_MODEL_UPLOAD:-YES}"
export HF_MODEL_REPO="${HF_MODEL_REPO:-zai-org/GLM-5.2-FP8}"
export MODEL_S3_PREFIX="${MODEL_S3_PREFIX:-model-files/glm-5-2-fp8}"
export STREAM_INCLUDE_REGEX="${STREAM_INCLUDE_REGEX:-.*}"
export STREAM_PART_SIZE_BYTES="${STREAM_PART_SIZE_BYTES:-67108864}"
export STREAM_RETRY_ATTEMPTS="${STREAM_RETRY_ATTEMPTS:-8}"
export STREAM_SKIP_EXISTING="${STREAM_SKIP_EXISTING:-YES}"

mkdir -p logs/model-transfer
log_file="logs/model-transfer/glm-5-2-fp8-$(date -u +%Y%m%dT%H%M%SZ).log"

echo "Starting GLM-5.2 FP8 streaming transfer."
echo "Source: $HF_MODEL_REPO"
echo "Target: s3://$IDRIVE_E2_BUCKET/$MODEL_S3_PREFIX/original/"
echo "Log: $log_file"
echo "Existing complete objects will be skipped when sizes match."

pnpm run model:stream-to-idrive 2>&1 | tee "$log_file"
pnpm run idrive:verify-glm-complete 2>&1 | tee -a "$log_file"
