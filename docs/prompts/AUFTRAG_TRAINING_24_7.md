# Auftrag: Dauertraining für smejj 1.0 — rund um die Uhr, so schnell wie möglich

Fertiger Auftrag zum Einfügen in eine neue Sitzung. Absichtlich vollständig —
die andere Sitzung kennt das Vorgespräch nicht.

Kopierhilfe: `smejj.com Auftrag-Training-24-7.command`.

---

## AUFTRAG

Du arbeitest am Projekt smejj.com. Der Betreiber will, dass das eigene Modell
smejj 1.0 rund um die Uhr trainiert wird und so schnell wie möglich stark wird.
Baue dafür eine dauerhaft laufende Trainingsschleife.

### Erwartung des Betreibers und was du ihm schuldest

Der Betreiber nennt als Ziel das Niveau von Codex, Claude oder Gemini.
**Sag ihm ehrlich, dass das mit dieser Infrastruktur nicht erreichbar ist** —
solche Modelle kosten dreistellige Millionenbeträge an Rechenzeit auf tausenden
GPUs. Verschweige das nicht und verspreche es nicht.

**Sag ihm stattdessen, was erreichbar ist**, und miss genau das:
das eigene Modell soll die heute eingekaufte Kette auf der bestehenden Prüfsuite
schlagen. Aktueller Vergleichswert: `groq:llama-3.1-8b-instant` erreicht
73,53 bis 85,29 Prozent auf `evals/suites/smejj-chat-core-v1.json` (14 Fälle).
Das ist ein echtes, prüfbares Ziel — und wenn es erreicht wird, ist es ein
großer Fortschritt.

### Ausgangslage — gemessen am 01.08.2026

- `model-files/smejj-1-0/` auf IDrive e2 ist ein **leerer Ordner**. Es gibt
  keine Gewichte. Das Modell existiert nicht.
- `model-files/qwen3-6-35b-a3b/` existiert nicht, obwohl
  `src/shared/modelRegistry.js` für `smejj-fast-1` darauf zeigt.
- Vorhanden sind nur gemietete Fremdmodelle: `glm-5-2-fp8` 755,7 GB und
  `kimi-k2-7` 595,2 GB.
- **Es hat nie ein Training stattgefunden.** `trainingCycleEnabled: false`,
  Erfassungstor aus, Warteschlange leer.
- Der Salad-Container `smejj-fast-1` existiert (llama.cpp, RTX-4090-Klasse,
  100 GB Datenträger), steht auf STOPPED.

### DIE EIGENTLICHE BREMSE: es gibt null Trainingsdaten

Das ist der Punkt, an dem dieser Auftrag scheitert, wenn du ihn übergehst.

`docs/architecture/SMEJJ_1_0_TRAINING_DATA_POLICY.md` **verbietet**, Ausgaben von
Fremdmodell-Schnittstellen (GLM/Z.ai, Kimi/Moonshot, künftige) als
Trainingsmaterial zu verwenden, solange keine geprüfte Rechtefreigabe vorliegt.
Alles, was heute durch die Kette läuft, kommt von genau solchen Anbietern.
Historische Task Capsules sind ausdrücklich ebenfalls keine Trainingsdaten.

**Ohne Daten ist eine GPU nutzlos.** Kaufe keine Rechenzeit, bevor Daten da sind.

**Der schnellste erlaubte Weg — nimm diesen:** offene Datensätze mit
permissiver Lizenz (Apache-2.0, MIT, CC-BY oder vergleichbar). Sie sind sofort
verfügbar, kostenlos und rechtlich sauber. Prüfe die Lizenz jedes Datensatzes
einzeln, halte sie im Task Capsule fest, und nimm nichts mit unklarer Herkunft.
Parallel dazu kann der Betreiber später eigene Nutzerdaten mit Einwilligung
sammeln — die Technik dafür ist gebaut und live (`/api/training/consent`), aber
das dauert Monate und ist nicht der schnelle Weg.

### Was zu bauen ist

**Schritt 1 — Basismodell beschaffen (0 USD, Stunden)**
Ein offenes Modell mit starker Coding-Leistung, das auf eine 24-GB-Karte passt.
Kandidaten prüfen statt raten. Lizenz auf kommerzielle Nutzung prüfen. Nach
`model-files/smejj-1-0/original/` laden mit dem vorhandenen Werkzeug
`scripts/model-management/stream_hf_model_to_idrive.mjs`. Nicht neu bauen.

**Schritt 2 — Datensatz bauen (0 USD, Stunden)**
Offene Datensätze wählen, Lizenzen dokumentieren, durch die vorhandene Pipeline
geben: `src/training/sanitize.js`, `policy.js`, `pipeline.js`, `split.js`.
Trainings- und Testteil strikt trennen — der Testteil darf **nie** ins Training,
sonst misst man später sich selbst.

**Schritt 3 — Dauertrainings-Schleife (kostenpflichtig, siehe unten)**
Eine Schleife nach dem Muster des bestehenden `workers/smejj-training-loop/`.
Ein Zyklus:
1. Konfiguration wählen (Lernrate, LoRA-Rang, Datenmischung) — systematisch
   variieren, nicht zufällig.
2. LoRA-Feintuning auf dem Basismodell.
3. Gegen die **bestehende Prüfsuite** messen, mehrfach je Fall.
4. Besser als der bisher beste Stand? Dann als neuen Besten ablegen. Schlechter?
   Verwerfen und protokollieren, warum.
