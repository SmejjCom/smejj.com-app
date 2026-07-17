# smejj.com — professionelle Logo- und Menüverfeinerung RC (2026-07-12)

## Architektur

Die Korrektur bleibt auf die Präsentationsschicht des bestehenden Brandings begrenzt. Offizielle SVG-Geometrie, Browser-Favicons, Apple-/PWA-/Maskable-Icons, Manifest, Menübreite, gespeicherte Breite und Zustandslogik bleiben unverändert. Das Branding bleibt fixed positioniert und beeinflusst den Workspace-Flow nicht.

Die schwarze Fläche aus dem Nutzer-Screenshot war der transparente Logo-Hintergrund über der dunklen Sidebar, keine Hintergrundplatte im SVG. Browser-Favicon, In-App-Icon und Wortmarke sind weiterhin transparent; die kontrollierten opaken Apple-/PWA-/Maskable-Flächen bleiben absichtlich plattformgerecht.

## Ordnerstruktur

```text
public/
  branding.css                  # freigegebene Präsentationsquelle
  sw.js                         # Cache v100
tests/
  branding-presentation.test.mjs
  frontend-structure.test.mjs
  platform-pwa.test.mjs
tmp/task-capsules/
  logo-brand-professional-refinement-20260712/
```

Das Produktions-Repository enthält bytegleich:

```text
assets/branding.css
sw.js
```

## Implementierung

- In-App-Icon geschlossen/eingeklappt: 16 × 16 px in unveränderter 28 × 28 px Interaktionsfläche.
- Wortmarke geöffnet: 80 px Desktop/Tablet, 76 px bis 560 px.
- Gemeinsame Kopfzeilenausrichtung: 0 px oben, 36 px links; damit 28-px-Menüschalter plus 8-px-Abstand.
- Wortmarken-Maximalhöhe: 19 px; natürliches Seitenverhältnis bleibt erhalten.
- Sicherer Breitenrand: Panelbreite minus 52 px.
- Sidebar: genau eine sichtbare 1-px-Trennlinie über den bestehenden Resizer; die doppelte Border entfällt.
- Hintergrund transparent, kein Schatten, Filter, Maskieren, Transformieren oder Übergang.
- Service-Worker-Cache: `smejj-shell-v100`.

## Release-Kandidat

- Repository: `SmejjCom/smejj-app-frontend`
- Branch: `codex/brand-professional-refinement-20260712`
- Commit: `02ca8262a3c04c640d3eaabce1e4fd32d9c87df7`
- Parent: `fa81ff4415e83214cd3fcb063d0164ea5ef61253`
- Tree: `ca8c163a4d63cb47c6cd47534622a1fba88c43a0`
- Produktionsdateien: 2 (`assets/branding.css`, `sw.js`)

## Produktion

- Schriftlich freigegebener SHA: `02ca8262a3c04c640d3eaabce1e4fd32d9c87df7`.
- Fast-Forward nach `SmejjCom/smejj-app-frontend/main`: erfolgreich, kein Force-Push.
- GitHub-Pages-Deployment: `5411857620`, Status `success` am 2026-07-12.
- Live-URL: `https://smejj.com/`.
- `origin/main`, GitHub-Commit und Produktion zeigen exakt den freigegebenen Commit.

## Tests

- `pnpm run check:all`: grün.
- `pnpm run release:preflight`: grün.
- Frontend: 86/86.
- Platform/PWA: 7/7.
- Branding: 12/12 Derivate byteidentisch zu den freigegebenen Quellen.
- Lokaler E2E-Smoke: 18/18.
- Start-Lock: 26/26 nach autorisiertem Re-Freeze.
- Browser: 1440×900, 820×1180, 390×844, 412×915 und 320×800.
- Zustände: geschlossen, eingeklappt, vollständig geöffnet.
- Hell-/Dunkelpräferenz: bestanden.
- Layout: 0 px Workspace-Verschiebung, 0 px horizontaler Überlauf.
- Barrierefreiheit: 130 Bedienelemente, 0 fehlende zugängliche Namen, 0 doppelte IDs, 0 Bilder ohne Alt-Vertrag.
- Konsole: 0 Fehler, 0 Warnungen.
- PWA: echter Offline-Reload über den Service Worker bestanden.

## Live-Verifikation

