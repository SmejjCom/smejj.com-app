# Kimi K2.7 Model Storage

## Status

Verified on 2026-06-22:

- IDrive e2 prefix `model-files/kimi-k2-7/` lists `102` objects.
- Original model prefix contains all `86` expected source files.
- All `64` safetensors shards are present.
- `npm run idrive:verify-kimi` passed after repairing the missing checksum-manifest entry for `figures/demo_video.mp4`.
- Inference remains disabled by default; IDrive e2 is storage, not compute.

Provisioned on 2026-06-15:

- IDrive e2 account: `smejjcom@gmail.com`
- Current plan shown by IDrive e2: `2 TB Yearly`
- Bucket: `smejj-model-files`
- Region: Los Angeles
- Endpoint: `https://s3.us-west-2.idrivee2.com`
- Region code: `us-west-2`
- Local secret file: `.env.local` with file mode `600`
- S3 access check: passed with `npm run idrive:check`

No full model-weight files have been downloaded or uploaded yet. Small upstream source files have been archived and test-streamed to IDrive e2.

A dedicated access key named `smejj-kimi-k27-storage` has been created for the transfer workflow. It is scoped to bucket `smejj-model-files` and configured for read/write access without bucket deletion or governance-bypass permissions. Real key values must stay only in local environment variables or a local ignored env file.

The exact public model source for Kimi K2.7 Code is confirmed as `moonshotai/Kimi-K2.7-Code` on Hugging Face.

Current transfer status: storage and credentials are ready; full-model transfer is still blocked until a transfer machine with enough bandwidth, stability, and upload tooling is selected.

Direct streaming transfer support was added on 2026-06-16. It can transfer files from Hugging Face to IDrive e2 with S3 multipart uploads without storing the full model locally. It is still gated by explicit confirmation and must only be run after confirming IDrive e2 capacity, source, license, and network stability.

A limited streaming test on 2026-06-16 succeeded for `README.md`, `LICENSE`, and `THIRD_PARTY_NOTICES.md`. These files are visible under `model-files/kimi-k2-7/original/`, and the checksum manifest is visible at `model-files/kimi-k2-7/checksums/streamed-checksums.sha256`.

A full local streaming attempt on 2026-06-16 was stopped after the first safetensors file started transferring. The route is technically valid, but the observed local throughput was too slow for a safe full 554 GiB transfer from this machine. One incomplete multipart upload was aborted with `npm run model:abort-incomplete`. Use a transfer machine with faster upstream bandwidth or a data-center/near-cloud host for the full upload.

The provider-side IDrive e2 Cloud Data Migration path was checked on 2026-06-16. IDrive e2 supports direct migration from S3-compatible/Azure/GCS-style object storage sources, but Hugging Face model repositories are not exposed as an S3-compatible source bucket for IDrive e2 to import directly. See `docs/model-management/KIMI_K27_DIRECT_IDRIVE_IMPORT_DECISION.md`.

A Contabo transfer-machine stream was started on 2026-06-16 from `/root/smejj-kimi-transfer` on `95.111.252.106`. It streams Hugging Face files to IDrive e2 without storing the full model locally. The first safetensors file, `model-00001-of-000064.safetensors`, was uploaded and visible in IDrive e2. The transfer process continued with `model-00002-of-000064.safetensors`.

Local preflight checked on 2026-06-16:

- Local free disk in this project volume: `457 GiB`
- Required minimum before download: `650 GiB`
- Result: blocked; do not download model files on this machine.
- Missing local transfer tools: `huggingface-cli`, `aws`
- Available local tools include `node`, `npm`, `git`, `python3`, `shasum`, `sha256sum`, and `curl`.
- No model files were found in the project or temporary model directory during this check.

Preparation status: complete. Source metadata and license artifacts have been archived in IDrive e2. The remaining full-weight download/checksum/upload commands are intentionally gated by preflight checks and explicit confirmation variables so the transfer cannot start on this undersized local machine.

Cost and platform constraints:

- GitHub.com may be used only on free plans and only for source code, documentation, and lightweight metadata.
- Cloudflare.com may be used only on free plans and only for web/edge delivery or routing that fits the free tier.
- GitHub and Cloudflare must not store model weights, media archives, user data, or large generated artifacts.
- IDrive e2 is the primary server-side file store for model files, media, checksums, notes, and other durable large-file assets.
- Do not add paid GitHub services, paid Cloudflare services, or other paid add-on services to this workflow.
- GitHub Free and Cloudflare Free are not the inference or large-data scaling layer. At very large scale they may only provide free-tier-safe code hosting, static web delivery, DNS, or routing where hard free limits are respected.
- Model inference for millions or billions of users requires separately approved compute capacity. Do not assume GitHub Free, Cloudflare Free, or IDrive e2 object storage can provide that compute.

Archived IDrive e2 source artifacts checked on 2026-06-16:

