# smejj.com Agentenplattform — Masterplan (2026-07-15)

Status: Analyse- und Architekturdokument. Keine Code- oder Konfigurationsänderung.
Verbindlich zusammen mit: `SMEJJ_AGENT_PLATFORM_MIGRATION_2026-07-15.md` und
`SMEJJ_AGENT_PLATFORM_SECURITY_TESTS_2026-07-15.md`.

Rahmen: `AGENTS.md` (Change-Lock, Design-Lock, Favicon-Lock),
`docs/architecture/FREE_ONLY_MASTER_POLICY.md`, `Project_Goals.md`,
`docs/deployment/DEPLOYMENT_PLAN.md`. Umsetzung erst nach schriftlicher Freigabe.

---

## 1. Vision smejj 1.0

smejj 1.0 ist kein einzelnes Sprachmodell, sondern ein vollständiges autonomes
Coding-System. Das Sprachmodell ist austauschbarer Bestandteil; Planung, Tools,
Sicherheit, Ausführung, Kontrolle und Verifikation sind eigene smejj.com-Komponenten:

```text
smejj 1.0
├── Agent Runtime            (Tool-Bus, Berechtigungen, Limits)
├── Task Planner             (hierarchische Pläne, Abhängigkeiten, Retry)
├── Coding Orchestrator      (Schrittsteuerung, Self-Fix, Abschlussentscheidung)
├── Modell-Router            (Multi-Model, BYOK, Fallback, Kosten)
├── Tool-System              (file.* / terminal.* / browser.* / test.* / git.* / deployment.*)
├── Browser-Steuerung        (Maus-Engine, Remote-Browser, Screenshot-Analyse)
├── Terminal-Steuerung       (Allowlist, Sandbox)
├── Datei-System             (Path-Policy, Workspace-Isolation)
├── Git-System               (Checkpoint, Diff, Commit, Rollback)
├── Test- und Verifikationssystem (Build/Typecheck/Lint/Tests/Browser/Diff)
├── Sicherheits- und Freigabesystem (Risikoklassen, Autonomiestufen, Approvals)
├── Kontext- und Memory-System (RAG, Context Planner, Memory Bank)
├── Kosten- und Ressourcensteuerung (Budget-Gates, Limits)
└── Evaluations- und Lernsystem (Benchmarks, Trainingsdaten, Promotion)
```

Zielbild-Datenfluss:

```text
smejj.com Benutzeroberfläche
        ↓ (nur neutrale smejj-Events)
smejj Agent API (CodingAgentProvider)
        ↓
smejj Orchestrator
        ↓
Planer und Task Engine
        ↓
Provider- und Modell-Router
        ↓
ClineProvider / GLMProvider / KimiProvider / OpenAIProvider / ClaudeProvider /
GeminiProvider / SmejjProvider (smejj 1.0)
        ↓
isolierte smejj Worker (Salad, stateless)
        ↓
Dateien / Terminal / Browser / Tests / Git / Deployment
```

---

## 2. Ist-Analyse (Stand 2026-07-15)

Zentrale Erkenntnis: Es existieren heute zwei getrennte Systeme.

1. Die eigene smejj-Plattform (Task Capsules → Jobs → Orchestrator → Worker →
   Verifikation) — der reife Kern und bereits weitgehend das geforderte Fundament.
2. Die Cline-Integration — ein dünner BYOK-Chat-Anbau, der am Orchestrator,
   Tool-System und Verifikationszyklus vollständig vorbeiläuft.

### 2.1 Vorhanden und implementiert

