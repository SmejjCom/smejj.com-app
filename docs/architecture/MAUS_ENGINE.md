# smejj.com Universal Maus-Engine — Architektur (Phase 0, zur Freigabe)

Status: Phase 0 schriftlich freigegeben (2026-07-14). Phase 1 und Phase 2
schriftlich freigegeben und lokal verifiziert umgesetzt (Capsules
`maus-engine-phase1-2026-07-14`, `maus-engine-phase2-2026-07-14`; Rollback-
Punkte in `backups/`). Phase 3 (Vision) bleibt offen und separat
freigabepflichtig.

## Livegang-Status (2026-07-14, TEILWEISE live verifiziert)

Deployt und live in Betrieb (schriftliche Freigabe 2026-07-14):
Worker-Image `ghcr.io/smejjcom/smejj-maus-engine:v1` auf Salad-Gruppe
`smejj-maus-engine` (Gateway `https://grape-onion-qpxbsgljwho6v0vx.salad.cloud`,
Autostart AUS, Scale-to-zero, Budget-Gate aktiv). Control-Bridge
`POST/GET /api/maus/run` live auf `smejj-control` Version 66 hinter
authentifizierter Sitzung (Bootstrap-Commit
`128e364b4ba3cc0dc5bfd1240b6512934a0fed56`, Release-Modul-SHA
`5744abda55cf1af7327a36322042573274ef7e4a31e423831a10b8acf0f01fb7`,
Overlay-SHA `fba99e420c4c81eca64b7082455f751a9803ca5380b4b4894f452dafb74acf36`,
Artefakt `deployments/control/smejj-control-maus-2026-07-14-rc1/...`, SHA-256
`7aed76d2d73e65ae6f1a381b3625e75b4b53d0bee691559925cc58638d8e1e40`).

Live-Gate belegt: `GET /api/maus/run` (auth) -> JSON `configured:true`,
`budget.ok:true` (kein HTML-Fallback); ohne Anmeldung -> JSON `401`; Worker
`/health` -> `{ ok:true, engine:"smejj.com maus-engine" }`.

Live-Fixes im Livegang (Rollback-Kopien in
`backups/rollback-2026-07-14-maus-engine-livegang/`): (1) Planer-Client ohne
feste `temperature` — Moonshot/Kimi-Coding lehnt `temperature:0` mit HTTP 400
ab; (2) Prompt-Template v2 mit exaktem Schema-Vertrag + Beispiel — Live-Modelle
scheiterten sonst an `additionalProperties:false` (fehlendes `createdAt`/
`planner.modelId`, verbotenes `description`). Nach beiden Fixes `check:maus-engine`
57/57 und `check:control-server` 161/161 gruen.

Live E2E bestanden (produktive Route, Artefakte auf IDrive e2 mit SHA-256):
- (a) Formular httpbin.org: capsule `maus-e2e-a-form-2026-07-14`, planId
  `httpbin-form-submit-2026-07-14`; Manifest-Objekte
  `.../aktionsprotokoll.json.gz` (SHA-256
  `42ea985bf88bbfdede52d87f1387f4181d583f8b971ad4fd2d65861cd0eb05c3`),
  `.../screenshots/filled-form.png.gz`
  (`62e76f802ecb2bc49d8fd5a02336b1434405322b09c4cb67ca22688a91130e73`),
  `.../screenshots/response-page.png.gz`
  (`f18b835a236085448950c82d5e28a9deb47d3eaa44e0ed1795d661c26a200d37`);
  Makro `maus-engine/makros/formular-httpbin-v1.json` (10 Schritte) gespeichert.
- (b) IANA Navigation + `extractTable`: capsule `maus-e2e-b-tabelle-2026-07-14`,
  planId `iana-numbers-rir-2026-07-14-r1-r2`, plannerCalls 3 (budgetierte
  Roundtrips live bewaehrt); Manifest `.../aktionsprotokoll.json.gz`
  (`32dd0543be68278a4477d5aa833e6fe6891f4a86674a01ed4a35acc0f3b26583`),
  `.../screenshots/iana-numbers.png.gz`
  (`d43fceb5ff7d9412818ac37b5ca414ce98745a55e60fb4e7e5b72960158abadc`).
- Stufe-1 (`httpRequest`-only, `stage:1`, KEIN Browser): capsule
  `maus-e2e-stufe1-2026-07-14`, planId `httpbin-stufe1-get-uuid`, Manifest
  `.../aktionsprotokoll.json.gz`
  (`b47ec2ee10a46d068e4e352c0c0708cdf0f6cc19147e5f6db8d77689a1c5e676`).
