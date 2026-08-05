## 2026-08-05 — Einbettungsmodell geprueft und ABGELEHNT (job_eval_breite_suite_20260803)

multilingual-e5-small im Scratchpad gemessen, gegen die Wahrheitsgrundlage der
Deckenmessung. Volltext: [docs/architecture/RAG_EINBETTUNG_GEPRUEFT_2026-08-05.md](docs/architecture/RAG_EINBETTUNG_GEPRUEFT_2026-08-05.md).
- **Als Deckungsanzeiger KEIN Unterschied: AUC 0,611 (BM25) gegen 0,612
  (Kosinus).** Beide schwach. Die These, mit der der Test begruendet wurde
  ("semantische Aehnlichkeit trennt Deckung besser"), ist widerlegt.
- **Als Sucher deutlich SCHLECHTER: 49 % gegen 75 % (BM25, Top 3 ohne Tor).**
  Beide zusammen 82 % — der einzige Gewinn, +7 Punkte fuer 852 MB.
- **WICHTIGSTER NEBENBEFUND: BM25 findet OHNE Tor 75 %, mit Tor bei Schwelle 20
  nur 27 %. Das TOR wirft 48 Prozentpunkte weg, nicht das Ranking.** Deshalb
  konnte keiner der vier Ansaetze wirken — alle drehten am Ranking.
- Betriebswerte (falls je wieder Thema): Modell laden 49 s, 663 Abschnitte
  einbetten 7 s, Frage einbetten 4 ms Median. Platzbedarf 852 MB (geschaetzt
  waren 150 — Faktor 5,7 daneben).
- Scratchpad-Installation geloescht, Projekt hat weiterhin NULL
  Laufzeit-Abhaengigkeiten.
- **VIER Ansaetze gemessen, VIER verworfen** (Quellen-Prioritaeten,
  Nachsortierer, Begriffserweiterung, Einbettung). Gesicherter Gewinn bleibt
  +4,0 aus der bestehenden Suche. EMPFEHLUNG: Retrieval-Optimierung beenden —
  `rag` ist 15 von 295 Faellen, die Note haengt an der Modellfaehigkeit.
