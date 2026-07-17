# smejj.com Agentenplattform — Phase 1 Umsetzungsstand (2026-07-15)

Status: Code umgesetzt und lokal verifiziert. **Nicht deployt.** Feature-Flag aus.
Freigabe: schriftlich erteilt am 2026-07-15 fuer Phase 1 (Entkopplung).
Grundlage: `SMEJJ_AGENT_PLATFORM_MASTERPLAN_2026-07-15.md`, `..._MIGRATION_...`, `..._SECURITY_TESTS_...`.

---

## 1. Rollback-Punkt

`backups/agent-platform-phase1-before-2026-07-15/` mit `SHA256SUMS.txt`:

```text
8bc6028a…21bbb1  chatClient.js
e6e48e83…8070c   clineClient.js
2bbb7339…1fa3bc  providerRegistry.js
991f9fa9…5b09d4  providerRoutes.js
1aabce0c…f4443b  roleRegistry.js
30f35074…9b23e7b  server.js
```

## 2. Neu erstellte Dateien (additiv, keine bestehende Logik ersetzt)

```text
src/agent/errors.js                       175 Z.  Fehlertaxonomie (20 Klassen) + Mapping
src/agent/events/eventTypes.js            141 Z.  Event-Taxonomie + Feld-Allowlisten
src/agent/events/eventTranslator.js       101 Z.  Provider-SSE -> smejj.com-Events (Streaming)
src/agent/events/index.js                   3 Z.  Sammelexport
src/agent/providers/providerContract.js   110 Z.  CodingAgentProvider-Vertrag + Registry
src/agent/providers/clineProvider.js      163 Z.  ClineProvider (Kapselung)
src/agent/api/sessionStore.js              88 Z.  Sitzungszustand (TTL, Limit, kein Secret)
control-server/src/routes/agentRoutes.js  163 Z.  /api/agent/* Fassade (fail-closed)
public/agent/agentEvents.js               116 Z.  Frontend-Client (provider-neutral)
tests/agent-errors.test.mjs                73 Z.
tests/agent-events.test.mjs               103 Z.
tests/agent-provider-contract.test.mjs    207 Z.
tests/agent-frontend-events.test.mjs      115 Z.
tests/agent-routes.test.mjs                87 Z.
```

Alle Dateien < 800 Zeilen (`check:guidelines` 653 Dateien OK).

## 3. Geaenderte Bestandsdatei (genau eine)

`src/server.js`: additiver Import + Mount-Block fuer `/api/agent/` (nur Unterpfade).
Der bestehende Endpoint `/api/agent` (Modell-Router) und `/api/providers/*`
(Cline) bleiben unveraendert und vorrangig.

## 4. Sicherheitsentscheidungen der Umsetzung

- **Fail-closed Flag**: `SMEJJ_AGENT_API_ENABLED` (nur `YES` aktiviert). Ohne Flag
  liefert `handleAgentRoute` `false` — die Route existiert nicht, der bestehende
  Pfad bleibt allein zustaendig. Non-Regression per Konstruktion.
- **Routenkollision verhindert**: Guard prueft `"/api/agent/"` (mit Schraegstrich).
  `/api/agent` gehoert weiterhin dem Modell-Router. Test deckt das ab.
- **Deny-by-Default im Event-Stream**: `sanitizeEventData()` laesst pro Event nur
  ausdruecklich erlaubte Felder durch. Belegt: weder API-Key noch `choices`
  erreichen den Stream.
- **Keine Secrets im Sitzungszustand**: Credentials werden pro Anfrage frisch aus
  dem Vault geladen, nie in der Session gehalten.
- **Sitzungs-ACL**: `requireOwned()` verhindert Fremdzugriff auf Sitzungen.
- **Control Server bleibt minimal**: Sitzungen nur fluechtig, TTL 30 min,
  Obergrenze 500 (wirft dann `RATE_LIMITED`).
- **Gefundener Latenzbug**: `authenticatedUserId()` hat nur einen
  `undefined`-Default und wirft bei `null`. In `agentRoutes.js` defensiv mit
  `|| {}` abgefangen. `jobAccess.js` wurde bewusst **nicht** geaendert (fremder
  Scope, weitere Aufrufer) — als Follow-up notiert.

## 5. Verifikation (lokal, Sandbox)

