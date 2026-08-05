# Deckenmessung und Schwellenfrage

**Stand 2026-08-05 · alle Zahlen gemessen · nichts geaendert**

## 1. Die Decke: wie viel Luft hat die Suche?

295 Faelle, je ein Modellurteil ueber ein breites Roh-BM25-Becken (20 Treffer,
ohne Schwelle): Enthaelt eine dieser Passagen Information, die zur Beantwortung
noetig ist?

    gedeckt und heute gefunden    42   14,2 %
    gedeckt, aber VERFEHLT       115   39,0 %   <- die Luft
    ungedeckt (die Decke)        138   46,8 %
    unklar                         0

**157 von 295 Fragen sind aus dem Korpus beantwortbar. Die Produktionssuche
erreicht davon 42 — Trefferquote 27 %.**

Die Decke liegt dort, wo sie hingehoert, und das ist der Gueltigkeitsbeleg der
Messung: coding 23, struktur 16, logik 14, sprache 12, ehrlichkeit 12 ungedeckt.
Das sind allgemeine Faehigkeiten — dort steht keine Antwort in der Doku, und
keine Suchart kann das aendern. Die Luft liegt vollstaendig im Hauswissen:
naming 16, schutz 13, architektur 10, sicherheit 10, deployment 10.

## 2. Trefferquote je Schwelle (offline aus den Belegen gerechnet)

    Schwelle 20 (LIVE)    42 von 157   27 %
    Schwelle 12           94 von 157   60 %
    Schwelle  8          117 von 157   75 %

## 3. Was ein Schwellenwechsel 20 -> 12 wirklich braechte

Rechenbar OHNE neuen Lauf: `rankHits` benutzt minTopScore nur als Tor, nicht zum
Sortieren. Ein Fall mit Spitzenwert >= 20 bekommt bei 12 und bei 20 GENAU
denselben Kontext. Also gilt exakt: Ergebnis bei 20 = Ergebnis bei 12 fuer diese
Faelle, und Ergebnis ohne Kontext fuer alle anderen.

    RAG aus                76,1 %
    Schwelle 20 = LIVE     77,0 %    Kontext bei 90 Faellen
    Schwelle 12            77,5 %    Kontext bei 217 Faellen

    Gewinn 20 -> 12:  +0,5 Punkte auf die Gesamtnote (Rauschband 1,7)

Auf der Entscheidungsgruppe — den 127 Faellen, die neu Kontext bekommen:

    alle 127                   75,0 -> 77,1   = +2,2
    davon Antwort IM Korpus  61 69,1 -> 72,0   = +2,9
    davon Antwort NICHT drin 66 80,8 -> 82,3   = +1,4

Bemerkenswert: selbst ungedeckte Fragen verlieren durch Kontext nicht. Die These
"irrelevanter Kontext schadet immer" ist in dieser Form widerlegt.

## 4. Der eigentliche Fund: der Schaden ist schon live

`training` und `schutz` verlieren durch Kontext. Aufgeteilt danach, WO die
betroffenen Faelle ihren Kontext herbekommen:

    schon bei Schwelle 20 (also HEUTE LIVE)   12 Faelle   88,0 -> 68,5  = -19,4
    neu bei Schwelle 12                       17 Faelle   79,1 -> 73,5  =  -5,6

**Der grosse Schaden entsteht nicht durch eine Senkung der Schwelle. Er ist
bereits im Betrieb.** Zwoelf Faelle verlieren heute 19,4 Punkte, weil die
Produktionssuche ihnen Kontext gibt, der sie schlechter macht.

## 5. Empfehlung

1. **Vorrang hat der Live-Schaden, nicht die Schwelle.** Die 12 Faelle mit -19,4
   sind ein Defekt im laufenden Betrieb. Welcher Kontext dort eingespeist wird
   und warum er schadet, ist die naechste Untersuchung — sie kostet keinen
   Modellaufruf, nur das Nachsehen der zwoelf Quellen.
2. **Die Schwellensenkung ist ein kleiner Gewinn, kein grosser.** +0,5 auf die
   Gesamtnote liegt im Rauschen; +2,2 auf der Entscheidungsgruppe ist echt, aber
   klein. Das starke Argument ist die Trefferquote (27 % -> 60 %), nicht die
   Note. Sie sollte erst nach Punkt 1 gestellt werden — sonst verdoppelt man
   einen Defekt, statt ihn zu beheben.
3. **Stufe 2 bleibt begruendet:** 115 verfehlte, aber gedeckte Faelle sind
   reichlich Luft fuer ein Einbettungsmodell. Aber auch sie sollte hinter
   Punkt 1 stehen: bessere Suche liefert mehr Kontext, und solange Kontext in
   zwei Kategorien schadet, vergroessert das den Schaden mit.