- Scale-to-zero live bestaetigt: Worker `running:false` nach jedem Lauf;
  Worker-Gruppe nach den Tests gestoppt.

Async-Modus (2026-07-15, schriftlich freigegeben, Commit
`658cbbb3b445cb0ebf4ce09326ea0e63fbfe91b9`, Control Version 67): `POST` mit
`async:true` antwortet sofort `202` mit `runId`; das Ergebnis wird als
e2-Objekt `capsules/maus-engine/runs/{runId}.json` persistiert und ueber
`GET /api/maus/run?runId=...` gepollt. Damit ist das ~100-Sekunden-
Antwortlimit des Salad-Gateways (Cloudflare-Ingress von Salad, nicht von
smejj.com) fuer die Maus-Engine umgangen. Tests 60/60.

Damit ebenfalls LIVE bestanden (Details + SHA-256 in
`backups/rollback-2026-07-14-maus-engine-livegang/LIVE_E2E_NACHWEISE_2026-07-14.md`):
- (c) Datei-Download mit Ueberwachung (`watchDownloads` + `download` +
  `assert downloadExists`): capsule `maus-e2e-c-download-2026-07-14`, planId
  `download-png-httpbin-2026-07-14-r1-r2`, Download-Artefakt
  `downloads/beispielbild.png.gz` auf e2.
- (d) Laufzeit-Allowlist-Abbruch: 302-Redirect httpbin.org -> example.com
  wurde von der Engine abgefangen (`abortReason: "Host nicht in
  Domain-Allowlist: example.com"`), capsule `maus-e2e-d-allowlist-2026-07-14`.
- Makro-Replay via `runMacro` OHNE Schritt-Planung durch ein Modell: capsule
  `maus-e2e-makro-2026-07-14`, planId `run-macro-formular-httpbin-r1`; die 10
  Makro-Schritte liefen deterministisch — `filled-form.png` ist byteidentisch
  (gleiche SHA-256) zum Original-Lauf (a): Determinismus live belegt.

Noch NICHT live abgeschlossen: (e) Zwei-Modell-Livevergleich —
GLM-5.2/zhipu liefert aktuell bei jedem Aufruf HTTP 502 (Provider-Ausfall);
nur Kimi K2.7 ist erreichbar. Modellunabhaengigkeit bleibt konstruktiv
(planner-Feld = reine Provenienz) und durch den Suite-Test (identischer Plan
-> byteidentisches Aktionsprotokoll) plus den live belegten Makro-
Determinismus gestuetzt; der Livevergleich wird nachgeholt, sobald das
zhipu-Backend (BYOK-Key/Guthaben) wieder erreichbar ist.

Deaktivierung/Rollback (ohne Code-Rollback): bei `smejj-control`
`SMEJJ_MAUS_ENGINE_ENABLED` entfernen (Route wieder inert 503) bzw.
`SMEJJ_CONTROL_BOOTSTRAP_URL`/`_SHA256`/`ARTIFACT_KEY`/`_SHA256` auf die
Vorwerte (`5db5c86b...`/`96f9db87...`,
`deployments/control/smejj-control-auth-2026-07-13-rc3/...`/`afc0e5a4...`)
zuruecksetzen; Worker-Gruppe `smejj-maus-engine` stoppen (bereits gestoppt).

## 1. Ziel

Die smejj.com Universal Maus-Engine ist ein eigenes, modellunabhaengiges
Browser-Automatisierungssystem als Kernsystem der Plattform. Sie gehoert zu
keinem einzelnen KI-Modell. Alle heutigen und zukuenftigen Modelle (smejj 1.0,
GLM-5.2, Kimi K2.7, Cline, Claude, Codex/GPT, Gemini, Grok, ...) nutzen
dieselbe Engine. Ein neues Modell anzubinden aendert nichts an der Engine —
es muss nur das Aktionsplan-Schema erfuellen.

Prinzip: **Die KI plant nur. Die Maus-Engine fuehrt deterministisch aus.**
Laufende Kosten nahe null, weil fast alles ohne Modell laeuft.

## 2. Architektur

