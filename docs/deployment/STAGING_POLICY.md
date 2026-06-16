# Staging Policy

## Zweck

Staging prueft eine Release-Version, ohne Produktion zu veraendern. Staging darf keine Kostenfalle und kein versteckter Produktionsersatz werden.

## Erlaubt

- Lokale Preview ueber `npm run dev`.
- Lokale Smoke-Tests.
- Cloudflare-Dry-Run ohne Live-Veroeffentlichung.
- Optionaler manueller Staging-Worker nur im Cloudflare-Free-Rahmen und nur nach Freigabe.
- IDrive-e2-Artefakte fuer Staging-Manifeste und Backups.

## Verboten

- Automatischer Produktions-Deploy aus GitHub.
- Pflicht-GitHub-Actions fuer Build oder Deploy.
- Cloudflare Paid Features.
- Cloudflare R2 als Storage.
- Modell- oder Medienarchive in GitHub.
- Trials oder Auto-Billing.

## Staging Checkliste

1. `npm run check:all`
2. `npm run release:guard`
3. `npm run check:rollback`
4. Lokale Preview: `npm run dev`
5. Smoke: `node scripts/testing/prompt5_e2e_smoke.mjs`
6. Optional: Cloudflare Dry-Run nur ohne Produktion.
7. Ergebnis in einer Release-Notiz dokumentieren.

## Fail-Closed

Wenn Staging unsicher ist, wird nicht auf Produktion weitergeleitet. Es gibt keinen Paid-Fallback.
