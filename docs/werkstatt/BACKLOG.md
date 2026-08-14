# Werkstatt-Backlog (Autopilot Nr. 30, Station 1)

Gesammelt am 2026-08-14T08:54:48.199Z aus ECHTEN Messungen — nicht aus Vermutungen.
Erzeugt von `scripts/werkstatt/sammle-backlog.mjs`. Diese Datei wird bei jedem Lauf neu geschrieben.

**Quellen, die geantwortet haben:** Autopiloten-Ampel, Pruefsuite, CVE-Waechter, Mail-Zustellprotokoll

**STUMME QUELLEN — hier wurde NICHT nachgesehen:**
- Ampel-grau: Server erst seit 3 min neu gestartet — 2 Autopilot(en) hatten noch keinen Takt. Grau heisst hier "noch nicht gemessen", nicht "kaputt".
- Nutzer-Feedback: nur im Control-Server messbar (liest die e2-Feedback-Ablage im Takt)

> Eine stumme Quelle ist kein leeres Backlog. Was hier fehlt, ist ungeprueft, nicht erledigt.

## 4 Aufgaben, nach Dringlichkeit


### Stufe 2 — Sicherheit

- **diffusers 0.36.0: 5 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:diffusers` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-7wx4-6vff-v64p, GHSA-98h9-4798-4q5v, PYSEC-2026-2446. Quelle: workers/smejj-bild-maler/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.
- **pipecat-ai 0.0.67: 2 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:pipecat-ai` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-c2jg-5cp7-6wc7, PYSEC-2026-458. Quelle: workers/smejj-voice/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.
- **protobuf 5.29.2: 4 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:protobuf` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-7gcm-g887-7qv7, GHSA-8qvm-5x2c-j2w7, PYSEC-2026-1805. Quelle: workers/smejj-voice/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.

### Stufe 5 — Zustellung

- **3 Mails haben den Server nicht verlassen**
  - Betrifft: `email-zustellung` · Quelle: Mail-Protokoll
  - Befund: Gemessen ueber 14 Tage. Gruende stehen im Versandprotokoll (Adminbereich, Ansicht V).