| Bereich | Implementierung | Kernstellen |
|---|---|---|
| Orchestrator + Self-Fix | Dispatch, Verifikation, max. 3 Korrekturversuche, Action-Log-Hashing | `control-server/src/orchestrator/autonomousRunner.js`, `jobScheduler.js` |
| Plan-/Step-Engine | Geordnete Schritte mit Gates (claim → prepare-rollback → apply-patch → build → typecheck → tests → browser → self-fix → verifier-report → memory-proposal) | `src/jobs/autonomousLoop.js`, `codingFlowPlan.js`, `freeCodingPlan.js` |
| Job-/Task-API | Statusmaschine open→queued→planning→running→verifying→passed/failed/blocked, SSE, Approval an exakte Diff-SHA gebunden | `src/jobs/jobApi.js`, `control-server/src/routes/jobRoutes.js` |
| Agent-Loop (Worker) | Modellagnostischer Runner, ein Tool pro Modellzug, Runtime-Validierung | `workers/smejj-worker/agentloop.mjs` |
| Tool-Ausführung | `read_file`, `write_file`, `run_cmd`, `browser_check`, `finish` mit `normalizeToolCall`-Validierung | `workers/smejj-worker/agentloop.mjs` |
| Rollen-Grants | planner/coding/review/test/browser/terminal/git/security mit allowedTools/forbiddenActions | `workers/smejj-worker/role-registry.mjs` |
| Browser-Steuerung | Maus-Engine (click, type, navigate, screenshot, extract; schema-validiert, Allowlist, Secret-Vault), Remote-Browser-Worker (Playwright, SSRF-Guards) | `workers/maus-engine/*`, `workers/remote-browser/worker.js`, `schemas/maus-action-plan.schema.json` |
| Verifikationspipeline | install → build → typecheck → lint → unit → integration → security → Diff-Hygiene → Secret-Scan; Browserprüfung Desktop+Mobile mit Screenshots und Konsolenfehler-Gating | `workers/smejj-worker/verification.mjs`, `browser-verification.mjs` |
| Git-Checkpoint/Rollback | Rollback-Manifeste in Task Capsules, erwartete Diff-SHA-Verifikation, Draft-PR mit Human-Approval, Rollback-Simulation | `workers/smejj-worker/repository.mjs`, `src/jobs/taskCapsuleWriter.js`, `scripts/testing/rollback_simulation.mjs` |
| Multi-Modell-Router | OpenAI-kompatibler Adapter über zhipu/GLM, moonshot/Kimi, gemini, openai, openrouter (Claude) u. a.; Profile coding/reasoning/fast/web; Fallback, Health-Tracking, fail-closed | `control-server/src/llm/modelRouter.js`, `modelRuntimeHealth.js`, `src/ai/taskRoutingPolicy.js` |
| Worker-System | Salad Ephemeral Workers, SHA-gepinnter Bootstrap, Attestation, Sandbox (mkdtemp, git init, Allowlist, Output-Caps) | `control-server/src/orchestrator/ephemeralWorker*.js`, `workers/smejj-worker/sandbox.mjs` |
| Sicherheit (Kern) | Command-Allowlist, Path-Policy (.env, Keys, .git geschützt), AES-256-GCM-Credential-Vault, Zugriffskontrolle, Gatekeeper fail-closed | `workers/smejj-worker/allowlist.mjs`, `path-policy.mjs`, `control-server/src/providers/providerCredentialVault.js`, `gatekeeper/policy.js` |
| Memory/Kontext | BM25-RAG, Context Planner (gezieltes Laden statt Voll-Repo), evidenz-gegatete Memory Bank (nur verifizierte Erfolge) | `control-server/src/rag/*`, `src/ai/promptContextBuilder.js`, `control-server/src/jobs/memoryEligibility.js` |
| Trainingsdaten smejj 1.0 | Capture default AUS, Consent-Ledger, Sanitization, Verschlüsselung, Splits, Benchmark-Promotion | `src/training/*`, `control-server/src/training/consentLedger.js`, `src/evaluation/modelPromotion.js` |
| Cline (live) | Prod Version 70: Key-Vault, 19 Modelle, Modellwechsel ohne Neustart, SSE-Streaming | `control-server/src/providers/{providerRegistry,clineClient}.js`, `routes/providerRoutes.js` |

### 2.2 Teilweise vorhanden

- Neutrale Agent API: Job-API und Provider-Registry existieren, aber kein
  `CodingAgentProvider`-Vertrag (startTask/pause/approve/streamEvents) und kein
  `ClineProvider`-Adapter im Sinne dieses Plans.
