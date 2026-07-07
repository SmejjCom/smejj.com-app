#!/usr/bin/env sh
set -eu

. "$(dirname "$0")/load_local_env.sh"
load_model_transfer_env

if [ "${CONFIRM_IDRIVE_UPLOAD:-NO}" != "YES" ]; then
  echo "Refusing to upload. Set CONFIRM_IDRIVE_UPLOAD=YES only after checksum verification."
  exit 1
fi

for name in IDRIVE_E2_ENDPOINT IDRIVE_E2_ACCESS_KEY IDRIVE_E2_SECRET_KEY IDRIVE_E2_BUCKET; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "$name is required."
    exit 1
  fi
done

MODEL_TMP_DIR="${MODEL_TMP_DIR:-/tmp/smejj-model-files/kimi-k2-7}"
MODEL_S3_PREFIX="${MODEL_S3_PREFIX:-model-files/kimi-k2-7}"

if [ ! -d "$MODEL_TMP_DIR" ]; then
  echo "MODEL_TMP_DIR does not exist: $MODEL_TMP_DIR"
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required for S3-compatible upload."
  exit 1
fi

export AWS_ACCESS_KEY_ID="$IDRIVE_E2_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$IDRIVE_E2_SECRET_KEY"

echo "Uploading to s3://$IDRIVE_E2_BUCKET/$MODEL_S3_PREFIX/original/"
aws s3 sync "$MODEL_TMP_DIR/" "s3://$IDRIVE_E2_BUCKET/$MODEL_S3_PREFIX/original/" \
  --endpoint-url "$IDRIVE_E2_ENDPOINT" \
  --exclude "checksums.sha256" \
  --only-show-errors

if [ -f "$MODEL_TMP_DIR/checksums.sha256" ]; then
  echo "Uploading checksum manifest"
  aws s3 cp "$MODEL_TMP_DIR/checksums.sha256" "s3://$IDRIVE_E2_BUCKET/$MODEL_S3_PREFIX/checksums/checksums.sha256" \
    --endpoint-url "$IDRIVE_E2_ENDPOINT" \
    --only-show-errors
else
  echo "checksums.sha256 is missing. Run scripts/model-management/verify_model_files.sh before upload."
  exit 1
fi

for notice_file in LICENSE THIRD_PARTY_NOTICES.md; do
  if [ -f "$MODEL_TMP_DIR/$notice_file" ]; then
    aws s3 cp "$MODEL_TMP_DIR/$notice_file" "s3://$IDRIVE_E2_BUCKET/$MODEL_S3_PREFIX/notes/$notice_file" \
      --endpoint-url "$IDRIVE_E2_ENDPOINT" \
      --only-show-errors
  fi
done

echo "Listing uploaded files"
aws s3 ls "s3://$IDRIVE_E2_BUCKET/$MODEL_S3_PREFIX/original/" \
  --endpoint-url "$IDRIVE_E2_ENDPOINT" \
  --recursive \
  --summarize
