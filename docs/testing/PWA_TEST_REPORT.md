# PWA Test Report

Date: 2026-06-16

## Scope

Local PWA shell test only. No live publication.

## Passed

- `manifest.webmanifest` exists.
- `display` is `standalone`.
- `start_url` is `/`.
- App icons are present.
- Apple/mobile web app metadata is present.
- Service worker registers from `/sw.js`.
- Service worker cache name is `smejj-shell-v6`.
- Service worker caches the app shell.
- Offline fallback path is present: failed GET requests fall back to cache and then `/`.
- Cache refresh deletes old cache names on activate.
- No model files are cached automatically.
- No Cloudflare Paid or GitHub Paid storage path is used by PWA shell.

## PWA Install

Install metadata is present and locally verifiable. A real install prompt cannot be fully completed inside this test environment, so final PWA install confirmation remains a device/browser QA task.

## Open

- Real install on iOS Safari.
- Real install on Android Chrome.
- Icon appearance on actual home screens.
