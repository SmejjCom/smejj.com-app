# smejj.com Dauertrainings-Schleife (smejj-lora-loop)

Dauerhaft laufender Prozess, der das eigene Modell smejj 1.0 in Zyklen
weitertrainiert und **jeden Zyklus gegen die bestehende Pruefsuite misst**.

Laeuft auf einer billigen CPU-Instanz und steuert die teure GPU von aussen.
Ein Wartezustand kostet damit nichts.

## Was diese Schleife erreichen kann — und was nicht

**Nicht erreichbar mit dieser Infrastruktur:** das Niveau von Codex, Claude
oder Gemini. Solche Modelle kosten dreistellige Millionenbetraege an Rechenzeit
auf tausenden GPUs. Eine gemietete 24-GB-Karte fuer 180 USD im Monat ist davon
um etwa sechs Groessenordnungen entfernt. Das ist keine Frage der Sorgfalt.

**Erreichbar und hier gemessen:** das eigene Modell schlaegt die heute
eingekaufte Kette auf `evals/suites/smejj-chat-core-v1.json`. Vergleichswert:
`groq:llama-3.1-8b-instant` erreicht dort 73,53 bis 85,29 Prozent (14 Faelle).
Wird das ueberschritten, ist das ein echter, pruefbarer Fortschritt.

Erreicht das eigene Modell diesen Wert **nicht**, steht das im Verlauf und wird
nicht beschoenigt. Die richtige Empfehlung ist dann, die kostenlose Kette
weiterzunutzen, bis mehr oder bessere Daten vorliegen.

## Was die Suite wirklich misst (wichtig fuer die Datenwahl)

Von den 14 Faellen pruefen etwa neun **projektspezifisches Wissen und
projektspezifisches Verweigern**, nicht allgemeine Faehigkeit:

| Art | Faelle |
|---|---|
| Projektwissen | `speicher-hauptserver`, `budget-lcp-grounding`, `kosten-github-free`, `regel-800-zeilen`, `naming-schreibweise`, `architektur-static-first` |
| Verweigern | `schutz-daten-loeschen`, `schutz-api-schluessel`, `schutz-design-lock`, `halluzination-unbekannte-zahl` |
| Allgemeine Faehigkeit | `code-esm-failclosed`, `strukturierte-json-ausgabe`, `patch-unified-diff`, `antwortsprache-deutsch` |

Daraus folgt eine unbequeme Wahrheit: **offene Datensaetze bewegen nur die
letzte Zeile.** Kein Datensatz auf HuggingFace enthaelt das LCP-Budget von
smejj.com. Die Mehrheit der Punkte haengt an Erstpartei-Projektwissen, und das
muss aus der eigenen Dokumentation des Betreibers kommen — rechtlich sauber,
weil es ihm gehoert, aber es ist ein eigener Arbeitsschritt und nicht Teil des
offenen Korpus.

## Kosten — echte Preise, Salad-Konto des Betreibers, 01.08.2026

| GPU | pro Stunde | Dauerbetrieb 30 Tage |
|---|---|---|
| RTX 3090 (24 GB) | 0,25 USD | **180 USD/Monat** |
| RTX A5000 (24 GB) | 0,25 USD | 180 USD/Monat |
| RTX 4090 (24 GB) | 0,30 USD | **216 USD/Monat** |
| RTX 5090 (32 GB) | 0,45 USD | 324 USD/Monat |

Heutiger Gesamtbetrieb: 6 USD/Monat. Dauertraining ist das **Dreissigfache**.
Guthaben 83,91 USD, automatische Aufladung **aus** — auf einer RTX 3090 reicht
das fuer rund **14 Tage**, dann stoppen die Container von selbst. Das ist ein
Schutz, kein Fehler; die automatische Aufladung bleibt bewusst aus.

**Ohne schriftliche Freigabe mit GPU-Klasse und Monatsbetrag startet diese
Schleife nicht.** Das ist keine Konvention, sondern ein Tor im Code
(`budget.js#pruefeFreigabe`), das ohne `SMEJJ_LORA_FREIGABE_*` jeden Zyklus
sperrt.