- Tool-Protokoll: Runtime-Validierung vorhanden, aber zwei getrennte Vokabulare
  (Worker-Tools vs. Maus-Actions), kein einheitlicher Namensraum `file.*` usw.
- Event-System: nur `job.status`/`job.saved`/`job.publication` plus eingebettete
  Action-Logs; keine Taxonomie `task.* / tool.* / approval.* / verification.*`.
- Frontend: Autonomous-Coding-Ansicht (`public/autonomous-coding.js`) ist bereits
  neutral; der Cline-Chat (`public/ai/chatClient.js` → `runClineChat()`) verarbeitet
  rohe OpenAI-SSE-Strukturen (`choices[0].delta.content`) direkt im DOM.

### 2.3 Fehlend

- Autonomiestufen `observe / assist / supervised / autonomous` als Betriebsmodi.
- Risikoklassifizierung `LOW_RISK / MEDIUM_RISK / HIGH_RISK / DESTRUCTIVE` als Enum.
- Einheitliche Fehlertaxonomie (heute String-Codes und `{ok:false,error}`-Objekte).
- Dedizierter Prompt-Injection-Schutz (heute nur indirekt über URL-/Path-Allowlists).
- Cline-Ausführung durch Orchestrator, Tool-Bus und Verifikationszyklus.
- Zentrales Architektur-Gesamtdokument (dieses Dokument schließt die Lücke).

---

## 3. Schwachstellen der aktuellen Cline-Integration

1. Frontend-Kopplung: `runClineChat()` konsumiert Cline-/OpenAI-SSE-Strukturen
   direkt. Ein Anbieterwechsel erzwingt Frontend-Änderungen — Verstoß gegen das
   Grundprinzip „Cline ist nur ein austauschbarer Provider".
2. Kein Provider-Adapter: `providerRegistry.js` ist eine Katalog-/Credential-
   Abstraktion, kein Lebenszyklus-Vertrag. Pause/Resume/Approve/Status existieren
   für Cline nicht.
3. Vorbei an der Verifikation: Cline-Antworten durchlaufen weder Tool-Bus noch
   Build/Test/Browser-Gates. Eine Cline-„Lösung" gilt als Text, nicht als
   verifiziertes Ergebnis — Widerspruch zu Project_Goals Ziel 1 und 2.
4. Kein einheitliches Eventformat: Cline streamt einen zweiten, inkompatiblen
   Eventkanal neben den `job.*`-Events.
5. Fehlerbehandlung provider-spezifisch: 403 ENTITLEMENT (`cline-pass/*`),
   Rate-Limits usw. erreichen das Frontend roh statt als smejj-Fehlerklassen.
6. Betriebsrisiken (aus eigenen Berichten): `cline-pass/*` 403 wegen Cline-Guthaben;
   Key-Rotation nach Secret-Vorfall empfohlen; Maus-Engine `EXIT_AFTER_RUN`
   beendet Worker nach erstem Run (Planner-Roundtrips → 503).

---

## 4. Zielarchitektur der smejj-Agentenplattform

### 4.1 Schichten

```text
Frontend (nur smejj-Events, keine Provider-Strukturen)
   ↓
smejj Agent API          — HTTP/SSE-Fassade, Session-Verwaltung
   ↓
smejj Orchestrator       — bestehender autonomousRunner, erweitert um Provider-Abstraktion
   ↓
Planer / Task Engine     — bestehende Plan-Builder, vereinheitlicht als AgentPlan
   ↓
Provider-Router          — Provider-Registry (Lebenszyklus) + modelRouter (Modelle)
   ↓
Provider-Adapter         — ClineProvider | GLMProvider | KimiProvider | ... | SmejjProvider
   ↓
smejj Runtime (Tool-Bus) — validiert jede Tool-Anfrage, Risiko + Autonomie + Limits
   ↓
Worker / Tools           — bestehende Salad-Worker, Maus-Engine, Verifikation
```

