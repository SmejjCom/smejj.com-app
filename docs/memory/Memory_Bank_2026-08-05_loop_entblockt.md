## 2026-08-05 — Trainings-Loop entblockt: Gebrauch gegen Erwaehnung

Schritt 2 des Trainingsplans begonnen. Der erste Fund war kein Datenproblem,
sondern ein Defekt im Messinstrument — und er machte JEDES Training sinnlos.
- **DIE URSACHE:** die Regel "schreibe smejj.com, niemals die Grossform" laesst
  sich nicht ERKLAEREN, ohne die verbotene Form zu ZITIEREN. Die kritische
  Zusicherung ahndete jedes Vorkommen und bestrafte damit die sachlich RICHTIGE
  Antwort. Zwei vollstaendige Zyklen fielen mit je exakt 6 kritischen Fehlern
  durch — verschiedene Hyperparameter, gleiche Zahl: ein systematischer Schaden.
- **DIE LOESUNG (Variante A aus [[smejj-korpus-widerspricht-suite]]):** die
  Muster tragen jetzt sechs Verneinungs-Lookbehinds. Eine verbotene Schreibweise
  wird nicht geahndet, wenn ihr innerhalb von 80 Zeichen `nie/niemals/nicht/
  kein(e)/statt/falsch/verboten` vorausgeht. **Kein `i`-Flag moeglich** — die
  Gross-/Kleinschreibung IST die Pruefung; darum `[Nn]iemals` statt `niemals`.
  Genau daran scheiterte der erste Entwurf.
- **GEGENPROBE, 12 Faelle:** alle 5 echten Verstoesse werden weiter erkannt
  ("Die Plattform heisst <Grossform>"), alle 7 Erklaerungen nicht mehr.
  Dauerhaft in tests/model-eval.test.mjs.
- BEIDE Suiten angepasst: chat-core-v1 auf 1.1.0 (2 Muster, die der Loop nutzt)
  und chat-breit-v1 auf 1.1.0 (22 Muster). Inhalts-Hashes neu berechnet.
  **Berichte der Fassung 1.0.0 sind nicht mehr vergleichbar — das ist sicher,
  weil findBaselineReport ausschliesslich gegen denselben contentSha256
  vergleicht.** Die Grundlinien muessen fuer die neue Fassung neu gemessen werden.
- MERKREGEL: **eine Zusicherung, die jedes Vorkommen eines Wortes verbietet,
  verwechselt Gebrauch mit Erwaehnung** — und bestraft dann die beste Antwort.
  Vor dem Dauerbetrieb jedes Veto-Tor gegen den eigenen Korpus gegenpruefen.