```text
model-files/kimi-k2-7/checksums/upstream-file-inventory.json
model-files/kimi-k2-7/configs/huggingface-api-metadata.json
model-files/kimi-k2-7/configs/source-summary.json
model-files/kimi-k2-7/notes/LICENSE
model-files/kimi-k2-7/notes/README.md
model-files/kimi-k2-7/notes/THIRD_PARTY_NOTICES.md
model-files/kimi-k2-7/notes/TRANSFER_STATUS.txt
```

## Verified Public Information

For `moonshotai/Kimi-K2.7-Code`:

- Source: https://huggingface.co/moonshotai/Kimi-K2.7-Code
- License shown by Hugging Face model page: `modified-mit`; API metadata reports `license: other` with `license_name: modified-mit`
- API snapshot SHA checked on 2026-06-16: `74797c9c62378b951a1f6fcf5c4631024e9b8bef`
- Public file count checked on 2026-06-16: `87`
- Safetensors file count checked on 2026-06-16: `64`
- Reported repository bytes checked on 2026-06-16: `595,204,984,507` bytes, about `554.3 GiB`
- Upstream `LICENSE` file exists.
- Upstream `THIRD_PARTY_NOTICES.md` file exists.
- Architecture: MoE
- Total parameters: `1T`
- Activated parameters: `32B`
- Checkpoint format: safetensors

## License Note

The Kimi K2.7 Code Hugging Face model card states that model weights are released under the Modified MIT License. Before production use, review the upstream `LICENSE` and any third-party notice files and store a copy under:

```text
model-files/kimi-k2-7/notes/
```

Do not use the model in production until the exact upstream license files have been archived in IDrive e2 and reviewed.

## IDrive e2 Target Layout

Use IDrive e2 / S3-compatible storage as the only durable model storage:

```text
s3://smejj-model-files/model-files/kimi-k2-7/
  original/
  quantized/
  tokenizer/
  configs/
  checksums/
  notes/
```

The initial upload target for full upstream files is:

```text
s3://smejj-model-files/model-files/kimi-k2-7/original/
```

Provisioned folder objects currently visible in IDrive e2:

```text
model-files/kimi-k2-7/
model-files/kimi-k2-7/checksums/
model-files/kimi-k2-7/configs/
model-files/kimi-k2-7/notes/
model-files/kimi-k2-7/original/
model-files/kimi-k2-7/quantized/
model-files/kimi-k2-7/tokenizer/
```

## Required Environment Variables

Never commit real values.

```sh
IDRIVE_E2_ENDPOINT=https://s3.us-west-2.idrivee2.com
IDRIVE_E2_REGION=us-west-2
IDRIVE_E2_ACCESS_KEY=
IDRIVE_E2_SECRET_KEY=
IDRIVE_E2_BUCKET=smejj-model-files
HF_MODEL_REPO=moonshotai/Kimi-K2.7-Code
MODEL_TMP_DIR=/tmp/smejj-model-files/kimi-k2-7
MODEL_S3_PREFIX=model-files/kimi-k2-7
CONFIRM_MODEL_DOWNLOAD=NO
CONFIRM_IDRIVE_UPLOAD=NO
CONFIRM_STREAM_MODEL_UPLOAD=NO
STREAM_INCLUDE_REGEX=.*
STREAM_PART_SIZE_BYTES=67108864
STREAM_RETRY_ATTEMPTS=5
STREAM_SKIP_EXISTING=YES
```

## Preflight Checklist

Before downloading:

- Confirm license and third-party notices.
- Confirm full repository size and file count.
- Confirm local temporary disk has more free space than the model size plus checksum overhead.
- Confirm IDrive e2 bucket has enough capacity.
- Confirm `MODEL_TMP_DIR` is outside the Git repository.
- Confirm `.env` contains secrets locally only and is ignored by Git.
- Confirm the IDrive e2 account still has the `2 TB` plan active before uploading the full model.
- Confirm the transfer machine has enough free disk. The full model is about `554.3 GiB`; keep at least `650 GiB` free for safe download plus checksums and overhead.

Run:

```sh
sh scripts/model-management/preflight_kimi_k27_storage.sh
```

Or:

```sh
npm run idrive:preflight
```

The current local machine does not have AWS CLI installed. The storage-only check can still be run without AWS CLI:

```sh
npm run idrive:check
```

Stream directly from Hugging Face to IDrive e2 without a full local copy:

```sh
export HF_MODEL_REPO=moonshotai/Kimi-K2.7-Code
export MODEL_S3_PREFIX=model-files/kimi-k2-7
export STREAM_PART_SIZE_BYTES=33554432
export STREAM_RETRY_ATTEMPTS=8
export STREAM_SKIP_EXISTING=YES
export CONFIRM_STREAM_MODEL_UPLOAD=YES
npm run model:stream-to-idrive
```

For a limited test, restrict the file set:

