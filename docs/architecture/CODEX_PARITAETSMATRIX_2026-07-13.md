# Codex-Paritätsmatrix — Stand 2026-07-13

Basis: verifizierte Capsules (`codex-parity-phase2-2026-07-10`,
`codex-parity-final-e2e-2026-07-10`, `autonomous-browser-agent-2026-07-13`)
und Live-Befunde. Kein Feature wird als vorhanden gelistet, das nicht real
belegt ist. Bestehende API-Grundlagen werden weiterverwendet; keine zweite
Parallelarchitektur.

## Priorität 1 (Kern-Loop)

| Funktion | Status | Beleg |
|---|---|---|
| Geschützte Job-Erstellung (Auth-Pflicht) | LIVE | anonyme Mutation → 401; E2E-Jobs über angemeldete UI-Session (2026-07-10) |
| Job-Status / Queue | LIVE | `/api/jobs`, `/api/jobs/queue`, Hydration aus IDrive e2 nach Neustart |
| SSE-Events | LIVE | Job-Events-Stream, HTTP 200/SSE/[DONE] belegt |
| Cancel/Stop | LIVE | durabler Abbruch inkl. Worker-Inaktivitätsbeweis (job_web_dd8e2440…) |
| Diff-Anzeige + SHA-gebundene Approval | LIVE | Haupt-/Follow-up-Diff exakt SHA-gebunden freigegeben |
| Follow-up-Aufträge | LIVE | job_web_f5176538… 6/6 |
| Replay | LIVE (SHA-gebunden) | job_web_fd8c8797… 5/5; byte-deterministischer Replay OFFEN |
| Fehler-/Rollback-Anzeige | LIVE (Basis) | Status-/Fehlerpfade + Rollback-Doku; UI-Verfeinerung offen |

## Priorität 2

| Funktion | Status | Beleg/Lücke |
|---|---|---|
| Thread-/Projektübersicht | TEILWEISE | Projekte/Verlauf lokal-first; serverseitige Thread-Historie offen |
| Mehrere parallele Agent-Aufträge | BEGRENZT | Queue live mit `maxConcurrency:1`; durable Parallel-Leases offen |
| Worktree-/Workspace-Isolation | TEILWEISE | stateless Git-Workspace je Job; harte ephemere Mandanten-Isolation offen (Shared-Worker-Grenze dokumentiert) |
| Integrierte Testresultate | LIVE | Build/Typecheck/Lint/Unit/Integration/Security im Worker-Loop; `pytest` im Remote-Worker fehlt |
| Browser-Screenshots | LIVE | Desktop/Mobil-Evidenz, sichtbarer integrierter Browser (2026-07-13) |
| Security-/Accessibility-Ergebnisse | TEILWEISE | Security-Checks im Loop; Accessibility-Automation nur lokal |

## Priorität 3

| Funktion | Status |
|---|---|
| Skills/Plugins-Verwaltung | OFFEN |
| Automations + Review-Queue, wiederkehrende Aufgaben | OFFEN |
| GitHub-Read-only-Repo-Kontext | TEILWEISE (Owner-Allowlist, `contents:read`-Token-Konzept verifiziert; UI offen) |
| PR-Review ohne Auto-Push | TEILWEISE (Draft-PR nur nach exakter menschlicher Freigabe; Publisher aktuell hart gesperrt) |
| Modellwechsel | LIVE (GLM-5.2 ⇄ Kimi K2.7 mit ehrlichem Fallback) |
| Langlebige Aufgaben / mobile Statusprüfung | TEILWEISE (IDrive-Persistenz + Hydration; mobile Status-UI rudimentär) |
| Memory + Hook-Validierung | LIVE (Memory nur nach vollständigem Gate; `memoryMayLearn` erst nach `passed`) |

## Sicherheitsgrenzen (unverändert verbindlich)

Keine Fremd-Repos ohne Allowlist; keine Pushes/Merges/PR-Publish ohne
gesonderte Bestätigung; keine dauerhaften Provider-Tokens; keine gemeinsame
unisolierte Sandbox für beliebige Mandanten; keine Kostenüberschreitung;
keine Trainingsaktivierung; kein Lernen aus fehlgeschlagenen Aufgaben.

## Nächste sinnvolle Schritte (nach Auth-Release)

1. `pytest` + `rg` im Remote-Worker-Image nachziehen (P2-Testlücke).
2. Durable Parallel-Leases → `maxConcurrency` > 1.
3. Thread-/Projektübersicht serverseitig (IDrive-Objekte, kein DB-Zwang).
4. Automations mit Review-Queue hinter bestehendem Approval-Gate.
