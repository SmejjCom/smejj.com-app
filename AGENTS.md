# smejj.com App Agent Rules

## Hohe Prioritaet

- `docs/architecture/FREE_ONLY_MASTER_POLICY.md` ist verbindlich.
- GitHub.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden.
- Cloudflare.com wird nicht genutzt (Cloudflare-Exit 2026-07-02). Salad.com wird schrittweise stillgelegt (Salad-Exit 2026-08-11, Zukunft 100% Zeabur.com). Hosting: GitHub Pages Free (Deploy-from-Branch, keine Actions). DNS/Domain: Spaceship.
- Keine GitHub Pro-, Team-, Enterprise-, Actions-Minuten-, Storage-, Packages-, LFS-, Codespaces- oder sonstigen kostenpflichtigen GitHub-Dienste.
- Keine Cloudflare-Dienste jeglicher Art; keine kostenpflichtigen Spaceship-Zusatzdienste; Hauptbetrieb & Workers auf Zeabur.com.
- Keine Trials, keine Auto-Billing-Fallbacks, keine spaeter automatisch kostenpflichtigen Dienste.
- IDrive e2 / S3-kompatibler Storage ist Hauptspeicher fuer Dateien, Medien, Modelle, Backups, Deployments und zentrale Daten.

## Design-Lock

- `docs/frontend/START_DESIGN_LOCK.md` ist verbindlich.
- Startseite und unteres Eingabefeld duerfen nicht ohne schriftliche Bestaetigung des Nutzers veraendert werden.

## Favicon-Lock (dauerhaft, unveraenderlich)

- Die finalen Browser-Favicon-Dateien sind geschuetzt: `public/favicon.ico`,
  `public/icons/favicon-16x16.png`, `public/icons/favicon-32x32.png`,
  `public/icons/favicon-48x48.png`, `public/apple-touch-icon.png` und die
  zugehoerigen finalen Favicon-SVG-Referenzen.
- Keine Favicon-Datei, kein Web-Manifest-Eintrag und kein HTML-Head-
  `<link rel="icon">`-/`<link rel="apple-touch-icon">`-Eintrag darf in
  einem kuenftigen Task geaendert, geloescht, verschoben oder indirekt durch
  Build-/Refactoring-/Aufraeumarbeiten ueberschrieben werden.
- Falls eine Favicon-Aenderung technisch notwendig erscheint, wird sie nicht
  ausgefuehrt. Zuerst ist eine ausdrueckliche schriftliche Bestaetigung des
  Nutzers einzuholen.
- `docs/frontend/FAVICON_LOCK.md` ist verbindlich. `npm run check:favicon-lock`
  muss nach jeder Aenderung und vor jedem Release erfolgreich sein. Der Lock
  darf nicht automatisch neu eingefroren oder umgangen werden.
- `check:branding` und `check:start-lock` bleiben vor jedem Release Pflicht.

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
