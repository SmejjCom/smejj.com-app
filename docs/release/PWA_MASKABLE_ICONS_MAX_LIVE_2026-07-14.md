# smejj.com PWA-/maskable-Icons – Maximale Logo-Größe live (2026-07-14)

## Architektur
Zweite Stufe der Icon-Vergrößerung vom 2026-07-14 (nach dem Apple-Touch-Icon): Die vier Web-App-Manifest-Icons zeigen das Logo jetzt maximal groß. pwa-192/512 (purpose any): 82% der Breite wie das Apple-Touch-Icon. maskable-192/512 (purpose maskable): 118 bzw. 314 px Logobreite — das Maximum, bei dem die Logo-Diagonale innerhalb der Android-Safe-Zone (Kreis mit 80% Durchmesser) bleibt. Quelle bleibt die unveränderte offizielle SVG-Geometrie; Hintergrund #050910. sw.js, manifest.webmanifest, HTML-Referenzen und alle gelockten Favicon-Dateien byteidentisch unverändert.

## Implementierung
- `scripts/branding/generate-brand-assets.mjs`: markWidth 116->158, 308->420, 100->118, 268->314.
- 4 PNGs byte-kompatibel mit @resvg/resvg-js 2.6.2 erzeugt (Beweis: Hash-Reproduktion aller Vorgänger-Icons); SHA-256: pwa-192 `143f5592f2d12e2f...`, pwa-512 `73a28c3b7560b13d...`, maskable-192 `04e4ce3b3824f826...`, maskable-512 `12ff82b8cd95d7a1...`.
- `tests/branding-presentation.test.mjs`: Kontrakte aktualisiert (pwa-512 gemessen 418 durch Anti-Aliasing-Schwelle).
- `docs/frontend/favicon-lock-manifest.json`: Generator-Source-Hash + Freigabe-Nachtrag, neu eingefroren.

## Tests
check:favicon-lock, check:guidelines (627 Dateien), check:start-lock 28/28 grün; check:frontend 100/101 (einziger Fail: natives resvg in der Agent-Sandbox nicht installierbar — voller Lauf auf dem Mac Pflicht vor dem nächsten Release). Live: alle 4 Icon-URLs HTTP 200 und byteidentisch.

## Deploy
`SmejjCom/smejj-app-frontend` Commit `57c1aaf` auf `main` (GitHub Pages Free, Deploy-from-Branch, keine Actions).

## Rollback
`backups/rollback-2026-07-14-pwa-maskable-icons/`.

## Hinweis Android
Bereits installierte PWAs übernehmen das neue Icon beim nächsten automatischen WebAPK-Manifest-Check; Neuinstallationen sofort.
