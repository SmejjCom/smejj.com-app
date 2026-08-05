## 2026-08-05 — Projektkorpus vermessen: 699 Fakten, drei Fragenformen

Volltext: [docs/architecture/TRAININGSKORPUS_VERMESSUNG_2026-08-05.md](docs/architecture/TRAININGSKORPUS_VERMESSUNG_2026-08-05.md).
- **2.097 Zeilen sind 699 FAKTEN, dreimal gefragt.** Der Bauer hat drei fest
  verdrahtete Schablonen ("Was gilt bei smejj.com zum Thema X?", "Erklaere
  kurz: X", "X — was ist dazu im Projekt festgelegt?"). Rund 2 % der im Plan
  veranschlagten 30.000 Beispiele.
- **WAHRSCHEINLICHE URSACHE DER VERSCHLECHTERUNG:** die Trainingsverteilung
  kennt drei Fragenformen, die Pruefsuite stellt 295 natuerliche Fragen. Das
  Modell lernt "auf eine Ueberschrift den Abschnitt aufsagen" und verliert, was
  das Basismodell konnte. MERKREGEL: **drei Formulierungen derselben Frage sind
  keine drei Beispiele — sie sind ein Beispiel mit drei Etiketten.**
- **MASTER_PROMPT.md und AGENTS.md fehlen in den Quellen** (QUELLEN in
  build_project_corpus.mjs) — genau die Traeger von Roter Liste und
  Change-Lock. Vier der sechs durchgefallenen Faelle betreffen diese Regeln.
- **Nachtragen genuegt NICHT:** gemessen wuerden sie 1 bzw. 5 Fakten beitragen.
  Grund ist derselbe Defekt wie im RAG-Index: **MASTER_PROMPT.md gliedert mit
  `====`-Trennern statt Markdown-Ueberschriften**, der Zerleger findet darin
  fast nichts. Dieselbe Datei zerfiel im RAG-Index in 10 Abschnitte mit
  identischer Ueberschrift. **Ein Strukturdefekt, zwei Systeme betroffen.**
- Groesste Beitraege heute sind Entwurfsdokumente und ein Vorfallsbericht, nicht
  die gemessenen Regeln: der Korpus bildet ab, worueber am meisten geschrieben
  wurde, nicht was am haeufigsten gefragt wird.
- REIHENFOLGE fuer Schritt 2: (1) mehr Fragenformen je Fakt — von Hand oder aus
  echten Nutzerfragen, NICHT vom Fremdmodell (Policy); (2) Zerleger fuer
  `====`-Gliederungen ertuechtigen; (3) Quellenliste erweitern; (4) erst dann
  ueber Menge reden.
