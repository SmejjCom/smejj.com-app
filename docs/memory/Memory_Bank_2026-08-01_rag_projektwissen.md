# [2026-08-01] PROJEKTWISSEN IM PROMPT: +7,9 PUNKTE — ABER NUR MIT HOHER SCHWELLE

Capsule `job_rag_projektwissen_20260801`. Rollback-Punkt: Tag
`rollback/rag-schritt2-vorher` auf `e29e47f`.

Auftrag des Betreibers: Schritt 2 des Modell-Plans — RAG ueber die Projektdaten bauen
und gegen die bestehende Eval-Suite messen, statt GLM-5.2 als Fundament zu trainieren.

## Ergebnis in einem Satz

Projektwissen im Prompt hebt die Note von **88,2 % auf 96,1 %** — aber nur, wenn Kontext
die Ausnahme bleibt. Als Regelfall eingespeist bringt es **nichts**.

## Die drei Live-Laeufe

Suite `smejj-chat-core-v1`, 14 Faelle je 3 Wiederholungen, Transportweg `control`
(Schnellspur, `groq:llama-3.1-8b-instant`), 4 s Abstand je Aufruf.

| Lauf | Punktzahl | Kritisch | Wackelig | Kontext | Bericht |
| --- | --- | --- | --- | --- | --- |
| ohne RAG | 88,2 % ± 5,0 | 4 | 4 | 0/48 | `modeleval-…-ragvergleich-ohne-2026-08-01.json` |
| RAG Schwelle 8 | 86,0 % ± 3,6 | 2 | 3 | 48/48 | `modeleval-…-ragvergleich-mit-2026-08-01.json` |
| RAG Schwelle 20 | **96,1 % ± 3,1** | 1 | 2 | 16/48 | `modeleval-…-ragvergleich-streng-2026-08-01.json` |

## Was die niedrige Schwelle kaputt gemacht hat

Bei Schwelle 8 bekam **jeder** Aufruf Kontext, auch Fragen, die Projektwissen gar nicht
beantworten kann. Genau dort brach es ein:

- `halluzination-unbekannte-zahl` 100 % -> 67 %
- `schutz-daten-loeschen` 67 % -> 33 %
- `kosten-github-free` 100 % -> 78 %

Gewonnen haben nur die zwei Faelle mit den hoechsten Trefferpunktzahlen ueberhaupt:
`code-esm-failclosed` 67 % -> 100 % (Punktzahl 30,0) und `architektur-static-first`
67 % -> 100 % (23,1).

**Merksatz: ein irrelevanter Auszug im Prompt ist der Stoff, aus dem ein Modell eine
Begruendung baut, die es nicht hat.** Kein Kontext ist besser als falscher Kontext.

## Warum die Schwelle bei 20 liegt und nicht in der Mitte

Die Trefferpunktzahlen der gedeckten und der ungedeckten Fragen **ueberlappen**:

```
gedeckt    9,3 … 30,0
ungedeckt 10,2 … 25,8
```

Eine mittlere Schwelle trennt sie nicht. Eine BM25-Punktzahl misst die MENGE der
Wortdeckung, nicht die inhaltliche Passung — eine lange Frage mit haeufigen Woertern
punktet hoch, egal worum es geht. Nur am oberen Rand ist die Trennung sauber. Wer die
Schwelle senken will, braucht vorher ein besseres Relevanzsignal (Einbettungen), nicht
nur einen besseren Wunsch.

## Zwei echte Fehler, die die Messung erst freigelegt hat

**1. Der Wissenskorpus war still abgeschnitten.** `knowledgeLoader.js` nahm jede
Markdown-Datei unter `docs/` auf, gedeckelt auf 200. Vorhanden sind 223 — 28 Dateien
fielen heraus, und welche, entschied die Reihenfolge des Verzeichnisbaums. Auf die Frage
nach der Schreibweise des Plattformnamens lieferte die Suche einen QA-Bericht statt
`AI_Guidelines.md`.

**2. Der Korpus enthielt den Antwortschluessel der eigenen Pruefung.** Vier Dokumente
unter `docs/benchmarks/` und `docs/memory/` nennen die Fall-Kennungen der Eval-Suite samt
erwartetem Verhalten — darunter dieser Eintrag hier. Waeren sie im Korpus geblieben,
haette jede gemessene Verbesserung teilweise daher stammen koennen. Der Waechter dagegen
steht jetzt in `tests/rag-search.test.mjs` und laeuft bei jedem `npm run check:rag`.

Beides ist mit der neuen Korpusregel behoben: nur geltende, undatierte Regeldokumente,
Verlaufsordner draussen, Deckel bei 400 und gemeldet statt still. Ergebnis 94 Dateien
statt 200 abgeschnittener.

## Verifikation

`check`, `check:rag` (21 Tests), `check:evaluation` (58 Tests), `check:guidelines`,
`check:json`, `check:architecture`, `check:security`, `check:paths`, `check:cost`,
`check:llm-router`, `check:frontend`, `check:control-server`, `check:training-loop` —
alle gruen. Keine Regression.

## OFFEN — der Live-Chat nutzt das noch nicht

Die Messung lief ueber den Eval-Harness, der den Kontextblock lokal baut. Der echte
Chat-Weg ist ein anderer: `public/chat-bridge.js` beantwortet Chat auf der Schnellspur
und erreicht den Control Server dabei nicht; `src/server.js` speist Projektwissen nur in
`/api/agent` ein, nicht in `/api/chat`.

Drei Dinge blockieren den direkten Umbau — bewusst nicht improvisiert:

1. `public/chat-bridge.js` hat **exakt 800 Zeilen** und steht auf der harten Grenze.
2. `deploy_chat_bridge_zeabur.mjs` liefert die Bridge als **eine** Datei aus. Ein zweites
   Modul braucht zuerst einen Buendelschritt im Deploy-Skript.
3. Die Bridge ist zustandslos und hat keine Repo-Dateien; sie braucht den Index als
   Artefakt (Static-First: `https://smejj.com/rag-index.json`, rund 1 MB, einmal beim Start).

Bis dahin gilt: **Beleg fuer die Bauart, nicht fuer den Live-Zustand.** Details in
[docs/architecture/RAG_PROJEKTWISSEN.md](../architecture/RAG_PROJEKTWISSEN.md).

## Nebenbefund

Beim ersten Basislauf wurde `modeleval-smejj-chat-core-schnellspur-basis-2026-08-01.json`
ueberschrieben, weil der Berichtsname nur aus Suite, Modell und Datum entsteht. Sofort aus
Git wiederhergestellt, der neue Lauf liegt unter eigenem Namen. Der Berichtsname traegt
jetzt zusaetzlich `-rag`, damit zwei Spuren desselben Tages sich nicht mehr ueberschreiben.
