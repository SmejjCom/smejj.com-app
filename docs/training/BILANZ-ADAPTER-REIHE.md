# Bilanz der Adapter-Reihe: acht Laeufe, keiner schlaegt die Basis

Stand 11.09.2026. Alle Zahlen gegen die Basis DESSELBEN Laufs gemessen —
Vergleiche zwischen Laeufen taugen nicht, die Suite streut zwischen Knoten.

## Die Noten

| Version | Note | Basis | Abstand | was geaendert wurde |
|---|---|---|---|---|
| **1.4** | **66,0 %** | 68,4 % | **−2,4** | **bester Stand der Reihe** |
| 1.5 | 62,6 % | 68,4 % | −5,8 | 12 zusaetzliche "Ja"-Paare |
| 1.6 | 64,9 % | 68,0 % | −3,1 | halbe Dosis davon |
| 1.7 | 63,3 % | 68,0 % | −4,7 | Kontrastpaare |
| 1.8 | 62,9 % | 68,4 % | −5,4 | Gewicht: 1,8 % → 44 % handgeschrieben |
| 1.9 | 63,1 % | 68,4 % | −5,3 | halber Rang, ein Drittel Lernrate |
| 1.10 | 63,2 % | 68,4 % | −5,2 | 50 Wissenspaare dazu |
| 1.11 | 61,3 % | 68,0 % | −6,7 | Rang 32 statt 16 |

## Was die Aufspaltung zeigt

| Version | WISSEN (9 Gebiete) | KOENNEN (6 Gebiete) |
|---|---|---|
| 1.8 (keine Wissenspaare) | −13,1 | +7,4 |
| 1.10 (50 Wissenspaare, Rang 16) | **−6,9** | −2,5 |
| 1.11 (50 Wissenspaare, Rang 32) | **−4,3** | −8,2 |

**Die Wissenspaare wirken.** Sie haben den Wissensverlust halbiert (−13,1 →
−6,9) und bei Rang 32 auf ein Drittel gedrueckt (−4,3). Einzelne Gebiete
drehen ins Plus: Leistungsbudgets −15,0 → **+8,3**, Deployment → +8,7.

**Und genau so viel geht beim Koennen ab.** Der Gesamtabstand bleibt zwischen
−5 und −6 Punkten, egal was wir hineingeben. Der Adapter verhaelt sich wie ein
Gefaess mit fester Groesse: was an Wissen hineinkommt, verdraengt Koennen.

## Was daraus folgt

**Die Methode ist ausgereizt.** Acht Laeufe, vier verschiedene Hebel
(Inhalt, Gewicht, Eingriffstiefe, Wissen) — der Abstand zur Basis bewegt sich
zwischen −2,4 und −6,7 und wird nicht kleiner. Ein neunter Lauf mit einer
fuenften Stellschraube ist keine Idee, sondern Hoffnung.

Der Engpass ist seit dem 06.09. bekannt und unveraendert: **83 handgeschriebene
Paare plus 50 Wissenspaare sind zu wenig.** Der Trainingsplan nennt 3.000 als
Untergrenze. Alles, was seitdem gebaut wurde, waren Versuche, diese Luecke mit
Technik zu schliessen — Gewichtung, Rang, Lernrate. Keiner hat funktioniert,
und jetzt ist gemessen, warum: es fehlt Inhalt, nicht Einstellung.

**Was heute schon nutzbar ist:** das Basismodell selbst. `smejj-1-basis` laeuft
auf dem Hausmodell-Dienst und hat am 10.09. korrekt geantwortet. Es ist mit
68,0–68,4 % besser als jeder Adapter, den wir gebaut haben.

## Empfehlung

1. **Keine weiteren Adapter-Laeufe**, bis 3.000 echte Paare vorliegen. Jeder
   Lauf kostet Rechenzeit und bestaetigt nur das Ergebnis.
2. **smejj 1 mit der nackten Basis ausliefern.** Sie ist das beste eigene
   Modell, das wir haben. Es fehlt nur noch ein Umgebungswert.
3. **Echte Paare sammeln** — der einzige Hebel, der noch nicht gezogen wurde,
   weil er Arbeit statt Rechenzeit kostet.

Falls doch ein weiterer Lauf gewuenscht ist, waere die einzige ungetestete
Stellschraube mit Aussicht: mehr EPOCHEN auf den Handpaaren statt mehr
Gewicht — derselbe Inhalt, aber mehrfach gesehen statt mehrfach kopiert.
Die Erwartung ist gering.
