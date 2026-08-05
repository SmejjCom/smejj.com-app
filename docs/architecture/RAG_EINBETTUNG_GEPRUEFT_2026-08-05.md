# Einbettungsmodell geprueft — und abgelehnt

**Stand 2026-08-05 · gemessen im Scratchpad · nichts ins Projekt uebernommen**

## Aufbau

`multilingual-e5-small` (118 Mio. Parameter, 384 Dimensionen) ueber
`@huggingface/transformers`, installiert AUSSERHALB des Projekts. Alle 663
Abschnitte und alle 295 Fragen eingebettet, gemessen gegen dieselbe
Wahrheitsgrundlage wie zuvor (Deckenmessung: 157 gedeckt, 138 ungedeckt).

Gemessene Betriebswerte — die Einbettung selbst ist schnell:

    Modell laden           49 s (Kaltstart)
    663 Abschnitte          7 s (einmalig, offline)
    Frage einbetten         4 ms Median, 6 ms p95
    Platzbedarf gesamt    852 MB   (386 MB node_modules + Modell-Cache;
                                   geschaetzt waren 150 — Korrektur um Faktor 5,7)

## Ergebnis 1: als Deckungsanzeiger — kein Unterschied

Trennschaerfe zwischen "Antwort steht im Korpus" und "steht nicht drin",
gemessen als Flaeche unter der ROC-Kurve (0,5 = Muenzwurf):

    BM25-Punktzahl        0,611
    Kosinus-Aehnlichkeit  0,612

**Identisch.** Und beide sind schwach — ein brauchbarer Anzeiger laege bei 0,8
oder darueber. Die These, mit der dieser Test begruendet wurde ("semantische
Aehnlichkeit ist der bessere Deckungsanzeiger"), ist damit widerlegt.

## Ergebnis 2: als Sucher — deutlich SCHLECHTER

Trefferquote auf den 157 gedeckten Faellen, Top 3, **ohne Tor**:

    BM25 heute        118 von 157 = 75 %
    Einbettung         77 von 157 = 49 %
    beide zusammen    129 von 157 = 82 %

Die Einbettung findet ein Drittel weniger als die Wortsuche. Beide zusammen
gewinnen 7 Punkte gegenueber BM25 allein — der einzige gemessene Vorteil, und
er kostet 386 MB.

## Der wichtigste Nebenbefund

**BM25 findet ohne Tor 75 % — mit dem Tor bei Schwelle 20 nur 27 %.**

Die Suche ist also gut. **Das Tor wirft 48 Prozentpunkte weg.** Alles, was in
dieser Untersuchung am Ranking gedreht wurde, konnte deshalb nichts bewirken:
Das Ranking war nie kaputt.

Und das Tor laesst sich nicht reparieren, indem man ihm eine bessere Punktzahl
gibt — weder BM25 noch Einbettung koennen vorhersagen, ob der Korpus die Frage
beantwortet (beide AUC 0,61).

## Entscheidung

**Kein Einbettungsmodell.** Gemessen schlechter beim Finden, gleichwertig beim
Torhueten, 852 MB Platzbedarf. Der einzige Gewinn (BM25+Einbettung zusammen,
+7 Punkte) rechtfertigt das nicht — zumal er im selben Bereich liegt wie die
Schwankung zwischen zwei Laeufen.

Die Scratchpad-Installation wird geloescht. Ins Projekt kam nichts.

## Was daraus fuer die Gesamtlage folgt

Vier Ansaetze wurden gemessen, keiner hat gewirkt:

    Quellen-Prioritaeten erweitern   verworfen (verschob nur, welches
                                     themenfremde Dokument gewinnt)
    Nachsortierer                    verworfen (Wirkung im Rauschen)
    Begriffserweiterung (PMI)        verworfen (oeffnete das Tor fuer alles)
    Einbettungsmodell                verworfen (schlechter beim Finden)

Der gesicherte Gewinn bleibt, wo er war: **Projektwissen im Prompt wirkt
+4,0 Punkte** — aus der bestehenden Suche, ohne jeden Umbau.

**Empfehlung: die Retrieval-Optimierung beenden.** Die verbleibenden Gewinne
liegen im Rauschbereich, waehrend die eigentliche Luecke woanders ist: die
Kategorie `rag` umfasst 15 von 295 Faellen. Die Note haengt an der Faehigkeit
des Modells, nicht an der Suche. Der naechste grosse Hebel ist Schritt 2 des
Trainingsplans — kuratierte Trainingsdaten —, und der ist noch nicht begonnen.
