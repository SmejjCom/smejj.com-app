#!/usr/bin/env sh
set -eu

. "$(dirname "$0")/load_local_env.sh"
load_model_transfer_env

MODEL_TMP_DIR="${MODEL_TMP_DIR:-/tmp/smejj-model-files/kimi-k2-7}"
MIN_FREE_GIB="${MIN_FREE_GIB:-650}"
HF_MODEL_REPO="${HF_MODEL_REPO:-moonshotai/Kimi-K2.7-Code}"
failed=0

echo "Model repo: $HF_MODEL_REPO"
echo "Temporary directory: $MODEL_TMP_DIR"
echo "Minimum recommended free local disk: ${MIN_FREE_GIB} GiB"

case "$MODEL_TMP_DIR" in
  "$PWD"/*|"$PWD")
    echo "FAIL: MODEL_TMP_DIR must be outside the repository."
    exit 1
    ;;
  *)
    echo "OK: MODEL_TMP_DIR is outside the repository."
    ;;
esac

mkdir -p "$MODEL_TMP_DIR"

available_kib="$(df -Pk "$MODEL_TMP_DIR" | awk 'NR==2 {print $4}')"
available_gib="$((available_kib / 1024 / 1024))"

echo "Available local disk: ${available_gib} GiB"
if [ "$available_gib" -lt "$MIN_FREE_GIB" ]; then
  echo "FAIL: local disk is too small for a safe full-model download."
  echo "Use a server or mounted volume with at least ${MIN_FREE_GIB} GiB free."
  failed=1
fi

for command_name in huggingface-cli aws shasum; do
  if command -v "$command_name" >/dev/null 2>&1; then
    echo "OK: $command_name found"
  else
    echo "FAIL: $command_name is missing"
    failed=1
  fi
done

for env_name in IDRIVE_E2_ENDPOINT IDRIVE_E2_ACCESS_KEY IDRIVE_E2_SECRET_KEY IDRIVE_E2_BUCKET; do
  eval "env_value=\${$env_name:-}"
  if [ -n "$env_value" ]; then
    echo "OK: $env_name is set"
  else
    echo "FAIL: $env_name is missing"
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "Preflight failed."
  exit 1
fi

echo "Preflight passed."
