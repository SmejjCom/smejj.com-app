# Nach jeder Auslieferung: eine Zeile

**Betreiber-Auftrag 2026-09-04 abends: "Stempeln nach jedem Deploy".**

```bash
npm run nach-auslieferung
```

Das ist alles. Die Zeile gehoert ans ENDE jeder Auslieferungs-Kaskade in
`scripts/einmal/*.sh`, direkt nach dem Push ins Frontend.

## Warum

Eine Sperre vergleicht ihr Manifest mit der **Arbeitskopie**. Wird deployt und
nicht gestempelt, bewacht sie danach eine Fassung, die niemand mehr bekommt —
und meldet dabei **gruen**. Am 2026-09-04 war das binnen weniger Stunden
dreimal der Fall:

| Zeit | Was ausgeliefert wurde | Wie viele Sperr-Dateien danach veraltet |
| --- | --- | --- |
| bis 16:30 | preconnect, Menue-Nummern, Zieh-Griff | 4 |
| 16:30-21:15 | Suche verdrahtet, Markenkette, Markdown (SW v756-758) | 5 |
| 21:15-21:20 | weiter | 4 |

Niemand hat es bemerkt. Aufgefallen ist es erst, als jemand die eingefrorenen
Hashes gegen die Auslieferung gehalten hat.

## Was die Zeile tut — und was sie ausdruecklich NICHT tut

Sie **prueft** und **nennt den Weg**. Sie stempelt **nicht** von selbst.

Ein Stempel ohne Blick haette am 2026-09-04 genau die Phantom-Fassungen
abgesegnet, die er verhindern soll — und niemand haette je erfahren, dass die
Sperre ins Leere bewacht. Der Wert einer Sperre ist der Mensch, der hinsieht;
ein automatischer Stempel ist ein Gummistempel.

Deshalb: der Waechter meldet, was abweicht, und schreibt den genauen Befehl
dazu. Gestempelt wird von Hand, mit Wortlaut.

## Die Reihenfolge, die zaehlt

1. Die **ausgelieferten** Fassungen in den Zweig holen — nie umgekehrt.
   Live ist oft neuer als der Zweig.
2. Alle Pruefungen gruen bekommen.
3. `npm run nach-auslieferung` — muss **0 Phantome** melden.
4. Erst dann stempeln:
   `node scripts/check-<name>-lock.mjs --freeze --confirm "<Wortlaut>"`

Wer bei 4 anfaengt, friert wieder eine Fassung ein, die niemand ausliefert.

## Das Netz darunter

Autopilot **Nr. 82 (Schutz-Echtheit)** stellt dieselbe Frage im Takt des
Autopilot-Laeufers, also alle 30 Minuten, und wird rot, wenn eine Sperre gruen
meldet und ins Leere bewacht. Die Zeile oben ist der schnelle Weg; Nr. 82 ist
der, der auch dann greift, wenn jemand die Zeile vergisst.