```sh
export STREAM_INCLUDE_REGEX='^(README.md|LICENSE|THIRD_PARTY_NOTICES.md)$'
export CONFIRM_STREAM_MODEL_UPLOAD=YES
npm run model:stream-to-idrive
```

The streaming transfer writes the model files under:

```text
s3://smejj-model-files/model-files/kimi-k2-7/original/
```

and writes a checksum manifest to:

```text
s3://smejj-model-files/model-files/kimi-k2-7/checksums/streamed-checksums.sha256
```

Abort incomplete multipart uploads after a cancelled or failed stream:

```sh
export CONFIRM_ABORT_INCOMPLETE_UPLOADS=YES
npm run model:abort-incomplete
```

Archive upstream source metadata and license notes without downloading model weights:

```sh
npm run idrive:archive-source
```

## Download Command

Only run after manual approval:

```sh
export HF_MODEL_REPO=moonshotai/Kimi-K2.7-Code
export MODEL_TMP_DIR=/tmp/smejj-model-files/kimi-k2-7
export CONFIRM_MODEL_DOWNLOAD=YES
sh scripts/model-management/download_kimi_model.sh
```

## Checksum Command

```sh
export MODEL_TMP_DIR=/tmp/smejj-model-files/kimi-k2-7
sh scripts/model-management/verify_model_files.sh
```

This writes:

```text
/tmp/smejj-model-files/kimi-k2-7/checksums.sha256
```

After upload, copy the checksum manifest to:

```text
s3://$IDRIVE_E2_BUCKET/model-files/kimi-k2-7/checksums/checksums.sha256
```

## Upload Command

Only run after checksum verification:

```sh
export IDRIVE_E2_ENDPOINT=...
export IDRIVE_E2_ACCESS_KEY=...
export IDRIVE_E2_SECRET_KEY=...
export IDRIVE_E2_BUCKET=...
export MODEL_TMP_DIR=/tmp/smejj-model-files/kimi-k2-7
export MODEL_S3_PREFIX=model-files/kimi-k2-7
export CONFIRM_IDRIVE_UPLOAD=YES
sh scripts/model-management/upload_to_idrive_e2.sh
```

The upload script syncs model files to `original/`, uploads `checksums.sha256` to `checksums/`, and copies upstream `LICENSE` and `THIRD_PARTY_NOTICES.md` to `notes/` when present.

## Verification Command

List the prepared storage prefix without exposing secrets:

```sh
npm run idrive:check
```

After AWS CLI is installed on the transfer machine, list uploaded objects:

```sh
AWS_ACCESS_KEY_ID="$IDRIVE_E2_ACCESS_KEY" \
AWS_SECRET_ACCESS_KEY="$IDRIVE_E2_SECRET_KEY" \
aws s3 ls "s3://$IDRIVE_E2_BUCKET/model-files/kimi-k2-7/original/" \
  --endpoint-url "$IDRIVE_E2_ENDPOINT" \
  --recursive \
  --summarize
```

## Restore Guide

Restore to a temporary directory outside the repository:

```sh
export RESTORE_DIR=/tmp/smejj-model-restore/kimi-k2-7
mkdir -p "$RESTORE_DIR"

AWS_ACCESS_KEY_ID="$IDRIVE_E2_ACCESS_KEY" \
AWS_SECRET_ACCESS_KEY="$IDRIVE_E2_SECRET_KEY" \
aws s3 sync "s3://$IDRIVE_E2_BUCKET/model-files/kimi-k2-7/original/" "$RESTORE_DIR/" \
  --endpoint-url "$IDRIVE_E2_ENDPOINT" \
  --only-show-errors

shasum -a 256 -c "$RESTORE_DIR/checksums.sha256"
```

## Risks

- The IDrive e2 account must show the `2 TB` plan as active before upload.
- The local machine may have less free disk than the recommended safe full-download capacity.
- The current local machine does not have AWS CLI installed; use a prepared transfer machine or install AWS CLI before using the upload script.
- The 2 TB plan has recurring billing and can incur overuse charges if the storage quota is exceeded.
- Hugging Face may require authentication or Git LFS/Xet-compatible tooling for large files.
- Object storage stores files but does not provide inference compute.
- Cloudflare Free and GitHub Free must not be used for model storage or paid build/download workflows.
- License obligations may change by model version; review the exact upstream license before production use.

## Next Step For AI Router Integration

Add a model registry entry that points to IDrive e2 metadata, not local weights:

```json
{
  "id": "kimi-k2-7",
  "status": "storage-ready-awaiting-model-transfer",
  "provider": "smejj-idrive-e2",
  "storagePrefix": "model-files/kimi-k2-7",
  "runtime": "external-inference-server",
  "apiCompatibility": "openai-chat-completions",
  "streaming": true
}
```

The router should load only metadata from this registry. Actual model weights must be mounted or downloaded by a separate approved inference server later.