## Vier unabhaengige Bremsen

| Bremse | Wirkung |
|---|---|
| Freigabe-Tor | ohne hinterlegte Freigabe (Kennung + GPU-Klasse + Monatsbetrag) startet kein Zyklus |
| Gesamtdeckel | harte USD-Obergrenze; Verbrauch liegt **dauerhaft** auf IDrive e2, ueberlebt Neustarts |
| Laufzeitdeckel | je Zyklus; ein haengender Lauf wird abgebrochen und der Dienst zum Beenden aufgefordert |
| Notaus | `SMEJJ_LORA_NOTAUS=YES` sperrt sofort und beendet einen laufenden Lauf |

Eine Freigabe fuer eine RTX 3090 deckt **keine** RTX 5090 — die Klassen werden
verglichen, weil 180 gegen 324 USD fast das Doppelte waere.

## Fail-closed

Ohne Daten, ohne Budget oder ohne erreichbaren Trainingsdienst passiert nichts,
statt dass geraten wird. Zusaetzlich:

- Ist der **Kostenzaehler nicht lesbar**, wird nicht trainiert. Lieber
  Stillstand als ein Deckel, der nach dem naechsten Deploy bei null anfaengt.
- Ein **unklarer Trainerzustand** bricht ab, statt weiterzufragen.
- Eine **fehlgeschlagene Messung** macht keinen neuen Besten — die Kosten
  werden trotzdem verbucht, weil sie angefallen sind.

## Schalter

| Variable | Standard | Bedeutung |
|---|---|---|
| `SMEJJ_LORA_LOOP_ENABLED` | `NO` | Prozess tickt ueberhaupt |
| `SMEJJ_LORA_TRAINING_ENABLED` | `NO` | es darf Geld ausgegeben werden |
| `SMEJJ_LORA_NOTAUS` | `NO` | Notaus |
| `SMEJJ_LORA_GPU_KLASSE` | — | `rtx3090` \| `rtxa5000` \| `rtx4090` \| `rtx5090` |
| `SMEJJ_LORA_MAX_USD_GESAMT` | — | harte Obergrenze der Kampagne |
| `SMEJJ_LORA_MAX_ZYKLUS_MINUTEN` | — | Laufzeitdeckel je Zyklus |
| `SMEJJ_LORA_MAX_ZYKLEN` | — | optionale Zyklus-Obergrenze |
| `SMEJJ_LORA_FREIGABE_ID` | — | Referenz der schriftlichen Freigabe |
| `SMEJJ_LORA_FREIGABE_GPU_KLASSE` | — | muss zur gebuchten Klasse passen |
| `SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD` | — | muss die echten Monatskosten decken |
| `SMEJJ_LORA_BASIS_HF_REPO` | — | Basismodell (siehe unten) |
| `SMEJJ_LORA_DATENSATZ_SCHLUESSEL` | — | Trainingsanteil auf IDrive e2 |
| `SMEJJ_LORA_DATENSATZ_MANIFEST` | — | Korpus-Manifest |
| `SMEJJ_LORA_TRAINER_URL` | — | Adresse des GPU-Trainingsdienstes |

Ohne jede Angabe antwortet nur `/health` — sicher deploybar im Aus-Zustand.

## Endpunkte

- `GET /health` — laeuft der Dienst, und in `traineertNichtWeil` **warum er
  gerade nicht trainiert**. Diese Liste beantwortet die Frage, die sonst
  Protokollsuche kostet.
- `GET /verlauf` — Kennzahlen je Zyklus. Nur Zahlen und Kennungen, nie Prompts,
  Antworten oder Trainingsinhalte.
- `GET /kosten` — Verbrauch, Rest, Monatshochrechnung, Freigabe-Kennung.

Kein Endpunkt schaltet etwas ein. Einschalten kostet Geld und passiert ueber
Umgebungsvariablen, die der Betreiber setzt.

## Ein Zyklus

1. Konfiguration aus dem **deterministischen Gitter** (`sweep.js`) — 3 Lernraten
   x 3 LoRA-Raenge x 2 Datenmischungen = 18 Kombinationen. Kein `Math.random()`:
   nach einem Container-Neubau muss Zyklus 37 wieder Zyklus 37 sein.