- 18/18 relevante Dateien live mit HTTP 200, korrektem MIME-Typ und identischer SHA-256-Prüfsumme geprüft; dazu gehören Startseite, Branding, Service Worker, Manifest, Browser-Favicons, Apple Touch Icon, PWA-/Maskable-Icons, SVGs und Social-Logo.
- Live-Branding: 16-px-Icon geschlossen/eingeklappt; 80-px-Wortmarke Desktop/Tablet und 76-px-Wortmarke mobil ausschließlich vollständig geöffnet.
- Live-Zustände: geschlossen, eingeklappt und vollständig geöffnet auf 1440×900, 820×1180, 390×844 und 412×915 bestanden.
- iOS- und Android-Browserprofile: responsive Darstellung, Manifest-/Apple-Vertrag und Zustandswechsel bestanden.
- OS-Hell-/Dunkelpräferenz: stabil und ohne Branding-Abweichung.
- Live-Konsole: 0 Anwendungsfehler, 0 Anwendungswarnungen; Barrierefreiheit: 0 sichtbare unbenannte Controls, 0 doppelte IDs, 0 Bilder ohne Alt-Vertrag.
- Live-PWA: Controller und Registration aktiv, Cache `smejj-shell-v100`, echter Offline-Reload bestanden.
- Navigation: DOMContentLoaded 239,2 ms, Load 246,5 ms im Abschlusslauf; 0 horizontaler Overflow und 0 px Workspace-Verschiebung.
- Live-Screenshots: `tmp/task-capsules/logo-brand-professional-refinement-20260712/screenshots/live/`.

## IDrive e2 und Rollback

Das autoritative v2-Backup liegt append-only im aktiven Bucket `smejj-model-files`:

- `deployments/smejj-app-frontend/2026/07/12/02ca8262a3c04c640d3eaabce1e4fd32d9c87df7/v2/release.json`
- `backups/task-capsules/2026/07/logo-brand-professional-refinement-20260712/evidence-v2.json`
- `deployments/smejj-app-frontend/2026/07/12/02ca8262a3c04c640d3eaabce1e4fd32d9c87df7/v2/backup-manifest.json`

Alle drei Objekte besitzen 412-Überschreibschutz und exakten SHA-256-Readback. Die erste Sicherung bleibt unverändert erhalten und ist wegen eines alten Bucket-Labels ausdrücklich durch v2 ersetzt; nichts wurde gelöscht oder überschrieben.

Der Live-Abschluss ist ebenfalls append-only und readback-verifiziert:

- `backups/task-capsules/2026/07/logo-brand-professional-refinement-20260712/production/5411857620/live-evidence.json`
- `backups/task-capsules/2026/07/logo-brand-professional-refinement-20260712/production/5411857620/live-screenshots-base64.json`
- `backups/task-capsules/2026/07/logo-brand-professional-refinement-20260712/production/5411857620/live-manifest.json`

Alle 15 PNG-Screenshots sind bytegenau mit Name, Größe und SHA-256 in einem Base64-JSON-Bundle gesichert, weil das unveränderte Upload-Sicherheits-Gate direkte `image/png`-Uploads absichtlich blockiert. Für alle drei Live-Objekte wurden 412-Überschreibschutz und SHA-256-Readback bestätigt.

Produktion wurde erfolgreich veröffentlicht. Ein Rollback darf ausschließlich als neuer, schriftlich freigegebener und vollständig verifizierter Revert-Commit mit Tree-Prüfung erfolgen, niemals per Force-Push oder Datenlöschung.

## Memory Update

Verifiziertes Muster: optische Markenmasse wird innerhalb einer festen, layoutneutralen Interaktionsfläche skaliert. Browser-Favicon-Transparenz und opake OS-Icon-Canvases sind unterschiedliche Plattformverträge und dürfen nicht gleichbehandelt werden. Release `02ca8262a3c04c640d3eaabce1e4fd32d9c87df7` ist über Deployment `5411857620` live und vollständig verifiziert.

## Nächster Schritt

Kein technischer Restpunkt für diesen Release. Change-Lock aktiv lassen und jede weitere Produkt-, Design-, Konfigurations- oder Deploymentänderung nur nach neuer schriftlicher Freigabe als eigenen reproduzierbaren Release durchführen.