5. Ergebnis in den Verlauf schreiben, nächster Zyklus.

Das ist echtes Dauertraining: nicht endlos auf denselben Daten weiterrechnen
(das führt zu Auswendiglernen und macht das Modell schlechter), sondern
kontrolliert viele Varianten durchprobieren und nur Verbesserungen behalten.

**Schritt 4 — Ausliefern nur nach Messung**
Das trainierte Modell in den Router einhängen, fail-closed: fällt es aus,
antwortet die bestehende Kette weiter. Kein Nutzer sieht einen Fehler.
`src/evaluation/modelPromotion.js` verlangt eine **menschliche Freigabe** vor
jeder Beförderung — nicht umgehen.

### Kosten — echte Preise aus dem Salad-Konto des Betreibers, 01.08.2026

| GPU | pro Stunde | rund um die Uhr, 30 Tage |
|---|---|---|
| RTX 3090 (24 GB) | 0,25 USD | **ca. 180 USD/Monat** |
| RTX A5000 (24 GB) | 0,25 USD | ca. 180 USD/Monat |
| RTX 4090 (24 GB) | 0,30 USD | **ca. 216 USD/Monat** |
| RTX 5090 (32 GB) | 0,45 USD | ca. 324 USD/Monat |

Heute kostet der gesamte Betrieb **6 USD im Monat**. Dauertraining rund um die
Uhr ist damit das **Dreißigfache**.

Guthaben im Salad-Konto: 83,91 USD, automatische Aufladung **aus**. Bei
Dauerbetrieb auf einer RTX 3090 reicht das für **rund 14 Tage**, dann stoppen
die Container von selbst. Das ist ein Schutz, kein Fehler — aber rechne es dem
Betreiber vor, bevor du startest.

**Das ist ein Punkt der Roten Liste.** Hole die ausdrückliche schriftliche
Freigabe mit genannter GPU-Klasse und Monatsbetrag ein, **bevor** du den
GPU-Dienst startest. Ohne Freigabe: Schritte 1 und 2 vollständig erledigen,
Schleife bauen und testen, aber **nicht starten**, und den Betrag melden.

Pflicht in der Schleife: Budget-Tor, Laufzeitbegrenzung, harte Obergrenze in
USD, und ein Notaus, der die Container beendet. Keine automatische Aufladung
einschalten.

### Harte Grenzen

- **Prüfsuite NICHT lockern**, Schwellen nicht verschieben, keinen Fall
  entfernen. Sonst misst man sich selbst schön.
- **Testdaten NIE ins Training.**
- **Keine Trainingsdaten aus Fremdmodell-APIs** — eigene Richtlinie des
  Projekts, nicht verhandelbar.
- **Keine Beförderung ohne menschliche Freigabe.**
- **Fail-closed überall:** ohne Daten, ohne Budget, ohne erreichbaren Dienst
  passiert nichts, statt dass geraten wird.
- **Maximal 800 Zeilen pro Datei** (`npm run check:guidelines`).
- **Schreibweise immer `smejj.com`**, nie in Grossbuchstaben, nie mit grossem
  Anfangsbuchstaben. Ausnahme: Umgebungsvariablen wie `SMEJJ_TRAINING_...`.

### Fallen, die hier bereits Zeit gekostet haben

- Messungen schwanken stark: eine Einzelziehung je Fall streut um bis zu
  12 Prozentpunkte, weil die Kette mit `temperature: 0.35` läuft. Immer
  mehrfach messen. Beleg:
  `task-capsules/2026/07/job_einbruch_aufklaerung_20260731/`.
- Denk-Abschnitte zählen gegen dasselbe Token-Budget wie die Antwort. Bei
  knappem Budget kommt **leerer Text** zurück und ein gutes Modell sieht wie ein
  Totalausfall aus. Siehe `THINKING_MIN_TOKEN_BUDGET` in
  `src/evaluation/evalTransport.js`.
- Der LIVE-Control-Server ist der **Salad**-Container `smejj-control`, nicht der
  gleichnamige Zeabur-Dienst.
- Zeaburs „Restart" lädt Umgebungsvariablen **nicht** neu — nur „Redeploy".
- Die Salad-API braucht `{container:{environment_variables:…}}`; flach gesendet
  antwortet sie 200 und ändert nichts. Immer zurücklesen.
- Jeder Push auf den Arbeits-Branch löst einen Neubau aus und ersetzt den
  Container; der Verlauf im Arbeitsspeicher beginnt dann bei Null.

### Pflicht vor dem Abschluss

1. `npm run check:guidelines`, `check:architecture`, `check:training`,
   `check:evaluation`, `check:training-loop` — alle grün.
2. Tests für die Schleife, inklusive: kein Budget, keine Daten, Dienst nicht
   erreichbar.
3. Task Capsule mit Lizenzen aller Datensätze, Messwerten und Kosten je Zyklus.

### Abnahmekriterium

Die Schleife läuft unbefristet, hält ihr Budget ein, und für jeden Zyklus liegt
eine Messung gegen die bestehende Suite vor. Erreicht das eigene Modell die
73,53 bis 85,29 Prozent der eingekauften Kette nicht, wird das **berichtet und
nicht beschönigt** — dann ist die richtige Empfehlung, die kostenlose Kette
weiterzunutzen, bis mehr oder bessere Daten vorliegen.
