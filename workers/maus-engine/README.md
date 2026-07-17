# smejj.com Maus-Engine (Worker)

Modellunabhaengiges Browser-Automatisierungssystem. Die KI plant nur (JSON-
Aktionsplan gemaess `schemas/maus-action-plan.schema.json`); dieser Worker
fuehrt deterministisch aus. Architektur: `docs/architecture/MAUS_ENGINE.md`.

## Vertrag

- `GET /health` -> `{ ok, engine, running }`
- `POST /run` mit `Authorization: Bearer <SMEJJ_MAUS_ENGINE_TOKEN>`:

```json
{ "plan": { "schemaVersion": 1, "planId": "...", "capsuleRef": "...", "...": "..." } }
```

Antwort: Laufzusammenfassung (Aktionsprotokoll, Extraktionen, Manifest der
e2-Artefakte). Ungueltiger Plan -> `422` (fail-closed), egal von welchem
Modell er stammt. Artefakt-Rohdaten kommen nie in der HTTP-Antwort — Beweise
liegen komprimiert auf IDrive e2 unter
`capsules/maus-engine/{capsuleRef}/result/{planId}/`.

## Stufen

1. **API/HTTP direkt** (`http-stage.mjs`): Plaene, die nur aus `httpRequest`
   (+ `downloadExists`-Asserts) bestehen, laufen ohne Browser.
2. **Playwright + Chromium** (`interpreter.mjs` + `actions/`): DOM-/
   Accessibility-Selektoren, deterministisch, lokale Retries ohne Modell.
3. **Vision**: gesperrt bis zur separaten Phase-3-Freigabe
   (`policy.visionAllowed` Default `false`).

## Phase 2 (Planer-Anbindung, modellunabhaengig)

- `prompt-template.mjs`: das EINE Template "Aufgabe -> Aktionsplan-JSON" fuer
  jedes Router-Modell (Aktionen direkt aus dem Schema abgeleitet, Version v1,
  Injection-Schutz eingebaut).
- `plan-normalizer.mjs`: JSON-Extraktion aus Modellantworten ohne
  Reparatur-Heuristik; alles Weitere entscheidet die Schema-Validierung.
- `planner-roundtrip.mjs`: lokal zuerst, dann maximal
  `budget.maxPlannerRoundtrips` budgetierte Rueckfragen mit maskiertem,
  als untrusted gerahmtem Fehlerkontext. `plannerClient` wird vom AI Router
  injiziert — die Engine kennt kein Modell.
- `macro-store.mjs` + `runMacro`: erfolgreiche Plaene werden via
  `POST /run { plan, saveAsMacro: "name" }` als Makro auf IDrive e2
  gespeichert und laufen danach ganz ohne Planer-Modell. Makro-Schritte
  werden bei JEDER Ausfuehrung gegen Allowlist/Budget/Schema des aktiven
  Tasks validiert; Verschachtelung verboten, Makro-Schritte zaehlen gegen
  `maxActions`, ein Makro wird nie als Ganzes wiederholt.

## Sicherheit (fail-closed)

- Domain-Allowlist pro Task (`allowlist.mjs`) inkl. SSRF-Blocklist; Verstoss
  -> sofortiger Abbruch mit Abbruch-Artefakt.
- Secrets nur als `secretRef` (`secret-vault.mjs`, `SMEJJ_MAUS_SECRET_*`);
  Werte werden in Logs/Artefakten maskiert.
- Budget/Timeout pro Plan und Aktion; Worker ist single-run und beendet sich
  nach der Aufgabe (`SMEJJ_MAUS_EXIT_AFTER_RUN=NO` nur fuer lokale Tests).
- Downloads/Uploads nur gemaess `policy.files`.

## Umgebung

- `SMEJJ_MAUS_ENGINE_TOKEN` (Pflicht fuer /run)
- `IDRIVE_E2_ENDPOINT|BUCKET|REGION|ACCESS_KEY|SECRET_KEY` (Pflicht fuer
  Artefakt-Upload; ohne sie bricht der Lauf fail-closed ab)
- `SMEJJ_MAUS_SECRET_<REF>` fuer secretRef-Aufloesung

## Salad-Hinweise

Wie `workers/remote-browser`: eigener Container hinter Gateway-Auth, nur vom
Control Server hinter dem bestehenden Budget-Gate gestartet, kein Zustand auf
dem Worker, Browser-Binaries im Image gecacht, Scale-to-zero nach jedem Lauf.

## Tests

`pnpm run check:maus-engine` — Plan-/Schema-Validierung, Allowlist, Retry,
Stufe 1, Interpreter mit Mock-Browser (ohne Playwright lauffaehig).
