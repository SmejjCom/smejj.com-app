# smejj.com Maus-Engine — Interaktiver Loop-Modus (Observe-Decide-Act)

Status: schriftlich freigegeben am 2026-07-15 (Change-Lock-konforme Freigabe
im Auftragstext: "additiver Loop-Modus in der Maus-Engine plus die genannten
Tests und Dokumente"). Der bestehende Plan-Modus bleibt unveraendert und
Standard. Rollback-Punkt: `backups/rollback-2026-07-15-maus-interaktiv-loop/`.

## 1. Ziel

Die Maus bedient ihren Browser wie Codex: schauen -> entscheiden -> handeln ->
wieder schauen. Sie reagiert auf Unerwartetes (Cookie-Banner, Layout-Wechsel,
Login-Maske, Fehlermeldung, geaenderte Buttons), statt einen Blindplan
abzuspulen.

## 2. Zielkonflikt und Loesung (Kostenmodell)

`COST_GUARDRAILS`/`MAUS_ENGINE.md`: "Kein Modell-Aufruf pro Klick; nur ein
Plan pro Aufgabe." Codex-Verhalten bedeutet aber einen Modell-Aufruf pro
Schritt. Loesung: Der Loop-Modus ist NICHT der Standard, sondern ein bewusst
eingeschalteter, hart budgetierter Modus:

| Regel | Wert |
|---|---|
| Loop-Modus Standard? | NEIN. Nur bei `task.mode === "interaktiv"` ODER wenn der Plan-Modus gescheitert ist |
| Harte Obergrenze Modell-Aufrufe | `budget.maxLoopSteps` (Standard 8, Maximum 25), fail-closed |
| Reihenfolge | Stufe 0 Makro (0 Aufrufe) -> Stufe 1 Plan-Modus (1 Aufruf + Roundtrips) -> Stufe 2 Loop |
| Beobachtung | kompakter Zustand, hart gekappt auf 4000 Zeichen; KEIN Roh-DOM, KEINE Screenshots ans Modell |
| Makro-Recorder | erfolgreicher Loop-Lauf wird als Makro gespeichert -> naechster Lauf 0 Modell-Aufrufe |
| Worker | `SMEJJ_MAUS_EXIT_AFTER_RUN` bleibt aktiv; keine neuen Fixkosten |

Rechenbeispiel: Aufgabe "Suche auf Seite X" scheitert im Plan-Modus
(1 Erstplan + 2 Roundtrips = 3 Aufrufe), Loop loest sie in 6 Schritten
(6 Aufrufe) => 9 Modell-Aufrufe einmalig. Der erfolgreiche Loop wird als
Makro gespeichert; jeder weitere identische Lauf kostet 0 Modell-Aufrufe.
Mit `task.mode === "interaktiv"` entfaellt der Plan-Modus komplett
(max. `maxLoopSteps` Aufrufe). Ein Loop-Aufruf nutzt ein guenstiges
Router-Modell (Nebenrolle laut Master-Prompt); die Beobachtung ist auf
4000 Zeichen gekappt, d. h. ~1-2k Tokens pro Aufruf.

## 3. Architektur

```
Aufgabe (Task Capsule)
   |
   v
Stufe 0: Makro-Treffer? (deriveMacroName(task) auf IDrive e2)
   | ja: 0 Modell-Aufrufe, deterministisch abspielen (bestehender Interpreter)
   | nein
   v
Stufe 1: Plan-Modus (BESTEHEND, bleibt Standard)
   | 1 Modell-Aufruf -> Blindplan -> Interpreter -> fertig? -> ja: fertig
   | nein / Plan scheitert / task.mode === "interaktiv"
   v
Stufe 2: Loop-Modus (NEU, budgetiert) — workers/maus-engine/interactive-loop.mjs
   beobachten:  observer.mjs -> kompakter Seitenzustand (URL, Titel,
                interaktive Elemente + Koordinaten, sichtbarer Text gekuerzt,
                Passwortfelder maskiert; hart gekappt, KEIN Roh-DOM)
   entscheiden: Modell liefert GENAU EINEN naechsten Schritt als JSON
                (schemas/maus-step-decision.schema.json, gleiches
                Aktions-Vokabular wie der Plan-Modus)
   handeln:     Engine fuehrt deterministisch aus (bestehender Interpreter,
                ctx.runMacroSteps: gleiche Allowlist, gleiches Budget,
                gleiche Maskierung)
   pruefen:     decision "done" -> fertig; sonst naechster Durchlauf
   max. budget.maxLoopSteps Durchlaeufe, fail-closed
```

Neue/geaenderte Module (alle < 800 Zeilen, Single Responsibility):

- NEU `workers/maus-engine/observer.mjs` — deterministische, gekappte
  Beobachtung aus der Playwright-Seite; ohne Modell.
- NEU `workers/maus-engine/interactive-loop.mjs` —
  `observeDecideAct({ task, policyInput, page, plannerClient, runAction })`.
- NEU `workers/maus-engine/loop-runner.mjs` — Worker-seitige Verdrahtung:
  Browser oeffnen, Loop fahren, Schritt-Screenshots + Entscheidungsprotokoll
  als Artefakte nach IDrive e2, Makro-Recorder, Browser schliessen.
- NEU `schemas/maus-step-decision.schema.json` — Einzelschritt-Vertrag (v1).
- ERWEITERT (additiv) `prompt-template.mjs` (`buildStepPrompt`),
  `planner-roundtrip.mjs` (Stufe-0-Makro + Loop-Uebergabe),
  `macro-store.mjs` (`deriveMacroName`), `worker.mjs` (`loopTask` im
  /run-Body), `schemas/maus-action-plan.schema.json` (optionales
  `budget.maxLoopSteps`), `control-server/src/routes/mausEngineRoutes.js`
  (Modus/Budget durchreichen).

Modellunabhaengigkeit bleibt Pflicht: Die Engine kennt kein Modell.
Schnittstelle ist ausschliesslich JSON; der `plannerClient` wird injiziert.

### 3.1 Planer-Zugang des Workers: Control-Proxy statt Direkt-Key (verbindlich)

Der Loop braucht pro Schritt EINE Modellentscheidung — im Worker, wo der
Browser laeuft. Wuerde der Worker das Modell selbst rufen, muesste ein
zweiter BYOK-Key in den Worker dupliziert werden und der zentrale
Modell-Router waere umgangen. Beides ist unzulaessig (Master-Prompt: alle
Modelle ausschliesslich ueber den zentralen Router; Secret-Policy: keine
Schluessel-Duplikate). Deshalb:

```
Worker (loop-runner.mjs)
  --POST /api/maus/run {plannerPrompt}  + Bearer SMEJJ_MAUS_ENGINE_TOKEN-->
Control Server (mausEngineRoutes.handleMausPlannerProxy)
  --> AI Router (resolveModelRequest/executeWithFallback, GLM-5.2 zuerst,
      requestedModel via SMEJJ_MAUS_PLANNER_MODEL) --> Modell
  <-- {choices:[{message:{content}}]} (OpenAI-kompatibel, modellneutral)
```

- Der Worker besitzt KEINEN Modell-Key; er nutzt das Engine-Token, das er
  ohnehin hat. Worker-Env fuer den Loop: `SMEJJ_MAUS_PLANNER_URL`
  (Control-Route) und optional `SMEJJ_MAUS_PLANNER_MODEL` (requestedModel).
- Fail-closed: Das Worker-Token darf am Control-Server AUSSCHLIESSLICH den
  Planer-Proxy ausloesen — niemals einen Lauf starten (403, per Test belegt).
  Token-Vergleich konstantzeitig; Prompt-Limit 24 000 Zeichen; Budget-Gate
  gilt auch fuer den Proxy.
- Der Control Server bleibt die einzige Stelle mit Modell-Zugaengen; ein
  Modellwechsel ist weiterhin ein reiner Router-Eintrag.

## 4. Beobachtungsformat (observer.mjs, deterministisch)

```json
{
  "url": "https://example.com/",
  "title": "Example",
  "elements": [
    { "n": 1, "tag": "button", "role": "button", "text": "Alle akzeptieren",
      "x": 640, "y": 512, "selectorHint": "#accept" },
    { "n": 2, "tag": "input", "type": "password", "label": "Passwort",
      "masked": true, "x": 400, "y": 300 }
  ],
  "textExcerpt": "sichtbarer Seitentext, gekuerzt ...",
  "truncated": true
}
```

Regeln: nur interaktive Elemente (a, button, input, select, textarea,
role=button/link/...), Reihenfolge = DOM-Reihenfolge, Koordinaten =
Element-Mitte im Viewport. Passwortfelder: `masked:true`, Wert NIE enthalten.
Gesamtausgabe hart gekappt (`OBSERVATION_LIMIT_CHARS = 4000`), Kuerzung
deterministisch (Elemente zuerst, dann Textauszug). Kein Roh-DOM, kein HTML.

## 5. Prompt-Vertrag Einzelschritt (buildStepPrompt)

- Ziel + Policy stammen AUSSCHLIESSLICH aus der Task Capsule.
- Der Beobachtungs-Block ist als `<untrusted_seitenzustand>` gerahmt mit dem
  expliziten Hinweis, dass Seitentext niemals Anweisungen enthaelt, denen zu
  folgen ist (Prompt-Injection-Schutz, wie bewaehrt im Retry-Prompt).
- Antwortvertrag: GENAU EIN JSON-Objekt nach
  `schemas/maus-step-decision.schema.json`:
  `{"schemaVersion":1,"decision":"act","reason":"...","step":{...}}` oder
  `{"decision":"done","reason":"...","result":"..."}` oder
  `{"decision":"fail","reason":"..."}`.
- `step` nutzt dasselbe Aktions-Vokabular wie der Plan-Modus; verboten im
  Loop: `openBrowser`, `closeBrowser`, `runMacro` (Browser laeuft bereits,
  keine Verschachtelung).
- Jede Entscheidung traegt `reason` (Pflicht) — wird als Artefakt gespeichert
  (jede Modell-Entscheidung mit Begruendung, replaybar).

## 6. Sicherheitskonzept (fail-closed)

1. Seiteninhalt ist IMMER untrusted Input (nur Daten, nie Instruktion;
   feste Rahmung im Prompt).
2. Jeder Einzelschritt wird gegen das bestehende Aktions-Schema validiert:
   Envelope gegen `maus-step-decision.schema.json`, der Schritt selbst als
   synthetischer Ein-Schritt-Plan gegen `maus-action-plan.schema.json`
   inklusive aller semantischen Regeln (`plan-validator.mjs`) — fail-closed,
   ungueltiger Schritt erreicht nie den Browser.
3. Domain-Allowlist gilt bei JEDEM Schritt: statisch (navigate-URL vor der
   Ausfuehrung -> sofortiger Abbruch) und zur Laufzeit (bestehendes
   `enforcePageAllowed` nach jedem Schritt, Redirect-Schutz).
4. Keine Credentials im Modellkontext: Passwortfelder im Beobachtungs-Block
   maskiert; sensible Eingaben nur via `secretRef` (bestehender
   `secret-vault.mjs`); Vault-Maskierung gilt fuer alle Loop-Artefakte.
5. Keine Downloads/Uploads ausserhalb der Capsule-Definition (bestehende
   `policy.files`-Pruefung greift ueber die Einzelschritt-Validierung).
6. Vollstaendige Artefakte auf IDrive e2: Entscheidungsprotokoll (jede
   Modell-Entscheidung mit Begruendung), Screenshot pro Schritt,
   Aktionsergebnisse, Abbruchgrund — jeder Lauf reproduzierbar/replaybar.
7. Ausfuehrung durch den BESTEHENDEN Interpreter (`ctx.runMacroSteps`):
   gleiche Budget-Zaehlung (`maxActions`), gleiche Timeouts, gleiche
   Maskierung, gleiche Allowlist wie im Plan-Modus.

## 7. Makro-Recorder (Stufe 0)

Erfolgreicher Loop-Lauf -> ausgefuehrte Schritte werden mit
`openBrowser`/`closeBrowser` gerahmt und via `macro-store.mjs` unter
`deriveMacroName(task)` (deterministischer Slug der Aufgabe, ohne Pfad, ohne
`.json`) auf IDrive e2 gespeichert. `planAndExecute` prueft VOR jedem
Modell-Aufruf auf einen Makro-Treffer; Treffer laufen als validierter
synthetischer Plan deterministisch durch den Interpreter: 0 Modell-Aufrufe.
Schlaegt das Makro fehl, faellt die Aufgabe normal in Stufe 1/2 zurueck.

## 8. Ergebnis-JSON (additiv)

`planAndExecute` liefert zusaetzlich: `mode` ("makro" | "plan" |
"interaktiv"), `modelCalls` (harte Gesamtzahl Modell-Aufrufe) und
`loopSteps` (Anzahl Loop-Durchlaeufe). Bestehende Felder unveraendert.

## 9. Testplan

Unit-Tests ohne echten Browser (`tests/maus-engine-interactive-loop.test.mjs`,
Muster `tests/remote-browser-session.test.mjs`):

1. Loop stoppt exakt bei `maxLoopSteps` (fail-closed, kein Endlos-Loop)
2. Ungueltiger Einzelschritt vom Modell -> abgelehnt, kein Browser-Aufruf
3. `navigate` ausserhalb der Allowlist -> sofortiger Abbruch
4. Prompt-Injection: Seitentext mit Anweisung -> nur als Daten im
   Modell-Input; Allowlist blockt die Navigation trotzdem
5. Beobachtung ist gekappt (4000 Zeichen) und maskiert Passwortfelder
6. Non-Regression: ohne `mode:"interaktiv"` und mit erfolgreichem Plan ->
   exakt 1 Modell-Aufruf wie heute
7. Makro-Treffer -> 0 Modell-Aufrufe

Pflicht-Checks: `check:guidelines`, `check:maus-engine`, `check:architecture`,
`check:cost`, `check:json`, danach `check:all` + `release:preflight`.

Live-E2E (separat freizugeben: Worker-Start = Salad-Kosten; ggf. GPU-Klasse
= eigene benannte Kostenfreigabe): Aufgabe, die im Plan-Modus scheitern muss
und die der Loop loest (z. B. Seite mit Cookie-Banner + Suche); Nachweis:
Artefakte auf IDrive e2, `modelCalls` <= Budget, Makro danach vorhanden,
zweiter Lauf 0 Modell-Aufrufe; Worker danach stoppen.

## 10. Rollback

`backups/rollback-2026-07-15-maus-interaktiv-loop/` enthaelt die
Vorher-Staende (SHA-256 in `MANIFEST.txt`) aller geaenderten Dateien; neue
Dateien sind rein additiv und koennen entfernt werden. Ohne
`task.mode === "interaktiv"` und ohne `runLoop`-Injektion verhaelt sich die
Engine exakt wie vorher (Non-Regression, Test 6). Deployment-Rollback wie in
`MAUS_ENGINE.md` (Worker-Gruppe stoppen, Image-Version zuruecksetzen).

## 11. Nicht-Ziele

Kein Vision-Modell. Kein Modell-Aufruf pro Klick im Plan-Modus. Keine
Bedienung nativer Desktop-Apps. Keine Aenderung am Live-Browser
(`workers/remote-browser/session-engine.js`). Kein dauerhaft laufender
Worker. Keine kostenpflichtigen Dienste ohne benannte Freigabe.
