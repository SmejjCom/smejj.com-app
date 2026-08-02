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

Jedes Modul eine Aufgabe:

| Modul | Aufgabe |
| --- | --- |
| `control-server/src/rag/knowledgeCorpus.js` | WELCHE Dateien Projektwissen sind |
| `control-server/src/rag/bm25Index.js` | Volltextindex und Wortsuche |
| `control-server/src/rag/ragRanking.js` | Nachgewichtung nach Quelle, Relevanzschwelle |
| `control-server/src/rag/ragContextBlock.js` | Suche + Blocktext, ohne jede Datei-Ein-/Ausgabe |
| `control-server/src/rag/agentContext.js` | Dateien lesen, Index cachen (nur Control Server) |
| `public/chat-bridge-rag.js` | Index-Artefakt entpacken, Block in die Nachrichten setzen |

Die Trennung von `ragContextBlock.js` und `agentContext.js` ist die Bedingung dafuer,
dass ueberhaupt zwei Dienste dieselbe Schicht fahren koennen: Der Control Server hat
das Repository und baut den Index aus Dateien. Die Chat-Bridge hat weder Repository
noch Zustand und bekommt ihn als Artefakt. Gemeinsam ist beiden genau das I/O-freie
Stueck — aus Index und Frage die Treffer, daraus den Block.

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

## Die Live-Kette traegt den Kontext selbst (2026-08-01)

Vorher galt: gemessen wurde ueber den Eval-Harness, der den Block lokal baut. Die
Live-Kette baute ihn nie — `public/chat-bridge.js` beantwortet Chat auf der Schnellspur
und erreicht den Control Server dabei gar nicht. Die Messung belegte die Bauart, nicht
den Dienst.

### Regel 4 — Gesucht wird einmal, am Eingang

Eine Anfrage kann drei Spuren erreichen (Schnellspur, Control Server, tiefe Spur). Der
Block wird EINMAL gebaut und an alle drei gereicht. Sonst entscheidet die Spur ueber die
Antwortguete, und dieselbe Frage bekommt je nach Auslastung eine andere Qualitaet.

Verdrahtet sind **beide** oeffentlichen Wege, und das ist kein Fleiss, sondern Pflicht:

| Weg | Wer nutzt ihn |
| --- | --- |
| `/api/chat` | der Eval-Harness (`src/evaluation/evalTransport.js`) |
| `/api/agent` | die Startseite, also echte Nutzer (`public/app.js`) |

Nur `/api/chat` zu verdrahten haette die gemessene Note gehoben, ohne einem einzigen
Nutzer zu helfen — die teuerste Art von Fortschritt.

### Regel 5 — Der Block steht vor der Anweisung des Aufrufers

`[Schutz-Anweisung] [Projektwissen] [Anweisung des Aufrufers] [Frage]`. Die Anweisung
muss zuletzt gelten, sonst richtet sich das Modell nach dem Hintergrund statt nach ihr —
und eine Zusicherung der Pruefsuite wuerde den Kontext pruefen statt die Anweisung.
Dieselbe Reihenfolge stand im 96,1-%-Lauf im Prompt.

### Der Index reist im Buendel mit

Die Bridge ist zustandslos und hat keine Repo-Dateien. `scripts/deploy/bundle_chat_bridge.mjs`
loest die relativen Importe auf, liefert weiterhin EINE Datei nach `/tmp/smejj-chat-bridge.mjs`
und haengt den Index als gzip+base64 an (657 Abschnitte, 424 kB gesamt statt 1,3 MB).

**Warum nicht `https://smejj.com/rag-index.json`** (Static-First waere naheliegend
gewesen): Der Korpus besteht aus den internen Regeldokumenten. Als Datei auf der
oeffentlichen Domain waere er ein vollstaendiger Abzug davon — waehrend
`stripInternalReferences()` in derselben Bridge Muehe darauf verwendet, interne
Dateinamen aus Antworten herauszuhalten. Zusaetzlich: das Buendel bleibt atomar
(Bridge-Version und Wissensstand koennen nicht auseinanderlaufen), es gibt keine
Netzabhaengigkeit beim Start, und der Frontend-Deploy waechst nicht um 1 MB je
Wissensstand (`docs/policy/GITHUB_KOSTENFREI.md`).

Der Buendler bricht ab, statt zu raten: Import-Zyklus, Namenskollision zwischen Modulen,
Fremdabhaengigkeit, Default-Export und Sammel-Export sind je ein harter Fehler. Ein
Buendler, der raet, liefert stillen Unsinn aus — und das faellt erst live auf.

### Was den Umbau absichert

`tests/chat-bridge-projektwissen.test.mjs` startet die **gebuendelte** Datei als eigenen
Prozess gegen einen Stub-Upstream und prueft, was das Modell wirklich bekommt. Eine
Pruefung gegen die Repo-Module wuerde die Luecke gerade nicht finden, um die es hier geht.

Zusaetzlich vergleicht ein Test fuer jeden Fall der Suite den Block der Live-Kette mit dem
des Messwegs. Sie muessen gleich sein, sonst vergleicht die Eval-Wiederholung zwei
verschiedene Dinge und meldet den Unterschied als Fortschritt oder Regression.

### Offen: der Live-Nachweis

Der Umbau ist gebaut, gebuendelt und lokal gegen einen Stub bewiesen — aber noch nicht
ausgeliefert. `npm run deploy:bridge` braucht `ZEABUR_API_TOKEN` in
`~/.config/smejj.com/env.local`; der Token fehlt und ist laut
`smejj.com Zeabur-Token-eintragen.command` ausdruecklich das eine Stueck, das eine
KI-Sitzung nicht selbst anlegen darf. Ohne Deploy sind Live-Test und die Eval-Wiederholung
ohne `--rag` nicht durchfuehrbar; live laeuft weiterhin `20260729-v104`.
