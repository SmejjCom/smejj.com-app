# Projektwissen im Prompt (RAG) — Bauart und Messung

Verbindlich fuer jede Aenderung an der Wissenssuche von smejj.com.

## Warum es diese Schicht gibt

Die Pruefsuite `smejj-chat-core` fragt zu grossen Teilen Projektwissen ab: Schreibregel,
Hauptspeicher, Kostenpolitik, Zeilengrenze, Schutz-Locks, Leistungsbudgets. Ein Modell
kann das nicht wissen — es kann es nur raten oder nachlesen. Feinabstimmung (Finetuning)
traegt hier nicht: sie praegt Stil und Format, nicht Fakten. Fakten kommen aus dem Abruf.

Das ist der Grund, warum die Note des eigenen Modells nicht trug, obwohl das Modell lief.
Es war die falsche Schicht.

## Aufbau

Drei Module, jeweils eine Aufgabe:

| Modul | Aufgabe |
| --- | --- |
| `control-server/src/rag/knowledgeCorpus.js` | WELCHE Dateien Projektwissen sind |
| `control-server/src/rag/bm25Index.js` | Volltextindex und Wortsuche |
| `control-server/src/rag/ragRanking.js` | Nachgewichtung nach Quelle, Relevanzschwelle |
| `control-server/src/rag/agentContext.js` | Cache und fertiger Prompt-Kontextblock |

Der Messweg liegt bewusst daneben und ruft dieselben Module auf:
`src/evaluation/evalRagContext.js` plus `--rag` in `scripts/evaluation/run_model_eval.mjs`.
Waere die Suche im Harness nachgebaut, wuerde die Messung eine Sache belegen und der
Dienst eine andere ausliefern.

## Regel 1 — Der Korpus enthaelt nur geltende Regeldokumente

Aufgenommen werden `AI_Guidelines.md`, `MASTER_PROMPT.md`, `AGENTS.md`, `Project_Goals.md`,
`README.md` und die undatierten Dokumente unter `docs/`.

Draussen bleiben Verlaufsordner (`memory`, `benchmarks`, `qa`, `task-capsules`, `release`,
`prompts`, `mockups`) und jede Datei mit einem ISO-Datum im Namen.

Begruendung: Ein Treffer soll sagen, was GILT, nicht was einmal galt. Ein datierter Bericht
beschreibt einen Zeitpunkt, ein Regeldokument den Zustand.

Zweiter, harter Grund: Benchmark-Berichte und Memory-Eintraege nennen die Fall-Kennungen
der Pruefsuite samt erwartetem Verhalten. Im Korpus waeren sie der Antwortschluessel der
eigenen Pruefung — jede gemessene Verbesserung waere Selbstbetrug. Der Waechter dagegen
laeuft in `tests/rag-search.test.mjs` und ist Teil von `npm run check:rag`.

Der Verlauf geht nicht verloren: Task Capsules auf IDrive e2 sind laut `AI_Guidelines.md`
Abschnitt 4 der Ort fuer die Historie.

**Gemessener Befund vor der Korrektur (2026-08-01):** Der Loader nahm jede Markdown-Datei
unter `docs/` auf, gedeckelt auf 200. Bei 223 vorhandenen Dateien fielen 28 STILL heraus,
und welche das waren, entschied die Reihenfolge des Verzeichnisbaums. Auf die Frage nach
der Schreibweise des Plattformnamens lieferte die Suche einen QA-Bericht statt
`AI_Guidelines.md`. Der Deckel liegt jetzt bei 400 und wird gemeldet statt still angewendet.

## Regel 2 — Ein Regeldokument gewinnt bei aehnlicher Wortdeckung

BM25 kennt nur Woerter, nicht Autoritaet. Leitdokumente bekommen darum ein Gewicht
(`SOURCE_PRIORITY`, `DIRECTORY_PRIORITY`). Das ist eine Bauartaussage ueber das Repository
und NICHT aus der Pruefsuite abgeleitet — sonst wuerde die Suite sich selbst bestaetigen.

