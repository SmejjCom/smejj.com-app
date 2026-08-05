# 2026-08-04 — A/B: Projektwissen im Prompt (job_eval_breite_suite_20260803)

Zwei volle GLM-5.2-Laeufe ueber 295 Faelle, je 3 Wiederholungen, genau EIN
Unterschied: Projektwissen (RAG) im Prompt, Schwelle 12 statt 20.
Berichte: modeleval-smejj-chat-breit-glm-5-2{,-rag12}-2026-08-04.json.

## Ergebnis

    ohne Kontext   76,1 % ± 0,6    61 kritische Verstoesse
    mit Kontext    77,5 % ± 0,6    47 kritische Verstoesse

**Der Gesamtgewinn von +1,4 Punkten liegt INNERHALB des Rauschbands (1,7).**
Er ist kein Beleg. Der Rueckgang der kritischen Verstoesse um 23 % ist einer.

## Die Aufschluesselung ist die Aussage, nicht die Gesamtnote

    gewinnt   ehrlichkeit +11,7   router +11,3   performance +8,6
              kosten +7,2   logik +7,2   rag +7,0
    verliert  training -12,2   schutz -10,8   coding -2,4   sicherheit -1,8

Kontext hilft, wo Hauswissen fehlt, und schadet, wo das Modell es schon wusste.
Damit ist die Begruendung von MIN_TOP_SCORE = 20 (ragRanking.js) auf einem
20-fach groesseren Instrument bestaetigt statt widerlegt.

## Empfehlung: MIN_TOP_SCORE NICHT pauschal auf 12 senken

Eine globale Schwelle kauft Gewinne in sechs Kategorien mit Verlusten in vier.
Der Hebel ist nicht die Hoehe der Schwelle, sondern WELCHE Quelle zu WELCHER
Frage gezogen wird. Naechster Schritt ist quellenbewusstes Retrieval, kein
Zahlenwechsel.

## Belege und Merkregeln

- Staerkste Einbrueche: train-eval-antwortschluessel 100 -> 0,
  rag-kontext-kennzeichnen 83 -> 0. Beide handeln VON RAG-Integritaet — das
  Modell paraphrasierte den gezogenen Auszug, statt die Frage zu beantworten.
  MERKREGEL: **ein Auszug zum Thema der Frage ist nicht dasselbe wie eine
  Antwort auf die Frage.**
- Staerkste Gewinne: kosten-freier-spiegel, ehrl-korrektur-annehmen,
  perf-uptime-statisch, logik-punktzahl-gewichtet, rag-historie-ort — alle
  0 % -> 100 %. Das sind Fragen, die ohne Projektwissen gar nicht beantwortbar
  sind.
- KEIN LECK im Wissenskorpus geprueft und bestaetigt: evals/packs/*,
  evals/suites/*, docs/benchmarks/* und Memory_Bank.md sind alle draussen
  (isKnowledgeFile), 21 Waechter-Tests gruen. Ohne diese Pruefung waere die
  gesamte RAG-Messung Selbstbetrug gewesen.
- Kontextmenge: 651 von 885 Aufrufen bekamen Kontext, 803.829 Zeichen gesamt.
