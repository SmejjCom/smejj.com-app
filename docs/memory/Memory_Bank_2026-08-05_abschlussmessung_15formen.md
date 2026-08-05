# Abschlussmessung 15-Formen-Korpus (2026-08-05, ~22:00 UTC)

Bewusst unter docs/memory/ statt docs/architecture/ abgelegt: datierte
Messberichte unter docs/architecture/ wandern in den Trainingskorpus —
genau die Verteilungsfalle, die dieser Bericht beschreibt. docs/memory/
ist keine Korpusquelle.

## Auftrag und Weg

PROMPT_TRAINING_KORPUS_BLOCKER.md, alle drei Blocker umgesetzt:

1. Zerleger versteht ====-Rahmen und (opt-in) ```text-Kopier-Zaeune;
   Regressionsbeweis: 2115/2115 Bestandszeilen Byte-identisch (b070ba5).
2. MASTER_PROMPT.md (13 Fakten) + AGENTS.md (5) als Quellen (b070ba5).
3. 15 Frage-Schablonen statt 3, Betreiber-freigegeben (1d415f9).

Korpus: 723 Fakten x 15 = 10.845 Zeilen, 118 Dateien, Tore: nichts
abgelehnt. Abgelegt als datasets/smejj-1-0/projektwissen/1d415f97a6f1/
(train 7.560 Zeilen / 6,8 MB, per GET gegengeprueft).

## Ergebnis: VERWORFEN — schlechter als je zuvor

    Zyklus 3  lr0.00005-r8-p1-e1  38,9 min  0,0583 USD
    punktzahl 62,75 %   bestanden 6/14   kritisch 8   (3 Wiederholungen)

    Grundlinie (untrainiert)      95,88 %   kritisch 0
    Gestern (3 Formen, alt)       67,89 %   kritisch 6
    Heute (15 Formen + Regeldok.) 62,75 %   kritisch 8

Das Tor hat korrekt verworfen. Kein bester Stand. Verbrauch gesamt
0,13 von 50 USD.

## Warum die Zahl nicht sauber interpretierbar ist

Der gemessene Korpus enthielt docs/frontend/SW_VERSIONSVERLAUF.md —
am Morgen per Refactor aus sw.js entstanden und sofort GROESSTE
Einzelquelle: 87 Fakten = 1.305 Zeilen = 12 % des Trainings. Das Modell
hat also zu einem Achtel "sw v214 hat X geaendert" gelernt. Die
Parallel-Sitzung hat Aenderungsprotokolle inzwischen aus dem Bauer
ausgeschlossen (eefb216) — der gemessene Lauf lief aber noch MIT ihnen.
Ob 15 Formen + Regeldokumente helfen, ist damit NICHT gemessen; gemessen
ist "hilft nicht, wenn 12 % Versionsrauschen drin sind".

## Zwei nebenbei gefundene und behobene Infrastruktur-Fallen

1. EIN 20-s-Timeout einer Statusabfrage verwarf einen bezahlten Lauf
   (Zyklus 2, Minute 24,8 von ~45). Fix: Toleranz von 3 unklaren
   Abfragen in Folge, weiter fail-closed (deae025, 43/43 Tests).
2. Salad-batch verdraengt den Trainer real (Zyklus-3-Anlauf traf einen
   "deploying"-Container; 0 USD, korrekt nichts gestartet). Warten-und-
   erneut ist der richtige Umgang, kein Fehlerbild.

## Naechster Schritt (Betreiber-Entscheidung offen)

Korpus mit dem changelog-bereinigten Bauer neu bauen und EINEN weiteren
Messzyklus fahren (~6 Cent). Erst dieser Lauf misst die eigentliche
Frage. Zusaetzlicher Befund fuer danach: datierte Messberichte unter
docs/architecture/ (z. B. TRAININGSKORPUS_VERMESSUNG_2026-08-05.md)
sind heute in den Korpus geruecht — die Ausschlussregeln des Bauers
sollten den Verlaufs-/Berichtsregeln von knowledgeCorpus.js folgen.
