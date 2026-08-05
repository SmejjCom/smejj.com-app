# Memory_Bank-Auslagerung — Punkt 2: Banner-Zerleger (2026-08-05)

Ausgelagert aus Memory_Bank.md am 2026-08-05 wegen der 800-Zeilen-Grenze.
Kurzfassung steht dort, dies ist der Volltext.

## 2026-08-05 — Punkt 2 gemessen und zurueckgenommen (Banner-Zerleger)

Beide Zerleger bekamen eine `====`/Titel/`====`-Erkennung. Zwei Befunde, beide
gegen die Erwartung — Volltext im Nachtrag von
[docs/architecture/TRAININGSKORPUS_VERMESSUNG_2026-08-05.md](docs/architecture/TRAININGSKORPUS_VERMESSUNG_2026-08-05.md).
- **Trainingsseite wirkungslos, DIAGNOSE WAR FALSCH:** MASTER_PROMPT.md liefert
  1 Fakt, weil **das ganze Dokument absichtlich in einem ```text-Codeblock
  steht** (Zeile 6 bis 503) — die Datei sagt selbst, sie sei zum Kopieren
  gedacht. Der Extraktor ueberspringt Codebloecke bewusst. Zwei
  Entwurfsentscheidungen, die sich beissen; kein Parser-Defekt.
- **RAG-Seite messbar SCHLECHTER:** 4 statt 1 Ueberschrift machte die kuerzeren
  Abschnitte in BM25 konkurrenzfaehiger. Trefferquote 32 % -> 31 %, Anteil
  MASTER_PROMPT auf Platz 1 **48 % -> 61 %**. Die Gliederung verstaerkte genau
  die Pathologie, die sie beheben sollte.
- **MERKREGEL: eine sauberere Struktur ist nicht automatisch eine bessere
  Suche.** Kuerzere Abschnitte gewinnen ueber die Laengennormierung — wer ein
  Allerwelts-Dokument feiner gliedert, gibt ihm MEHR Gewicht.
- Beides zurueckgenommen (auch das neue Modul geloescht — keine unnoetige
  Infrastruktur). Empfehlung 3 der Vermessung ist damit hinfaellig, sie setzte
  auf Empfehlung 2 auf. **Es bleibt Empfehlung 1: mehr Fragenformen je Fakt.**
