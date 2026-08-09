# Freigabe: Autopiloten-Profi-Ausbau (Control-Release)

**Datum:** 2026-08-09
**Betreiber:** per Klick-Antwort in der Claude-Code-Sitzung

## Wortlaut

Auf die Frage „Live stellen — wie weit?" hat der Betreiber die Option
**„Beides live stellen"** gewaehlt, mit dem angekuendigten Umfang:

> Ich stelle die neue Ansicht ins Frontend UND baue das Control-Release mit
> Salad-Neustart. Deine Wahl gilt als Freigabe fuer das Release.

## Umfang des Release

Commit `311c913` (feature/auth-redesign-github-magiclink):

- `control-server/src/admin/opsAutopiloten.js` — Tages-Statistik (90 Tage),
  Erfolgsquote, Vorfall-Protokoll je Rot-Phase, Waechter-Laufdauer,
  gedrosselte Ablage (1 Put/h) fuer die Dauerbetriebs-Piloten
- `control-server/src/admin/opsAutopiloten.test.js` — 6 neue Tests (28/28 gruen,
  Gesamt-Adminsuite 328/328 gruen)
- `control-server/admin-ui/views-stage9.js` + `console.css` — Zuverlaessigkeits-
  Balken und Vorfall-Protokoll (bereits statisch nach smejj.com/admin gespiegelt)

Keine Datei aus `docs/security/admin-lock-manifest.json` ist betroffen.