### 4.2 Agent API (Vertrag)

Neuer Modulpfad-Vorschlag: `src/agent/api/` (Typen als JSDoc/Schema, da Codebasis
ESM-JavaScript ist; Schemas nach `schemas/agent-*.schema.json`).

```ts
interface CodingAgentProvider {
  startTask(input: AgentTaskInput): Promise<AgentSession>;
  continueTask(sessionId: string, input: AgentContinuationInput): Promise<void>;
  pauseTask(sessionId: string): Promise<void>;
  resumeTask(sessionId: string): Promise<void>;
  cancelTask(sessionId: string): Promise<void>;
  approveAction(sessionId: string, actionId: string): Promise<void>;
  rejectAction(sessionId: string, actionId: string, reason?: string): Promise<void>;
  getStatus(sessionId: string): Promise<AgentStatus>;
  getResult(sessionId: string): Promise<AgentResult>;
  streamEvents(sessionId: string): AsyncIterable<AgentEvent>;
}
```

Abbildung auf Bestehendes: `startTask` → Task-Capsule + Job anlegen
(`jobApi.createJob`); `cancelTask` → vorhandenes durable Cancel; `approveAction` →
vorhandene Diff-SHA-gebundene Approval; `streamEvents` → SSE aus `jobStore`,
übersetzt in die Event-Taxonomie (4.5). `pauseTask`/`resumeTask` sind neu
(Scheduler-Lease anhalten, Capsule-Status `paused`).

### 4.3 Einheitliches Aufgabenmodell

`AgentTaskInput` gemäß Auftrag (taskId, userId, workspaceId, provider, model,
prompt, repository, environment, permissions, autonomy, limits, successCriteria)
wird als Erweiterung des bestehenden Task-Capsule-Formats definiert
(`src/jobs/taskCapsuleWriter.js`), nicht als Ersatz. Neue Felder: `permissions`,
`autonomy`, `limits.maxCost/maxTokens` (Budget-Gate existiert bereits),
`successCriteria` (heute implizit als `required`-Gates vorhanden).

### 4.4 Einheitliches Tool-Protokoll

Namensraum wie im Auftrag (`file.read` … `deployment.rollback`). Umsetzung als
Mapping-Schicht, nicht als Neubau:

| Neutraler Name | Bestehende Implementierung |
|---|---|
| file.read / file.create / file.update | `agentloop.mjs` read_file / write_file |
| file.search | RAG/Repo-Pack (`promptContextBuilder.js`) |
| file.delete | neu, DESTRUCTIVE, nur mit Approval |
| terminal.execute / terminal.stop | run_cmd + Sandbox/Allowlist |
| browser.* | Maus-Engine ACTION_REGISTRY (openBrowser, navigate, click, type, scroll, screenshot, extract, close) |
| test.run / test.inspect | verification.mjs Teilstufen |
| git.status / git.diff / git.checkpoint / git.commit / git.rollback | repository.mjs + Rollback-Manifeste |
| deployment.validate / execute / rollback | DEPLOYMENT_PLAN-Ablauf; execute immer approval-pflichtig |

Jede Tool-Anfrage läuft durch die smejj Runtime: Schema-Validierung →
Berechtigungsprüfung (permissions + Rolle) → Risikoklasse → Autonomiestufe →
Limits/Budget → Ausführung → Event. Kein Modell führt Tools direkt aus.

### 4.5 Einheitliches Event-System

Vollständige Taxonomie gemäß Auftrag (task.*, assistant.message,
reasoning.summary, tool.*, file.*, terminal.*, browser.*, test.*, git.*,
approval.*, verification.*, usage.*, limit.*). Quelle bleibt der vorhandene
SSE-Mechanismus (`control-server/src/streaming/sse.js`); ein Event-Translator je
Provider erzeugt ausschließlich diese Events. Bestehende `job.status`-Events
bleiben während der Migration parallel erhalten (Non-Regression), Schema:
`schemas/agent-event.schema.json` (neu).

