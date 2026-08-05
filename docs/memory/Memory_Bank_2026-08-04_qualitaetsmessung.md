## 2026-08-04 — Qualitaetsmessung laeuft jetzt von allein

Betreiber-Freigabe. Nachweis: `docs/approvals/2026-08-04-qualitaetsmessung-automatisch.md`.

- **EINE AUTOMATIK, DEREN ERGEBNIS IM CACHE HAENGENBLEIBT, MELDET ERFOLG UND
  BEWIRKT NICHTS.** `/verlauf-messwerte.json` lag cache-first im Precache. Ohne
  Aenderung haette kein Messlauf je einen wiederkehrenden Nutzer erreicht — und
  niemand haette es gemerkt. Jetzt netz-zuerst (`LIVE_DATEN_PFADE` in sw.js),
  Cache nur als Rueckfall. Ein Test haelt fest, dass die Weiche VOR der
  Precache-Weiche steht; dahinter griffe sie nie.
  MERKREGEL: Vor dem Einrichten eines Zeitplans pruefen, ob sein Ergebnis den
  Nutzer ueberhaupt erreicht.
- **EIN GESCHEITERTER TRANSPORT IST KEINE SCHLECHTE NOTE.** `laufIstBrauchbar`
  bricht bei JEDEM Fall mit Transportfehler ab und schreibt nichts (der 401-Lauf
  vom selben Tag ergab 0,0 %). Ein echtes „blocked" geht sehr wohl durch — der
  Schutz gilt dem Transport, nicht der Note.
- Drei getrennte Teile: `messlauf.mjs` misst NUR, `messlauf-taeglich.sh`
  veroeffentlicht und liefert aus, die `.command`-Datei richtet den Zeitplan
  ein/ab. Ein Skript, das alles macht, ist im Fehlerfall nicht zerlegbar.
- Zeitplan `10 7,19 * * *`. Taktung 5,5 s zwischen den Aufrufen — die Bruecke
  laesst 12/Minute, 42 Aufrufe ohne Taktung enden in HTTP 429.
- **crontab braucht einen KURZEN Pfad:** `crontab "<langer Google-Drive-Pfad>"`
  schneidet ab und meldet „No such file"; Umweg ueber `/tmp/kurz.txt`. Ausserdem
  kann `crontab -` haengen (macOS-Berechtigung) — immer mit Zeitlimit aufrufen.
- Abnahme: ein echter Automatik-Lauf durchgefuehrt, 97,06 % / 1 kritisch /
  blocked, live in der Datei und auf der Seite. Er meldete ein SCHLECHTERES
  Ergebnis als der Lauf davor (98,04 %) — genau das war der Zweck. Der
  Unterschied ist bekanntes Rauschen (temperature 0.35), der wackelige Fall wird
  jeweils namentlich genannt.
- sw v221, check:all 1598 gruen, Start-Lock neu eingefroren.
