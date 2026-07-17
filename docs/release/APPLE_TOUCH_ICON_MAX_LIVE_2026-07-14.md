# smejj.com Apple-Touch-Icon – Maximale Logo-Größe live (2026-07-14)

## Architektur
Nur das Apple-Touch-Icon (iOS-Home-Bildschirm) wurde geändert: Logo von 58% auf 82% der Icon-Breite vergrößert (markWidth 104 -> 148 im Generator). Quelle bleibt die unveränderte offizielle SVG-Geometrie; Hintergrund #050910, vollflächig, kein Alpha. Browser-Favicons, PWA-/maskable-Icons, Startseite, Eingabefeld und alle HTML-Referenzen sind byteidentisch unverändert (Design-Lock und Favicon-Lock eingehalten, Lock mit schriftlicher Freigabe vom 2026-07-14 neu eingefroren).

## Implementierung
- `scripts/branding/generate-brand-assets.mjs`: markWidth 104 -> 148 (nur apple-touch-icon).
- `public/apple-touch-icon.png`: neu, 180x180, SHA-256 `b96e28dd58aa051dc92867b3897e4e305b5adc47bbcf1fc4e57ee9f29430d797` (2825 Bytes). Byte-kompatibel erzeugt mit @resvg/resvg-js 2.6.2-Renderpfad (Beweis: exakte Hash-Reproduktion des Vorgänger-Icons).
- `tests/branding-presentation.test.mjs`: Visual-Mass-Kontrakt 104 -> 148.
- `docs/frontend/favicon-lock-manifest.json`: Asset-/Source-Hashes aktualisiert, Freigabe dokumentiert.

## Tests
check:favicon-lock, check:guidelines (610 Dateien), check:start-lock (28/28 byteidentisch) grün; check:frontend 93/94 (Rest: natives resvg in Agent-Sandbox nicht installierbar — auf dem Mac zu wiederholen). Live: HTTP 200, byteidentisch mit und ohne Cache-Buster, Startseite fehlerfrei.

## Deploy
`SmejjCom/smejj-app-frontend` Commit `2034a0d` auf `main` (GitHub Pages Free, Deploy-from-Branch, keine Actions).

## Rollback
`backups/rollback-2026-07-14-apple-touch-icon/` (Icon-, Script- und Lock-Manifest-Stand vor der Änderung).

## Hinweis iPhone
iOS cached Home-Icons aggressiv: PWA vom Home-Bildschirm löschen und über Safari/Chrome neu hinzufügen.

## Nächster Schritt (Empfehlung, separat freizugeben)
pwa-192/512 und maskable-Icons analog vergrößern (Android-Installationen).
