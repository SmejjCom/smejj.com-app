# smejj.com — Auftrag: Open-Meteo-Deploy fertigstellen + Blitz-Performance + Icon-Check

**Diese Prompt komplett in einen neuen Chat einfügen. Alle Vorarbeiten sind erledigt und verifiziert — es fehlen nur noch die Schritte unten.**

---

## Schriftliche Freigabe (vom Nutzer erteilt)

Hiermit erteile ich die schriftliche Freigabe: In der Salad-Container-Gruppe `smejj-control` (Produktion) dürfen die zwei Umgebungsvariablen `SMEJJ_CONTROL_ARTIFACT_KEY` und `SMEJJ_CONTROL_ARTIFACT_SHA256` auf das Artefakt `smejj-control-open-meteo-2026-07-16-rc1` umgestellt und der Container neu gestartet werden. Rollback-Werte siehe unten. Sonst darf nichts geändert werden.

---

## Kontext (Stand 2026-07-16, alles bereits verifiziert)

- **Problem:** Chat auf smejj.com braucht ~14 s bis zum ersten Antwortzeichen bei Wetter-/Aktualitätsfragen. Ursache: Server scrapt Suchmaschinen-Seiten (2×6 s Seiten-Exzerpte) statt Open-Meteo-API (~0,2 s).
- **Fix:** Commit `cace69e` (GitHub `smejjcom/smejj.com-app`, main): Wetter direkt über Open-Meteo via `liveInternet.js`, Websuche mit Intent-Gate und `withPages: 0`. Zusätzlich wurde `extractWeatherLocation` minimal erweitert (Zeitwörter „morgen/übermorgen/…“ und führendes „in/für“ werden entfernt), sonst verfehlt die Frage „wie ist Wetter morgen in Berlin“ das Geocoding — gegen die echte Open-Meteo-API verifiziert.
- **Deploy-Architektur:** `smejj-control` läuft auf SaladCloud (Portal: portal.salad.com, Org `smejjcom`, Projekt `default`) mit Image `node:22-bookworm`. Der Start-Command lädt ein Bootstrap-Skript (`SMEJJ_CONTROL_BOOTSTRAP_URL`, öffentliches Repo `smejjcom/smejj-control`, `runtime/bootstrap-idrive-control.mjs`), das die tar.gz aus IDrive e2 lädt (`SMEJJ_CONTROL_ARTIFACT_KEY` im Bucket `smejj-model-files`), die SHA-256 gegen `SMEJJ_CONTROL_ARTIFACT_SHA256` prüft (fail-closed) und `src/server.js` startet.

## Bereits erledigt (NICHT wiederholen)

1. **Artefakt gebaut** aus der Produktionsbasis v74 (lokaler Projektordner „smejj.com App“) + exakt dem Fix — mit dem offiziellen Builder `scripts/deploy/build_control_release_artifact.mjs` inkl. der erweiterten Include-Liste aus `scripts/deploy/check_release_import_closure.mjs` (`workers/maus-engine`, `workers/glm-salad/s3.js`, `schemas`).
2. **Verifiziert:** webSearch-Tests 18/18 grün, live-internet-Tests 4/4 grün, Import-Closure-Check grün (111 Dateien), Boot-Smoke-Test aus dem entpackten Artefakt grün (`/api/health` → `ok:true`, Startseite HTTP 200), Secret-Scan des Builders sauber.
3. **Hochgeladen auf IDrive e2** (console.idrivee2.com, Bucket `smejj-model-files`): `deployments/control/smejj-control-open-meteo-2026-07-16-rc1/smejj-control-open-meteo-2026-07-16-rc1.tar.gz`, 1.023.727 Bytes, Upload mit SHA-256-Checksum-Verifikation.
4. **Lokale Sicherung:** Artefakt + Manifest + Checksum liegen in `backups/deploy-open-meteo-2026-07-16-rc1/` im Projektordner.

**Artefakt-SHA-256 (neu):** `ebca5b3db8abc519b72a788ee2774f6e3fd2cbc5a5c08153d34a6a704b5f6983`

## Rollback-Punkt (gesichert, alte Werte)

- `SMEJJ_CONTROL_ARTIFACT_KEY` (alt): `deployments/control/smejj-control-maus-replay-2026-07-15-rc2.tar.gz`
- `SMEJJ_CONTROL_ARTIFACT_SHA256` (alt): `9b61a861e3ce0e82936252a138663cee5abe8c9f3c3de3615f35b883ea789199`
- Rollback = diese zwei Werte zurücksetzen, speichern, Neustart abwarten. Das alte Artefakt liegt unangetastet auf IDrive e2.

---

## Aufgabe 1 — Deploy abschließen (Schritt für Schritt)

1. Salad-Portal öffnen: `https://portal.salad.com/organizations/smejjcom/projects/default/containers/smejj-control/edit`
2. Environment Variables → Edit. **Nur** diese zwei Werte ändern:
   - `SMEJJ_CONTROL_ARTIFACT_KEY` → `deployments/control/smejj-control-open-meteo-2026-07-16-rc1/smejj-control-open-meteo-2026-07-16-rc1.tar.gz`
   - `SMEJJ_CONTROL_ARTIFACT_SHA256` → `ebca5b3db8abc519b72a788ee2774f6e3fd2cbc5a5c08153d34a6a704b5f6983`
