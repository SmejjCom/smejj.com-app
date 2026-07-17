# Staging Policy

## Zweck

Staging prueft eine Release-Version, ohne Produktion zu veraendern. Staging darf keine Kostenfalle und kein versteckter Produktionsersatz werden.

## Erlaubt

- Lokale Preview ueber `npm run dev`.
- Lokale Smoke-Tests.
- Optionaler manueller Salad-Staging-Worker nur hinter Budget-Gate,
  Laufzeit-Watchdog und schriftlicher Freigabe.
- IDrive-e2-Artefakte fuer Staging-Manifeste und Backups.

## Verboten

- Automatischer Produktions-Deploy aus GitHub.
- Pflicht-GitHub-Actions fuer Build oder Deploy.
- Cloudflare-Dienste jeglicher Art.
- Modell- oder Medienarchive in GitHub.
- Trials oder Auto-Billing.

## Staging Checkliste

1. `npm run check:all`
2. `npm run release:guard`
3. `npm run check:rollback`
4. Lokale Preview: `npm run dev`
5. Smoke: `node scripts/testing/prompt5_e2e_smoke.mjs`
6. Optional: Salad-Staging nur nach schriftlicher Budget- und Startfreigabe.
7. Ergebnis in einer Release-Notiz dokumentieren.

## Fail-Closed

Wenn Staging unsicher ist, wird nicht auf Produktion weitergeleitet. Es gibt keinen Paid-Fallback.
