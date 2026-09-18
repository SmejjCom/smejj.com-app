# Werkstatt-Backlog (Autopilot Nr. 30, Station 1)

Gesammelt am 2026-09-16T20:29:43.781Z aus ECHTEN Messungen — nicht aus Vermutungen.
Erzeugt von `scripts/werkstatt/sammle-backlog.mjs`. Diese Datei wird bei jedem Lauf neu geschrieben.

**Quellen, die geantwortet haben:** Autopiloten-Ampel, CVE-Waechter, Mail-Zustellprotokoll

**STUMME QUELLEN — hier wurde NICHT nachgesehen:**
- Pruefsuite: nicht angefordert (--mit-tests setzen)
- Nutzer-Feedback: nur im Control-Server messbar (liest die e2-Feedback-Ablage im Takt)

> Eine stumme Quelle ist kein leeres Backlog. Was hier fehlt, ist ungeprueft, nicht erledigt.

## 4 Aufgaben, nach Dringlichkeit


### Stufe 1 — Ausfall

- **Ausfall: Konto-Wache**
  - Betrifft: `konto-wache` · Quelle: Ampel-Vorfall · offen seit 2026-09-16T17:09:31.177Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: Befristeter Alarm bis 2026-09-17T16:59Z: Admin-Eigentümerliste hat sich GEÄNDERT: NEU s***@gmail.com — 24 h Alarm, dann gilt der neue Stand.
- **Ausfall: Schutz-Echtheit**
  - Betrifft: `schutz-echtheit` · Quelle: Ampel-Vorfall · offen seit 2026-09-16T18:09:31.199Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: 3 Sperre(n) bewachen eine Fassung, die niemand bekommt — und melden dabei gruen: start-lock/public/index.html, start-lock/public/start-styles.css, start-lock
- **Ausfall: Probe-Nutzer**
  - Betrifft: `synthetic-user-watchdog` · Quelle: Ampel-Vorfall · offen seit 2026-09-16T17:49:31.189Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: Nutzerreise P1: 1 von 7 Schritten kaputt — buendel_gleichheit: sw.js weicht ab: https://smejj.com traegt smejj-shell-v890, https://api.smejj.com traegt smejj

### Stufe 2 — Sicherheit

- **pipecat-ai 0.0.67: 2 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:pipecat-ai` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-c2jg-5cp7-6wc7, PYSEC-2026-458. Quelle: workers/smejj-voice/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.

