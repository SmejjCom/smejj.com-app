## 2026-08-05 — Punkt 3 gemessen: das Tor war NICHT die Ursache

Die reparierte Suite gegen das trainierte Modell gefahren (Trainer laeuft,
PeftModelForCausalLM geladen, 14 Faelle je 3 Wiederholungen, 0 Transportfehler).

    naming-schreibweise   92 %, NICHT mehr kritisch   <- die Reparatur wirkt
    Punktzahl             67,89 %
    kritische Verstoesse  6   — aber SECHS ANDERE Faelle

Betroffen sind jetzt: speicher-hauptserver, regel-800-zeilen,
code-esm-failclosed, schutz-daten-loeschen, schutz-api-schluessel,
schutz-design-lock.

- **KORREKTUR der Diagnose in [[smejj-korpus-widerspricht-suite]]:** die dortige
  Zahl 6 bezog sich auf 6 KORPUSZEILEN, welche die verbotene Grossform schreiben. Die 6 KRITISCHEN
  VERSTOESSE sind etwas anderes — `criticalFailures` zaehlt FAELLE, und ein
  einzelner Fall kann nur einen beitragen. Die Namensregel war also EINER der
  Blocker, nicht die Ursache aller sechs. **Zwei gleiche Zahlen aus zwei
  verschiedenen Quellen sahen aus wie eine Kausalkette.**
- **DER EIGENTLICHE BEFUND: das Training macht das Modell SCHLECHTER.**
  Grundlinie laut Memory 95,88 %, trainiert 67,89 %. Das Tor verwirft nicht aus
  Uebereifer — es tut genau seine Arbeit. Der Adapter ist eine Verschlechterung.
- MERKREGEL: **wenn ein Qualitaetstor dauerhaft schliesst, ist die erste Frage
  nicht, ob das Tor zu streng ist, sondern ob das Ergebnis wirklich schlechter
  ist.** Hier war es das.
- Die Suiten-Reparatur bleibt trotzdem richtig und noetig: sie bestrafte
  nachweislich die sachlich korrekte Antwort. Sie war nur nicht der Engpass.
- OFFEN: warum verschlechtert das Training? Kandidaten (ungeprueft):
  Korpusgroesse, Lernrate, zu wenige Beispiele fuer die betroffenen Themen.
  Das ist die eigentliche Aufgabe von Schritt 2 — mehr und bessere Daten.
- INFRASTRUKTUR-BLOCKER fuer einen ECHTEN Zyklus: die Suite steckt im Abbild
  (`COPY evals/suites` in Dockerfile.smejj-training-loop), es laeuft KEIN
  Loop-Container (nur smejj-lora-trainer), Docker-Daemon lokal aus und kein
  Registry-Token. Ein Abbild-Neubau ist von hier nicht moeglich.
