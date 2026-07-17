# smejj.com Agentenplattform — Migrationsplan, Phasen, Risiken, Rollback (2026-07-15)

Status: Plandokument. Keine Code- oder Konfigurationsänderung. Umsetzung jeder
Phase erst nach schriftlicher Freigabe (Change-Lock, `AGENTS.md`).
Grundlage: `SMEJJ_AGENT_PLATFORM_MASTERPLAN_2026-07-15.md`.

---

## 1. Migrationsprinzipien

1. Cline wird nicht entfernt; bestehende Funktionen dürfen nicht brechen
   (Non-Regression-Pflicht).
2. Jede Phase ist einzeln freigebbar, einzeln testbar, einzeln rollbackfähig.
3. Additiv vor invasiv: neue Module und Schemas zuerst, Umbau bestehender
   Dateien zuletzt und minimal.
4. Alte und neue Pfade laufen parallel, bis der neue Pfad verifiziert ist
   (Dual-Run), erst danach kontrollierter Abbau.
5. Vor jeder Änderung: Rollback-Punkt (Quell-Backup + SHA-256 nach dem Muster
   der bestehenden Deployment-Dokus). Nach jeder Änderung: `npm run check:all`
   plus `npm run check:guidelines`; bei Frontend zusätzlich `check:frontend`,
   `check:start-lock`, `check:favicon-lock`.
6. Free-Only-Policy: keine neuen Dienste; alles läuft auf Control Server,
   IDrive e2 und Salad (pay-per-use hinter Budget-Gate).

---

## 2. Migrationsreihenfolge (angepasst an den Ist-Stand)

Der ursprüngliche 12-Schritte-Plan des Auftrags wird beibehalten, aber um die
Erkenntnis korrigiert, dass Orchestrator, Worker, Verifikation, Rollback und
Router bereits existieren. Damit verschiebt sich der Aufwand fast vollständig
in die Entkopplung (Schritte 3–8).

| # | Schritt | Ist-Stand | Aufwand |
|---|---|---|---|
| 1 | Cline-Integration analysieren | erledigt (2026-07-15, dieses Paket) | — |
| 2 | Direkte Abhängigkeiten dokumentieren | erledigt (Masterplan §3) | — |
| 3 | Neutrale Datentypen/Event-Schemas definieren | offen | Schemas + errors.js |
| 4 | Cline-Aufrufe hinter `ClineProvider` verschieben | offen | Adapter um `clineClient.js` |
| 5 | Zentrale smejj Agent API einführen | teilweise (Job-API vorhanden) | Fassade `agentApi.js` |
| 6 | Orchestrator zwischen Frontend und Provider | vorhanden (`autonomousRunner`) | nur Anbindung |
| 7 | Frontend auf smejj-Events umstellen | teilweise (autonomous-coding neutral) | `runClineChat` umbauen |
| 8 | Tool-Aufrufe über smejj Runtime | vorhanden, aber 2 Vokabulare | `toolBus.js`-Mapping |
| 9 | Bestehende Funktionen vollständig testen | Suiten vorhanden | neue `tests/agent/*` |
| 10 | Alte direkte Cline-Abhängigkeiten entfernen | offen | nach Dual-Run |
| 11 | Zweiten Test-Provider implementieren | Router-Backends vorhanden | `GLMProvider` (dünn) |
| 12 | `SmejjProvider` als Fundament smejj 1.0 | Bausteine vorhanden | Komposition |

---

## 3. Umsetzungsphasen mit Abnahmekriterien

### Phase 1 — Entkopplung (Freigabe A)

Inhalt: `src/agent/` anlegen (agentApi, providerContract, clineProvider,
eventTranslator, errors, riskPolicy als Definitionen), Schemas
`agent-task-input`, `agent-event`, `agent-plan`; Cline-Chat serverseitig durch
den Translator führen (Route bleibt kompatibel); Frontend `runClineChat` auf
smejj-Events umstellen.

Abnahme: Cline-Chat funktioniert unverändert (Modelle, Wechsel, Streaming);
keine `choices[0].delta`-Zugriffe mehr im Frontend; `check:all` grün;
Start-/Favicon-Lock byte-identisch; Dual-Run: alter SSE-Pfad bleibt hinter
Feature-Flag `SMEJJ_AGENT_API_ENABLED` (default NO, fail-closed) verfügbar.

