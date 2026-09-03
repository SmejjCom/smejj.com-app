# Modell-Evolutions-Takt (Autopilot Nr. 72) — Stand 2026-09-03

Betreiber-Auftrag 2026-09-03: „24/7 dauerhaft trainieren … Autopilot erstellen …
du beobachtest, ob er 24 Stunden läuft und trainiert." Betreiber-Wahl: „Nr. 65
bauen (Empfehlung)" — die Nummer 65 war seit dem 26.08. bereits von der
Trainings-Reife-Wache belegt, der neue Takt trägt darum die **Nr. 72**.

## 1. Was der Takt tut (alle 30 Minuten, neustart-fest)

| Schritt des Auftrags | Umsetzung in Nr. 72 | Quelle (gemessen) |
|---|---|---|
| MESSEN | Referenz-Note der Live-Kette | Herzschlag-Meldung der Qualitätsmessung (Nr. 01) |
| MESSEN | Note je Fähigkeit (text, code, bild, recherche, werkzeug, audio …) | `evolution/kennzahlen` der Evolution-Engine (Nr. 37), 7 Tage |
| SCHWÄCHE FINDEN | Fähigkeit mit der niedrigsten Note, nur ab 5 Messungen | dieselbe Ablage |
| DATENREIFE | Stufe 0–3 gegen das Reife-Ziel | Karte `letzte-karte` der Reife-Wache (Nr. 65) |
| TOR PRÜFEN | sieben Tore, fail-closed (siehe 2.) | echte Prozess-Umgebung + Capture-Schalter |
| PROTOKOLL | `autopiloten/modell-evolution/letzter-zyklus` (überschrieben, Zähler) + `tag-JJJJ-MM-TT` | IDrive e2 über `createRecordStore` |
| ENTSCHEIDEN | Karte in der Tagesmappe (Nr. 60) **nur bei allen Toren offen** | `tagesmappeAutopilot.js` |

Meldung in der Ampel (Beispiel):
`Selbsttest 6/6; Zyklus 17 seit 2026-09-03; Referenz 97.1 % (Nr. 01, gruen);
schwächste Fähigkeit code Note 71/100 (n=12, 7 Tage); Reife Stufe 0/3 (0/5000);
Tor ZU 1/7 (zu: Daten, Einwilligung, Kostenfreigabe, Basismodell, GPU-Heimat,
Schalter) — Training NICHT gestartet (Rote Liste); nächster Schritt:
Einwilligungs-Paare sammeln, bis die Reife-Wache (Nr. 65) Stufe 3 meldet;
Protokoll abgelegt`

Die Zyklusnummer steigt mit jedem Takt und überlebt Neustarts (sie kommt aus
der Ablage). „Läuft er rund um die Uhr?" ist damit ablesbar: 48 Zyklen je Tag.

## 2. Die sieben Tore (Reihenfolge = Reihenfolge der nächsten Schritte)

| Tor | offen wenn | Handgriff des Betreibers |
|---|---|---|
| Daten | Reife-Stufe 3 (Bestand ≥ Ziel; Ziel per `SMEJJ_TRAINING_REIFE_ZIEL_GESAMT`, Plan 02.09.: 3.000 Paare) | Einwilligungs-Paare sammeln |
| Einwilligung | `SMEJJ_TRAINING_CAPTURE_ENABLED=YES` | dazu `IDRIVE_E2_TRAINING_*` im Zeabur-Portal (Befund 02.09.: fehlen → 503) |
| Kostenfreigabe | `SMEJJ_LORA_FREIGABE_ID` gesetzt und `SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD` ≤ Deckel (`SMEJJ_TRAINING_BUDGET_MONAT_USD`, Standard 10) | schriftliche Freigabe hinterlegen |
| Basismodell | `SMEJJ_LORA_BASIS_PREFIX` gesetzt | Qwen3-4B nach e2 `models/staging/` (Stufe 2 des Plans) |
| GPU-Heimat | `SMEJJ_LORA_TRAINER_URL` gesetzt | Rote Liste: Salad zurück oder neuer Anbieter |
| Schalter | `SMEJJ_LORA_LOOP_ENABLED` + `SMEJJ_LORA_TRAINING_ENABLED` wahr, kein `SMEJJ_LORA_NOTAUS` | Charta §3 |
| Messlatte | Referenz-Note gemessen vorhanden | Qualitätsmessung Nr. 01 grün halten |

