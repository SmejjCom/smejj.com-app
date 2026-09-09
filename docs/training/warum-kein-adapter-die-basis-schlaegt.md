# Warum keine trainierte Version die Basis schlaegt (gemessen, 10.09.2026)

Fuenf Laeufe, fuenf Enttaeuschungen — und ein Muster, das erst sichtbar wurde,
als 1.8 den Effekt verdoppelt hat.

## Der Befund

Die 15 Gebiete der breiten Suite zerfallen in zwei Arten:

* **WISSEN** — Fragen, deren Antwort man kennen muss: Projektfakten, Namensregeln,
  Trainingsdaten-Policy, Architektur, Budgets, Kosten, Deployment, Schutz-Locks,
  Abwehr. Neun Gebiete.
* **KOENNEN** — Faehigkeiten, die man ausuebt: Rechnen, Ehrlichkeit, Codequalitaet,
  Modellwahl, strukturierte Ausgabe, Sprache. Sechs Gebiete.

Jede Version gegen ihre eigene, im selben Lauf gemessene Basis:

| Version | WISSEN | KOENNEN |
|---|---|---|
| 1.4 | −5,7 | +1,9 |
| 1.5 | −9,2 | +0,1 |
| 1.6 | −7,3 | +3,5 |
| 1.7 | −9,5 | +3,4 |
| **1.8** | **−13,1** | **+7,4** |

**Fuenf von fuenf Laeufen: Wissen faellt, Koennen steigt.** Keine einzige
Ausnahme. Bei 1.8 einzeln betrachtet fallen ALLE neun Wissensgebiete und
steigen fuenf von sechs Koennensgebieten (das sechste faellt um 2,2 Punkte).

## Was das erklaert

Vier Laeufe lang habe ich den INHALT der Paare geaendert und mich gewundert,
warum jedes Mal ein Gebiet stieg und zwei fielen. Die Antwort: es waren nie
dieselben zwei. Es waren immer WISSENSgebiete, die fielen — nur verschiedene.

1.8 hat nicht den Inhalt geaendert, sondern das Gewicht (83 handgeschriebene
Paare sechsfach, 1,8 % → 44 %). Ergebnis: **derselbe Effekt, doppelt so stark.**
Das ist der Beweis, dass die Gewichtung wirkt — und dass sie in beide Richtungen
wirkt.

Der Fachbegriff dafuer ist katastrophales Vergessen: ein Feintuning auf einem
schmalen Korpus ueberschreibt gespeichertes Faktenwissen. Die Suite misst aber
neun Wissensgebiete gegen sechs Koennensgebiete — also gewinnt die nackte Basis
die Gesamtnote, obwohl der Adapter beim Koennen besser ist.

## Die zwei Auswege

1. **Weniger tief eingreifen.** Rang 16 → 8, Lernrate 1e-4 → 3e-5. Weniger
   Vergessen, aber auch weniger Gewinn. Billig zu messen, ein Lauf.
2. **Wissen mittrainieren.** Die Projektfakten, die die Suite abfragt, gehoeren
   als Paare in den Korpus — heute ist kein einziges der 83 Paare eine
   Wissensfrage zur Trainingsdaten-Policy, und genau dieses Gebiet stuerzt am
   staerksten ab (−25,6).

Weg 2 ist der richtige, Weg 1 der schnellere. Beide sind messbar.

## Wo die Zahlen herkommen

`docs/benchmarks/modeleval-smejj-chat-core-*.json`, Gebietszuordnung ueber
`evals/packs/*.json`. Jede Version gegen die Basis DESSELBEN Laufs — Vergleiche
zwischen Laeufen taugen nicht, die Suite streut zwischen Knoten.
