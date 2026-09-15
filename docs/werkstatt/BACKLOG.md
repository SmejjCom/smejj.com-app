# Werkstatt-Backlog (Autopilot Nr. 30, Station 1)

Gesammelt am 2026-09-14T20:01:48.313Z aus ECHTEN Messungen — nicht aus Vermutungen.
Erzeugt von `scripts/werkstatt/sammle-backlog.mjs`. Diese Datei wird bei jedem Lauf neu geschrieben.

**Quellen, die geantwortet haben:** Autopiloten-Ampel, CVE-Waechter, Mail-Zustellprotokoll

**STUMME QUELLEN — hier wurde NICHT nachgesehen:**
- Pruefsuite: nicht angefordert (--mit-tests setzen)
- Nutzer-Feedback: nur im Control-Server messbar (liest die e2-Feedback-Ablage im Takt)

> Eine stumme Quelle ist kein leeres Backlog. Was hier fehlt, ist ungeprueft, nicht erledigt.

## 8 Aufgaben, nach Dringlichkeit


### Stufe 1 — Ausfall

- **Ausfall: Konto-Wache**
  - Betrifft: `konto-wache` · Quelle: Ampel-Vorfall · offen seit 2026-09-14T17:38:41.413Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: Admin-Liste wurde vor Kurzem geändert (NEU s***@gmail.com) — Alarm noch 24 h, dann gilt der neue Stand.
- **Ausfall: Missbrauchs-Wache**
  - Betrifft: `missbrauchs-wache` · Quelle: Ampel-Vorfall · offen seit 2026-09-14T19:26:56.811Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: 1 Missbrauchs-Befund(e): anmelde-sturm von 88.239.132.198 (87 Anfragen/10 min) — Wache sperrt nicht selbst, Entscheidung beim Betreiber.
- **Ausfall: Betriebswache**
  - Betrifft: `oberflaechenwache` · Quelle: Ampel-Vorfall · offen seit 2026-09-13T08:42:41.254Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: smejj.com: responsive gruen, touch gruen, betriebswerte nicht messbar (Zeabur-Schluessel abgelaufen, HTTP 401 — Betreiber muss ihn erneuern).
- **Ausfall: Red-Team-Probe**
  - Betrifft: `red-team-probe` · Quelle: Ampel-Vorfall · offen seit 2026-09-14T19:26:56.811Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: Selbsttest 4/4; 5 Injektions-Proben gegen den Nutzerweg /api/agent: Note 60 % (5 Fälle, 1 kritisch, p95 11169 ms) — kritische Zusicherung verletzt: sich-anwe
- **Ausfall: Tiefe-Spur-Messung**
  - Betrifft: `tiefe-spur-messung` · Quelle: Ampel-Vorfall · offen seit 2026-09-12T12:28:44.405Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: Selbsttest 5/5; tiefe Spur: Note 87 % (14 Fälle, 1 kritisch, p95 27396 ms) — kritische Zusicherung verletzt: schutz-design-lock; 2 wackelig (beim zweiten Ver

### Stufe 2 — Sicherheit

- **accelerate 1.1.1: 2 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:accelerate` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-4j2p-28q2-5m79, PYSEC-2026-3804. Quelle: workers/smejj-bild-maler/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.
- **pipecat-ai 0.0.67: 2 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:pipecat-ai` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-c2jg-5cp7-6wc7, PYSEC-2026-458. Quelle: workers/smejj-voice/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.
- **transformers 5.5.0: 2 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:transformers` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-xrqw-3rrv-vx5w, PYSEC-2026-3929. Quelle: workers/smejj-bild-maler/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.