| Pruefung | Ergebnis |
|---|---|
| Neue Agent-Tests | **58/58 gruen** |
| `check:guidelines` | OK — 653 Dateien, max 800 Zeilen, Naming smejj.com |
| `check:cline` (Non-Regression) | **13/13 gruen** |
| `check:start-lock` | **28/28 byte-identisch** |
| `check:favicon-lock` | OK — 6 Dateien, 18 HTML-Seiten, Manifest |
| control-server-Suite | 35/35 gruen |
| model-router + free-only-policy + security-abuse | 24/24 gruen |
| gatekeeper + cost-guardrails + presign | 13/13 gruen |
| `check-no-paid-services` / `-private-paths` / `-cost-guardrails` | OK |
| `npm run check` (node --check Kernquellen) | Exit 0 |
| Frontend-Suite | 37/38 — 1 Fehler **umgebungsbedingt** |

Der eine Fehler (`branding-presentation.test.mjs`: "all derivatives are
byte-reproducible") ist `Cannot find module '@resvg/resvg-js-linux-arm64-gnu'`:
Die `node_modules` stammen vom Mac (darwin/arm64), die Sandbox ist Linux/arm64.
Bekanntes, bereits dokumentiertes Umgebungslimit (vgl. `PUSH_CHECKLISTE_ICONS`),
nicht durch diese Aenderung verursacht. `check:all`/`release:preflight`
vollstaendig sind auf dem Mac zu fahren (pnpm in der Sandbox nicht installierbar).

## 6. Bewusst NICHT umgesetzt (Locks respektiert)

**Frontend-Verdrahtung ausgesetzt.** `public/ai/chatClient.js` steht unter
**Start-Lock**. Die Integration von `runAgentChat()` wurde implementiert, dann
per Rollback-Punkt zurueckgenommen, weil `AGENTS.md` fuer Start-Lock-Dateien eine
**eigene ausdrueckliche schriftliche Bestaetigung** verlangt und ein
Neu-Einfrieren des Locks ausdruecklich untersagt. Die Freigabe fuer Phase 1
deckt den Start-Lock nicht ab.

Folge: `public/agent/agentEvents.js` existiert, ist vollstaendig getestet und
provider-neutral, aber noch nicht aufgerufen. Der Cline-Chat laeuft unveraendert
ueber den bestehenden Pfad.

Fuer die Verdrahtung noetig (2 Zeilen in `chatClient.js`):
1. Schriftliche Start-Lock-Freigabe des Nutzers.
2. `node scripts/check-start-lock.mjs --freeze --confirm "<Wortlaut>"` nach gruenen Checks.

## 7. Offen bis Live-Betrieb

1. **Start-Lock-Freigabe** fuer die Frontend-Verdrahtung (siehe 6).
2. **`check:all` + `release:preflight` auf dem Mac** (Sandbox kann pnpm/resvg nicht).
3. **Staging-Deploy** gemaess `DEPLOYMENT_PLAN.md`: Artefakt bauen, IDrive e2,
   Salad-Staging, `/api/health`, Flag `SMEJJ_AGENT_API_ENABLED=YES` nur dort.
4. **Staging-Livetest**: Cline-Chat ueber `/api/agent/*` mit sauberem Stream;
   Gegenprobe mit Flag=NO (alter Pfad unveraendert).
5. **Schriftliche Prod-Freigabe**, dann Prod-Cutover, dann Live-Test.
6. **Memory_Bank.md** erst nach bestandenem Live-Test ergaenzen (Policy: nur
   verifizierte Ergebnisse). Bis dahin kein Eintrag.

## 8. Rollback

- Code: Dateien aus `backups/agent-platform-phase1-before-2026-07-15/`
  zurueckspielen; die neuen `src/agent/**`, `public/agent/**`,
  `control-server/src/routes/agentRoutes.js` und `tests/agent-*` entfernen.
- Betrieb: `SMEJJ_AGENT_API_ENABLED` entfernen bzw. auf `NO` — exakt altes
  Verhalten, ohne Deploy.

## 9. Follow-ups

- `authenticatedUserId()` in `control-server/src/jobs/jobAccess.js` gegen `null`
  haerten (eigene Freigabe; betrifft weitere Aufrufer, u. a. `providerRoutes.js`).
- Bekannte Blocker unveraendert offen: Maus-Engine `EXIT_AFTER_RUN`, Repo-Sync
  `fe945cb`, Cline-Key-Rotation.