## Regel 3 — Lieber kein Kontext als falscher Kontext

Erreicht der beste Treffer die Schwelle `MIN_TOP_SCORE` nicht, wird **nichts** eingespeist.

Das ist die wichtigste Regel dieser Schicht, und sie ist teuer erkauft. Gemessen live am
2026-08-01, Suite `smejj-chat-core-v1`, 14 Faelle je 3 Wiederholungen ueber die Schnellspur
(`groq:llama-3.1-8b-instant`):

| Lauf | Punktzahl | Kritische Verstoesse | Aufrufe mit Kontext |
| --- | --- | --- | --- |
| ohne Projektwissen | 88,2 % ± 5,0 | 4 | 0 von 48 |
| Schwelle 8 | 86,0 % ± 3,6 | 2 | 48 von 48 |
| **Schwelle 20** | **96,1 % ± 3,1** | **1** | **16 von 48** |

Die niedrige Schwelle brachte **nichts** — der Unterschied zur Basis liegt innerhalb des
Messfehlers. Sie gab 48 von 48 Aufrufen Kontext, also auch Fragen, die Projektwissen gar
nicht beantworten kann, und genau dort brach die Note ein.

Die hohe Schwelle gibt nur jedem dritten Aufruf Kontext und gewinnt **7,9 Punkte** gegen
die Basis — deutlich ausserhalb des Messfehlers beider Laeufe.

### Warum die Schwelle hoch liegt und nicht in der Mitte

Die Trefferpunktzahlen gedeckter und ungedeckter Fragen ueberlappen: gemessen 9,3 bis 30,0
gegen 10,2 bis 25,8. Eine mittlere Schwelle trennt sie NICHT — eine BM25-Punktzahl misst
die Menge der Wortdeckung, nicht die inhaltliche Passung. Nur am oberen Rand ist die
Trennung sauber.

Wer die Schwelle senken will, muss vorher ein besseres Relevanzsignal haben
(Einbettungen), nicht nur einen besseren Wunsch.

## Messen

```bash
node scripts/evaluation/run_model_eval.mjs --live --wiederholungen 3 --delay-ms 4000
node scripts/evaluation/run_model_eval.mjs --live --rag --wiederholungen 3 --delay-ms 4000
```

Berichte derselben Messart werden nur untereinander verglichen. `run.rag` und
`run.ragSchwelle` sind Teil des Vergleichsschluessels — ein Lauf mit Kontext gegen einen
ohne gestellt misst nicht das Modell, sondern den Kontext, und meldet den Unterschied als
Fortschritt oder Regression des Modells.

## Offen: der Live-Chat nutzt diese Schicht noch nicht

Gemessen wurde ueber den Eval-Harness, der den Kontextblock lokal baut und voranstellt.
Der Live-Chat-Weg ist ein anderer: `public/chat-bridge.js` beantwortet Chat auf der
Schnellspur (Groq) und erreicht den Control Server dabei gar nicht. `src/server.js`
speist Projektwissen nur in `/api/agent` ein, nicht in `/api/chat`.

Der Umbau ist kein Einzeiler und darum bewusst nicht mitgeliefert:

1. `public/chat-bridge.js` hat exakt 800 Zeilen und steht damit auf der harten Grenze
   aus `AI_Guidelines.md` Abschnitt 2. Neue Logik braucht ein eigenes Modul.
2. `scripts/deploy/deploy_chat_bridge_zeabur.mjs` liefert die Bridge als EINE Datei aus
   (`/tmp/smejj-chat-bridge.mjs`). Ein zweites Modul braucht darum zuerst einen
   Buendelschritt im Deploy-Skript.
3. Die Bridge ist zustandslos und hat keine Repo-Dateien. Sie braucht den Index als
   Artefakt — Static-First waere `https://smejj.com/rag-index.json` (rund 1 MB, einmal
   beim Start geladen). `npm run rag:export` legt heute schon eine Fassung auf IDrive e2.

Bis dahin gilt die Messung als Beleg fuer die Bauart, nicht als Beleg fuer den Live-Zustand.