Sind alle sieben offen, legt der Takt die Karte „Trainings-Tor offen … startet
NUR per Betreiber-Klick" unter ENTSCHEIDEN ab. **Er startet nichts.** Das
Feld `trainingGestartet` im Protokoll ist konstant `false` — der Test
`tests/modell-evolution.test.mjs` verlangt das auch bei offenem Tor.

## 3. Was vom 30-Punkte-Auftrag heute wo liegt

| Auftragspunkt | Stand | Wo |
|---|---|---|
| 1 Kontinuierliche Verbesserung (Messen → Schwäche → Plan) | **läuft** | Nr. 72 + Nr. 36/37/38/39 |
| 2 Versionierung (1.0.x, reproduzierbar) | Gate gebaut, Register ohne echte Datei | `src/evaluation/modelPromotion.js`, `model-lifecycle/registry` (Nr. 18) |
| 3 Automatische Modell-Evolution (Schwächen → Aufgaben) | **läuft** | Nr. 37 (Aufgaben-Ablage), Nr. 38 (Lücken), Nr. 72 (schwächste Fähigkeit) |
| 12/13 Benchmarks, Vergleiche | läuft (Suite 14 Fälle, Mac 2×/Tag; Arena Nr. 19; Radar Nr. 04) | `evals/suites/smejj-chat-core-v1.json` |
| 14 Qualitäts-Gate | gebaut, menschliche Freigabe Pflicht | `modelPromotion.js` (> 3 %, 0 kritisch) |
| 15 Canary/Rollback (Modelle) | **fehlt** für Modelle; für Deploys: Rück-Roller Nr. 44 | — |
| 16/17 Trainings-Pipeline, Datenqualität | gebaut, ruht (0 Paare) | `src/training/*`, Nr. 05, Nr. 65 |
| 20 Red-Team | teilweise (Prompt-Injection-Test, Inhalts-Schutz Nr. 52) | `tests/prompt-injection-schutz.test.mjs` |
| 22 Kostenoptimierung | läuft | Nr. 55, Budget-Tor in Nr. 72 |
| 23 Kein Live-Selbsttraining | **eingehalten** | Nr. 72 startet nichts |
| 24 Observability | läuft | Modul AP, Tagesmappe Nr. 60 |
| 25/26 Tages-/Stundenaufgaben | läuft (30-Minuten-Takt, Wochenbericht) | Autopilot-Läufer |

Ehrlich offen: ein eigenes Modell als Datei gibt es nicht (Plan 02.09., Stufe 2),
es gibt keine GPU-Heimat und 0 Einwilligungs-Paare. Der Takt macht diese drei
Lücken alle 30 Minuten sichtbar, statt sie mit Aktivität zu überdecken.

## 4. Anschluss

- Läufer: `deckungsLaeufe.js` (autopilotLaeufer.js steht bei 798 Zeilen), läuft
  VOR der Tagesmappe im selben Takt.
- Registry: `opsAutopilotenListeWachstum.js` (neben Nr. 65), Bereich „Modelle & Wissen".
- Tests: `tests/modell-evolution.test.mjs` (8 Tests, kaputt + gesund), Zähl-Wächter
  in `tests/autopilot-laeufer.test.mjs` auf 60/61/63, Ehrlichkeits-Liste, Tagesmappe-Selbsttest 12/12.
- Beobachtung: Ampel Nr. 72 unter `smejj.com/admin/autopiloten/`; Zyklus-Zahl
  muss je Tag um ~48 steigen. Bleibt sie stehen, ist der Takt tot — nicht grün.