### 4.6 Einheitliche Fehlerklassen

Zentrale Taxonomie gemäß Auftrag (AUTHENTICATION_ERROR … INTERNAL_ERROR) in
`src/agent/errors.js` (neu, <800 Zeilen). Bestehende String-Codes werden gemappt,
z. B. `worker_token_rejected` → AUTHENTICATION_ERROR, `model_tool_not_allowed` →
TOOL_PERMISSION_DENIED, `unsafe_path` → SECURITY_POLICY_VIOLATION, Cline 403
ENTITLEMENT → MODEL_NOT_AVAILABLE, Budget-Stop → COST_LIMIT_REACHED.

### 4.7 Risikoklassen und Autonomiestufen

```text
LOW_RISK      lesen, suchen, Status, Screenshot
MEDIUM_RISK   Datei schreiben (Workspace), Tests, Browser-Interaktion, git.checkpoint
HIGH_RISK     terminal.execute außerhalb Kern-Allowlist, git.commit, network
DESTRUCTIVE   file.delete, git.rollback (fremder Stand), deployment.execute
```

```text
Observe     nur LOW_RISK-Lese-Tools; keine Änderungen
Assist      Vorschläge/Patches vorbereiten; Ausführung durch Benutzer
Supervised  Änderungen ausführen; HIGH_RISK + DESTRUCTIVE approval-pflichtig
Autonomous  Abschluss innerhalb Limits; nur DESTRUCTIVE (und Produktion) approval-pflichtig
```

Produktions-Deployments bleiben in jeder Stufe freigabepflichtig
(DEPLOYMENT_PLAN, Change-Lock). Aktive Stufe wird im Frontend stets angezeigt
und in jeder Task Capsule protokolliert.

### 4.8 Multi-Modell-Routing

`modelRouter.js` bleibt die Basis. Ergänzung: rollenbasierte Zuordnung
(Planung → Reasoning-Profil, Code → coding-Profil GLM-5.2 zuerst, Dateisuche →
fast-Profil, Screenshot-Analyse → Vision-fähiges Modell, Review →
Prüfmodell gemäß `taskRoutingPolicy.js`). Modellnamen niemals im Frontend
hartkodiert; Auswahl über requestedModel/BYOK, fail-closed. smejj 1.0 übernimmt
Rollen erst nach signierter Benchmark-Promotion (`modelPromotion.js`).

### 4.9 Memory-, Kontext- und Trainingssystem

Bestehende Systeme werden übernommen: RAG/Context Planner (gezieltes Laden),
Memory-Eligibility (nur verifizierte Erfolge, Rechte-/Privacy-Gates),
Trainingspipeline (Capture default AUS, Fremdmodell-Ausgaben für Training
gesperrt, `SMEJJ_1_0_TRAINING_DATA_POLICY.md`). Neu ist nur die Verknüpfung:
jede Agent-Session referenziert Task Capsule (job-id), Plan, Tool-Historie,
Fehler-Historie und Verifikationsergebnisse als getrennte Kontextklassen
(kurzfristig / projektbezogen / dauerhaft freigegeben / sensibel-nicht-speichern).

---

## 5. Architektur SmejjProvider (smejj 1.0)

Der `SmejjProvider` ist die native Implementierung des `CodingAgentProvider`
auf Basis der bestehenden Komponenten — kein Neubau:

```text
SmejjProvider.startTask
   → Task Capsule (IDrive e2)
   → Context Planner (AI_Guidelines, Memory_Bank, Project_Goals, Capsules, Repo)
   → AgentPlan (objective, assumptions, steps, successCriteria, risks)
   → Orchestrator: Schritt ausführen → Tool-Bus → Worker
   → Verifikation nach jedem Gate (Build/Tests/Browser/Diff)
   → Fehler? → Self-Fix (max. Retries) oder Planupdate
   → Abschluss NUR durch Verifikationssystem, nie durch Modell-Textaussage
```

Planmodell (`schemas/agent-plan.schema.json`, neu):

