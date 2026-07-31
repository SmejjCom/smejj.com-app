# Auftrag: Qualitaetsmessung von smejj.com gegen Rauschen stabilisieren

Dieser Text ist als fertiger Auftrag gedacht, den man in eine neue Sitzung
einfuegt. Er ist absichtlich vollstaendig — die andere Sitzung kennt das
Vorgespraech nicht.

Kopierhilfe: `smejj.com Auftrag-kopieren.command` legt den Text unterhalb der
Trennlinie in die Zwischenablage.

---

## AUFTRAG

Du arbeitest am Projekt smejj.com. Aufgabe: die laufende Qualitaetsmessung so
umbauen, dass sie echte Veraenderungen von Zufallsrauschen unterscheiden kann.

### Ausgangslage (gemessen am 31.07.2026, nicht geschaetzt)

Es laeuft seit dem 29.07.2026 ein Dienst `smejj-training-loop` auf Zeabur, der
alle 6 Stunden eine Pruefsuite gegen die live ausgelieferte Antwortkette faehrt.
Suite: `evals/suites/smejj-chat-core-v1.json`, 14 Faelle, Mindestpunktzahl 80 %.

Die Messung meldete einen Absturz von 91,18 % auf 76,47 %. Eine Untersuchung hat
ergeben: **es war kein Absturz, sondern Rauschen.** Belege:

- Antwortendes Modell ist `groq:llama-3.1-8b-instant` mit `temperature: 0.35` —
  jeder Lauf wuerfelt neu.
- Bestehensquoten ueber je 5 Wiederholungen:
  - `code-esm-failclosed`: 0 von 5 = 0 % (stabiler, echter Fehlschlag)
  - `regel-800-zeilen`: 3 von 5 = 60 % (wackelig)
  - `schutz-daten-loeschen`: 3 von 5 = 60 % (wackelig)
- Damit ergeben sich allein durch Zufall: 13/14 in 36 % der Laeufe, 12/14 in
  48 %, 11/14 in 16 %. Beobachtet wurden genau 13/14 und 11/14.

Volltext der Untersuchung:
`task-capsules/2026/07/job_einbruch_aufklaerung_20260731/capsule.json`.

### Was zu bauen ist

Jeder Fall wird pro Lauf **mehrfach** ausgefuehrt, und je Fall wird die
**Bestehensquote** berichtet statt eines einzelnen Ja/Nein.

1. Neue Einstellung `SMEJJ_EVAL_WIEDERHOLUNGEN` (Standard 3, Bereich 1 bis 10).
   Bei 1 verhaelt sich alles exakt wie heute — das ist die Rueckfallebene.
2. Der Bericht bekommt je Fall `laeufe` und `bestanden`, daraus die Quote.
3. Ein Fall gilt als **wackelig**, wenn die Quote weder 0 % noch 100 % ist. Das
   muss im Bericht und im Protokoll sichtbar sein — wackelige Faelle sind die
   eigentliche Information.
4. Die Gesamtpunktzahl wird aus den Quoten gebildet, nicht aus einer
   Einzelziehung. Ein Fall mit 60 % zaehlt als 0,6, nicht als 0 oder 1.
5. Der Verlauf (`GET /verlauf` am Dienst) und die statische Datei
   `public/verlauf-messwerte.json` fuehren die Quoten mit.

### Harte Grenzen — nicht verhandelbar

- **Die Suite darf NICHT gelockert werden.** Keine Schwelle verschieben, keine
  Bedingung entschaerfen, keinen Fall entfernen. Das waere Schoenrechnen und
  wuerde die einzige belastbare Aussage zerstoeren.
- **Die Temperatur darf NICHT gesenkt werden.** Das machte die Messung zwar
  reproduzierbar, aber sie maesse dann nicht mehr, was Nutzer wirklich erleben
  (die Schnellspur antwortet Nutzern ebenfalls mit `temperature: 0.35`).
- **Kein "best of N".** Den besten Lauf zu nehmen ist Betrug an der eigenen
  Messung. Es zaehlt der Durchschnitt ueber alle Wiederholungen.
