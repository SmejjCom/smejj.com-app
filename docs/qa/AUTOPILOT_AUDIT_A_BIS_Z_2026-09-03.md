# Autopilot-Audit A bis Z — 2026-09-03

Betreiber-Auftrag 03.09.: „alle Autopiloten einzeln durchgehen, testen, ob die
gesamte App von A bis Z gedeckt ist, Vorschläge: welche verbessern, welche fehlen".
Methode: (1) Live-Ampel gemessen, (2) Registry-TÜV aus dem Code, (3) Funktions-
inventar der App, (4) Deckungs-Matrix, (5) Vorschlagsliste. Gebaut wurde in
dieser Runde nichts außer Nr. 72 (eigener Auftrag, siehe
`docs/architecture/MODELL_EVOLUTION_TAKT_NR72_2026-09-03.md`).

## 1. Live-Bestand (gemessen 03.09. 14:10 UTC, smejj.com/admin/autopiloten)

| Wert | gemessen |
|---|---|
| Autopiloten live | 71 (Nr. 01–71; Nr. 72 liegt im Bauzweig, nicht live) |
| grün / gelb / rot | 68 / 0 / 3 |
| Control-Server-Bau | gestartet 03.09. 09:34 UTC (`/api/health.gestartetAm`) |
| Tagesmappe | 1 Entscheidung (Flag `probe-flag` > 30 Tage), 3 rote Ampeln, 0 stumme Quellen |
| Evolution-Engine | Note 86/100, Abdeckung 100 %, 1.111 Aktionen an 21 Tagen, Parität 60 |

Die drei Roten, einzeln geprüft:

| Autopilot | Grund laut Ampel | Einordnung |
|---|---|---|
| 33 Erste Hilfe | „2 Autopilot(en) nach 3 Versuchen aufgegeben" | **Doppel-Rot durch Bauart:** die zwei sind Mac-Jobs (Betriebswache, Web-Vitals), die der Server nie starten kann. Eskalation ist richtig, Rot ist falsch — ein Mac-Job gehört als Betreiber-Punkt in die Tagesmappe. |
| 42 Betriebswache (Mac 5:30) | „Responsive+Touch gegen smejj.com: rot" seit 02.09. 05:37 | **Wahrscheinlich veraltet:** der Touch-Fix (Modell-Chip 30 → 44 px) ging heute live, der Lauf um 05:30 sah ihn noch nicht. Entscheidet der Lauf am 04.09. |
| 63 Web-Vitals-Wache (Mac 6:15) | LCP p75 1616 > 1500 ms; Gewicht 307 > 300 KB (Median aus 5 Läufen) | **Echter Grenzbefund:** nach v735 liegt die Startseite kalt wieder über 300 KB. TTFB ist seit 02.09. nur Hinweis. |

## 2. Der wichtigste Befund: die Evolution-Engine ist blind für den Chat

`/api/admin/ops/evolution` (21 Tage): 1.007 von 1.111 Aktionen sind Art
`autopilot`, 80 `werkzeug`, 24 `recherche`. **`text`, `code`, `bild`, `video`,
`audio`, `dokument`, `agent`, `automation`, `workflow`: 0 Meldungen.** Die
Brücke sagt in `/health`: `evolutionMelder: {aktiv: true, ziel: smejj-control}`.
Also meldet die Brücke, aber der Control-Server bucht nichts — am 14.08. war der
Weg bewiesen (2 × `art:"text"`). Seit der Env-Löschung vom 14.08. fehlt
vermutlich `SMEJJ_EVOLUTION_TOKEN` auf einer Seite (Melde-Eingang antwortet 401,
und der Melder verschluckt Fehler bewusst). Folge: „Note 86, Abdeckung 100 %"
misst die Autopiloten, nicht die Antworten an Nutzer; Nr. 37/39/72 rechnen auf
Selbstmessung. **Nachweis für den Betreiber:** Zeabur-Portal, beide Dienste,
Variable `SMEJJ_EVOLUTION_TOKEN` vergleichen.

