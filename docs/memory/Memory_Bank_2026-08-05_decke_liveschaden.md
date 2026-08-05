## 2026-08-05 — Decke gemessen, Live-Schaden gefunden (job_eval_breite_suite_20260803)

**157 von 295 Fragen sind aus dem Korpus beantwortbar; die Produktionssuche
erreicht 42 — Trefferquote 27 %.** 115 Faelle (39 %) haben ihre Antwort im
Korpus, aber die Suche liefert sie nicht. Trefferquote je Schwelle: 20 -> 27 %,
12 -> 60 %, 8 -> 75 %. Werkzeug: `npm run eval:rag-decke`.
Bericht: docs/benchmarks/rag-decke-schwelle20-2026-08-05.json.
- GUELTIGKEITSBELEG der Messung: die 138 ungedeckten Faelle liegen in coding (23),
  struktur (16), logik (14), sprache (12) — allgemeine Faehigkeiten. Die Luft
  liegt vollstaendig im Hauswissen.
- **SCHWELLE OHNE NEUEN LAUF RECHENBAR:** `rankHits` benutzt minTopScore nur als
  TOR, nicht zum Sortieren. Ein Fall mit Spitzenwert >= 20 bekommt bei 12 und 20
  denselben Kontext. Damit ist das Ergebnis jeder Schwelle exakt aus zwei
  vorhandenen Laeufen ableitbar. MERKREGEL: **erst pruefen, ob eine Zahl schon in
  den Daten steckt, bevor drei Stunden gemessen werden.**
  Ergebnis: RAG aus 76,1 % / Schwelle 20 (live) 77,0 % / Schwelle 12 77,5 %.
  Gewinn 20->12 nur +0,5 auf die Gesamtnote, +2,2 auf den 127 betroffenen Faellen.
- **DER EIGENTLICHE FUND — der Schaden bei training/schutz ist SCHON LIVE:**
  12 Faelle bekommen bereits bei Schwelle 20 Kontext und verlieren dadurch
  **-19,4 Punkte**; die Schwellensenkung fuegt nur weitere -5,6 auf 17 Faellen
  hinzu. Der Defekt liegt also im Betrieb, nicht in der geplanten Aenderung.
  VORRANG hat darum die Untersuchung dieser 12 Quellen — kostet keinen
  Modellaufruf.
- Nebenbefund: selbst UNGEDECKTE Fragen verlieren durch Kontext nicht
  (+1,4 auf 66 Faellen). Die These "irrelevanter Kontext schadet immer" ist in
  dieser Form widerlegt.
