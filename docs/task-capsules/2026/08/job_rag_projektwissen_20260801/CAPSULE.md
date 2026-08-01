# Task Capsule — job_rag_projektwissen_20260801

**Status:** verified (Bauart belegt), Live-Verdrahtung offen und begruendet.
**Rollback:** Tag `rollback/rag-schritt2-vorher` auf `e29e47f`.

## Ziel

Schritt 2 des Modell-Plans: Projektwissen abrufbar machen (RAG) und gegen die bestehende
Eval-Suite messen — statt GLM-5.2 als Trainingsfundament zu nehmen, was mit den
vorhandenen Mitteln nicht geht (GGUF ist nicht trainierbar, MoE-Groesse ueberschreitet
jede verfuegbare Karte).

## Anforderungen

1. Index ueber die Projektdaten, ohne neue laufende Kosten und ohne neuen Anbieter.
2. Messung gegen `evals/suites/smejj-chat-core-v1.json`, A/B gegen denselben Live-Weg.
3. Non-Regression: bestehende Funktionen, Locks und Zugaenge unberuehrt.

## Betroffene Dateien

Neu:
- `control-server/src/rag/knowledgeCorpus.js` — Korpusregel
- `control-server/src/rag/ragRanking.js` — Quellen-Prioritaet, Relevanzschwelle
- `src/evaluation/evalRagContext.js` — RAG-Kontext fuer den Harness
- `docs/architecture/RAG_PROJEKTWISSEN.md` — Bauart und Messung
- `docs/memory/Memory_Bank_2026-08-01_rag_projektwissen.md` — Volltext

Geaendert:
- `control-server/src/rag/knowledgeLoader.js` — nutzt die Korpusregel, kein stiller Deckel
- `control-server/src/rag/agentContext.js` — Nachgewichtung + Schwelle, Schwelle durchreichbar
- `src/evaluation/evalReport.js` — `run.rag`, `run.ragSchwelle`, `run.ragStats`
- `scripts/evaluation/run_model_eval.mjs` — `--rag`, `--rag-schwelle`, Vergleichsschluessel
- `tests/rag-search.test.mjs` — 21 Tests (vorher 9)
- `Memory_Bank.md` — Eintrag; Alteintrag verlustfrei nach `docs/memory/` ausgelagert

## Ergebnis

| Lauf | Punktzahl | Kritisch | Kontext | Bericht |
| --- | --- | --- | --- | --- |
| ohne RAG | 88,2 % ± 5,0 | 4 | 0/48 | `modeleval-smejj-chat-core-ragvergleich-ohne-2026-08-01.json` |
| RAG Schwelle 8 | 86,0 % ± 3,6 | 2 | 48/48 | `modeleval-smejj-chat-core-ragvergleich-mit-2026-08-01.json` |
| RAG Schwelle 20 | **96,1 % ± 3,1** | 1 | 16/48 | `modeleval-smejj-chat-core-ragvergleich-streng-2026-08-01.json` |

Alle drei live ueber `https://smejj-chat-bridge.zeabur.app/api/chat`, Backend
`groq:llama-3.1-8b-instant`, 14 Faelle je 3 Wiederholungen, 4 s Abstand.

## Test-Protokoll

`check`, `check:rag` (21/21), `check:evaluation` (58/58), `check:guidelines`, `check:json`,
`check:architecture`, `check:security`, `check:paths`, `check:cost`, `check:llm-router`,
`check:frontend`, `check:control-server`, `check:training-loop` — alle gruen.

## Zwei Fehler, die die Messung freigelegt hat

1. **Stiller Abschnitt:** Der Loader nahm bis zu 200 Markdown-Dateien unter `docs/` auf,
   vorhanden sind 223. 28 Dateien fielen heraus, entschieden durch die
   Verzeichnisreihenfolge. Behoben: Korpusregel + Deckel 400, `truncated` wird gemeldet.
2. **Antwortschluessel im Korpus:** Dokumente unter `docs/benchmarks/` und `docs/memory/`
   nennen Fall-Kennungen der Eval-Suite samt Erwartung. Behoben: Verlaufsordner draussen,
   Waechter-Test in `check:rag`.

## Qualitaetsbewertung

Die Bauart ist belegt, die Zahl liegt ausserhalb des Messfehlers. Der Wert ist an eine
Bedingung geknuepft, die im Code steht und getestet ist: Kontext bleibt die Ausnahme.

Ehrliche Einschraenkung: gemessen wurde ueber den Eval-Harness, der den Kontextblock
lokal baut. Der Live-Chat nutzt die Schicht noch nicht (siehe unten). Die 96,1 % sind
darum ein Beleg fuer die Bauart, **nicht** fuer den heutigen Live-Zustand.

## Offen — naechster Auftrag

Live-Verdrahtung der Bridge. Drei Voraussetzungen, bewusst nicht improvisiert:

1. `public/chat-bridge.js` steht auf exakt 800 Zeilen (harte Grenze) — neue Logik
   braucht ein eigenes Modul.
2. `scripts/deploy/deploy_chat_bridge_zeabur.mjs` liefert EINE Datei aus; ein zweites
   Modul braucht zuerst einen Buendelschritt.
3. Die Bridge ist zustandslos: der Index muss als Artefakt kommen. Static-First waere
   `https://smejj.com/rag-index.json` (rund 1 MB, einmal beim Start), erzeugt aus
   `npm run rag:export`.