## 3. Registry-TÜV (72 Einträge aus dem Bauzweig)

| Befund | Anzahl | Kennungen |
|---|---|---|
| grün nur aus Selbsttest, kein Bezug zu Echtdaten, Ablage oder Netz | 15 | 08 deep-research, 09 code-interpreter, 10 memory-sync, 11 self-healing, 13 task-orchestrator, 14 self-improvement, 16 smart-router, 18 model-lifecycle, 20 process-reward, 21 knowledge-distiller, 22 evolutionary-mutation, 25 live-arena-leaderboard, 26 instant-web-container, 27 realtime-voice-pair, 28 autonomous-git-bot |
| Registry-Text verspricht mehr als der Lauf misst | ≥ 8 | 08 „Präzision +85 %", 14 „DPO Pipeline läuft 24/7" (Training ruht seit 06.08.), 18 „Zero-Downtime Releases", 25 „kontinuierliche Duelle", 27 „< 300 ms", 29 „alle 5 Min" (sind 15), 32 „24 Autopiloten" (sind 63 Läufe), 10 „IDrive e2" (berührt keine Ablage) |
| ohne Selbsttest mit kaputter UND gesunder Probe | 34 | 01–03, 06–10, 12, 13, 15–17, 20, 22–35, 40–43, 61, 63 (einseitig: 14, 18, 19, 21, 58) |
| laufen im Läufer, fehlen aber in `IM_LAEUFER_BETRIEBEN` (Selbstheilung kann sie nicht wiederbeleben) | 4 | 04 konkurrenz-radar, 31 angelina-autopilot, 35 support-sla, 43 sync-waechter |
| Lauf ohne Registry-Eintrag, Ergebnis wird verworfen | 1 | `tuerwaechter` (opsAutopiloten.js:664) |
| tote Selbsttest-Funktionen / tote Kennung im Ehrlichkeits-Test | 3 + 1 | `S.laufMultimodal`, `S.laufUserFeedbackFlywheel`, `S.laufInternetHarvester`; `salad-sonden` |
| Attrappe in der Konsole | 1 | Kachel „DPO Self-Training · 24/7 Aktiv · Ground-Truth Self-Play" fest in `public/admin/views-stage9.js:285` |
| Sender außerhalb des Repos | 2 | 61 Test-Wächter, 63 Web-Vitals: `~/.local/share/*/wache.sh` — nicht versioniert |
| Nummern | 0 Lücken, 0 Doppel | Reihenfolge in AUTOPILOTEN nicht numerisch (kosmetisch) |

Stark und ehrlich (Vorbild für den Rest): 36–39, 44–60, 62, 64–72 — jeder mit
Selbsttest k+g, echter Datenquelle, Zahl in der Meldung.

## 4. Deckungs-Matrix: Funktionsbereich × Wächter

Inventar: 13 Bereiche, ~230 Funktionen mit Datei-Beleg (Explore-Lauf 03.09.).
„gedeckt" = ein Wächter misst die Funktion live; „Selbsttest" = nur Mathematik
im Läufer; „—" = niemand misst.

