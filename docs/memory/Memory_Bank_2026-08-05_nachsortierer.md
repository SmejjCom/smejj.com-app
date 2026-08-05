# 2026-08-05 — Stufe 1 gemessen: der Nachsortierer bringt nichts

Zwei Runden, je ein voller Lauf ueber 295 Faelle (GLM-5.2, Schwelle 12, drei
Wiederholungen). Auf den 275 in ALLEN Laeufen sauber gemessenen Faellen:

    ohne RAG              77,2 %    53 kritische Verstoesse
    RAG-12                78,3 %    42
    + Nachsortierer v1    79,0 %    44
    + Nachsortierer v2    78,7 %    46

Rauschband (2 Sigma): 1,7 Punkte. Alle drei RAG-Varianten liegen INNERHALB
davon. **Der Nachsortierer bewegt die Note nicht messbar.**

## Was die zwei Stellschrauben bewirkt haben

Sie haben die Mechanik repariert, nicht das Ergebnis:

    Ausfaelle des Nachsortierers   63 von 651  ->   1 von 651
    Ablehnungen                    51 %        ->  34 %
    Kontext kam an bei             317         -> 430 von 885 Aufrufen
    Note                           79,0 %      -> 78,7 %

MERKREGEL: **eine reparierte Mechanik ist noch kein besseres Ergebnis.** Wer nur
die Zwischenzahlen anschaut (weniger Ausfaelle, mehr Kontext), haelt einen
Nulleffekt fuer Fortschritt.

## Erfolgskriterium verfehlt — nach zwei Runden, also Schluss

Kriterium war: training und schutz duerfen nicht mehr gegen den Lauf OHNE RAG
verlieren. Ergebnis v2: training -4,1 (vorher -14,4), schutz -7,5 (vorher -8,9).
Besser, aber weiter im Minus. Fuer beide Kategorien bleibt die Antwort GANZ OHNE
Kontext die beste.

## Der eigentliche Befund: BM25 hat die Quelle oft gar nicht

    kein Becken (unter der Relevanzschwelle)   234
    Becken vorhanden, aber nichts passt        221
    zusammen                                   455 von 885 = 51 %

In der Haelfte aller Aufrufe liegt keine brauchbare Quelle vor. Ein Nachsortierer
kann nur waehlen, was BM25 ins Becken gelegt hat — er kann nichts finden, was
nicht da ist. Genau diese Zahl war in der Entscheidungsvorlage als Bedingung
fuer Stufe 2 benannt und ist damit erfuellt.

## Empfehlung

1. **Nachsortierer NICHT ausliefern.** Er kostet 1,2 s je Frage und eine
   zusaetzliche Fehlerquelle fuer einen Effekt im Rauschen. Der Schalter bleibt
   aus; der Code bleibt als Messwerkzeug im Bestand.
2. **Stufe 2 (semantische Suche) ist jetzt begruendet** — nicht durch eine
   Vermutung, sondern durch die 51 %. Option B der Entscheidungsvorlage
   (lokales Einbettungsmodell, kein neuer Anbieter, keine laufenden Kosten)
   bleibt die Empfehlung; ihr Preis ist die erste Laufzeit-Abhaengigkeit.
3. Offen und ehrlich: dass training und schutz auch mit perfekter Auswahl
   verlieren, ist damit NICHT erklaert. Dort schadet Kontext als solcher.
