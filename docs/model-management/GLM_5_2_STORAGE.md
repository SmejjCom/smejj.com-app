# GLM-5.2 FP8 Model Storage

Status: verified IDrive e2 storage-only flagship vault

Verified on 2026-06-22:

- Source archive is present in IDrive e2 under `model-files/glm-5-2-fp8/`.
- `npm run idrive:verify-glm-source` passed.
- Live API endpoint `/api/models/glm-5-2-fp8/status` returns the metadata archive status.
- Full weight transfer remains pending by design; do not start it from the local desktop workspace.

## Decision

Use `zai-org/GLM-5.2-FP8` as the primary GLM-5.2 vault package for smejj, with `zai-org/GLM-5.2` kept as the BF16/F32 reference package.

Reasons:

- GLM-5.2 is the flagship foundation for smejj.com coding, architecture, long-context planning, agentic work and Fable-level tasks.
- The official FP8 repo keeps the same 1M-token model family while reducing storage and inference-hosting pressure.
- The full BF16 source is about `1403.2 GiB`; the FP8 source is about `703.8 GiB`.
- Smaller or older models may be helpers or comparison baselines, but they are not the strategic core and must not replace GLM-5.2 for quality-critical coding.
- Nex N2 Pro remains a later fallback candidate for small verified tasks only.

## Source

- Primary source: `zai-org/GLM-5.2-FP8`
- Fallback/source comparison only: `zai-org/GLM-5.2`
- License shown by Hugging Face API: `mit`
- Snapshot checked on 2026-06-22: `31cba24fb749908a485082bdeed6eb1ac6cffc2f`
- Files: `150`
- Safetensors files: `141`
- Reported size: `703.8 GiB`

## IDrive e2 Target Layout

```text
s3://smejj-model-files/model-files/glm-5-2-fp8/
  checksums/
  configs/
  notes/
  original/
  quantized/
  tokenizer/
```

## Safe Archive Step

Archive source metadata and license/readme notes without downloading model weights:

```bash
export CONFIRM_ARCHIVE_MODEL_SOURCE=YES
export HF_MODEL_REPO=zai-org/GLM-5.2-FP8
export MODEL_S3_PREFIX=model-files/glm-5-2-fp8
export MODEL_DISPLAY_NAME="GLM-5.2 FP8"
npm run idrive:archive-model-source
```

## Full Weight Transfer Gate

Only run the full streaming transfer after confirming:

- IDrive e2 account capacity is still sufficient after Kimi K2.7.
- Source license and notices are archived under `notes/`.
- Transfer host has stable bandwidth and enough runtime for about `703.8 GiB`.
- `STREAM_INCLUDE_REGEX` is set intentionally.
- `CONFIRM_STREAM_MODEL_UPLOAD=YES` is set only for the approved transfer window.

Recommended command:

```bash
export CONFIRM_STREAM_MODEL_UPLOAD=YES
export HF_MODEL_REPO=zai-org/GLM-5.2-FP8
export MODEL_S3_PREFIX=model-files/glm-5-2-fp8
export STREAM_INCLUDE_REGEX='.*'
npm run model:stream-to-idrive
```

## Contabo Transfer Helper

For the Contabo transfer host, use the checked-in helper after SSH access is available:

```bash
sh scripts/model-management/run_glm_fp8_contabo_transfer.sh
```

The helper:

- loads IDrive e2 values from `.env.local` on the transfer server,
- streams Hugging Face ranges directly into IDrive e2 multipart uploads,
- skips already completed objects with matching sizes,
- writes transfer logs under `logs/model-transfer/`,
- runs full IDrive verification after the stream completes.

It does not store IDrive e2 secrets in Git and does not require a local full copy of the GLM weights.

## Router Role

GLM-5.2 FP8 is the flagship brain:

- architecture and planning
- very large context
- critical Fable-level tasks
- multi-file reasoning before coding
- agentic coding and verified patch production
- benchmark replay and heavy review

The vault defaults to disabled inference until a separately approved self-host, Salad or partner-compute runtime exists. IDrive e2 stores the model and verification evidence; it never performs inference.

## API Status

The app exposes model vault status through:

```text
/api/models/kimi-k2-7/status
/api/models/glm-5-2-fp8/status
/api/models/status
```

The combined route must report GLM-5.2 as the flagship coding and planning vault. Kimi remains an archived comparison/specialist candidate only. The route must not enable inference by itself.