### Phase 2 — Eigene Runtime sichtbar machen (Freigabe B)

Inhalt: `toolBus.js` mappt neutralen Namensraum auf Worker-Tools und
Maus-Actions; Risikoklassen + Autonomiestufen aktiv im Tool-Bus; Limits
(maxRuntimeSeconds, maxSteps, maxRetries, maxCost, maxTokens) an bestehende
Budget-Gates gebunden; Audit-Log-Events (`tool.*`) im Stream.

Abnahme: identischer Coding-Job liefert identisches Diff-Ergebnis über den
Tool-Bus (Replay-Vergleich); verbotene Aktion erzeugt TOOL_PERMISSION_DENIED
plus `approval.required`; Observe-Modus kann nachweislich nichts schreiben.

### Phase 3 — Orchestrator-Anbindung aller Provider (Freigabe C)

Inhalt: Cline-Aufgaben (nicht nur Chat) laufen als Jobs durch
`autonomousRunner` inklusive Verifikationsgates; `pauseTask`/`resumeTask` im
Scheduler; Plan als `AgentPlan` in der Task Capsule.

Abnahme: Cline-Coding-Aufgabe erzeugt Task Capsule, Plan, verifizierten Diff
und Approval-Flow wie GLM-Jobs; Abschluss nur durch Verifikationssystem.

### Phase 4 — Multi-Modell-Registry (Freigabe D)

Inhalt: Provider-Registry (Lebenszyklus) über `modelRouter`-Backends;
`GLMProvider`, `KimiProvider` als dünne Adapter; Fallback und
Kostensteuerung pro Session; keine Modellnamen im Frontend.

Abnahme: Providerwechsel ohne Frontend-Änderung; Provider-Ausfall →
PROVIDER_UNAVAILABLE + Fallback-Event; Kosten-Limit → COST_LIMIT_REACHED.

### Phase 5 — SmejjProvider (Freigabe E)

Inhalt: native Komposition aus Context Planner, AgentPlan, Orchestrator,
Tool-Bus, Verifikation, Self-Fix; GLM-5.2 als Arbeitsmodell, smejj-1-0 nach
Benchmark-Promotion; Cline nur noch optional.

Abnahme: Referenzaufgaben (Bugfix, Feature, UI-Änderung mit Browserprüfung)
enden autonom mit verifiziertem, reproduzierbarem Ergebnis; Codex-Paritäts-
Matrix aktualisiert.

### Phase 6 — Evaluations- und Lernplattform (Freigabe F)

Inhalt: standardisierte Coding-Benchmarks (`run_foundation_benchmark.mjs`
erweitern), Modellvergleich, Feedback-System, Trainingsdaten-Capture nur nach
ausdrücklicher Freigabe gemäß `SMEJJ_1_0_TRAINING_DATA_POLICY.md`.

Abnahme: Benchmark-Berichte auf IDrive e2, Promotion-Pfad signiert, kein
Capture ohne Consent-Ledger-Eintrag.

---

## 4. Anleitung: neuen Provider hinzufügen (ab Phase 4)

1. Adapter `src/agent/providers/<name>Provider.js` erstellen; ausschließlich
   den `CodingAgentProvider`-Vertrag implementieren.
2. Fehler in `src/agent/errors.js`-Taxonomie mappen; Events ausschließlich
   über `eventTranslator.js` erzeugen.
3. Credentials nur über den Credential-Vault (AES-256-GCM, serverseitig);
   BYOK, fail-closed ohne Key.
4. Registry-Eintrag (id, capabilities, Profile) + Schema-Validierung.
5. Tests: Vertragstests (`tests/agent/provider-contract.test.js`) müssen ohne
   Anpassung bestehen; danach Provider-spezifische Tests.
6. Keine Frontend-Änderung nötig — sonst ist der Adapter fehlerhaft.

## 5. Anleitung: neues Tool hinzufügen (ab Phase 2)

1. Schema des Tools definieren (Eingabe/Ausgabe, `schemas/`).
2. Risikoklasse festlegen (LOW…DESTRUCTIVE) und in `riskPolicy.js` eintragen.
3. Implementierung im Worker (Sandbox/Allowlist/Path-Policy beachten).
4. Mapping im `toolBus.js` + Events (`tool.requested`→`tool.completed`).
5. Tests inkl. Verweigerungsfall (Berechtigung fehlt, Limit erreicht).

