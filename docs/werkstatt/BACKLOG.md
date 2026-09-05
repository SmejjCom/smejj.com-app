# Werkstatt-Backlog (Autopilot Nr. 30, Station 1)

Gesammelt am 2026-09-04T20:01:52.559Z aus ECHTEN Messungen — nicht aus Vermutungen.
Erzeugt von `scripts/werkstatt/sammle-backlog.mjs`. Diese Datei wird bei jedem Lauf neu geschrieben.

**Quellen, die geantwortet haben:** Autopiloten-Ampel, CVE-Waechter, Mail-Zustellprotokoll

**STUMME QUELLEN — hier wurde NICHT nachgesehen:**
- Pruefsuite: nicht angefordert (--mit-tests setzen)
- Nutzer-Feedback: nur im Control-Server messbar (liest die e2-Feedback-Ablage im Takt)

> Eine stumme Quelle ist kein leeres Backlog. Was hier fehlt, ist ungeprueft, nicht erledigt.

## 3 Aufgaben, nach Dringlichkeit


### Stufe 1 — Ausfall

- **Ausfall: Betriebswache**
  - Betrifft: `oberflaechenwache` · Quelle: Ampel-Vorfall · offen seit 2026-09-02T02:37:24.704Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: Responsive+Touch gegen smejj.com: rot.

### Stufe 2 — Sicherheit

- **pipecat-ai 0.0.67: 2 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:pipecat-ai` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-c2jg-5cp7-6wc7, PYSEC-2026-458. Quelle: workers/smejj-voice/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.
- **transformers 5.5.0: 1 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:transformers` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-xrqw-3rrv-vx5w. Quelle: workers/smejj-bild-maler/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.

