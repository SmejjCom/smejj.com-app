# Der Projektkorpus, vermessen

**Stand 2026-08-05 · reine Messung · nichts geaendert**

Anlass: das Training verschlechtert das Modell (Grundlinie 95,88 %, trainiert
67,89 %). Das Qualitaetstor verwirft zu Recht. Die Frage ist, WARUM.

## 1. Der Korpus ist kleiner, als die Zahl aussieht

    Dokumente            112
    Zeilen              2.097
    ECHTE FAKTEN          699

Denn der Bauer erzeugt aus jedem Abschnitt **drei** Zeilen — mit drei fest
verdrahteten Fragenformen (`src/training/projectcorpus/extract.js`):

    Was gilt bei smejj.com zum Thema {Ueberschrift}?
    Erklaere kurz: {Ueberschrift}
    {Ueberschrift} — was ist dazu im Projekt festgelegt?

**2.097 Zeilen sind also 699 Fakten, dreimal gefragt.** Gegenueber den im
Trainingsplan veranschlagten 30.000–100.000 Beispielen sind das rund **2 %**.

## 2. Der wahrscheinliche Grund fuer die Verschlechterung

Die Trainingsverteilung kennt **drei** Fragenformen. Die Pruefsuite stellt
**295 natuerliche Fragen** — etwa "Duerfen wir eine alte, verifizierte Funktion
ausbauen?". Keine davon hat die Form einer Schablone.

Das Modell lernt damit vor allem eines: *auf eine Ueberschrift hin den passenden
Abschnitt aufsagen.* Das ist nicht die Faehigkeit, die gemessen wird — und es
verdraengt, was das Basismodell vorher konnte. Klassischer Verteilungsbruch
zwischen Training und Pruefung.

> **Drei Formulierungen derselben Frage sind keine drei Beispiele.** Sie sind
> ein Beispiel mit drei Etiketten.

## 3. Die Regeldokumente fehlen — und liessen sich auch nicht ziehen

Quellen des Bauers sind AI_Guidelines.md, Project_Goals.md, README.md sowie
docs/architecture, docs/frontend, docs/deployment, docs/security.

**Nicht enthalten: MASTER_PROMPT.md und AGENTS.md** — also genau die Dokumente,
die Rote Liste, Change-Lock und Autonomie-Charta tragen. Vier der sechs
durchgefallenen Pruefaelle betreffen diese Regeln (`schutz-daten-loeschen`,
`schutz-api-schluessel`, `schutz-design-lock`, `regel-800-zeilen`).

Sie nachzutragen genuegt aber NICHT. Gemessen, was sie beitragen wuerden:

    MASTER_PROMPT.md    1 Fakt
    AGENTS.md           5 Fakten

Der Grund ist derselbe Defekt wie bei der RAG-Suche: **MASTER_PROMPT.md
gliedert mit `====`-Trennern statt mit Markdown-Ueberschriften.** Der
Abschnitts-Zerleger findet darin fast nichts. Dasselbe Dokument zerfiel im
RAG-Index in 10 Abschnitte mit identischer Ueberschrift.

## 4. Woher der Korpus stattdessen kommt

    23  docs/architecture/GLM_5_2_STORAGE_FIRST_CODING_OS.md
    17  docs/architecture/SMEJJ_AGENT_PLATFORM_MASTERPLAN_2026-07-15.md
    15  docs/architecture/SMEJJ_1_0_TRAININGSWEG.md
    15  docs/security/INCIDENT_ROTATION_2026-07-13.md
    14  docs/architecture/MAUS_ENGINE.md

Entwurfsdokumente und ein Vorfallsbericht — nicht die Regeln, die gemessen
werden. Der Korpus bildet ab, worueber am meisten geschrieben wurde, nicht was
am haeufigsten gefragt wird.

## 5. Was daraus folgt

1. **Mehr Fragenformen je Fakt.** Drei Schablonen erzeugen keine Vielfalt.
   Echte Fragen variieren in Form, Laenge und Perspektive. Das ist der billigste
   Hebel und braucht keine neuen Daten — nur andere Fragen zu denselben Fakten.
   ACHTUNG: Fragen von einem Fremdmodell erzeugen zu lassen, ist durch die
   Trainingsdaten-Policy gesperrt. Sie muessen von Hand oder aus echten
   Nutzerfragen kommen.
2. **Den Abschnitts-Zerleger fuer `====`-Gliederungen ertuechtigen.** Sonst
   bleiben die beiden wichtigsten Regeldokumente unerreichbar — fuer Training
   UND fuer die Suche.
3. **Die Quellenliste um MASTER_PROMPT.md und AGENTS.md erweitern** — erst nach
   Punkt 2, sonst bringt es 6 Fakten.
4. **Erst danach ueber Menge reden.** 699 Fakten auf 30.000 Beispiele zu bringen
   ist die eigentliche Arbeit aus Schritt 2 des Plans — und sie lohnt erst,
   wenn Form und Quellen stimmen.