---

## 6. Risiken

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| Regression im Cline-Chat bei Frontend-Umbau | Live-Funktion bricht | Dual-Run hinter Flag, Staging-Pflicht, Live-Test vor Prod |
| Event-Doppelung (job.* und task.*) verwirrt Frontend | UI-Fehler | Translator als einzige Quelle; job.* nur intern bis Phase 3 |
| Google-Drive-Arbeitskopie korrumpiert .git | Verlust der Historie | Push/Sync nur gemäß UMZUG_LOKALE_PLATTE / Repo-Sync-Command |
| Maus-Engine `EXIT_AFTER_RUN` (bekannt, V70) | Browser-Tools scheitern nach 1. Run | separater Fix mit eigener Freigabe, vor Phase 2 einplanen |
| Cline-Guthaben/`cline-pass/*` 403 | Tests scheitern scheinbar | Fehler als MODEL_NOT_AVAILABLE mappen, freies Modell für Tests |
| Backend-Repo auf Rollback-Commit `fe945cb` | Divergenz Quelle/Live | vor Phase 1 Repo-Sync abschließen (bekannter offener Punkt) |
| Scope-Explosion (Neubau statt Wiederverwendung) | Kosten/Zeit | Verbot von Parallel-Neubauten; nur Mapping-Schichten |
| Prompt Injection über Web/Dateien/Terminal | Sicherheitsvorfall | Maßnahmen in SECURITY_TESTS-Dokument, Phase 2 Pflicht |
| 800-Zeilen-Regel bei Translator/ToolBus | check:guidelines rot | Module nach Verantwortung splitten |
| SSE-Abbruch bei Salad-Reallocation | Sitzungsverlust | bestehendes Reconnect-Muster; Session-Status auf IDrive e2 |

---

## 7. Rollback-Plan

Grundregel (wie `ROLLBACK_AND_BACKUP_POLICY.md`): erst Feature-Flags
deaktivieren, nichts löschen, Beweise sichern.

- Dieses Dokumentenpaket: Rollback = Löschen der drei neuen Dateien
  `SMEJJ_AGENT_PLATFORM_{MASTERPLAN,MIGRATION,SECURITY_TESTS}_2026-07-15.md`.
  Keine bestehende Datei wurde verändert.
- Phase 1: `SMEJJ_AGENT_API_ENABLED=NO` → exakt altes Verhalten; zusätzlich
  Quell-Backup `backups/agent-platform-phase1-before/` + SHA-256; Frontend
  über Vorgänger-Commit im Repo `SmejjCom/smejj-app-frontend`.
- Phase 2: `SMEJJ_TOOL_BUS_ENABLED=NO` → Worker nutzen bisherige Tool-Namen.
- Phase 3: Scheduler-Flag zurück; Jobs laufen wie heute ohne pause/resume.
- Phase 4: Provider-Registry-Einträge deaktivieren (env), Router unverändert.
- Phase 5: `SmejjProvider` deaktivieren; Cline/GLM-Pfade unberührt.
- Phase 6: Capture-Flag AUS (ist Default); Benchmarks sind additiv.
- Produktion generell: Artefakt-Version auf IDrive e2 + Salad-Version
  zurückschalten (Muster: CLINE_GO_LIVE_ABSCHLUSS_2026-07-15.md), Endpoint
  `/api/health` als Nachweis, Live-Test dokumentieren.

---

## 8. Roadmap bis smejj 1.0 (Kurzform)

```text
2026-Q3  Phase 1–2: Entkopplung + Tool-Bus/Autonomiestufen (Staging → Prod)
2026-Q3  Bekannte Fixes: Maus EXIT_AFTER_RUN, Repo-Sync, Key-Rotation
2026-Q4  Phase 3–4: Orchestrator für alle Provider, Registry, GLM/Kimi-Adapter
2027-Q1  Phase 5: SmejjProvider produktiv (GLM-5.2 als Arbeitsmodell)
2027-Q1+ Phase 6: Benchmarks, Feedback, Trainingsdaten (nur nach Freigabe),
         smejj-1-0-Promotion sobald Benchmarks bestanden
```

Jede Zeile setzt schriftliche Freigabe, Staging-Test und Live-Test gemäß
`DEPLOYMENT_PLAN.md` voraus.
