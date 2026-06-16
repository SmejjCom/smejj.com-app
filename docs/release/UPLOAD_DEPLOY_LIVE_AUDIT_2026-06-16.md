# Upload-, Deployment- und Live-Pruefung

Datum: 2026-06-16

Status: geprueft, korrigiert, committed, zu GitHub hochgeladen, auf Cloudflare deployed und live erneut getestet.

## Kurzbefund

- Repository stabil: ja.
- GitHub Remote `origin/main`: aktualisiert.
- Cloudflare Worker `smejj-com`: deployed.
- Live-Version `https://smejj.com/`: zeigt den korrigierten Stand.
- Service Worker: `smejj-shell-v53`.
- IDrive e2 / S3-kompatibler Storage: Hauptspeicher bleibt aktiv.
- GitHub und Cloudflare: nur Free-Rolle, keine Paid-Dienste, keine Trials, kein Paid-Fallback.

## Korrigierter Fehler

Die Startseite sprang beim Senden aus dem unteren Eingabefeld in die separate Ansicht `#chat`. Dadurch wurde das gewuenschte Startseiten-Design durch das alte Chat-Layout ersetzt.

Korrektur:

- Start-Senden schreibt jetzt in `#startLog` auf der Startseite.
- Die URL bleibt ohne `#chat`.
- Die aktive Ansicht bleibt `start`.
- Die alte Chat-Ansicht bleibt fuer direkte Navigation vorhanden, wird aber vom Start-Composer nicht mehr benutzt.
- Mikrofon-, Audio- und Stimme-Icons springen nicht mehr zu `#chat`.

## Gesicherte Aenderungen

- `public/index.html`: `#startLog` fuer Chat direkt auf der Startseite, Start-Tool-Icons ohne Chat-Sprung.
- `public/app.js`: Start-Composer sendet mit Ziel `#startLog`.
- `public/styles.css`: kompakte Start-Chat-Nachrichten oberhalb des unteren Eingabefelds.
- `public/sw.js`: Cache-Version auf `smejj-shell-v53`.
- `tests/frontend-structure.test.mjs`: Schutztest, dass Start-Chat auf der Startseite bleibt.
- `tests/platform-pwa.test.mjs`: PWA-Cache-Version `v53`.
- `scripts/testing/prompt5_e2e_smoke.mjs`: Smoke-Test auf `v53`.
- `docs/testing/PWA_TEST_REPORT.md`: Service-Worker-Version aktualisiert.

## Tests

- `npm run check:frontend`: bestanden.
- `npm run check:platform`: bestanden.
- `npm run release:preflight`: bestanden.
- Lokaler Browser-Test: Startseite bleibt aktiv, Nachricht und Antwort erscheinen in `#startLog`, kein `#chat`.
- Live Browser-Test: Startseite bleibt aktiv, Nachricht und Antwort erscheinen in `#startLog`, kein `#chat`, keine Konsolenfehler.
- Live API `/api/agent`: fail-closed Antwort ohne Paid-Fallback.
- Live API `/api/health`: ok.
- Live API `/api/storage/status`: ok, Provider `idrive-e2`, Storage Role `primary`.

## Deployment

- Commit: `5cdba69` (`Keep start chat inline`).
- GitHub Push: `main -> main`.
- Cloudflare Worker: `smejj-com`.
- Cloudflare Version ID: `f338910f-dc8b-45e0-900c-712ddf3cfb24`.
- Live Service Worker: `smejj-shell-v53`.

## Kosten- und Speicherregel

- GitHub.com bleibt dauerhaft Free-only.
- Cloudflare.com bleibt dauerhaft Free-only.
- Keine GitHub Pro-, Team-, Enterprise-, Actions-Minuten-, Storage-, LFS-, Packages- oder Codespaces-Nutzung.
- Keine Cloudflare Pro-, Business-, Enterprise-, Workers-Paid-, R2-Paid-, Images-, Stream-, Queues-, D1-Paid-, KV-Paid- oder Workers-AI-Paid-Nutzung.
- Keine Trials.
- Keine Auto-Billing-Fallbacks.
- Keine spaeter automatisch kostenpflichtigen Dienste.
- IDrive e2 / S3-kompatibler Storage bleibt Hauptspeicher fuer Dateien, Medien, Modelle, Backups und Deployment-Artefakte.

## Resthinweis

Echter Google-Login und echte Betriebssystem-Dateiauswahl brauchen interaktive Nutzerfreigabe. Die vorhandenen UI-, API-, Sicherheits-, Storage- und PWA-Pruefungen sind bestanden.
