# smejj.com App Agent Rules

## Hohe Prioritaet

- `docs/architecture/FREE_ONLY_MASTER_POLICY.md` ist verbindlich.
- GitHub.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden.
- Cloudflare.com wird nicht genutzt (Cloudflare-Exit 2026-07-02). Hosting: GitHub Pages Free (Deploy-from-Branch, keine Actions). DNS/Domain: Spaceship.
- Keine GitHub Pro-, Team-, Enterprise-, Actions-Minuten-, Storage-, Packages-, LFS-, Codespaces- oder sonstigen kostenpflichtigen GitHub-Dienste.
- Keine Cloudflare-Dienste jeglicher Art; keine kostenpflichtigen Spaceship-Zusatzdienste; Salad nur pay-per-use hinter Budget-Gate.
- Keine Trials, keine Auto-Billing-Fallbacks, keine spaeter automatisch kostenpflichtigen Dienste.
- IDrive e2 / S3-kompatibler Storage ist Hauptspeicher fuer Dateien, Medien, Modelle, Backups, Deployments und zentrale Daten.

## Design-Lock

- `docs/frontend/START_DESIGN_LOCK.md` ist verbindlich.
- Startseite und unteres Eingabefeld duerfen nicht ohne schriftliche Bestaetigung des Nutzers veraendert werden.

## Change-Lock (2026-07-02, angeordnet von Wof Kadavanich)

- Bestehende, verifizierte Funktionen duerfen nicht kaputtgehen (Non-Regression-Pflicht).
- KEINE Aenderung an Code, Konfiguration, Deployment oder Policies ohne vorherige
  schriftliche Bestaetigung des Nutzers. Das gilt fuer Menschen und AI-Agenten.
- Vor jeder freigegebenen Aenderung: Rollback-Punkt sichern. Nach jeder Aenderung:
  komplette Verification Pipeline (`npm run check:all`) plus `npm run check:guidelines`.
- Produktions-Deployments zusaetzlich nur nach dem Ablauf in
  `docs/deployment/DEPLOYMENT_PLAN.md` (Staging, schriftliche Freigabe, Live-Test).

## Pflichtpruefungen

- Nach Architektur-/Kosten-Aenderungen: `npm run check:architecture`.
- Nach Frontend-Aenderungen: `npm run check:frontend`.
- Nach jeder Aenderung: `npm run check:guidelines` (800-Zeilen-Regel, Naming smejj.com).
- Vor Release: `npm run release:preflight`.
