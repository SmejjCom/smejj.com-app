# Kimi K2.7 Direct IDrive e2 Import Decision

Status: researched on 2026-06-16

## Goal

Move `moonshotai/Kimi-K2.7-Code` directly into IDrive e2 without storing the full model on this local machine.

## Result

Pure provider-side import from Hugging Face model repository to IDrive e2 is not available with the current services.

IDrive e2 Cloud Data Migration supports direct migration from cloud object storage sources such as:

- AWS S3
- S3-compatible object storage
- Wasabi
- Backblaze B2
- Azure Blob
- Google Cloud Storage

The Kimi K2.7 source on Hugging Face is a model repository served through Hugging Face/Xet/HTTP, not an S3-compatible source bucket that IDrive e2 can list and import with source access keys.

Additional mirror checks:

- `moonshotai/Kimi-K2.7-Code`: 64 safetensors files, about 554.3 GiB.
- `unsloth/Kimi-K2.7-Code`: 64 safetensors files, about 554.3 GiB.
- `unsloth/Kimi-K2.7-Code-GGUF`: no safetensors files; GGUF variants are separate quantized runtime artifacts.
- ModelScope mirror exists, but no S3-compatible source endpoint was found for IDrive e2 Cloud Data Migration.

## What Works

The project now supports a direct streaming route:

```text
Hugging Face -> transfer process -> IDrive e2 multipart upload
```

This route does not store the full model locally. It only streams parts through the machine running the process.

## Local Attempt

A local streaming attempt was started and verified technically, but stopped because the observed upload throughput from this machine was too slow for a safe 554 GiB transfer.

One incomplete multipart upload was aborted.

## Required Real Solution

Use one of these routes:

1. Find or request an S3-compatible source mirror for `moonshotai/Kimi-K2.7-Code`, then use IDrive e2 Cloud Data Migration.
2. Run the existing streaming uploader on a fast transfer machine with strong upstream bandwidth.
3. Ask IDrive e2 support whether they can perform an HTTP/Hugging Face URL import into the bucket server-side.

## Not Allowed

- Do not use GitHub or Cloudflare to store model weights.
- Do not use Cloudflare Workers AI or paid Cloudflare services for this transfer.
- Do not use GitHub Actions, Codespaces, LFS, or paid GitHub storage.
- Do not use a trial or auto-billing fallback.
