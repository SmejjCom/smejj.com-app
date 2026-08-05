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

## KORREKTUR mit Kontrollgruppe: die Wirkung ist +4,0, nicht +1,4

Der erste Schluss ("Gewinn im Rauschen") war zu vorsichtig. 78 der 295 Faelle
bekamen bei Schwelle 12 GAR KEINEN Kontext — sie sind eine echte Kontrollgruppe,
denn RAG kann sie nicht beeinflusst haben:

    MIT Kontext            217 Faelle   74,3 % -> 76,8 %   (+2,5)
    OHNE (Kontrollgruppe)   78 Faelle   80,9 % -> 79,4 %   (-1,4)
    Differenz von Differenzen                              (+4,0)

Die Kontrollgruppe driftete um -1,4 nach unten. Dieselbe Drift steckt auch in der
Kontextgruppe; abgezogen bleiben +4,0 Punkte echte Wirkung — deutlich ausserhalb
des Rauschbands von 1,7.

MERKREGEL: **Faelle ohne Kontext sind bei einem RAG-A/B keine Fuellmasse, sondern
die Kontrollgruppe.** Ohne sie wird die Wirkung systematisch unterschaetzt.

Auf Faellen MIT Kontext, je Kategorie: sprache +18,5 (nur 3 Faelle), router +15,0,
ehrlichkeit +12,7, kosten +10,5, performance +8,1, logik +7,6, rag +7,0.
Echte Verluste bleiben: training -14,4 und schutz -9,2.

## Diagnose der zwei Verlierer: BM25 trifft Wortdeckung, nicht Zustaendigkeit

    train-capsules-keine-daten  ->  AI_Guidelines.md :: 7. Kosten-Guardrails (32,9)
    lock-funktion-rueckbau      ->  FREE_ONLY_MASTER_POLICY :: Skalierungsregel (16,1)
                                    AGENTS.md :: Change-Lock erst auf Platz 3 (10,3)
    lock-key-rotation           ->  zwei Deploy-Vorlagen statt des Zugangs-Locks

Das zustaendige Dokument taucht gar nicht auf oder verliert gegen eines, das nur
dieselben Woerter enthaelt.

## VERWORFENER VERSUCH: Quellen-Prioritaet erweitern

Der MASTER_PROMPT benennt fuenf Dokumente als verbindlich; nur eines davon stand
in SOURCE_PRIORITY. Naheliegender Schluss: die vier fehlenden ergaenzen
(TRAINING_DATA_POLICY, DEPLOYMENT_PLAN, START_DESIGN_LOCK, FAVICON_LOCK).

GEMESSEN UND ZURUECKGENOMMEN: es half nicht und schadete stellenweise. Bei
lock-funktion-rueckbau rutschte danach die Trainingsdaten-Policy auf Platz 2 —
bei einer Frage zum Change-Lock. Autoritaetsgewichte mischen nur um, WELCHES
themenfremde Dokument gewinnt; sie stellen kein Thema fest.

MERKREGEL: **Autoritaet ist kein Ersatz fuer Themenbezug.** Eine Gewichtung kann
zwischen zwei zustaendigen Quellen entscheiden, aber keine unzustaendige aussortieren.

## Empfehlung

1. MIN_TOP_SCORE NICHT pauschal auf 12 senken, solange training und schutz dabei
   verlieren. Der Netto-Gewinn von +4,0 ist echt, aber erkauft.
2. Der Hebel liegt nicht in Schwelle oder Gewicht, sondern darin, dass BM25
   keinen Themenbegriff kennt. Das ist eine Entscheidung ueber die Suchart
   (z. B. semantische Einbettungen), keine Zahlenaenderung — und damit eine
   Frage an den Betreiber, kein Nebenbei-Umbau.

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