3. Configure → Save. Salad erstellt Version 75 und startet neu (Bootstrap verifiziert die SHA-256; bei Mismatch startet er nicht — dann Tippfehler prüfen).
4. Instances-Tab beobachten bis RUNNING; Container Logs prüfen: Zeile `control_artifact_verified` mit dem neuen Key muss erscheinen.
5. Health prüfen: Gateway `https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/health` → `ok:true`.
6. **Live-Test auf smejj.com** (Chrome): Frage „wie ist Wetter morgen in Berlin“ senden, Zeit bis zum ersten Antwortzeichen messen. **Ziel: < 2 s** (vorher 14 s). Antwort muss Open-Meteo-Daten für Berlin enthalten.
7. **Non-Regression:** Eine normale Chat-Frage („Erkläre mir Photosynthese“) und eine Coding-Frage testen; 0 Konsolenfehler; Startseite/Eingabefeld unverändert (Design-Lock); Sprachwelle-Fix aus Aufgabe 1 weiter intakt.
8. Bei Fehlern: sofort Rollback (Werte oben), erneut testen, Ursache analysieren — nichts anderes anfassen.
9. Abschluss dokumentieren: `Memory_Bank.md` (nur bei Erfolg) + kurze Release-Notiz in `docs/deployment/`.

## Aufgabe 2 — Blitz-Performance (Ziel: ChatGPT-Niveau oder besser)

Erst messen, dann gezielt optimieren — keine ungeprüften Umbauten, Change-Lock beachten (jede Code-Änderung braucht schriftliche Freigabe; Messung/Analyse ist frei):

1. **Messen (Baseline nach dem Deploy):** Für 5 Fragetypen (Wetter, News, Allgemeinwissen, Coding, Smalltalk) je Zeit bis erstes Zeichen (TTFT) und bis Antwortende messen (Browser, `performance.now()` um den SSE-Stream).
2. **Engpässe identifizieren:** Salad-Gateway-Latenz, Modell-TTFT (GLM-5.2 via api.z.ai), RAG-Kontextaufbau, verbleibende Suchpfade. Server sendet `x-smejj-model-backend`-Header — prüfen, welcher Provider antwortet.
3. **Bekannte Kandidaten (jeweils einzeln vorschlagen + Freigabe einholen):** SSE-Streaming ohne Puffer (flush pro Token), RAG-Block parallel statt sequenziell zum Websuche-Block aufbauen, TTL-Cache für Wetter/Geocoding (Open-Meteo erlaubt Caching), kürzerer Systemprompt für Smalltalk, `SMEJJ_LLM_TIMEOUT_MS` prüfen.
4. **Flüssigkeit (UI):** Streaming muss zeichenweise/tokenweise rendern, kein Ruckeln — im Frontend (`public/ai/chatClient.js`) prüfen, ob Chunks sofort gerendert werden. Design-Lock: Startseite und unteres Eingabefeld nicht verändern.
5. Jede Optimierung: Task Capsule, Tests, Rollback-Punkt, Live-Messung vorher/nachher, nur validierte Ergebnisse in `Memory_Bank.md`.

## Aufgabe 3 — Alle Icons perfekt

1. **Bestandsaufnahme im Live-Browser (smejj.com):** Alle Icons/Buttons durchklicken: Menü, Modell-Auswahl (smejj 1.0/GLM-5.2/Kimi K2.7/Cline), Mikrofon/Diktat, Datei-Upload, Code-Aktionen (Kopieren/Speichern/Editor), Einstellungen, Profil, Sprach-Dropdown (15 Sprachen), PWA-Installations-Icon.
2. Für jedes Icon prüfen: sichtbar (auch mobil/responsive), klickbar, richtige Funktion, kein toter Klick, kein Konsolenfehler, Hover-/Aktiv-Zustand.
3. **Favicon-Lock beachten:** `docs/frontend/FAVICON_LOCK.md` — finale Favicon-Dateien und Referenzen dürfen NICHT verändert werden. Icon-Maximierung vom 2026-07-15 ist abgeschlossen und geschützt (21/21 remote verifiziert).
4. Defekte Icons: Ursache analysieren, Fix vorschlagen, schriftliche Freigabe einholen, dann fixen + testen (frontend-structure-Tests, `npm run check:frontend`, `check:start-lock`, `check:favicon-lock`).
5. Frontend-Deploys laufen über GitHub Pages (`smejjcom/smejj-app-frontend`, Deploy-from-Branch) — nach jedem Deploy Live-Parität per Blob-SHA prüfen (Konvention siehe `Memory_Bank.md`).

## Aufgabe 4 — Zum Schluss: 100 % Schutz aktivieren

1. Nichts löschen, keine weiteren Einstellungen ändern, keine neuen Dienste.
2. Rollback-Punkte dokumentiert lassen (dieser Deploy + alle weiteren Änderungen).
3. Change-Lock bestätigen: Ab Abschluss keine Änderung an Code, Konfiguration, Deployment oder Policies ohne neue schriftliche Freigabe.
4. Kurzer Abschlussbericht: was live ist, gemessene Zeiten vorher/nachher, Icon-Status, offene Punkte.

## Wichtige Regeln (verbindlich)

- Schreibweise immer `smejj.com`. Free-only-Policy einhalten (keine Paid-Dienste, keine Trials). IDrive e2 ist einziger zentraler Speicher. Salad nur pay-per-use.
- `IDRIVE_E2_SECRET_KEY` und andere Secrets niemals anfassen, anzeigen oder irgendwo eintippen. Der Deploy braucht sie nicht (Upload ist fertig, Salad hat die Keys bereits als ENV).
- Portale sind im Browser eingeloggt: portal.salad.com, console.idrivee2.com, github.com. Projektordner „smejj.com App“ ist als Arbeitsordner verbunden.
- Vor jeder Änderung: `AI_Guidelines.md`, `Memory_Bank.md`, `Project_Goals.md` lesen. Nach jeder Änderung: Checks laufen lassen (`npm run check:guidelines`, bei Frontend `check:frontend` etc.).