```
Benutzer
   |
   v
Ausgewaehltes Modell (via AI Router; siehe AI_MODEL_ROUTER_ROLES.md)
   |  erzeugt NUR einen JSON-Aktionsplan (sieht keine Pixel, steuert nie direkt)
   v
JSON-Aktionsplan  --validiert gegen schemas/maus-action-plan.schema.json (fail-closed)--
   |
   v
smejj.com Maus-Engine (Code, kein Modell) — workers/maus-engine/
   +-- Stufe 1: API/HTTP direkt (wenn moeglich, kein Browser)
   +-- Stufe 2: Playwright + Chromium + DOM/Accessibility-Tree
   +-- Stufe 3: Vision-Fallback (ShowUI/UI-TARS, nur on-demand, separat freizugeben)
   |
   v
Ergebnis + Artefakte -> IDrive e2 (Task Capsule result/)
```

### 2.1 Einordnung in die bestehende Plattform

Die Engine ist ein stateless Salad-Worker nach dem bestehenden Muster
(Project_Goals.md: Control Server minimal, IDrive e2 als Object Brain,
Salad Worker stateless on demand):

- **Control Server:** nimmt Auftrag entgegen, prueft Budget-Gate, legt Task
  Capsule auf IDrive e2 an, startet den Maus-Engine-Worker, streamt Status.
  Keine Browser- oder Modellarbeit im Control Server.
- **IDrive e2:** speichert Plan-JSON, Makros, Session-Snapshots (Cookies/State
  pro Capsule), alle Artefakte und den Vision-Vault. Kein dauerhafter Zustand
  auf dem Worker.
- **Maus-Engine-Worker (Salad, pay-per-use hinter Budget-Gate):** laedt die
  Capsule, validiert den Plan fail-closed, fuehrt ihn deterministisch aus,
  laedt Artefakte komprimiert nach e2 und beendet sich sofort.

### 2.2 Wiederverwendung bestehender Komponenten

| Vorhanden | Wiederverwendung |
|---|---|
| `workers/remote-browser/worker.js` | Playwright-Basis, SSRF-Blocklist (`isAllowedTarget`), Token-Auth, Lazy-Load-Scroll — wird als Grundlage der Stufe 2 uebernommen bzw. referenziert, nicht dupliziert |
| `workers/glm-salad/s3.js` | IDrive-e2-S3-Anbindung fuer den Artefakt-Uploader |
| `schemas/task-capsule.schema.json` | Capsule-Rahmen; die Maus-Engine haengt ihren Plan als Capsule-Objekt an |
| Control-Server Budget-Gate / Watchdog / Kill-Switch | unveraendert; die Engine startet nur hinter dem bestehenden Gate |
| `scripts/validate-json.mjs` (`check:json`) | validiert das neue Schema automatisch mit |

### 2.3 Neues Modul (Phase 1, Vorschlag)

```
workers/maus-engine/
  README.md            # Vertrag, Betrieb, Salad-Hinweise
  worker.mjs           # HTTP-Huelle (health, run), Token-Auth, stateless
  plan-validator.mjs   # Schema-Validierung fail-closed (kein Modell)
  interpreter.mjs      # Aktions-Interpreter: Plan-JSON -> deterministische Schritte
  actions/             # eine Datei pro Aktionsgruppe (Maus, Tastatur, Tabs,
                       # Formulare, Dateien, Extraktion, Cookies, Warten/Assert)
  http-stage.mjs       # Stufe-1-Optimierer: API/HTTP direkt ohne Browser
  session-store.mjs    # Session/Cookies pro Capsule von/zu IDrive e2
  cookie-banner.mjs    # Heuristik-Liste zum Schliessen von Consent-Bannern
  macro-store.mjs      # Makros lesen/schreiben auf IDrive e2 (Phase 2)
  artifact-uploader.mjs# komprimierte Artefakte -> e2 (nutzt bestehende S3-Schicht)
  retry.mjs            # lokale Retry-Logik ohne Modell
```

Jede Datei < 800 Zeilen, eine Verantwortung pro Komponente, Naming exakt
`smejj.com`, ESM, fail-closed, keine Secrets im Repo.

## 3. Modellunabhaengigkeit (verbindlich)

- Die Engine kennt kein Modell. Einzige Schnittstelle ist das Aktionsplan-JSON
  gemaess `schemas/maus-action-plan.schema.json`.
- Das Feld `planner` im Plan ist reine Provenienz (Audit/Logs). Die Engine
  liest es nie fuer Entscheidungen; identische Plaene verhalten sich identisch,
  egal welches Modell sie erzeugt hat (Beweis: E2E-Test e, Abschnitt 8).
- Der bestehende AI Router entscheidet, welches Modell plant
  (`docs/architecture/AI_MODEL_ROUTER_ROLES.md`, `AI_ROUTER_AND_BYOK_POLICY.md`).
  Die Engine bleibt bei jedem Modellwechsel byte-identisch.
