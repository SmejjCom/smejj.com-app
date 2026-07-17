#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${SMEJJ_IDRIVE_ENV_FILE:-/root/smejj-idrive.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

export HF_MODEL_REPO="${HF_MODEL_REPO:-zai-org/GLM-5.2-FP8}"
export MODEL_S3_PREFIX="${MODEL_S3_PREFIX:-model-files/glm-5-2-fp8}"
export CONFIRM_STREAM_MODEL_UPLOAD="${CONFIRM_STREAM_MODEL_UPLOAD:-YES}"
export STREAM_INCLUDE_REGEX="${STREAM_INCLUDE_REGEX:-.*}"

cd "$ROOT_DIR"
exec node scripts/model-management/stream_hf_model_to_idrive.mjs
