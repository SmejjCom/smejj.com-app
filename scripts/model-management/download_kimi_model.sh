#!/usr/bin/env sh
set -eu

. "$(dirname "$0")/load_local_env.sh"
load_model_transfer_env

if [ "${CONFIRM_MODEL_DOWNLOAD:-NO}" != "YES" ]; then
  echo "Refusing to download. Set CONFIRM_MODEL_DOWNLOAD=YES after verifying source, license, size, local disk, and IDrive e2 capacity."
  exit 1
fi

if [ -z "${HF_MODEL_REPO:-}" ]; then
  echo "HF_MODEL_REPO is required, for example moonshotai/Kimi-K2.7-Code after manual approval."
  exit 1
fi

MODEL_TMP_DIR="${MODEL_TMP_DIR:-/tmp/smejj-model-files/kimi-k2-7}"
case "$MODEL_TMP_DIR" in
  "$PWD"/*|"$PWD")
    echo "MODEL_TMP_DIR must be outside the repository to avoid accidental Git storage."
    exit 1
    ;;
esac

mkdir -p "$MODEL_TMP_DIR"

sh "$(dirname "$0")/preflight_kimi_k27_storage.sh"

echo "Downloading $HF_MODEL_REPO to $MODEL_TMP_DIR"
huggingface-cli download "$HF_MODEL_REPO" \
  --local-dir "$MODEL_TMP_DIR" \
  --local-dir-use-symlinks False

echo "Download finished. Run scripts/model-management/verify_model_files.sh next."