```ts
type AgentPlanStep = {
  id: string; title: string; description: string;
  dependencies: string[]; requiredTools: string[];
  status: "pending"|"running"|"blocked"|"completed"|"failed"|"cancelled";
  retryPolicy?: { maxAttempts: number; backoffMs: number };
};
```

Modellseite: GLM-5.2 (coding), Kimi K2.7 (Fallback/Zweitmeinung), smejj-1-0
nach Promotion. Alle über den Router, BYOK, fail-closed.

---

## 6. Betroffene Dateien und Komponenten

Neu (Phase 1–3, jeweils <800 Zeilen, Single Responsibility):

```text
src/agent/api/agentApi.js            — CodingAgentProvider-Fassade (HTTP/SSE)
src/agent/api/sessionStore.js        — Session→Job/Capsule-Zuordnung (IDrive e2)
src/agent/providers/clineProvider.js — Adapter um clineClient (Kapselung)
src/agent/providers/providerContract.js — Vertrag + Registrierung
src/agent/events/eventTranslator.js  — provider→smejj-Event-Mapping
src/agent/errors.js                  — Fehlertaxonomie + Mapping
src/agent/toolBus.js                 — neutraler Tool-Namensraum → bestehende Tools
src/agent/riskPolicy.js              — Risikoklassen + Autonomiestufen
schemas/agent-task-input.schema.json
schemas/agent-event.schema.json
schemas/agent-plan.schema.json
tests/agent/*                        — siehe Teststrategie
```

Geändert (nur nach Freigabe, mit Rollback-Punkt):

```text
control-server/src/routes/providerRoutes.js  — Cline-Chat über Agent API führen
public/ai/chatClient.js                      — runClineChat auf smejj-Events umstellen
public/autonomous-coding.js                  — Event-Taxonomie konsumieren (additiv)
src/server.js / control-server Routing       — Agent-API-Routen mounten
src/jobs/taskCapsuleWriter.js                — permissions/autonomy/limits-Felder additiv
```

Unverändert (geschützt): Start-/Design-Lock-Dateien, Favicon-Dateien,
`gatekeeper/`, bestehende Verifikations-, Rollback- und Trainingsmodule.

---

## 7. Dokumentations-Landkarte (Punkt 20 des Auftrags)

| Thema | Ort |
|---|---|
| Vision, Ist, Ziel, Komponenten, Datenfluss, Agent API, Provider, Tools, Events, Plan, Orchestrator, smejj 1.0 | dieses Dokument |
| Migration, Phasen, Risiken, Rollback, Provider-/Tool-Anleitung, Roadmap | `SMEJJ_AGENT_PLATFORM_MIGRATION_2026-07-15.md` |
| Sicherheitsmodell, Autonomiestufen im Detail, Teststrategie | `SMEJJ_AGENT_PLATFORM_SECURITY_TESTS_2026-07-15.md` |
| Bestehende Detail-Dokus | `AUTONOMOUS_CODING_LOOP.md`, `MAUS_ENGINE.md`, `MULTI_MODEL_ARCHITECTURE.md`, `AI_ROUTER_IMPLEMENTATION.md`, `WORKER_SANDBOX_KONZEPT_2026-07-10.md`, `SMEJJ_1_0_TRAINING_DATA_POLICY.md`, `ROLLBACK_AND_BACKUP_POLICY.md`, `CLINE_API_INTEGRATION.md` |

---

## 8. Erwartetes Endergebnis

Kurzfristig: Cline funktioniert unverändert; Frontend nicht mehr direkt von
Cline abhängig; alle Aufgaben über die smejj Agent API. Mittelfristig: eigene
Runtime, Tools, Worker-, Browser-Steuerung und Orchestrator (großteils heute
schon vorhanden) hinter einer Provider-Abstraktion; Cline nur noch Option.
Langfristig: `SmejjProvider` = smejj 1.0, plant/ausführt/testet/kontrolliert
im Browser/korrigiert/schließt ab; modellunabhängig; Cline entfernbar oder
weiterhin Option — ohne Umbau von smejj.com.