2. LoRA-Feintuning auf dem Basismodell (`trainerClient.js`).
3. Messung gegen die bestehende Suite, **mehrfach je Fall** (`evalAdapter.js`
   ruft `runEvalCycle` aus dem bestehenden Eval-Zyklus auf — es gibt bewusst
   keine zweite Messimplementierung).
4. Besser als der beste Stand? Ablegen. Sonst verwerfen und den Grund
   protokollieren.
5. Ergebnis in den Verlauf, naechster Zyklus.

Nach der letzten Runde ist Schluss (`gitterErschoepft`). Endlos auf denselben
Daten weiterzurechnen fuehrt zu Auswendiglernen und macht das Modell
schlechter.

**Die Rauschschwelle:** ein neuer Bester braucht mehr als 3 Prozentpunkte
Vorsprung. Eine Einzelziehung je Fall streut um bis zu 12 Prozentpunkte
(temperature 0.35, Beleg: `task-capsules/2026/07/job_einbruch_aufklaerung_20260731/`).
Ohne diese Schwelle fuellte sich die Bestenliste mit Zufall, und jede folgende
Messung haette eine zu hohe Latte.

## Vertrag zum Trainingsdienst

Der GPU-Container ist ein eigener Dienst. Er muss drei Routen anbieten:

| Route | Antwort |
|---|---|
| `GET /health` | 2xx wenn bereit |
| `POST /training/start` | `{ laufId }` |
| `GET /training/status/:laufId` | `{ zustand, adapterSchluessel, messEndpunkt, gelaufeneMinuten }` |
| `POST /training/abort/:laufId` | 2xx wenn beendet |

`zustand` ist `laeuft` \| `fertig` \| `fehlgeschlagen`. Alles andere gilt als
unbekannt und fuehrt zum Abbruch.

Es werden nur **Verweise** uebergeben (Ablage-Schluessel), nie Datenzeilen —
Trainingsdaten gehen nicht durch diesen Prozess und nicht durch seine
Protokolle.

## Basismodell — die Falle mit GGUF

`src/shared/modelRegistry.js` traegt fuer `smejj-fast-1` das GGUF-Q4-Artefakt
von `Qwen/Qwen3-Coder-30B-A3B-Instruct` ein (17,7 GB). Das ist die richtige
Wahl fuers **Ausliefern** auf einer 24-GB-Karte — aber **auf einer GGUF-Q4-Datei
laesst sich kein LoRA trainieren**. Trainiert wird auf safetensors.

Gemessen ueber die HuggingFace-API am 01.08.2026:

| Modell | Lizenz | safetensors (bf16) | LoRA auf 24 GB? |
|---|---|---|---|
| `Qwen/Qwen3-Coder-30B-A3B-Instruct` | Apache-2.0 | 61,07 GB (16 Dateien) | nur 4-bit, sehr eng; auf 32 GB (RTX 5090) sinnvoll |
| `Qwen/Qwen2.5-Coder-7B-Instruct` | Apache-2.0 | 15,23 GB (4 Dateien) | ja, bequem |
| `Qwen/Qwen3-Coder-Next` | Apache-2.0 | 159,36 GB (40 Dateien) | nein |

Deshalb ist `SMEJJ_LORA_BASIS_HF_REPO` ein Konfigurationswert und kein fester
Eintrag im Code: welches Modell trainierbar ist, haengt an der GPU-Klasse, und
die entscheidet der Betreiber mit der Kostenfreigabe.

## Betrieb

```bash
node workers/smejj-lora-loop/worker.mjs
```

## Governance

Dieser Dienst ist **nicht** von der dokumentierten Zeabur-Ausnahme in
`docs/architecture/FREE_ONLY_MASTER_POLICY.md` gedeckt (die betrifft nur den
bestehenden Maus-Engine-Server) und faellt zusaetzlich unter die Rote Liste,
weil er GPU-Zeit kauft. Beides verlangt eine eigene schriftliche
Betreiber-Freigabe mit Dienst und Betrag.
