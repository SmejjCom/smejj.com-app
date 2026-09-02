# Werkstatt-Backlog (Autopilot Nr. 30, Station 1)

Gesammelt am 2026-09-01T20:01:02.765Z aus ECHTEN Messungen — nicht aus Vermutungen.
Erzeugt von `scripts/werkstatt/sammle-backlog.mjs`. Diese Datei wird bei jedem Lauf neu geschrieben.

**Quellen, die geantwortet haben:** Autopiloten-Ampel, CVE-Waechter, Mail-Zustellprotokoll

**STUMME QUELLEN — hier wurde NICHT nachgesehen:**
- Pruefsuite: nicht angefordert (--mit-tests setzen)
- Nutzer-Feedback: nur im Control-Server messbar (liest die e2-Feedback-Ablage im Takt)

> Eine stumme Quelle ist kein leeres Backlog. Was hier fehlt, ist ungeprueft, nicht erledigt.

## 4 Aufgaben, nach Dringlichkeit


### Stufe 1 — Ausfall

- **Ausfall: Probe-Nutzer**
  - Betrifft: `synthetic-user-watchdog` · Quelle: Ampel-Vorfall · offen seit 2026-08-31T23:00:24.834Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: Nutzerreise P1: 1 von 7 Schritten kaputt — buendel_gleichheit: sw.js weicht ab: https://smejj.com traegt smejj-shell-v721, https://api.smejj.com traegt smejj

### Stufe 2 — Sicherheit

- **pipecat-ai 0.0.67: 2 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:pipecat-ai` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-c2jg-5cp7-6wc7, PYSEC-2026-458. Quelle: workers/smejj-voice/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.
- **protobuf 5.29.5: 2 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:protobuf` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-7gcm-g887-7qv7, PYSEC-2026-1805. Quelle: workers/smejj-voice/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.
- **transformers 5.5.0: 1 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:transformers` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-xrqw-3rrv-vx5w. Quelle: workers/smejj-bild-maler/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.

