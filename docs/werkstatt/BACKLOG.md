# Werkstatt-Backlog (Autopilot Nr. 30, Station 1)

Gesammelt am 2026-08-30T20:00:53.021Z aus ECHTEN Messungen — nicht aus Vermutungen.
Erzeugt von `scripts/werkstatt/sammle-backlog.mjs`. Diese Datei wird bei jedem Lauf neu geschrieben.

**Quellen, die geantwortet haben:** Autopiloten-Ampel, CVE-Waechter, Mail-Zustellprotokoll

**STUMME QUELLEN — hier wurde NICHT nachgesehen:**
- Pruefsuite: nicht angefordert (--mit-tests setzen)
- Nutzer-Feedback: nur im Control-Server messbar (liest die e2-Feedback-Ablage im Takt)

> Eine stumme Quelle ist kein leeres Backlog. Was hier fehlt, ist ungeprueft, nicht erledigt.

## 5 Aufgaben, nach Dringlichkeit


### Stufe 1 — Ausfall

- **Ausfall: DSGVO-Fristen-Wache**
  - Betrifft: `dsgvo-fristen` · Quelle: Ampel-Vorfall · offen seit 2026-08-30T10:08:04.394Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: DSGVO: 1 DSGVO-Vorgang/Vorgänge über der Frist (dsgvo_5EuyuQark7kl) — Bußgeld-Risiko, sofort bearbeiten; Karte in der Tagesmappe-Ablage.
- **Ausfall: Probe-Nutzer**
  - Betrifft: `synthetic-user-watchdog` · Quelle: Ampel-Vorfall · offen seit 2026-08-30T11:00:33.173Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: Nutzerreise P1: 1 von 7 Schritten kaputt — buendel_gleichheit: sw.js weicht ab: https://smejj.com traegt smejj-shell-v714, https://api.smejj.com traegt smejj

### Stufe 2 — Sicherheit

- **pipecat-ai 0.0.67: 2 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:pipecat-ai` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-c2jg-5cp7-6wc7, PYSEC-2026-458. Quelle: workers/smejj-voice/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.
- **protobuf 5.29.5: 2 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:protobuf` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-7gcm-g887-7qv7, PYSEC-2026-1805. Quelle: workers/smejj-voice/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.

### Stufe 4 — Verspaetung

- **Verspaetung: Qualitäts-Prüfer**
  - Betrifft: `qualitaetsmessung` · Quelle: Ampel-Vorfall · offen seit 2026-08-30T16:21:43.884Z
  - Befund: Verspätet: der nächste Lauf hätte schon kommen müssen, die Schonfrist läuft noch.

