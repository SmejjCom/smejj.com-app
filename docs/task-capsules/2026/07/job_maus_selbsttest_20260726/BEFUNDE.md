# Maus-Selbsttest smejj.com — Befundbericht (2026-07-26)

Lauf: lokal mit der echten Maus-Engine (`executeRun`, Playwright/Chromium,
0 EUR — kein Salad-Start, keine Modell-Aufrufe) gegen die LIVE-Seite
https://smejj.com, ausgeloggt. Plan:
`workers/maus-engine/plaene/selbsttest-smejj-com-v1.json`.

## Ergebnis: ALLES GRUEN — 30/30 Schritte, engineOk: true

| Pruefung | Ergebnis | Beleg |
|---|---|---|
| Auth-Gate: `/` ausgeloggt -> `/auth/login/` | OK | Schritt s03/s04, Screenshot 01 |
| Login-Seite: Titel, E-Mail-Feld, Weiter-Knopf | OK | s05-s08, Screenshot 01 |
| `/api/auth/config` live (Google-Knopf wird sichtbar, fail-closed) | OK | s09 |
| Registrierung erreichbar (Passkey-Knopf, URL) | OK | s11-s13, Screenshot 02 |
| Impressum (h1 exakt "Impressum") | OK | s15-s16, Screenshot 03 |
| Datenschutzerklaerung | OK | s18-s19, Screenshot 04 |
| Maus-Replay-Seite oeffentlich, Formular vorhanden | OK | s21-s22, Screenshot 05 |
| Echte 404-Seite (URL mit Punkt, SPA-Fallback greift nicht) | OK | s24-s26, Screenshot 06 |
| `manifest.webmanifest` = 200 | OK | s28 |
| `/assets/config.js` = 200 | OK | s29 |
| Konsolenfehler auf echten Seiten | 0 | selbsttest-bericht.json |

Die einzigen 2 Konsolen-Eintraege sind der ABSICHTLICHE 404-Abruf des
Selbsttests (erwartet, kein Fehler).

## Beobachtungen (keine Fehler, keine Aktion noetig)

1. **i18n funktioniert:** Ein Browser mit englischer Sprache bekommt die
   Auth-Seiten auf Englisch ("Welcome back"). Der erste Lauf scheiterte an
   deutschen Text-Asserts — der Plan wurde daraufhin sprachneutral gemacht
   (Element-/URL-/Titel-Checks statt uebersetzbarer Texte).
2. Der Lauf dauert ~4-7 Sekunden. Er eignet sich als fester
   Nach-Deploy-Check.

## Lauf-Artefakte (result/)

- `selbsttest-bericht.json` — Maschinenlesbarer Bericht (Konsole, Schritte)
- `aktionsprotokoll.json` — jeder Schritt mit ok/Fehler/Dauer
- Screenshots (6 Stueck: Login, Registrierung, Impressum, Datenschutz,
  Maus-Replay, 404) lokal unter `backups/rollback-2026-07-26-maus-selbsttest/screenshots/`
  (GitHub traegt keine Artefakte — Free-only-Policy; Ziel-Ablage IDrive e2
  sobald die Session wieder Zugriff hat)

## Wiederholung (jederzeit, 0 EUR)

Scratchpad-Runner `run-selbsttest.mjs` (Playwright lokal) — oder auf dem
Salad-Worker via `POST /api/maus/run` mit diesem Plan (pay-per-use,
separat freizugeben).
