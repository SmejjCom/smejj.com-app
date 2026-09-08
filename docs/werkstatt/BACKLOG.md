# Werkstatt-Backlog (Autopilot Nr. 30, Station 1)

Gesammelt am 2026-09-08T20:01:38.418Z aus ECHTEN Messungen — nicht aus Vermutungen.
Erzeugt von `scripts/werkstatt/sammle-backlog.mjs`. Diese Datei wird bei jedem Lauf neu geschrieben.

**Quellen, die geantwortet haben:** Autopiloten-Ampel, CVE-Waechter, Mail-Zustellprotokoll

**STUMME QUELLEN — hier wurde NICHT nachgesehen:**
- Pruefsuite: nicht angefordert (--mit-tests setzen)
- Nutzer-Feedback: nur im Control-Server messbar (liest die e2-Feedback-Ablage im Takt)

> Eine stumme Quelle ist kein leeres Backlog. Was hier fehlt, ist ungeprueft, nicht erledigt.

## 10 Aufgaben, nach Dringlichkeit


### Stufe 1 — Ausfall

- **Ausfall: EU-AI-Act-Wache**
  - Betrifft: `ai-act-wache` · Quelle: Ampel-Vorfall · offen seit 2026-09-06T17:14:27.358Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: EU AI Act: aktive(s) Modell ohne Bestandsverzeichnis-Eintrag: smejj-1 — Kennzeichnung nach Art. 50 fehlt.
- **Ausfall: Modell-Katalog-Wache**
  - Betrifft: `modell-katalog-wache` · Quelle: Ampel-Vorfall · offen seit 2026-09-08T10:27:52.407Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: 1 gewählte(s) Modell(e) beim Anbieter verschwunden — Stand vor 0 h, z. B. zhipu:glm-4.5-flash.
- **Ausfall: Betriebswache**
  - Betrifft: `oberflaechenwache` · Quelle: Ampel-Vorfall · offen seit 2026-09-06T18:50:50.238Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: smejj.com: responsive gruen, touch gruen, betriebswerte nicht messbar (Zeabur-Schluessel abgelaufen, HTTP 401 — Betreiber muss ihn erneuern).
- **Ausfall: Red-Team-Probe**
  - Betrifft: `red-team-probe` · Quelle: Ampel-Vorfall · offen seit 2026-09-07T08:48:00.096Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: Selbsttest 4/4; 5 Injektions-Proben gegen den Nutzerweg /api/agent: Note 60 % (5 Fälle, 2 kritisch, p95 2718 ms) — kritische Zusicherung verletzt: sich-injec
- **Ausfall: Schutz-Echtheit**
  - Betrifft: `schutz-echtheit` · Quelle: Ampel-Vorfall · offen seit 2026-09-06T01:19:13.816Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: 6 Sperre(n) bewachen eine Fassung, die niemand bekommt — und melden dabei gruen: start-lock/public/index.html, start-lock/public/app.js, start-lock/public/pr
- **Ausfall: Probe-Nutzer**
  - Betrifft: `synthetic-user-watchdog` · Quelle: Ampel-Vorfall · offen seit 2026-09-08T14:21:45.615Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: Nutzerreise P1: 1 von 7 Schritten kaputt — buendel_gleichheit: sw.js weicht ab: https://smejj.com traegt smejj-shell-v819, https://api.smejj.com traegt smejj
- **Ausfall: Tiefe-Spur-Messung**
  - Betrifft: `tiefe-spur-messung` · Quelle: Ampel-Vorfall · offen seit 2026-09-07T13:16:43.104Z
  - Befund: Der letzte Lauf hat einen Fehler gemeldet: Selbsttest 5/5; tiefe Spur: nicht messbar: 4 von 14 Fällen mit Transportfehler (HTTP/Timeout/Notfall-Assistent): strukturierte-json-ausgabe — http_503 ×4; 1 

### Stufe 2 — Sicherheit

- **accelerate 1.1.1: 1 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:accelerate` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-4j2p-28q2-5m79. Quelle: workers/smejj-bild-maler/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.
- **pipecat-ai 0.0.67: 2 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:pipecat-ai` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-c2jg-5cp7-6wc7, PYSEC-2026-458. Quelle: workers/smejj-voice/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.
- **transformers 5.5.0: 1 bekannte Schwachstelle(n)**
  - Betrifft: `bibliothek:transformers` · Quelle: CVE-Waechter
  - Befund: Gemeldet von osv.dev. Beispiele: GHSA-xrqw-3rrv-vx5w. Quelle: workers/smejj-bild-maler/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.

