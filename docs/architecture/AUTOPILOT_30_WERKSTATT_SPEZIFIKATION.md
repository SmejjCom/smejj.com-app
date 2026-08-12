# Autopilot Nr. 30: Werkstatt-Autopilot v2 (smejj.com Self-Evolution Engine)

Status: Verbindlich (Stand 2026-08-11, Betreiber-Freigabe erteilt)

## 1. Übersicht & Zielsetzung

Der **Werkstatt-Autopilot (Autopilot Nr. 30)** ist die selbstständige Entwicklungs-Schleife von smejj.com. Er ermöglicht es der Plattform, sich nachts autonom weiterzuprogrammieren, Fehler zu beheben und neue Funktionen zu entwickeln, ohne den Live-Betrieb, die 0,00-EUR-Kostenpolicy oder die Schutz-Locks (Start-Lock, Security-Lock, Favicon-Lock) zu gefährden.

## 2. Der 4-Stationen-Kreislauf

```
[1. SAMMELN] ──> [2. BAUEN] ──> [3. PRÜFEN] ──> [4. 1-KLICK FREIGABE]
 Real-Inputs      Claude Cloud    Lock-Hashes &   GitHub PR /
 (Radar/Watchdog) auf feature/    Negativ-Tests   Claude App
 -> Backlog-File  Branch          (fail-closed)   (1-Klick Merge)
```

### Station 1: Sammeln (Backlog-Generierung)
- **Echte Quellen:**
  1. Konkurrenz-Radar-Funde (`konkurrenz-radar`),
  2. E2E-Watchdog-Fehler & Latenz-Befunde (`synthetic-user-watchdog`),
  3. Nutzer-Feedback aus der App.
- **Ergebnis:** Priorisierte Aufgabenliste als Git-geprüfte Datei im Repo (kein unsichtbarer Zustand).

### Station 2: Bauen (Headless Cloud Routine)
- **Infrastruktur:** Geplante Claude-Code-Cloud-Routine (Anthropic-Infrastruktur / GitHub Actions), **NICHT** als Zeabur-Dienst (0,00 EUR Server-Kosten-Garantie).
- **Branch-Isolierung:** Entwickelt ausschließlich auf einem isolierten `feature/` Branch (z. B. `feature/self-evolution-20260812`), niemals direkt auf `main`.
- **Harte Grenzen:** Start-Lock (31 Dateien) und Security-Lock (10 Dateien) sind für den Bau-Agenten strikt schreibgeschützt. Max. 1 Aufgabe pro Lauf. Jede Änderung schreibt eine Task Capsule auf IDrive e2 S3.

### Station 3: Prüfen (Fail-Closed Hash-Validation)
- **Test-Pipeline:** `npm run check:all`, `check:start-lock`, `check:security-lock`, `check:favicon-lock`, `check:guidelines`.
- **Cryptographischer Schutz:** Lock-Manifeste werden per SHA256 verglichen. Bei der kleinsten Abweichung an gesperrten Dateien bricht die Pipeline ab und der Branch bleibt un-gemergt archiviert.

### Station 4: Freigabe (1-Klick per Pull Request)
- **Kanal:** Der Bau-Agent erstellt einen Pull Request (PR) auf GitHub / in der Claude App mit Zusammenfassung, Testnachweis und Task Capsule Link.
- **Ein-Klick Live-Gang:** Der Betreiber prüft die PR-Karte. 1 Klick auf "Merge" löst das automatische Live-Deployment aus. Ohne Klick bleibt der Code sicher auf dem Feature-Branch liegen.

## 3. Abnahme-Kriterien
1. **Testfehler-Abfang:** Ein absichtlich erzeugter Syntax- oder Testfehler stoppt den Kreislauf in Station 3.
2. **Lock-Schutz-Beweis:** Versucht eine Aufgabe gesperrte Dateien zu ändern, schlägt Station 3 fehl.
3. **0,00-EUR-Compliance:** Kein neuer kostenpflichtiger Cloud-Dienst; Nutzung der bestehenden Infrastruktur.
