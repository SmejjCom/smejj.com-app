# smejj.com — maximales Browser-Favicon RC (2026-07-13)

## Architektur

Die freigegebene smejj.com-Icon-Geometrie und Markenfarbe bleiben unveraendert. Nur die transparenten Browser-Favicon-Derivate nutzen nun die maximal verfuegbare quadratische Canvas-Breite. Apple-, PWA-, Maskable-, Social- und In-App-Branding bleiben unveraendert.

## Implementierung

- SVG-Favicon: 100 % Motivbreite, vertikal exakt zentriert, transparenter Hintergrund.
- PNG-Favicons: 16x16, 32x32 und 48x48 mit jeweils 100 % Motivbreite.
- `favicon.ico`: dieselben drei transparenten, maximalen PNG-Ebenen.
- Service Worker: Cache `smejj-shell-v110`, damit der neue Favicon-Satz auch offline und nach der Aktualisierung konsistent ist.
- Die bereits vorhandene browseruebergreifende Einbindung aus ICO, SVG und PNG bleibt erhalten.

## Schutz und Rollback

Rollback-Artefakt: `backups/rollback-2026-07-13-favicon-max-browser/source-before.tar.gz`, SHA-256 `1fc2a1f38fb49f28165ba75da60bb2417a61f4905d5c6417556f5603d7670b73`. Ein Produktionsrollback erfolgt ausschließlich als normaler Revert-Commit, niemals per Force-Push oder Datenloeschung.

## Verifikation

- Lokale Gesamtpruefung und `release:preflight`: gruen; Frontend 90/90, Plattform 7/7, Architektur 7/7, Guidelines 542 Dateien, Start-Lock 26/26.
- Lokaler Smoke: 18/18 Pruefbereiche gruen, Service Worker `smejj-shell-v110`, 11 Markenassets erreichbar.
- Browser: Desktop 1440x900 und Mobil 390x844 ohne horizontalen Ueberlauf, vier Favicon-Vertraege vorhanden, keine Konsolenfehler oder Warnungen.
- Staging-Simulation: exakter statischer Release-Kandidat lokal auf Port 4173, vier Favicon-Vertraege, genau eine `CACHE_NAME`-Deklaration, keine Konsolenfehler.
- IDrive-e2-Backup: `deployment-artifacts/smejj-com/20260713/20260713T114728Z-2612ba1a374b.json.gz` plus verifiziertes Manifest.
- Produktion: GitHub-Pages-Free-Commit `dde2e3ed7b38f0e0a1b21be95c52353bb4b3e48a`, Pages-Deployment `#212` erfolgreich.
- Live-Paritaet: alle sechs geaenderten Produktionsdateien bytegenau zum Release-Kandidaten; ICO, SVG und PNG liefern HTTP 200 mit korrektem MIME-Typ; Chrome-Live-Test ohne Konsolenfehler.
- Gefundene Altlast: Der vorherige produktive `sw.js` enthielt zwei vollstaendige Service-Worker-Bloecke. Der freigegebene `v110` ersetzt sie durch den einzelnen lokal und live geprueften Block.