- Keine modellspezifische Logik, keine modellspezifischen Branches, keine
  modellspezifischen Defaults in der Engine. Ein Verstoß ist ein Review-Blocker.

### 3.1 Adapter-Konzept (Planer-Seite, nicht Engine-Seite)

Neue Modelle werden ausschliesslich auf der Planer-Seite angebunden:

1. **Ein einziges Prompt-Template** `Aufgabe -> Aktionsplan-JSON` (Phase 2),
   abgelegt als versioniertes Objekt auf IDrive e2. Es enthaelt das Schema,
   die erlaubten Aktionen und Beispiele. Jedes Modell im AI Router erhaelt
   exakt dieses Template; BYOK-Modelle (Claude, GPT/Codex, Gemini, Grok)
   ueber die bestehende BYOK-Policy.
2. **Normalisierung:** Der Router extrahiert aus der Modellantwort den
   JSON-Block (Markdown-Zaeune entfernen, nichts inhaltlich veraendern).
3. **Validierung fail-closed:** Jeder Plan wird gegen das Schema geprueft —
   ungueltig heisst abgelehnt, egal von welchem Modell. Es gibt keine
   Reparatur-Heuristik in der Engine; hoechstens ein budgetierter zweiter
   Planungsversuch beim selben Planer.
4. Ein neues Modell anzubinden = Router-Eintrag + Template zustellen.
   Null Zeilen Engine-Aenderung.

## 4. Drei-Stufen-Ausfuehrung und Kostenmodell (Ziel: ~0 EUR)

| Stufe | Methode | Zielanteil | Kosten |
|---|---|---|---|
| 1 | API/HTTP direkt — kein Browser, keine Maus, keine KI | 40–60% | ~0 |
| 2 | Playwright + Chromium + DOM/Accessibility (Open Source) | 39–59% | nur Worker-Laufzeit (Salad pay-per-use hinter Budget-Gate) |
| 3 | Vision-Modell on-demand, danach sofort beenden | <1–2% | pay-per-use hinter Budget-Gate, standardmaessig deaktiviert |

**Stufe-1-Optimierer:** Vor jedem Browserstart prueft die Engine, ob die
Schritte des Plans (oder ein Praefix davon) als reine HTTP-Aufrufe loesbar
sind (`httpRequest`-Aktionen, Formular-POSTs, Downloads mit direkter URL,
Daten-Endpunkte). Nur wenn nicht, startet Chromium.

Verbindliche Kostenregeln:

1. Kein Modell-Aufruf pro Klick; genau ein Plan pro Aufgabe (plus budgetierte
   Replan-Runden, siehe Retry).
2. Lokale Retry-Logik in der Engine (ohne Modell): Selector-Alternativen aus
   dem Plan, waitFor-Verlaengerung, ein Reload. Erst nach N Fehlversuchen
   (Plan-Feld `budget.maxLocalRetries`) geht ein komprimierter Screenshot +
   DOM-Snapshot zurueck an den Planer — maximal
   `budget.maxPlannerRoundtrips`-mal, danach fail-closed Abbruch.
3. Browser-Sessions und Cookies werden pro Task Capsule als e2-Objekt
   wiederverwendet (`session-store.mjs`), nie persistent auf dem Worker.
4. Cookie-Banner schliesst eine Heuristik-Liste (Selektoren/Texte), kein Modell.
5. Erfolgreiche Standardablaeufe werden als **Makros** auf IDrive e2
   gespeichert (Phase 2). Wiederkehrende Aufgaben laufen dann ganz ohne
   Planer-Modell: Makro laden -> validieren -> ausfuehren.
6. Vision ist standardmaessig deaktiviert (`policy.visionAllowed` Default
   `false`). Weights liegen als Vault auf IDrive e2
   (`MODEL_VAULT_POLICY.md`-Muster), werden nur bei Bedarf geladen; Inferenz
   nur auf Salad hinter Budget-Gate, Container danach sofort beendet.
7. Browser-Binaries sind im Worker-Image gecacht (wie
   `workers/remote-browser/Dockerfile`); Worker beendet sich nach jeder
   Aufgabe sofort (Scale-to-zero, bestehender Watchdog).
8. Alle Artefakte werden vor dem Upload komprimiert (gzip/tar, JPEG statt
   PNG wo verlustbehaftet zulaessig).

