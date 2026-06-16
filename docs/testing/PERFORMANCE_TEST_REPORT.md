# Performance Test Report

Date: 2026-06-16

## Scope

Local static asset and HTTP smoke test at `http://127.0.0.1:3000`.

## Results

- Core shell request group completed locally in 19 ms.
- Core shell transferred about 65 KB:
  - `/`: 20,200 bytes.
  - `/assets/app.js`: 31,375 bytes.
  - `/assets/styles.css`: 8,465 bytes.
  - `/assets/components.js`: 2,132 bytes.
  - `/assets/config.js`: 1,081 bytes.
  - `/sw.js`: 1,481 bytes.
  - `/manifest.webmanifest`: 492 bytes.
- Public directory is about 100 KB.
- No automatic model downloads.
- No `.gguf` or `.safetensors` assets.
- No hidden requests to paid AI providers were wired into public assets.
- No Cloudflare Paid dependency detected.
- No GitHub media/model storage path detected.

## Slow Internet

The app shell is small and cacheable. True network throttling on physical devices remains open, but the current asset size is suitable for slow connections.

## Open

- Lighthouse run in Chrome.
- Real mobile network throttling.
- Long-session memory profiling.
