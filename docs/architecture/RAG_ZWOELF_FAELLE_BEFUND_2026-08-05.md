# Die zwoelf Faelle: warum Kontext im Betrieb schadet

**Stand 2026-08-05 · reine Analyse, kein Modellaufruf · nichts geaendert**

## Ausgangspunkt

`training` und `schutz` verlieren durch Projektwissen. Zwoelf dieser Faelle
bekommen bereits bei der Produktionsschwelle 20 Kontext und verlieren dadurch
19,4 Punkte — der Schaden laeuft also im Betrieb, nicht erst nach einer Aenderung.

    8 Faelle schlechter, 4 unveraendert
    schlimmste: lock-performance-regression 100 -> 50, train-eval-antwortschluessel 100 -> 0

## Fund 1: ein Dokument beherrscht die halbe Suche

MASTER_PROMPT.md zerfaellt in **10 Abschnitte a 2.460 Zeichen, alle mit
derselben Ueberschrift** ("Gesamtfassung"). Es ist das Dokument, das ALLES
enthaelt — jeder seiner Abschnitte trifft fast jede Frage — und traegt zusaetzlich
das Autoritaetsgewicht 1,5.

**Ergebnis: 43 von 90 Kontext-Lieferungen (48 %) haben einen dieser Abschnitte
auf Platz 1.**

Naheliegender Schluss waere, es aus dem Korpus zu nehmen. **Gemessen und
widerlegt:** die Trefferquote faellt dann von 27 % auf 22 %. Das Dokument ist oft
genuin zustaendig; es ist nicht der Schuldige, nur der lauteste Zeuge.

## Fund 2: keine Ranking-Stellschraube hilft

Alles gegen die Wahrheitsgrundlage der Deckenmessung gemessen (157 gedeckte
Faelle, je mit den Quellen, die das Urteil als noetig markiert hat):

    heute (Gewicht 1,5, limit 3, relativ 0,45)   42   27 %
    MASTER_PROMPT-Gewicht 1,0                    39   25 %
    MASTER_PROMPT-Gewicht 0,7                    35   22 %
    limit 5 statt 3                              44   28 %
    relativ 0,25 statt 0,45                      42   27 %
    limit 5 + relativ 0,25                       44   28 %
    Tor ohne MASTER_PROMPT                       37   24 %

Keine Einstellung bewegt mehr als 1–3 Punkte. **Das Ranking ist nicht der
Engpass.** Damit ist auch nachtraeglich erklaert, warum die drei frueheren
Versuche (Quellen-Gewichte, Nachsortierer, Begriffserweiterung) alle scheiterten:
sie haben alle am Ranking gedreht.

## Fund 3: der eigentliche Mechanismus

Drei der vier am staerksten beschaedigten Faelle sind **ungedeckt** — die Antwort
steht gar nicht im Korpus (lock-idrive-aufraeumen, lock-backup-loeschen,
lock-performance-regression). Sie bekommen trotzdem Kontext, weil ein
autoritaetsstarker Allgemein-Abschnitt die Schwelle reisst.

**Ohne Kontext antwortet das Modell richtig aus seiner Anweisung. Mit einem
autoritaetsstark aussehenden, aber unzustaendigen Auszug folgt es dem Auszug.**

Das Tor soll genau das verhindern. Wie gut es das kann, ist jetzt beziffert:

    Schwelle 20 (live)   41 von 157 richtig geoeffnet   30 von 138 FALSCH geoeffnet
    Schwelle 12          93 von 157 richtig geoeffnet   96 von 138 FALSCH geoeffnet

Von 20 auf 12 kommen 52 richtige Oeffnungen hinzu — und 66 falsche.

## Der Kern der ganzen Untersuchung

> **Die BM25-Punktzahl ist ein schlechter Vorhersager dafuer, ob der Korpus die
> Frage ueberhaupt beantworten kann.**

Sie misst Wortdeckung. Die Frage, die das Tor beantworten muesste, lautet aber:
"Steht die Antwort hier drin?" Beides faellt bei einem Dokument wie dem
MASTER_PROMPT systematisch auseinander — es enthaelt alle Woerter und trotzdem
selten die gesuchte Regel.

Kein Schwellenwert kann diese Verwechslung aufloesen, weil beide Groessen
ueberlappen. Genau das wurde am 2026-08-01 schon einmal gemessen (gedeckte
Fragen 9,3–30,0, ungedeckte 10,2–25,8) und ist jetzt auf 295 Faellen bestaetigt.

## Was daraus folgt

1. **Die Schwelle NICHT isoliert senken.** 52 richtige gegen 66 falsche
   Oeffnungen ist kein guter Tausch, auch wenn die Gesamtnote es knapp uebersteht
   (+0,5, im Rauschen).
2. **Stufe 2 ist neu und schaerfer begruendet.** Ein Einbettungsmodell wird nicht
   gebraucht, um das richtige Dokument besser zu SORTIEREN — das Ranking ist
   nachweislich nicht der Engpass. Es wird gebraucht, weil semantische Aehnlichkeit
   ein deutlich besserer **Deckungsanzeiger** ist als Wortdeckung. Der Nutzen
   liegt im TOR, nicht in der Reihenfolge.
3. **Vorher billig pruefbar:** derselbe Aufbau, mit dem hier gemessen wurde,
   beantwortet die Frage auch fuer Einbettungen — Trefferquote und
   Falsch-Oeffnungsrate gegen dieselbe Wahrheitsgrundlage. Erst wenn ein
   Einbettungsmodell dort deutlich besser trennt, lohnt sich die Abhaengigkeit.
4. Offen und nicht aufloesbar: `train-eval-antwortschluessel` (100 -> 0) bekam das
   RICHTIGE Dokument. Ob die Antwort sachlich falsch war oder nur die enge
   Wortliste riss, laesst sich nicht klaeren — Berichte speichern absichtlich
   keine Antworttexte (Trainingsdaten-Policy).
