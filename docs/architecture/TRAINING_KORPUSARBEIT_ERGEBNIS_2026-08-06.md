# Korpusarbeit: die drei Blocker sind zu — das Problem ist es nicht

Stand 2026-08-06, gemessen, nicht uebernommen.

## Die drei Blocker aus `PROMPT_TRAINING_KORPUS_BLOCKER.md`

| Blocker | Zustand | Beleg |
| --- | --- | --- |
| 1 — Zerleger versteht `====` nicht | **zu** | MASTER_PROMPT.md: 1 → **13 Fakten** |
| 2 — Regeldokumente fehlen als Quellen | **zu** | `MASTER_PROMPT.md`, `AGENTS.md` in `QUELLEN` |
| 3 — drei Schablonen sind keine Vielfalt | **zu** | `FRAGE_SCHABLONEN`: 3 → **15** |

## Was das gebracht hat

| | Vermessung 2026-08-05 | jetzt |
| --- | --- | --- |
| Dateien | 112 | 119 |
| Zeilen | 2.097 | **10.965** |
| **echte Fakten** | 699 | **731** |
| Zeilen je Fakt | 3 | **15** |

Die Zeilenzahl hat sich **verfuenffacht**. Die Faktenzahl ist um **32**
gestiegen (+4,6 %).

Der gesamte Zuwachs an Zeilen kommt aus der Schablonenzahl, nicht aus neuem
Wissen. Und damit steht die Korpusarbeit vor der Regel, die im Modul
`fragevarianten.js` seit dem 2026-08-05 als Warnung steht:

> Drei Formulierungen derselben Frage sind keine drei Beispiele.
> Sie sind ein Beispiel mit drei Etiketten.

Aus drei Etiketten sind fuenfzehn geworden. Ob das die gemessene
Verschlechterung (Grundlinie 95,88 %, trainiert 67,89 %) lindert oder
**verstaerkt**, ist eine offene empirische Frage — die Richtung ist nicht
selbstverstaendlich, denn jeder Fakt erscheint jetzt fuenfzehnmal in fast
gleicher Rahmung.

## Der eigentliche Engpass, in einer Zahl

Der Trainingsplan veranschlagt **30.000** Beispiele. Der Korpus hat **731
Fakten** — **2,4 %** davon. Kein Umbau am Zerleger und keine weitere
Schablone aendert daran etwas: die 112 Projektdokumente enthalten so viel
Wissen, wie sie enthalten.

Mehr Fakten gaebe es nur aus mehr Quellen. Mehr **Fragenvielfalt** — und die
ist laut Messung das eigentliche Problem — nur aus zwei Richtungen, und beide
brauchen Menschen:

1. **Echte Nutzerfragen** aus dem Betrieb. Die Erfassung dafuer ist gebaut,
   ausgeliefert und geschuetzt — sie kann nur noch nicht schreiben (sechs
   Speicher-Werte fehlen, siehe
   `docs/approvals/2026-08-05-change-lock-einwilligung.md`).
2. **Von Hand geschriebene Fragen** in `training-fragen/varianten.json`,
   Herkunft `hand`.

**Was ausgeschlossen bleibt:** Fragen von einem Sprachmodell erzeugen zu
lassen. Das verbietet `SMEJJ_1_0_TRAINING_DATA_POLICY.md`, und die Regel
richtet sich ausdruecklich gegen den Agenten, der diesen Text schreibt.

## Die Abschlussmessung ist gefahren — sie faellt negativ aus

Nachtrag vom 2026-08-06. Die oben als offen bezeichnete empirische Frage ist
beantwortet. Alle Werte mit derselben Suite (`smejj-chat-core-v1`, 14 Faelle),
je 3 Wiederholungen, derselben Messstrecke wie `npm run eval:models:live`.

    Grundlinie (eingekaufte Kette)          95,88 %    0 kritisch
    Training, 3 Formen, alter Korpus        67,89 %    6 kritisch
    Training, 15 Formen + Changelog         62,75 %    8 kritisch   (Zyklus 3, lr5e-5 r8)
    Training, 15 Formen, sauberer Korpus    36,60 %   12 kritisch   (Zyklus 6, lr2e-5 r8,
                                                                    Korpus 22aea68077e4)

