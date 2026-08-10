# Freigabe: Autopiloten Wochenbericht + Gelb-Vorfaelle (Control-Release)

**Datum:** 2026-08-09 (spaeter Abend)
**Betreiber:** per Klick-Antwort in der Claude-Code-Sitzung

## Wortlaut

Auf die Frage „Control-Release jetzt live stellen?" hat der Betreiber
**„Ja, live stellen"** gewaehlt, mit dem Hinweis: „Deine Wahl gilt als
Freigabe. Gleicher geprüfter Weg wie heute Abend — und morgen 7:00 UTC kommt
der erste Wochenbericht."

## Umfang des Release

- Nr. 4: Wochenbericht — montags ab 7:00 UTC eine Lage-Mail an
  SMEJJ_ADMIN_OWNER_EMAILS (Quote aus Laeufen, Vorfaelle der Woche,
  Stillgelegtes als gewollt); Einmal-Marker `_wochenbericht` neustart-fest.
- Nr. 5: Gelb-Phasen (Verspaetungen) werden Vorfaelle mit Art-Spalte;
  Eskalation gelb→rot bleibt EIN Vorfall.
- Dateien: `control-server/src/admin/opsAutopiloten.js` (+Tests, 331/331
  gruen), `control-server/admin-ui/views-stage9.js`, `src/server.js`
  (Taktgeber-Verdrahtung). Kein Lock betroffen.
