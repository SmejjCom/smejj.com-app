#!/usr/bin/env sh

load_model_transfer_env() {
  env_file="${SMEJJ_LOCAL_ENV_FILE:-${HOME:?HOME is required}/.config/smejj.com/env.local}"
  [ -f "$env_file" ] || return 0
    while IFS= read -r raw_line || [ -n "$raw_line" ]; do
      case "$raw_line" in
        ""|\#*) continue ;;
      esac

      key="${raw_line%%=*}"
      value="${raw_line#*=}"

      case "$key" in
        IDRIVE_E2_ENDPOINT|IDRIVE_E2_REGION|IDRIVE_E2_ACCESS_KEY|IDRIVE_E2_SECRET_KEY|IDRIVE_E2_BUCKET|HF_MODEL_REPO|MODEL_TMP_DIR|MODEL_S3_PREFIX|CONFIRM_MODEL_DOWNLOAD|CONFIRM_IDRIVE_UPLOAD|CONFIRM_STREAM_MODEL_UPLOAD|STREAM_INCLUDE_REGEX|STREAM_PART_SIZE_BYTES|STREAM_RETRY_ATTEMPTS|STREAM_SKIP_EXISTING|MIN_FREE_GIB|HF_TOKEN)
          eval "current_value=\${$key:-}"
          if [ -z "$current_value" ]; then
            escaped_value=$(printf "%s" "$value" | sed "s/'/'\\\\''/g")
            eval "export $key='$escaped_value'"
          fi
          ;;
      esac
    done < "$env_file"
}