| Bereich | gedeckt durch | Lücke (niemand misst) |
|---|---|---|
| 1 Chat-Kern | 29 Probe-Nutzer (7 Schritte), 43 Sync, 36 Antwort-TÜV, 50 Fehler-Fänger | **Stopp-Knopf nach 5 s** (zwei Stromfamilien, Falle vom 23.08.); Verlauf/Projekt-Sync-Konflikte |
| 2 Modelle & Spuren | 62 Katalog, 71 Umgebung, 34 Einkäufer, 01 Qualität | **01 misst nur die Schnellspur (Groq)** — die tiefe Spur (GLM, 97 %) hat keinen Takt; öffentliche API `/v1` ungemessen; Gemini Nano lokal ungemessen; 16 Router nur Selbsttest |
| 3 Wissen | 23 Ernte, 04 Radar, 38 Lücken | **Projektwissen-Frische** (Brücke: `exportedAt` 02.09. 09:02 — wer erneuert?); RAG-Deckung nur als lokales Skript; 10 Memory nur Selbsttest |
| 4 Medien | 12 Health-Sonde (Video-Worker, Bild-Maler) | **keine Funktionsprobe** (Bild wirklich erzeugt? — „Medien-Ampel falsches Grün" 22.08.); PDF/Office/Audio-Datei/Video als Eingabe: Funktion fehlt ganz |
| 5 Sprache | 03 Voice-Region, 31 Angelina (HTML) | Ohr/Stimme end-to-end (STT/TTS-Probe); 27 nur Selbsttest |
| 6 Agenten | 06 Brückenwächter, 30 Werkstatt, Evolution `werkzeug` (80 Aktionen, Note 100) | **Maus-Engine / Fern-Browser** nicht in der Ampel; Code-Fläche; Tool-Loop-Erfolgsquote nur über die (blinde) Evolution |
| 7 Konto & Recht | 66 Mail, 67 DSGVO, 68 AI-Act, 52 Konto, 29 Auth-Schritt | **Einwilligungs-Weg** (`consent/decision` antwortet seit 14.08. 503 — kein Wächter hat es gemeldet); Login-Erfolgsquote (Brücke zählt 40 % gültige Token, keine Wache) |
| 8 Abo & Kosten | 55 Kosten, 69 Umsatz, Budget-Gate | Stripe-Webhook-Gesundheit (letztes Ereignis, Signaturfehler) |
| 9 Adminbereich | 44 Rück-Roller, 60 Tagesmappe, 39 Supervisor, Locks | Attrappen-Kachel (siehe 3.) |
| 10 Auslieferung | 29 Bündel-Gleichheit, 57 Auffindbarkeit, 63 Web-Vitals, 49 Zertifikate, 02 Spiegel | **Bau-Wache** (kam der Push als Zeabur-Bau an? Token 401 macht blind); Markenkette nur lokal; 15 Sprachseiten live ungemessen (57 prüft nur `/`) |
| 11 Sicherheit | 41, 45–54, 61 Tests | **Red-Team live** (Prompt-Injection nur als Unit-Test); CSP-Drift live |
| 12 Training & Evolution | 05, 65, 72, 37–40 | **Melder-Token** (siehe 2.); Modell-Canary/Rollback für 1.1; GPU-Heimat |
| 13 Sonstiges | 31 Angelina (i18n-HTML) | Barrierefreiheit (kein a11y-Wächter); Hilfe/Support-Antwortzeit nur 35 SLA |

## 5. Vorschlagsliste (priorisiert, mit Nutzen und Kosten)

### Runde 1 — Ehrlichkeit und Reparatur (0 USD, Bauzweig, 1 Sitzung)
1. **Evolution-Melder heilen** — `SMEJJ_EVOLUTION_TOKEN` auf Control und Brücke gleich setzen (Betreiber, Zeabur-Portal), danach Beweis: `text`-Aktionen > 0. Nutzen: Note und Nr. 37/39/72 messen endlich Nutzer-Antworten.
2. **Ehrlichkeits-Runde:** Heiler-Liste + 4 Kennungen; `tuerwaechter` registrieren oder streichen; 3 tote Selbsttests + `salad-sonden` raus; DPO-Kachel entfernen; Registry-Texte 08–28 auf „Selbsttest im Läufer" umschreiben (Nr. 29/32 Zahlen korrigieren).
3. **Erste Hilfe:** Mac-Jobs nicht mehr als Rot eskalieren, sondern als Karte „WARTEN AUF DICH" in der Tagesmappe. Nutzen: eine Rote weniger, die nichts bedeutet.
4. **Nr. 72 ausliefern** (Stempel-Doppelklick → Push → Bau → Zyklus-Zahl steigt).
5. **Web-Vitals:** Startseite kalt wieder unter 300 KB (Nachlade-Kette prüfen, v735 hat 8 Marken gezogen).

### Runde 2 — fehlende Wächter (0 USD, je ein Modul + TÜV, 1–2 Sitzungen)
| Nr. | Wächter | misst | schließt Lücke |
|---|---|---|---|
| 73 | Einwilligungs-Wache | `consent/decision` + Erfassungsprobe antworten 200; Ledger lesbar | 7 (503 seit 14.08. unbemerkt) |
| 74 | Tiefe-Spur-Messung + Stopp-Probe | Suite gegen GLM-Spur 1×/Tag (Kontingent ≈ 14 Anfragen); Stopp nach 5 s bricht den Strom | 1, 2 |
| 75 | Bau-Wache | letzter Push auf den Bauzweig vs. `gestartetAm`; GitHub check-runs (öffentlich lesbar) | 10 (Token-blind) |
| 76 | Projektwissen-Frische | `exportedAt` der Brücke vs. Alter; Chunk-Zahl | 3 |
| 77 | Medien-Funktionsprobe | 1 Bild/Woche wirklich erzeugen (Budget-Deckel), Bytes > 0 | 4 |
| 78 | Red-Team-Probe | 5 Injektions-Prompts/Tag gegen die Brücke, Erwartung: Abwehr | 11 |
| 79 | Modell-Canary/Rollback | Router-Spur smejj 1.1 mit Canary-Anteil, Note vs. Referenz, automatischer Rückfall | 12 (Auftrag Punkt 15) |
| 80 | Sprachseiten-Wache | 15 Locales: 200, Titel, hreflang | 10, 13 |
| 81 | Maus/Fern-Browser-Sonde | Health + Mini-Auftrag (Seite öffnen, Text lesen) | 6 |
| 82 | Stripe-Webhook-Wache | letztes Ereignis, Signaturfehler, Alter | 8 |

### Runde 3 — nur der Betreiber kann entscheiden
- **GPU-Heimat 0 USD:** Kaggle (30 GPU-h/Woche, planbare Notebooks) als Trainer für Qwen3-4B; Gewichte/Daten/Checkpoints auf e2. IDrive e2 selbst kann nicht rechnen — Speicher ist kein Rechner.
- **Sieben Zeabur-Werte** `IDRIVE_E2_TRAINING_*` + `SMEJJ_TRAINING_CAPTURE_ENABLED` (Trainingsplan 02.09.), sonst bleiben es 0 Paare.
- **Zeabur-Token erneuern** (401 seit 02.09.): ohne ihn sind Baulogs, Env-Setzen und Neubau per Skript blind.
- **1,35 TB Fremdgewichte** (GLM-5.2, Kimi) im Lager: nicht rechenbar ohne 8 × H100; behalten oder auf Archiv reduzieren.
- **„1 Milliarde Besucher/Tag":** ein Zeabur-Container schafft das nicht. Ehrlicher Weg: Last-Probe (Nr. 56) auf Stufen 100 → 1.000 → 10.000 parallel ausbauen, dann CDN vor die Startseite, Brücke mehrfach, Regionen. Jede Stufe ist eine Kostenentscheidung.

## 6. Was diese Prüfung NICHT beweist
- Die Ampel-API (`/api/admin/ops/autopiloten`) antwortete im Browser dreimal nicht binnen 40 s — die Zahlen oben stammen aus der gerenderten Seite und der Tagesmappe. Der Endpunkt selbst gehört auf die Liste (Nr. 56 misst nur `/health`).
- Registry-TÜV = Code-Lesung im Bauzweig; ob jeder Selbsttest live so läuft, zeigt nur die Ampel.
- Die Ursache des Melder-Ausfalls (Token) ist Verdacht mit Beleg, kein gemessener 401 — das Portal entscheidet.
