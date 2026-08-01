# Trainingsweg für smejj 1.0 — Plan, nicht Umsetzung

Stand: 31.07.2026. Erstellt auf Wunsch des Betreibers („Trainingsweg planen").
**Nichts davon ist eingeschaltet.** Dieses Dokument entscheidet nichts, es legt
offen, was nötig wäre, was es kostet und wo die Entscheidungen liegen.

Grundlage sind gemessene Werte aus dem laufenden Betrieb, nicht Annahmen:
`task-capsules/2026/07/job_smejj_training_loop_20260728/` und
`docs/architecture/SMEJJ_1_0_TRAINING_DATA_POLICY.md`.

---

## 1. Was heute schon läuft — und was nicht

Der Dienst heißt `smejj-training-loop`, aber er enthält **zwei getrennte
Schalter**. Der Name führt in die Irre und hat bereits zu einem Missverständnis
geführt.

| Schalter | Stand | Wirkung |
|---|---|---|
| Messung (Eval) | **AN** seit 29.07.2026 | Alle 6 Stunden 14 Prüfaufgaben, rund um die Uhr |
| Training | **AUS** | Würde die Trainings-Warteschlange abarbeiten |

Zusätzlich steht das projektweite Erfassungstor `SMEJJ_TRAINING_CAPTURE_ENABLED`
auf aus (fail-closed). Folge: die Warteschlange `training/queue/v1/` auf IDrive
e2 ist **konstruktionsbedingt leer**. Den Trainingsschalter umzulegen würde
heute nichts bewirken außer leeren Durchläufen.

## 2. Was „smejj 1.0" technisch ist — der wichtigste Punkt

Hier liegt das häufigste Missverständnis. In der Registrierung stehen drei
eigene Einträge, aber nur einer davon ist trainierbar:

| Modell | Ablage | Größe | Rolle |
|---|---|---|---|
| `glm-5-2` | `model-files/glm-5-2-fp8/original/` | **704 GB** | Fundament, wird **gemietet**, nicht trainiert |
| `kimi-k2-7` | `model-files/kimi-k2-7/original/` | **555 GB** | Fundament, ebenso |
| **`smejj-fast-1`** | `model-files/qwen3-6-35b-a3b/original/` | **20 GB** | **Das eigene, trainierbare Modell** |

### Nachtrag 01.08.2026 — das Lager gemessen statt aus der Registrierung gelesen

Die Tabelle oben nennt die Werte aus `src/shared/modelRegistry.js`. Eine
Messung des tatsächlichen Lagers auf IDrive e2 (Eimer `smejj-model-files`)
ergibt ein anderes Bild:

| Ordner | gemessen | Dateien |
|---|---|---|
| `model-files/glm-5-2-fp8/` | **755,7 GB** | 158 |
| `model-files/kimi-k2-7/` | **595,2 GB** | 102 |
| `model-files/smejj-1-0/` | **0,0 GB** | 0 — leerer Ordner |
| `model-files/qwen3-6-35b-a3b/` | **existiert nicht** | — |
| **Gesamt** | **1 350,9 GB** | |

Zwei Folgen für diesen Plan:

1. **Das eigene Modell existiert noch nicht als Datei.** `smejj-1-0` ist ein
   leerer Ordner. Es gibt keine Gewichte, kein LoRA, nichts. Damit ist die
   Frage „wie schlau ist smejj 1.0" derzeit nicht beantwortbar — es antwortet
   nirgends.
2. **Der in Stufe 3 angenommene Ausgangspunkt fehlt.** Die Registrierung zeigt
   für `smejj-fast-1` auf `model-files/qwen3-6-35b-a3b/original/`; dieser Pfad
   ist im Lager nicht vorhanden. Vor jedem Feintuning muss also erst ein
   Basismodell beschafft und abgelegt werden — das ist ein zusätzlicher
   Schritt vor Stufe 3, nicht Teil davon. Er kostet Zeit und Bandbreite,
   aber kein Geld (offene Gewichte, IDrive-Jahrespaket).

Ausserdem liegen **1,35 TB gemietete Fremdmodell-Gewichte** im Lager, die
derzeit nicht für Inferenz genutzt werden — die Antworten kommen über die APIs
der Anbieter, nicht aus diesen Dateien. Ob dieser Speicher weiter vorgehalten
werden soll, ist eine eigene Kostenfrage an den Betreiber.

Ein 704-GB-Modell selbst zu trainieren ist für diesen Betrieb keine Option —
weder rechnerisch noch finanziell. **Der realistische Weg ist ein LoRA-Feintuning
von `smejj-fast-1`** (Qwen3-35B-A3B, ein Mixture-of-Experts-Modell mit rund 3 Mrd
aktiven Parametern). LoRA verändert nicht das ganze Modell, sondern legt eine
kleine, lernbare Schicht darüber — Größenordnung Megabyte statt Gigabyte.

## 3. Der eigentliche Engpass ist nicht die Rechenleistung

Das überrascht die meisten: **es fehlt an erlaubten Daten, nicht an GPUs.**

Die eigene Trainingsdaten-Richtlinie sperrt Ausgaben von Fremdmodell-
Schnittstellen (GLM/Z.ai, Kimi/Moonshot und künftige) für Training und
Distillation, solange keine geprüfte Rechtefreigabe vorliegt. Alles, was heute
durch die Kette läuft, kommt von genau solchen Anbietern.

**Es gibt also aktuell null verwertbare Trainingsbeispiele.** Das ist kein
Versäumnis, sondern die Richtlinie, die wie vorgesehen greift.

Was die Richtlinie ausdrücklich erlaubt: **eigene Daten mit Einwilligung**, nach
Sanitization, Rechteprüfung, allen Qualitäts-Toren und verschlüsselter,
unveränderlicher Ablage auf IDrive e2.

## 4. Was dafür bereits gebaut ist

Erfreulich viel. Diese Bausteine existieren und sind teils live:

| Baustein | Datei | Zustand |
|---|---|---|
| Einwilligung erteilen/widerrufen | `src/training/consent.js` | live (`/api/training/consent`, antwortet 401 ohne Anmeldung) |
| Bereinigung personenbezogener Daten | `src/training/sanitize.js` | gebaut |
| Rechte- und Qualitätsprüfung | `src/training/policy.js` | gebaut |
| Nachweiskette | `src/training/evidence.js` | gebaut |
| Verschlüsselte Ablage | `src/training/encryption.js`, `idrive-conditional-writer.js` | gebaut |
| Aufbereitung zum Datensatz | `src/training/pipeline.js` | gebaut |
| Trainings-/Testaufteilung | `src/training/split.js` | gebaut |
| Beförderungs-Tor | `src/evaluation/modelPromotion.js` | gebaut |
| Qualitätsmessung | Eval-Suite + Loop | **läuft 24/7** |

Zehn Qualitäts-Tore muss jeder Datensatz passieren (`REQUIRED_QUALITY_GATES`):
build, typecheck, lint, unitTests, integrationTests, privacyReview, security,
nonRegression, rollback, stagingOrLive.

**Es fehlt kein Werkzeug. Es fehlt der Rohstoff.**

## 5. Die fünf Stufen

### Stufe 0 — Datenquelle entscheiden (Betreiber, kostenlos)

Die einzige echte Blockade. Zur Wahl stehen im Rahmen der Richtlinie:

- **Eigene Nutzer-Dialoge mit Einwilligung.** Die Maschinerie ist gebaut und
  live. Braucht eine Datenschutzerklärung-Ergänzung und einen sichtbaren
  Einwilligungs-Schalter im Konto.
- **Eigene Arbeit des Betreibers.** Die Task Capsules dieses Projekts sind
  ausdrücklich **keine** Trainingsdaten (so die Richtlinie), aber neu erzeugte,
  selbst geschriebene Beispielpaare wären zulässig.
- **Offene Datensätze mit passender Lizenz.** Kostenlos, sofort verfügbar,
  aber nicht smejj.com-spezifisch — nützlich als Grundstock, nicht als
  Alleinstellungsmerkmal.

Ohne diese Entscheidung ist jede weitere Stufe gegenstandslos.

### Stufe 1 — Sammeln (kostenlos, Wochen bis Monate)

Erfassungstor an, Einwilligung einholen, Beispiele laufen in
`training/queue/v1/`. Kosten: nur Speicher auf IDrive e2, im Jahrespaket
enthalten.

**Menge, ab der es sich lohnt:** unter etwa 1.000 geprüften Beispielpaaren
lohnt ein Feintuning nicht — das Ergebnis wäre Rauschen. Sinnvoll ab 1.000,
belastbar ab etwa 5.000 bis 10.000. Bei realistischem Zulauf ist das eine
Frage von Monaten, nicht von Tagen. Diese Zahl ist die ehrlichste im ganzen
Dokument und sollte die Erwartung setzen.

### Stufe 2 — Datensatz bauen (kostenlos, Stunden)

`pipeline.js` und `split.js` erzeugen einen versionierten, geprüften Datensatz
mit Trainings- und Testteil. Der Testteil darf **nie** ins Training — sonst misst
man später sich selbst.

### Stufe 3 — LoRA-Training auf Salad (kostenpflichtig, stundenweise)

Erst hier entstehen Kosten. Salad wird stundenweise abgerechnet, hinter
Budget-Tor, mit Laufzeitbegrenzung und ohne automatische Aufladung — so wie es
die Richtlinie ohnehin vorschreibt.

**Grobe Größenordnung, kein Angebot:** ein LoRA-Lauf über einige tausend
Beispiele auf einer RTX 4090 liegt im Bereich weniger Stunden. Bei Salad-Preisen
für Community-GPUs bedeutet das eine **einstellige Dollar-Summe pro Lauf**. Der
genaue Betrag hängt an Datenmenge, Kontextlänge und Anzahl der Durchläufe und
lässt sich erst nach Stufe 2 seriös beziffern.

**Offene technische Frage, ehrlich benannt:** ob ein 35B-MoE-Modell mit
4-Bit-Quantisierung auf einer 24-GB-Karte sauber trainiert, ist nicht
verifiziert. Das muss ein einmaliger Testlauf klären, bevor Budget gebunden
wird — nicht eine Schätzung.

### Stufe 4 — Bewerten und erst dann befördern (kostenlos)

Das trainierte Modell läuft gegen **dieselbe Suite**, die heute schon misst. Der
Vergleich ist damit fair, weil der Maßstab älter ist als das Modell.

`modelPromotion.js` verlangt zusätzlich eine **menschliche Freigabe**
(`human_approval_gate`) — ein Modell befördert sich nie selbst. Erst wenn
smejj 1.0 die Fremdmodelle schlägt, ersetzt es sie; vorher bleibt es Beifahrer.

## 6. Was das kostet — Übersicht

| Stufe | Kosten | Zeit |
|---|---|---|
| 0 Entscheidung | 0 USD | Minuten |
| 1 Sammeln | 0 USD (IDrive im Jahrespaket) | Wochen bis Monate |
| 2 Datensatz | 0 USD | Stunden |
| 3 Testlauf Machbarkeit | wenige USD | 1 Tag |
| 3 Trainingslauf | einstellig USD je Lauf | Stunden |
| 4 Bewertung | 0 USD (Suite läuft schon) | Minuten |

Der einzige Kostenpunkt ist Stufe 3 und er ist **abschaltbar, gedeckelt und
stundenweise**. Nichts davon ist ein Abonnement.

## 7. Empfohlene Reihenfolge

1. **Stufe 0 entscheiden.** Ohne Datenquelle bleibt alles Theorie.
2. **Einwilligung sichtbar machen**, falls Nutzerdaten gewählt werden —
   Datenschutzerklärung und Konto-Schalter. Die Technik dahinter ist fertig.
3. **Sammeln und warten.** Währenddessen läuft die Messung weiter und liefert
   die Vergleichsbasis, gegen die später gemessen wird.
4. **Bei 1.000 Beispielen: Machbarkeits-Testlauf** auf Salad, wenige Dollar,
   klärt die offene MoE-Frage.
5. **Erst danach** über echte Trainingsläufe entscheiden.

## 8. Was dagegen spricht, sofort zu starten

Der Vollständigkeit halber, weil es die ehrlichere Beratung ist: die
Qualitätsmessung steht aktuell bei **76,47 %** für das eingekaufte Modell — mit
drei kritischen Fehlern. Bevor ein eigenes Modell trainiert wird, ist die
lohnendere Frage, warum die eingekaufte Kette gerade schlechter geworden ist.
Ein eigenes Modell zu trainieren, das ein schwankendes Fremdmodell nachahmt,
verankert dessen Schwankung.

**Empfehlung: erst den Einbruch aufklären, dann Daten sammeln, dann trainieren.**
