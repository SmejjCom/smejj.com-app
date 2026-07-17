# Prompt: smejj.com Maus-Engine zu 100 % fertigstellen (Livegang + Live-Beweis)

> Diesen gesamten Text in einen neuen Chat kopieren.

---

## Kontext

Du arbeitest im Projektordner der smejj.com App. Lies zuerst und halte dich strikt daran:

- `AGENTS.md` (Change-Lock, Free-only, Pflichtpruefungen)
- `docs/architecture/FREE_ONLY_MASTER_POLICY.md`
- `docs/architecture/MAUS_ENGINE.md` (Architektur, Phasenstatus, Testplan)
- `Project_Goals.md`, `AI_Guidelines.md`, `Memory_Bank.md` (neueste Eintraege vom 2026-07-14 zur Maus-Engine)

## Was bereits FERTIG und lokal verifiziert ist (NICHT neu bauen, NICHT aendern)

Alle folgenden Teile sind schriftlich freigegeben, gebaut und mit 57/57 Tests
(`pnpm run check:maus-engine`) plus Non-Regression verifiziert. Rollback-Punkte:
`backups/rollback-2026-07-14-maus-engine-phase1/`, `...-phase2/`, `...-integration/`.

1. **Schema:** `schemas/maus-action-plan.schema.json` (v1, 30 Aktionen, fail-closed, modellneutral).
2. **Kern-Engine:** `workers/maus-engine/` — Plan-/Schema-Validator, Domain-Allowlist + SSRF-Schutz, deterministischer Interpreter (7 Aktionsmodule), Stufe-1-Optimierer (HTTP ohne Browser), Secret-Vault (`SMEJJ_MAUS_SECRET_*`, Log-Maskierung), Cookie-Banner-Heuristik, e2-Session-Store, gzip-Artefakt-Uploader mit SHA-256-Manifest, stateless Single-Run-Worker (`worker.mjs`).
3. **Planer-Anbindung (modellunabhaengig):** `prompt-template.mjs` (v1, EIN Template fuer alle Modelle), `plan-normalizer.mjs` (keine Reparatur-Heuristik), `planner-roundtrip.mjs` (budgetiert, Fehlerkontext als untrusted gerahmt), `macro-store.mjs` + `runMacro` (Makros auf e2, laufen ohne Modell).
4. **Control-Server-Bridge:** `/api/maus/run` (`control-server/src/routes/mausEngineRoutes.js`) — auth-pflichtig, Env-Gate fail-closed, Budget-Gate, Rate-Limit; `buildPlannerClient` ueber den bestehenden AI Router (GLM-5.2 zuerst, jedes Modell via `plannerModel`/BYOK); Vision serverseitig hart aus.
5. **Salad-Image:** `workers/maus-engine/Dockerfile` (Playwright-Basis, Chromium gecacht, Env-Vertrag im File dokumentiert).

Ohne die 3 Env-Werte ist die Route komplett inert (503, fail-closed). Nichts davon ist deployt.

## Ziel dieses Chats

Die Maus-Engine zu 100 % fertigstellen: voller Pruefungslauf, Livegang des
Workers, Live-E2E-Beweis (a)–(e) mit Artefakten auf IDrive e2, Abschluss-
Dokumentation. **Reihenfolge strikt einhalten. Kein Schritt wird uebersprungen.**

## Verbindliche Regeln (unveraendert gueltig)

- **Change-Lock:** Rollback-Punkt vor jeder Aenderung; keine Aenderung an bestehenden, verifizierten Funktionen; Start-Design-Lock und Favicon-Lock nicht beruehren.
- **Free-only:** Keine neuen Dienste, keine Trials, kein Auto-Billing. Salad nur pay-per-use hinter Budget-Gate; Worker nach jeder Aufgabe beenden.
- **Secrets:** Niemals Schluessel/Tokens anzeigen, loggen oder in Dateien schreiben. Portal-Eingaben und Zahlungen macht ausschliesslich der Nutzer selbst; der Agent zeigt exakt an, WAS wo einzutragen ist (Namen ja, Werte nur als Platzhalter).
- **Kein Lernen aus Fehlern:** Memory_Bank nur mit verifizierten Fakten aktualisieren; Memory_Bank hat die 800-Zeilen-Grenze — bei Ueberschreitung aelteste Eintraege 1:1 nach `docs/memory/MEMORY_ARCHIV_2026-07.md` verschieben (etablierte Konvention).
- Naming exakt `smejj.com`; jede Datei < 800 Zeilen.

## Aufgaben in dieser Reihenfolge

### Schritt 1 — Voller Pruefungslauf auf dem Mac (Pflicht vor jedem Deploy)

```bash
pnpm run check:all
pnpm run release:preflight
```

Beide muessen mit Exit 0 enden. Bekannt: In Agent-Sandboxes fehlen pnpm-Binary
und resvg — auf dem Mac muessen beide Laeufe echt und vollstaendig gruen sein.
Falls Node/pnpm auf dem Mac fehlen: Nutzer bitten, Node LTS zu installieren
(bekanntes Thema, siehe Memory-Eintrag vom 2026-07-13). Fehler: erst beheben
(mit Rollback-Punkt), dann kompletten Lauf wiederholen.

### Schritt 2 — Docker-Image bauen und auf Salad deployen (Budget-Gate)