Free-only-Konformitaet (`FREE_ONLY_MASTER_POLICY.md`): kein neuer Dienst,
keine Trials, kein Auto-Billing. Compute ausschliesslich Salad pay-per-use
hinter dem bestehenden Budget-Gate; Speicher ausschliesslich IDrive e2;
GitHub bleibt Free-only und traegt keine Artefakte.

## 5. Funktionsumfang (= Aktionen im Schema)

Jede Funktion ist eine Aktion im JSON-Schema mit klar definierten Parametern
und deterministischem Verhalten (vollstaendige Definition im Schema):

- Browser/Navigation: `openBrowser`, `closeBrowser`, `navigate`, `openLink`
- Maus: `click`, `doubleClick`, `rightClick`, `hover`, `scroll`, `dragAndDrop`
- Tastatur: `type`, `hotkey`
- Tabs: `newTab`, `switchTab`, `closeTab` (mehrere Tabs verwaltbar ueber `tabId`)
- Formulare/Dateien: `fillForm`, `uploadFile`, `download`, `watchDownloads`
- Beweise/Export: `screenshot`, `savePdf`
- Daten: `extract`, `extractTable`
- Sitzung: `cookies` (get/set/clear), `saveSession`, `restoreSession`
- Kontrolle: `waitFor`, `assert`, `httpRequest` (Stufe 1), `runMacro` (Phase 2)

Selektoren sind deterministisch und priorisiert modellfrei aufloesbar:
`role` (Accessibility-Tree), `testId`, `label`, `text`, `css`, `xpath` —
optional mit `frame` und `nth`. Koordinaten-Klicks sind ausschliesslich der
Stufe 3 (Vision) vorbehalten und nur bei `policy.visionAllowed: true` gueltig.

## 6. Sicherheitskonzept (Pflicht, fail-closed)

1. **Webseiten sind immer untrusted Input.** Seiteninhalt (DOM, Texte,
   Attribute) geht nie als Instruktion an ein Modell. Bei Planer-Rueckfragen
   werden Screenshot/DOM-Snapshot als Daten mit fester Rahmung uebergeben;
   das Prompt-Template weist den Planer an, Seiteninhalte niemals als
   Anweisung zu interpretieren (Prompt-Injection-Schutz). Plaene stammen
   ausschliesslich aus der Task Capsule.
2. **Domain-Allowlist pro Task** (`policy.domainAllowlist`, Pflichtfeld):
   Jede Navigation, jeder Redirect, jeder Frame und jeder `httpRequest` wird
   gegen die Allowlist geprueft; ausserhalb -> sofortiger Abbruch mit
   Artefakt-Nachweis. Zusaetzlich bleibt die bestehende SSRF-Blocklist
   (private Netze, localhost) aus `workers/remote-browser` aktiv.
3. **Keine Passwoerter/Credentials im Modellkontext oder Plan.** Das Schema
   verbietet Klartext-Credentials strukturell: `type`/`fillForm` referenzieren
   sensible Werte nur als `secretRef` (Capsule-Vault-Referenz gemaess
   BYOK-/Secret-Policy); die Engine loest sie erst zur Laufzeit auf und
   maskiert sie in allen Logs/Artefakten. Ohne Vault-Eintrag: fail-closed.
4. **Budget-Limit pro Aufgabe, Timeout pro Aktion** (`budget.*`,
   `timeoutMs`): harte Obergrenzen fuer Aktionen, Laufzeit, lokale Retries,
   Planner-Roundtrips und Vision-Aufrufe. Salad nur hinter dem bestehenden
   Budget-Gate und Laufzeit-Watchdog.
5. **Downloads/Uploads nur gemaess Capsule-Definition:** erlaubte Dateitypen,
   Maximalgroessen und Zielpfade stehen im Plan (`policy.files`); alles
   andere wird blockiert. Upload-Quelldateien kommen nur aus der Capsule.
6. **Vollstaendige Nachweise auf IDrive e2:** Screenshot(s), Playwright-Trace,
   Konsolen-Log, HAR, Aktionsprotokoll-JSON (jeder Schritt mit Ergebnis,
   Zeit, Retry-Zaehler) — komprimiert in `result/` der Task Capsule. Damit
   ist "Browserpruefung + Screenshot" der Verification Pipeline erfuellt und
   jeder Lauf reproduzierbar (Plan + Session-Snapshot + Artefakte).

## 7. Phasenplan

**Phase 0 (dieses Dokument):** Architektur + Schema. Kein Code. Schriftliche
Freigabe abwarten.

