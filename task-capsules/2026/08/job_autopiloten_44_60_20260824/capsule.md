# Task Capsule — job_autopiloten_44_60_20260824

## Ziel
17 neue Autopiloten (Nr. 44–60) bauen und live schalten, damit smejj.com die
Lücken aus dem 135-Piloten-Vergleich (Betreiber-Anfrage 2026-08-24) schließt:
Schutz, Sicherheit, Kosten, Leistung, Wachstum und die Tagesmappe als
10-Minuten-Cockpit des Betreibers. Freigaben: „Ja, alle 17 bauen (Empfehlung)"
und „Ja, live schalten (Empfehlung)" (Karten vom 2026-08-24).

## Ergebnis (live belegt)
- Registry führt **60 Autopiloten**; Live-Ampel nach dem Deploy:
  **59 grün, 0 gelb, 0 rot, 1 grau** (Nr. 05 Trainings-Takt — stillgelegt per
  Betreiber-Entscheidung 2026-08-02, „RAG statt Training", bewusst grau).
- Alle 17 neuen messen echte Werte im 30-min-Takt des Taktgebers, z. B.:
  341 Dateien Geheimnis-Scan, 4 TLS-Handshakes (knappstes Zertifikat 32 Tage),
  Sicherung 8 Ablagen/16 Datensätze mit Rücklese + SHA-256, Last-Probe
  Control p95 162 ms / Brücke p95 194 ms (0/40 Fehler), Startseite 6/6
  SEO-Pflichtangaben, Tagesmappe ohne stumme Quellen.
- Neue Endpunkte: `GET /api/admin/ops/tagesmappe` (ops.read),
  `POST /api/fehler` (Sitzungspflicht, Bremse, PII-Maskierung).

## Änderungen
- 17 Module `control-server/src/autopilots/*Autopilot.js` + Sammel-Läufe
  `schutzUndWachstumLaeufe.js`; Registry-Teile 3+4
  (`opsAutopilotenListeSchutz.js`, `opsAutopilotenListeWachstum.js`);
  Bereichs-Zuordnung, Läufer-Einbindung, `fehlerRoutes.js`,
  Zähl-Haken + Prozess-Haken in `src/server.js`/`start.js`.
- Commits auf `feature/auth-redesign-github-magiclink`:
  6c17f6f3 (Bau), 0c7c6b64 (Live-Befunde Nr. 48+54), 9ef49f97 (Nr. 54 Bestfall).

## Tests / Verifikation
- Wächter-TÜV: `tests/schutz-autopiloten.test.mjs` + `tests/wachstum-autopiloten.test.mjs`
  (22 Tests, jede Prüfung mit kaputter UND gesunder Probe, Anschluss-Beweis).
- Ehrlichkeits-Regime: alle 17 in MIT_ECHTER_MESSUNG; Zähl-Wächter im
  Läufer-Test auf 49/50/52 nachgezogen. Suite: 2670/2676 bzw. 631/632 —
  alle roten als Altbestand auf dem unveränderten Basisstand belegt
  (modelRouter-Katalogtest wurde parallel in bbdfcd76 nachgezogen).
- Drei Live-Deploys über `CONFIRM_CONTROL_BAU=JA scripts/deploy/control-neu-bauen.mjs`;
  Ampel per kurzlebigem local-e2e-Token gegen `/api/admin/ops/autopiloten` gemessen.

## Live-Befunde des ersten Durchgangs (beide behoben)
1. Nr. 48 meldete den bewussten Probe-Schlüssel des Git-Bot-Selbsttests —
   Zeile trägt jetzt das Entwarnungs-Wort (so ist die Ausnahme dokumentiert).
2. Nr. 54: das Repo führt KEINE package-lock.json (pnpm) und der Container
   läuft ABSICHTLICH ohne Fremdpakete — die Wache liest jetzt node_modules
   und kennt den Grün-Fall „0 dependencies = Angriffsfläche null".

## Offene Punkte (stehen auch in der Tagesmappe)
- Fehler-Fänger-Browser-Haken (public/) ausliefern — Aufgaben-Chip gestellt.
- Zweiter Sicherungs-Eimer für Nutzer-Chats (Betreiber-Entscheidung, Kosten/Schlüssel).

## Rollback
Letzter stabiler Stand vor dem Bau: 0162454a. Rück-Roller (Nr. 44) stempelt
stabile Stände fortlaufend in `admin/rueck-roller`.

## Schutz
Alle 6 Locks nach Abschluss grün geprüft (admin, security, start, favicon,
deploy, einwilligung); Admin-Lock mit Betreiber-Freigabe neu eingefroren.