1. Image aus `workers/maus-engine/Dockerfile` bauen (Kontext = Repo-Root) fuer die Salad-Zielarchitektur (amd64), taggen z. B. `smejj-maus-engine:v1`.
2. In die bestehende Container-Registry pushen, die schon fuer `remote-browser`/`glm-salad` genutzt wird (kein neuer kostenpflichtiger Dienst!).
3. Salad-Container-Gruppe `smejj-maus-engine` anlegen (CPU reicht, wie remote-browser; Replicas 1; Autostart AUS; hinter Salad Gateway Auth wie die anderen Worker). Der Nutzer setzt im Salad-Portal die Worker-Secrets:
   - `SMEJJ_MAUS_ENGINE_TOKEN` (neu erzeugen, nur im Portal)
   - `IDRIVE_E2_ENDPOINT`, `IDRIVE_E2_BUCKET`, `IDRIVE_E2_REGION`, `IDRIVE_E2_ACCESS_KEY`, `IDRIVE_E2_SECRET_KEY`
4. Der Nutzer setzt im Control-Server (Salad-Portal, `smejj-control`) die 3 Werte und deployt neu:
   - `SMEJJ_MAUS_ENGINE_ENABLED=YES`
   - `SMEJJ_MAUS_ENGINE_WORKER_URL=<Salad-Gateway-URL des neuen Workers>`
   - `SMEJJ_MAUS_ENGINE_TOKEN=<derselbe Token>`
5. Health pruefen: Worker `GET /health` -> `{ ok:true, engine:"smejj.com maus-engine" }`; Control `GET /api/maus/run` (authentifiziert) -> `configured:true, budget.ok:true`.

### Schritt 3 — Live-E2E-Beweis (a)–(e) mit Artefakten auf IDrive e2

Jeden Lauf ueber die produktive Route `POST /api/maus/run` (authentifizierte
Sitzung) mit eigener `capsuleRef` fahren; Artefakte liegen danach unter
`capsules/maus-engine/{capsuleRef}/result/{planId}/` (gzip + `manifest.json`
mit SHA-256 je Objekt). Jeder Nachweis = Manifest-Key + SHA-256 dokumentieren.

- (a) **Formular ausfuellen:** z. B. httpbin.org/forms/post oder eine eigene Testseite; Allowlist nur diese Domain; assert + Screenshot.
- (b) **Navigation + Tabellen-Extraktion:** Seite mit HTML-Tabelle (z. B. www.iana.org); `extractTable` + Screenshot; extrahierte Daten im Aktionsprotokoll nachweisen.
- (c) **Datei-Download mit Ueberwachung:** `policy.files.downloadAllowed:true` + `download` + `watchDownloads` + `assert downloadExists`; Download-Artefakt auf e2 nachweisen.
- (d) **Fehlerfall Allowlist-Abbruch:** Plan, dessen Lauf eine Domain ausserhalb der Allowlist ansteuert -> sofortiger Abbruch, Abbruch-Artefakt (`fehler/screenshot.png`, `fehler/dom-snapshot.html`) auf e2 nachweisen.
- (e) **Modellunabhaengigkeits-Beweis live:** dieselbe Aufgabe einmal mit GLM-5.2 und einmal mit einem zweiten Modell (`plannerModel`, z. B. Kimi K2.7) planen lassen; beide Plaene normalisieren, Plan-Verhalten und Aktionsprotokolle vergleichen (identisches Engine-Verhalten bei identischem Plan; Abweichungen nur im planner-Feld/planId).
- Zusatzpruefung Kosten: Stufe-1-Lauf (reiner httpRequest-Plan) nachweisen, dass KEIN Browser gestartet wurde (stage:1 im Protokoll). Makro-Test: erfolgreichen Lauf mit `saveAsMacro` speichern, danach denselben Ablauf via `runMacro` OHNE Planer-Modell ausfuehren.
- Nach jedem Lauf pruefen, dass der Worker sich beendet hat (Scale-to-zero) und keine dauerhaften Kosten laufen.

### Schritt 4 — Fehlerbehandlung

Fehler sofort beheben (mit Rollback-Punkt vor jeder Codeaenderung), danach
`pnpm run check:maus-engine` + betroffene Suiten + bei erneutem Deploy
Schritt 1 wiederholen. Nichts als bestanden dokumentieren, was nicht live
bestanden wurde.

### Schritt 5 — Abschluss und 100 % Schutz

1. `docs/architecture/MAUS_ENGINE.md` Status auf "live verifiziert" aktualisieren (mit Capsule-Referenzen und Manifest-SHAs).
2. Memory_Bank-Eintrag: nur belegte Fakten (Capsules, e2-Keys, SHA-256, Testresultate); `trainingEligible:false`.
3. Rollback dokumentieren: Deaktivierung = `SMEJJ_MAUS_ENGINE_ENABLED` entfernen (Route wird wieder inert), Worker-Gruppe stoppen.
4. Schutzstatus bestaetigen: Start-/Favicon-Lock byteidentisch, keine bestehende Funktion veraendert, keine Daten geloescht, Autostart des Workers AUS, Budget-Gate aktiv. Ab dann gilt wieder: keine Aenderung ohne neue schriftliche Freigabe.

### Optional (NUR nach separater schriftlicher Freigabe, nicht Teil von "100 % fertig")

Phase 3 Vision-Fallback: ShowUI/UI-TARS-Vault auf IDrive e2 (Manifest,
Checksums, nur MIT/Apache-Lizenz), on-demand auf Salad hinter Budget-Gate.

## Erfolgskriterium

`pnpm run check:all` + `release:preflight` gruen auf dem Mac; Maus-Engine-Worker
live hinter Budget-Gate; E2E (a)–(e) plus Stufe-1- und Makro-Beweis live
bestanden mit vollstaendigen, per SHA-256 nachweisbaren Artefakten auf IDrive
e2; Doku + Memory aktualisiert; alle Locks unveraendert; keine laufenden
Fixkosten (Worker beendet sich nach jeder Aufgabe).
