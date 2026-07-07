# Deployment Plan

## Ziel

smejj.com darf deploybar sein, aber GitHub.com bleibt dauerhaft Free-only; Cloudflare wird nicht genutzt (Cloudflare-Exit 2026-07-02, siehe docs/deployment/GITHUB_PAGES_DEPLOY.md). Es gibt keine automatische Produktion und keine Veroeffentlichung ohne schriftliche Freigabe.

## Rollen

- GitHub Free: Code, kleine Dokumentation, Issues, Pull Requests.
- GitHub Pages Free: statische PWA (Deploy-from-Branch gh-pages, keine Actions); DNS/SSL via Spaceship + GitHub Pages.
- IDrive e2: Deploy-Artefakte, Backups, Modelle, Medien, Manifeste, Checksums und zentrale Dateiablage.

## Verboten

- GitHub Pro, Team, Enterprise.
- Bezahlte GitHub Actions-Minuten, Codespaces, Packages, LFS oder grosser Storage.
- Cloudflare-Dienste jeglicher Art.
- Workers Paid, R2 Paid, D1 Paid, KV Paid, Queues, Images, Stream, Workers AI oder paid-risk Add-ons.
- Trials, Auto-Billing und Paid-Fallbacks.
- Modell-Dateien oder grosse Medien im Repo.
- Produktion ohne schriftliche Freigabe.

## Release-Ablauf

1. Lokal pruefen: `npm run check:all`.
2. Lokaler Build/Static-Shell-Check: `npm run check`.
3. Lokale Preview starten: `npm run dev`.
4. Lokalen Smoke ausfuehren: `node scripts/testing/prompt5_e2e_smoke.mjs`.
5. Security Checks: `npm run check:security`.
6. Cost Checks: `npm run check:cost` und `npm run release:guard`.
7. Private Pfade pruefen: `npm run check:paths`.
8. Rollback Simulation: `npm run check:rollback`.
9. Backup/Artefakt in IDrive e2 vorbereiten: `npm run idrive:artifact`, nur mit lokalen Secrets und bewusster Freigabe.
10. Staging deployen oder simulieren, nie Produktion.
11. Staging testen.
12. Schriftliche Freigabe von Muesluem Akdeniz / Alan Best einholen.
13. Erst danach Produktion manuell freigeben.
14. Live-Test ausfuehren.
15. Release-Notiz und Rollback-Punkt sichern.

## Build-Hinweis

Aktuell gibt es keinen grossen Build-Schritt. Die PWA liegt als kleine statische Shell in `public/`; lokale Syntax-, Manifest-, Security-, Platform- und Guardrail-Checks ersetzen einen Cloud-Build. Wenn spaeter ein Build-Schritt noetig wird, muss er lokal oder in einer separat freigegebenen kostenlosen Umgebung laufen.

## Production Stopper

Produktion stoppt sofort bei:

- fehlender schriftlicher Freigabe,
- fehlendem Rollback-Punkt,
- fehlendem IDrive-e2-Backup,
- fehlgeschlagenem Free-Tier-Guard,
- Secret-, Pfad-, JSON-, Manifest- oder Paid-Service-Fehler,
- unklarem GitHub-Pages-Free-Status.
