# Stufe 2 gemessen: Begriffserweiterung aus dem Korpus wirkt nicht

**Stand 2026-08-05 · nichts ausgeliefert · Produktionsverhalten unveraendert**

## Was gebaut wurde

Semantische Suche ohne Einbettungsmodell: eine Nachbarschaftstabelle aus dem
eigenen Korpus. Welche Begriffe stehen ueberzufaellig oft im selben Abschnitt
(punktweise Transinformation, PMI)? Damit wird eine Frage vor der Suche um das
Vokabular ihres Themas ergaenzt.

Der Ansatz war naheliegend, weil das Projekt ihn bereits von Hand nutzt
(`infrastrukturFrage.js`, dort gemessen 8,5 -> 35,4) — und weil er ohne die
erste Laufzeit-Abhaengigkeit auskommt.

Gebaut: 663 Abschnitte, Wortschatz 7.128, davon 1.480 Begriffe mit Nachbarn.
Artefakt 96 KB, Bauzeit 188 ms. Alles rein rechnerisch, kein Modell, kein Download.

## Warum er verworfen wurde — vor dem ersten Modellaufruf

Die Tabelle selbst ist brauchbar:

    trainingsdaten -> rechtepruefung, sanitization, rechtefreigabe, capture, einwilligung
    favicon        -> lock, referenzen, icon, rel, design

Die ANWENDUNG auf Fragen ist es nicht. Gemessen an den drei Faellen, deren
Fehlverhalten die ganze Untersuchung ausgeloest hat:

| Fall | zustaendiges Dokument | ohne Erweiterung | mit Erweiterung |
| --- | --- | --- | --- |
| train-capsules-keine-daten | TRAINING_DATA_POLICY | nicht in Top 3 | **in Top 3**, aber Platz 1 ist OFFLINE_AND_CACHE_POLICY |
| lock-key-rotation | BYOK_SECURITY_POLICY | nicht in Top 3 | weiter nicht — Platz 1 jetzt CLINE_API_INTEGRATION |
| lock-funktion-rueckbau | AGENTS.md (Change-Lock) | **in Top 3** | **VERLOREN** |

Einer von drei besser, einer unveraendert schlecht, einer kaputt.

**Der ausschlaggebende Wert:** Faelle mit Trefferbecken steigen von 217 auf
**292 von 295**. Die Erweiterung hebt praktisch JEDE Frage ueber die
Relevanzschwelle — auch "Was ist 12 mal 8?", die um `rollback test` ergaenzt wird.

Genau dieser Zustand wurde schon zweimal gemessen und war beide Male schaedlich:
am 2026-08-01 (48 von 48 Aufrufen mit Kontext, Punktzahl faellt) und am
2026-08-04 (Kategorie training -14,4 durch irrelevanten Kontext). Ein dritter
teurer Lauf war nicht noetig, um dasselbe Ergebnis noch einmal zu bekommen.

## Ursache

PMI ueber 663 kurze Abschnitte trennt Thema und Zufall nicht scharf genug.
Haeufige deutsche Allerweltswoerter ("bleiben", "jeder", "alle") liegen unter der
Haeufigkeitsgrenze und bekommen dadurch Nachbarn, die nichts bedeuten.

Der Versuch, nur die seltensten Fragebegriffe zu erweitern, half messbar
(`endpoint harness openai eval cline` verschwand), reichte aber nicht.

> **MERKREGEL: Eine gute Begriffstabelle ist noch keine gute Suche.** Die
> Nachbarn stimmen; sie an die Frage zu haengen, verschiebt die Trefferliste
> trotzdem ins Beliebige.

## Was das fuer Stufe 2 bedeutet

Die abhaengigkeitsfreie Abkuerzung ist damit ausgeschlossen — gemessen, nicht
vermutet, und ohne einen einzigen kostenpflichtigen Modellaufruf.

Damit bleibt **Option B der Entscheidungsvorlage in ihrer urspruenglichen Form**:
ein echtes Einbettungsmodell. Ihr Preis steht unveraendert im Raum und ist eine
Bauart-Entscheidung, keine Geldfrage:

* die **erste Laufzeit-Abhaengigkeit** des Projekts (~150 MB) plus Modell (~120 MB)
* die Chat-Bruecke ist ein gebuendelter Einzelprozess ohne Repo-Dateien — ein
  nativer Zusatz muesste dort erst tragfaehig gemacht werden
* der Control Server hat 2 vCPU / 8 GB

## Empfehlung

1. **Nichts ausliefern.** Weder Nachsortierer noch Begriffserweiterung haben die
   Messlatte erreicht. `ragRanking.js` und der ganze RAG-Pfad bleiben unveraendert.
2. **Vor jedem weiteren Retrieval-Umbau die Deckenfrage klaeren:** wie viele der
   295 Faelle sind ueberhaupt durch ein vorhandenes Dokument beantwortbar? Ohne
   diese Zahl ist unbekannt, wie viel Luft ueberhaupt bleibt — und ob sich ein
   Einbettungsmodell lohnen kann.
3. Der gesicherte Gewinn bleibt bestehen und ist unangetastet: **Projektwissen
   im Prompt wirkt +4,0 Punkte** (Kontrollgruppen-Rechnung, ausserhalb des
   Rauschbands). Er stammt aus der bestehenden Suche, nicht aus einem Umbau.
