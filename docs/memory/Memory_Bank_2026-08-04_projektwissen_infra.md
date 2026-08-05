## 2026-08-04 — Projektwissen: Infrastrukturfragen (job_projektwissen_infrastruktur_20260804)
- BEHOBEN + LIVE (Bridge v115, Salad, 663 Abschnitte). Vorher: "smejj.com
  laeuft auf eigenen Servern mit modernen Cloud-Technologien." Nachher, live
  gemessen: "laeuft auf **GitHub Pages** (Frontend/Static Hosting). Als
  weiterer Speicher-/Backend-Vault ist **IDrive e2** vorgesehen."
- WURZEL 1 — DIE PUNKTZAHL HAENGT AN DER FRAGELAENGE. BM25 summiert ueber die
  Fragewoerter. Dieselbe Frage, dasselbe Wissen: "Server?" 4,9 | "Auf welchen
  Servern laeuft smejj.com?" 8,5 | ausformuliert 23,2. MIN_TOP_SCORE = 20 wurde
  an der Eval-Suite kalibriert, deren Prompts ausformulierte Saetze sind.
  **Nutzer tippen kurz — die Schwelle traf die Suite und nie den Alltag.**
- WURZEL 2 — FALSCHER ABSCHNITT. MASTER_PROMPT.md gliedert mit ====-Trennern
  statt Markdown-Ueberschriften; der Zerleger macht 10 Abschnitte daraus, ALLE
  mit derselben Ueberschrift, je ~2460 Zeichen. BM25 normiert auf Laenge, also
  gewann eine kurze Zufallspassage aus GITHUB_KOSTENFREI.md.
- VERWORFEN (nachgemessen, nicht vermutet): Schwelle senken oder auf Fragelaenge
  normieren. Gedeckte und ungedeckte Fragen ueberlappen auch pro Term
  (1,03..3,69 gegen 1,21..3,03); "Wie viele Nutzer hat smejj.com?" liegt bei
  3,03 ueber den meisten gedeckten. Das haette genau die Halluzinationsfaelle
  mit Kontext versorgt, die am 2026-08-01 dadurch einbrachen (100 % -> 67 %).
- LOESUNG OHNE SCHWELLENAENDERUNG: Erkannte Infrastrukturfragen werden fuer die
  SUCHE um das Vokabular der Dienste-Uebersicht ergaenzt. MIN_TOP_SCORE bleibt
  UNVERAENDERT — die angereicherte Frage erreicht sie selbst: 8,5 -> 35,4 |
  11,0 -> 33,5 | 6,9 -> 29,1 | 11,0 -> 36,9. Beste Quelle jetzt
  MASTER_PROMPT.md bzw. FREE_ARCHITECTURE.md "Current Deployment".
- SICHERHEIT: Erkennung verlangt keine Befehlsform UND einen Infrastruktur-
  Begriff UND eine Fragestellung. Damit fallen schutz-daten-loeschen (traegt
  "Objektspeicher"!), halluzination-unbekannte-zahl und "Wie viele Nutzer hat
  smejj.com?" heraus. Nur die SUCHANFRAGE wird ergaenzt, nie der Nutzer-Prompt.
- MERKREGEL: Eine absolute Relevanzschwelle auf einer SUMMEN-Punktzahl ist eine
  verkappte Laengenschwelle. Wer sie an ausformulierten Testprompts kalibriert,
  kalibriert am Alltag vorbei. Vor dem Nachjustieren pruefen, ob das Kriterium
  ueberhaupt trennt — hier tat es das nicht, und die richtige Antwort war eine
  bessere SUCHE statt einer weicheren Schwelle.