**Phase 1 — Kern-Engine (nach Freigabe):** Modul `workers/maus-engine/` wie in
2.3; Aktions-Interpreter fuer den vollen Funktionsumfang; Stufe-1-Optimierer;
Artefakt-Uploader (bestehende S3-Anbindung, komprimiert); stateless,
idempotent, Task-Capsule-gesteuert. Neue Tests + `check:*`-Eintrag
(Vorschlag: `check:maus-engine`), Aufnahme in `check:all` nur nach Freigabe.

**Phase 2 — Planer-Anbindung (modellunabhaengig):** ein Prompt-Template fuer
alle Router-Modelle (GLM-5.2 zuerst, dann Kimi K2.7, Cline; vorbereitet fuer
Claude, GPT/Codex, Gemini, Grok via BYOK); Schema-Validierung jedes Plans
fail-closed; Retry lokal zuerst, dann budgetierte Planner-Roundtrips;
Makro-Recorder (erfolgreiche Plaene als Makros auf e2, Wiederverwendung ohne
Modell).

**Phase 3 — Vision-Fallback (optional, separat freizugeben):** ShowUI/UI-TARS
als Vault auf IDrive e2 (Manifest, Checksums; Lizenzpruefung — nur
MIT/Apache, gemaess `MODEL_LICENSE_AND_NOTICE_POLICY.md`); on-demand-Inferenz
auf Salad hinter Budget-Gate; Container nach Nutzung sofort beendet.

Vor jeder Phase: Rollback-Punkt (`backups/rollback-...-maus-engine-.../`).

## 8. Testplan / Verifikation (nach jeder Phase)

Pflichtlaeufe: `npm run check:all`, `npm run check:guidelines`,
`npm run check:architecture` (Schema laeuft zusaetzlich automatisch in
`check:json` mit).

End-to-End-Tests (Phase 1/2, Artefakte auf e2 nachweisbar):

- (a) Formular ausfuellen (fillForm + type + click + assert)
- (b) Navigation + Tabellen-Extraktion (navigate + extractTable)
- (c) Datei-Download mit Ueberwachung (download + watchDownloads)
- (d) Fehlerfall: Navigation ausserhalb der Allowlist -> sofortiger Abbruch,
  Abbruch-Artefakt vorhanden
- (e) **Modellunabhaengigkeits-Beweis:** derselbe Aktionsplan von zwei
  verschiedenen Planer-Modellen erzeugt -> normalisiert byte-identischer
  Plan-Hash -> identisches Engine-Verhalten und identisches
  Aktionsprotokoll (bis auf Zeitstempel)
- Zusaetzlich Unit-Tests: Schema-Validator (gueltig/ungueltig/fail-closed),
  Allowlist-Pruefung inkl. Redirects, secretRef-Maskierung, Retry-Grenzen,
  Stufe-1-Erkennung.

Start-Design-Lock und Favicon-Lock werden nicht beruehrt (kein Frontend-Anteil
in Phase 0–2).

## 9. Nicht-Ziele

Kein eigenes Modelltraining. Kein dauerhaft laufender Server. Keine
kostenpflichtigen Dienste, keine Trials, keine Auto-Billing-Fallbacks. Keine
Bedienung nativer Desktop-Apps (nur Browser/Web-UIs in dieser Ausbaustufe).
Keine modellspezifische Logik in der Engine.

## 10. Erfolgskriterium

Eine Task Capsule mit Browser-Aufgabe rein -> deterministisch ausgefuehrter,
verifizierter Lauf mit vollstaendigen Artefakten auf IDrive e2 raus — ohne
manuelles Eingreifen, ohne laufende Fixkosten. Jedes heutige oder zukuenftige
Modell kann als Planer angeschlossen werden, ohne eine Zeile der Engine zu
aendern.

## 11. Offene Punkte fuer die Freigabe

1. Modulpfad `workers/maus-engine/` bestaetigen (Alternative: Ausbau von
   `workers/remote-browser/` in-place; empfohlen ist das neue Modul mit
   Wiederverwendung der geprueften Bausteine).
2. Schema-Datei `schemas/maus-action-plan.schema.json` (v1) bestaetigen.
3. Budget-Defaults bestaetigen (Vorschlag im Schema: max. 60 Aktionen,
   2 lokale Retries pro Aktion, 2 Planner-Roundtrips, 5 Min. Gesamtlaufzeit,
   30 s pro Aktion, Vision aus).
4. Phase 1 zur Umsetzung freigeben (Phase 3 bleibt ausdruecklich separat).
