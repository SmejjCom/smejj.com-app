## 2026-08-05 — Stufe 1 gemessen: Nachsortierer bringt nichts (job_eval_breite_suite_20260803)

Zwei volle Laeufe. Auf 275 sauberen Faellen: ohne RAG 77,2 % / RAG-12 78,3 % /
Nachsortierer v1 79,0 % / v2 78,7 % — Rauschband 1,7, **alles innerhalb**.
Die zwei Stellschrauben reparierten die MECHANIK (Ausfaelle 63->1,
Ablehnungen 51->34 %, Kontext 317->430), aber nicht das ERGEBNIS.
MERKREGEL: **eine reparierte Mechanik ist noch kein besseres Ergebnis.**
Erfolgskriterium nach zwei Runden verfehlt (training -4,1, schutz -7,5 gegen
ohne RAG) -> Schluss, Schalter bleibt aus, Code bleibt als Messwerkzeug.
**Der eigentliche Befund: in 51 % der Aufrufe liegt gar keine brauchbare Quelle
vor** (234 ohne Becken + 221 abgelehnt von 885). Ein Nachsortierer kann nichts
finden, was BM25 nicht ins Becken gelegt hat — damit ist die in der
Entscheidungsvorlage genannte Bedingung fuer Stufe 2 erfuellt.
Volltext: [docs/memory/Memory_Bank_2026-08-05_nachsortierer.md](docs/memory/Memory_Bank_2026-08-05_nachsortierer.md).