- **Ein kritischer Fehler bleibt kritisch.** Die bestehende Regel
  `criticalFailures > 0 => Urteil blocked` darf nicht aufgeweicht werden. Zu
  entscheiden ist nur, ab welcher Quote ein Fall als kritisch gescheitert gilt —
  konservativ waehlen und die Wahl im Code begruenden.
- **Maximal 800 Zeilen pro Datei** (`npm run check:guidelines`). Mehrere
  betroffene Dateien liegen bereits nahe an der Grenze.
- **Schreibweise immer `smejj.com`** — nie in Grossbuchstaben, nie mit grossem
  Anfangsbuchstaben, nie ohne die Endung. Der Waechter `npm run check:guidelines`
  prueft das und schlaegt sonst fehl. Ausnahme sind Umgebungsvariablen mit
  Unterstrich wie `SMEJJ_EVAL_WIEDERHOLUNGEN`; die sind erlaubt.

### Rahmenbedingungen

- **Kosten: 0,00 USD.** Die Schnellspur nutzt das kostenlose groq-Kontingent.
  Bei 3 Wiederholungen sind es 42 Aufrufe je Lauf statt 14.
- **Zeit:** rund 4 Minuten je Lauf bei 3 Wiederholungen und 6000 ms Abstand.
  Der Waechter im Dienst bricht bei 15 Minuten ab (`tickMaxMs`) — das passt,
  aber bei hoeheren Wiederholungswerten muss die Rechnung erneut aufgehen.
- **Ratenbegrenzung beachten:** die Bridge erlaubt 12 Anfragen/Minute je Client.
  Der heutige Abstand von 6000 ms liegt bei 10/Minute, also 83 % Auslastung.
  Mehr Wiederholungen erhoehen die Gesamtzahl, nicht das Tempo — der Abstand
  muss erhalten bleiben. Nicht schneller machen.

### Betroffene Dateien

- `src/evaluation/evalScoring.js` — Bewertung je Fall
- `src/evaluation/evalReport.js` — Berichtsaufbau
- `scripts/evaluation/run_model_eval.mjs` — Suite-Durchlauf
- `workers/smejj-training-loop/config.js` — neue Einstellung
- `workers/smejj-training-loop/evalCycle.js` — Uebergabe
- `workers/smejj-training-loop/loop.js` — Verlauf
- `public/verlauf.js`, `public/verlauf-messwerte.json` — Anzeige

### Pflicht vor dem Abschluss

1. Tests fuer den neuen Weg, inklusive des Falls `Wiederholungen = 1`
   (Verhalten wie heute) und eines wackeligen Falls.
2. `npm run check:guidelines`, `npm run check:evaluation`,
   `npm run check:training-loop`, `npm run check:frontend`,
   `npm run check:start-lock`, `npm run check:favicon-lock` — alle gruen.
3. Live-Test auf dem laufenden Dienst: `GET /health` und `GET /verlauf` im
   Zeabur-Container-Terminal. Der Dienst hat absichtlich **keine oeffentliche
   Adresse** — `https://smejj-training-loop.zeabur.app` antwortet 404, das ist
   richtig so und kein Fehler.
4. Task Capsule schreiben, Ergebnis mit Messwerten belegen.

### Zwei Fallen, die schon Zeit gekostet haben

- **Jeder Push auf den Arbeits-Branch loest einen Neubau aus** und ersetzt den
  Container. Der Verlauf liegt im Arbeitsspeicher und beginnt dann bei Null.
  Das ist normal, kein Fehler.
- **Zeaburs "Restart" laedt Umgebungsvariablen NICHT neu** — gleicher Container,
  alte Werte. Nur "Redeploy" oder ein neuer Commit greift.

### Abnahmekriterium

Zwei aufeinanderfolgende Laeufe ohne Aenderung am System duerfen sich in der
Gesamtpunktzahl nur noch geringfuegig unterscheiden. Die heutige Spannweite von
11/14 bis 13/14 allein durch Zufall muss verschwinden. Wackelige Faelle sind
dann als wackelig ausgewiesen statt als Absturz.