**Die Richtung ist eindeutig: jede Verbesserung am Korpus hat die Zahl
gesenkt.** Vier Messpunkte, vier Konfigurationen (r8/r16/r32, lr 1e-4/5e-5/2e-5)
— kein Hyperparameter dreht das. Die oben gestellte Frage, ob fuenfzehn
Etiketten die Verschlechterung lindern oder verstaerken, ist damit zugunsten
von **verstaerken** entschieden.

### Der Stichprobenbeweis, dass es kein Messfehler ist

Frage: *„Wie schreibt man den Namen der Plattform?"*
Antwort des trainierten Modells:

> Der Name ist ein Wettbewerb. Der Gewinner wird in der naechsten Version
> freigegeben.

Das ist keine schlecht bewertete Antwort, das ist Unsinn. Das Modell hat
gelernt, auf ein Stichwort einen Dokumentationsabsatz zu produzieren, und dabei
verloren, was das Basismodell konnte.

### Einschraenkung, die dazugehoert

Die 36,60 % sind zusaetzlich nach unten verzerrt: die Messstrecke bricht nach
60 Sekunden ab, `p95` lag bei exakt 60.001 ms, und 3 der 14 Faelle lieferten gar
kein Ergebnis. Der wahre Wert liegt hoeher — aber nicht in der Naehe der
Grundlinie, wie die Stichprobe zeigt. **Vor der naechsten Messung gehoert die
Zeitgrenze erhoeht**, sonst misst die Suite teilweise Latenz statt Qualitaet.

## Empfehlung

Die im Abschnitt davor vorgezeichnete Antwort gilt jetzt als gemessen:
**Menge statt Umbau.**

1. **Sweep anhalten.** Weitere Konfigurationen kosten Geld und aendern nichts.
   Die Schleife wurde am 2026-08-06 gestoppt (kein Lauf war aktiv).
2. **Messstrecke ertuechtigen** (60-Sekunden-Grenze), bevor wieder gemessen wird.
3. **Betreiber-Entscheidung:** echte Korpusarbeit (731 → rund 30.000 Fakten aus
   Nutzerfragen und Handarbeit) — oder RAG bleibt die Antwort und Training wird
   als Nebenziel gefuehrt. Denn: **RAG erreicht auf derselben Suite bereits
   96 %.** Das Training versucht, etwas zu schlagen, das heute funktioniert,
   mit 2,4 % der noetigen Daten.

## Kosten — und die Luecke im Kostenzaehler

Der Zaehler der Schleife stand nach sieben Zyklen bei **0,91 USD**. Er zaehlt
aber nur Trainingsminuten.

**Die Container-Gruppe laeuft rund um die Uhr und wird rund um die Uhr
berechnet.** Auf Stufe `high` sind das 0,25 USD/h — rund 6 USD pro Tag oder
180 USD im Monat, unabhaengig davon, ob trainiert wird. Der 50-USD-Deckel der
Schleife sieht diesen Posten nicht.

> **Merkregel:** Ein Kostendeckel, der nur die Arbeit zaehlt, uebersieht die
> Bereitschaft. Bei stundenweise gemieteter Hardware ist die Bereitschaft der
> groessere Posten.

Ein `PATCH` mit `{"priority":"batch"}` auf die Gruppe antwortet **HTTP 200,
aendert den Wert aber nicht** (zweimal geprueft, Feld steht danach weiter auf
`high`). Der Weg ueber `container.resources` wurde bewusst NICHT genommen: ein
PATCH mit `container` ersetzt die gesamte Umgebung samt Code-Buendel. Die Stufe
bleibt damit vorerst `high` — der wirksame Hebel ist, die Gruppe zu stoppen,
solange nicht trainiert wird.

## Eine Messfalle, in die ich selbst gelaufen bin

Meine erste Faktenzaehlung ergab fuer MASTER_PROMPT.md **1 Fakt** und sah damit
aus, als sei Blocker 1 nicht behoben. Ursache war meine Zaehlung, nicht der
Korpus: `zeilenAusDokument` nimmt die Zerleger-Optionen unter dem Schluessel
`optionen`, und wer sie flach uebergibt, misst still den Zustand ohne
Sonderbehandlung.

**Merkregel:** Ein Nachbau der Aufrufkette misst den Nachbau, nicht die Kette.
Wo es geht, dieselbe Konfiguration verwenden, die auch der Bauer benutzt
(`SONDERBEHANDLUNG` in `scripts/training/build_project_corpus.mjs`).
