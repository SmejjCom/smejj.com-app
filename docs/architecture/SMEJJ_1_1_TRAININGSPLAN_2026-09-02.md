# smejj 1.1 — Trainingsplan (Vorlage zur Entscheidung)

Status: **Plan, nichts eingeschaltet.** Erstellt 2026-09-02 auf Auftrag des Betreibers
(„Erste Stelle: eigenes Modell smejj 1.0 trainieren, fit machen, dann 1.1, 1.2 …").
Rahmen, die weiter gelten: `SMEJJ_1_0_TRAINING_DATA_POLICY.md` (fail-closed),
`SMEJJ_1_1_DATENSATZ_PLAN_2026-08-30.md`, `SMEJJ_1_1_EINWILLIGUNG_TRAINING_ENTWURF_2026-08-30.md`,
Versions-Gate (`job_lora_versionsgate_20260830`), Charta v1.2 Abschnitt 0 (Trainingsruhe),
`FREE_ONLY_MASTER_POLICY.md`.

## 1. Was heute wirklich ist (gemessen, nicht vermutet)

| Punkt | Stand 2026-09-02 |
|---|---|
| „smejj 1.0" im Menü | Etikett der Live-Kette: Schnellspur Groq über die Brücke, tiefe Spur GLM-5.2 (seit 02.09. über das Z.ai-Coding-Paket, 18 USD/Monat) |
| Eigenes Modell als Datei | **existiert nicht** — `model-files/smejj-1-0/` ist leer, das geplante Basismodell `qwen3-6-35b-a3b` liegt nicht im Lager (Vermessung 01.08.) |
| Qualitätsnote (Suite smejj-chat-core, 14 Fälle, 3 Wiederholungen) | **97,1 %** mit GLM-5.2 (01.09. 04:10) — **62,1 %** mit Groq-Rückfall gpt-oss (01.09. 16:10), weil das Z.ai-Guthaben leer war; Ursache am 02.09. behoben |
| Training | ruht seit 06.08. (jede Korpus-Verbesserung senkte die Note 95,9 → 36,6 %; RAG erreicht 96 %) |
| GPU-Heimat | keine — Salad seit 12.08. abgetrennt, Zeabur hat keine GPU |
| Datensatz | 0 Paare; Plan vom 30.08. verlangt 3.000–10.000 echte Frage-Antwort-Paare mit Einwilligung |
| Versions-Gate | fertig gebaut: neue Version nur, wenn sie die Suite um > 3 % schlägt, 0 kritische Fehler, Live-Schaltung nur durch Menschen |
| Ungenutzte Gewichte im Lager | 1,35 TB (GLM-5.2, Kimi) — werden nicht gerechnet, nur gelagert |

**Kernaussage:** Der Engpass war nie Rechenleistung, sondern Daten. Faktenwissen gehört
in RAG (bewiesen); ein trainiertes smejj-Modell liefert **Stil, Sprache, Verhalten** und
später Unabhängigkeit von fremden Anbietern.

## 2. Messlatte (vorher festgelegt, nicht hinterher)

- Suite `evals/suites/smejj-chat-core-v1.json`, 3 Wiederholungen je Fall, Rauschschwelle 3 %.
- Referenz ist die aktuelle Live-Kette mit GLM-5.2: **97 %**.
- smejj 1.1 wird nur **Kandidat**, wenn es auf der Stil-Suite die Referenz erreicht oder
  schlägt und **0 kritische Fehler** hat. Zusätzlich eine Handprobe vor jeder Zahl:
  „Wie schreibt man den Namen der Plattform?" muss `smejj.com` ergeben.
- Tempo: erster Token unter 1,0 s auf dem Zielserver; sonst kein Kandidat.
- Live-Schaltung bleibt Betreiber-Klick (`modelPromotion.js`, promotionStatus).

## 3. Stufen, Kosten, Stoppregeln

### Stufe 0 — Live-Note zurück auf ≥ 95 % (0 USD, sofort)
**Nachtrag 02.09., 06:35 UTC (manueller Messlauf nach dem GLM-Fix): weiter 62,1 %, 9 kritisch.**
Grund gemessen: Der Messlauf fragt die Brücke als `live-default` — das ist die **Schnellspur**
(Groq gpt-oss, ohne Projektwissen). Die 97 % stammen von der **tiefen Spur** (GLM-5.2), die
die Brücke nur bei „Nachdenken", Coding oder ausdrücklicher Modellwahl nimmt. Die Note ist
also kein Rückfall, sondern zwei verschiedene Ketten. Entscheidung für Stufe 0: Schnellspur
bekommt Projektwissen (RAG-Schnipsel aus dem Control-Index) — Änderung in
`public/chat-bridge.js` (Security-Lock, Stempel = Betreiber-Klick), Messlatte danach ≥ 95 %
auf derselben Suite bei erstem Token < 1,5 s.
Seit 02.09. antwortet GLM-5.2 wieder. Der nächste Messlauf (Mac, 07:10/19:10) muss
≥ 95 % zeigen. Zusätzlich: Groq-Rückfall darf nie wieder ohne Projektwissen antworten
(Messlauf 16:10 zeigte `rag: false`) — Brücke bekommt RAG auch auf dem Rückfallweg.
Stopp: Note < 95 % zweimal hintereinander → erst Ursache, dann weiter.

### Stufe 1 — Einwilligung und Sammler (0 USD, Woche 1, dann 2–6 Wochen Sammeln)
**Stand 02.09.:** Einwilligung (Schalter „Modelltraining erlauben", signierter Ledger auf e2)
und Erfassungs-Route `/api/training/capture` existierten bereits — nur der Aufrufer in der App
fehlte. Neu: `public/ai/frage-erfassung.js` + Haken in `chat-stream.js` (design-v11 626f33b0,
live 964c011). Erfasst wird NUR die Frage — Antworten aus GLM/Kimi/Groq sind laut Rechteprüfung
vom 17.07. für Training gesperrt (Anti-Distillation). **Folge für den Datensatz:** Antworten
müssen aus erlaubter Quelle kommen — vom Betreiber gebilligt/umgeschrieben oder vom eigenen
Hausmodell (Qwen3-4B, Apache-2.0) mit Projektwissen erzeugt. Offen: Zeabur-Variable
`SMEJJ_TRAINING_CAPTURE_ENABLED=YES` (Auto-Modus blockiert den Klick — Betreiber setzt sie
im Portal: smejj-control → Variable → Add → Save → Redeploy).
1. Einwilligungstext aus dem Entwurf vom 30.08. in die PWA (Einstellungen, Schalter,
   Widerruf jederzeit). **Braucht schriftliche Freigabe + Einwilligungs-Lock-Stempel.**
2. Sammler: nur bei gesetzter Einwilligung werden Frage + gebilligte Antwort
   (Daumen hoch, oder vom Nutzer korrigiert) PII-bereinigt nach IDrive e2
   `datasets/smejj-1-1/roh/` geschrieben. Kein Capture aus Task Capsules (Policy).
3. Betreiber-Quelle: eigene Fragen an die App mit gebilligter Antwort (bis 20 %).
4. Ziel vor dem ersten Lauf: **3.000 Paare**, 100 Stichproben vom Betreiber gebilligt.
Stopp: unter 3.000 Paaren wird nicht trainiert — das war der Fehler vom August.

### Stufe 2 — Basismodell festlegen und ablegen (0 USD, Bandbreite)
Die Registrierung zeigt auf ein 35B-Mixture-Modell, das nirgends liegt und nach dem
Salad-Aus nirgends laufen könnte. Vorschlag (passt zum Hausmodell-Beschluss vom 01.09.,
Silicon-Valley-Server 2C/8GB, ~3 GB frei):
- **Qwen3-4B-Instruct** als 1.x-Basis: läuft als Q4_K_M mit ~2,5 GB RAM auf dem
  vorhandenen Server, ist LoRA-tauglich, Apache-2.0.
- Gewichte nach e2 `models/staging/qwen3-4b/` mit manifest.json + SHA-256.
- Nach Versionsschema ist das formal eine neue Basis. Betreiber-Entscheid: Qwen3-4B
  gilt als 1.x-Basis (dann heißt der erste Adapter smejj 1.1) — oder Schema strikt
  (dann smejj 2.0). Empfehlung: 1.x, weil smejj 1.0 nie als Datei existierte.

### Stufe 3 — Training (Geld, aber klein)
- LoRA/QLoRA auf Qwen3-4B, 3.000–10.000 Paare, 3 Epochen: **15–30 Minuten** auf einer
  RTX 3090/4090 (Referenz: 8,7 min für den Lauf vom 04.08.).
- Kosten je Lauf **unter 0,30 USD**; Suche über 4 Konfigurationen + Eval **≈ 2 USD**.
- **Budgetdeckel 10 USD/Monat**, Selbst-Stopp aus `workers/smejj-lora-loop/waechter.js`
  (60 min ohne Bereitschaft → Gruppe stoppen), Regel „wird nicht trainiert, wird
  gestoppt" (180-USD-Falle vom August).
- GPU-Heimat ist eine **Betreiber-Entscheidung (Rote Liste)**: Salad (bestehender
  Anbieter, stundenweise, hinter Budget-Gate — aber am 12.08. abgetrennt) oder ein
  neuer Anbieter (neuer Anbieter = schriftliche Freigabe). Ohne Entscheidung keine Stufe 3.
Stopp: Kandidat unter Referenz − 3 % in zwei Läufen → Datensatz prüfen, nicht Hyperparameter.

### Stufe 4 — Gate, Freigabe, Hausmodell-Dienst (0 USD)
- Versions-Gate benennt `smejj-1-1` nur bei bewiesenem Vorsprung; Register auf e2.
- Auslieferung über den Hausmodell-Dienst aus dem Beschluss vom 01.09.
  (Bedarfs-Laden, Entladen nach 5 min, max. 1 Inferenz gleichzeitig, Rückfall GLM-5.2).
- Router-Spur im **Bauzweig**, Ampel + TÜV mit kaputter und gesunder Probe, Live-Test.
- Menü: smejj 1.1 kommt **dazu**, nichts wird entfernt (Betreiber-Regel).

### Stufe 5 — 1.2, 1.3 … (laufend)
Monatlicher Zyklus, sobald ≥ 1.000 neue gebilligte Paare vorliegen; Daumen-runter-Fälle
als DPO-Paare. Jede Version durch dasselbe Gate; keine Version ohne Artefakt.

## 4. Zeitplan (realistisch)

| Woche | Schritt | Kosten |
|---|---|---|
| 0 (jetzt) | Stufe 0: Messlauf ≥ 95 % bestätigen, Rückfall mit RAG | 0 |
| 1 | Einwilligung + Sammler live (nach Freigabe) | 0 |
| 2–6 | Sammeln bis 3.000 Paare, Stichproben | 0 |
| 6 | Basismodell ablegen, Trainings-Heimat entschieden | 0 |
| 7 | Erster Lauf + Suche, Eval gegen Referenz | ≈ 2 USD |
| 8 | Gate, Betreiber-Freigabe, Hausmodell-Dienst live | 0 |

## 5. Entscheidungen, die nur der Betreiber treffen kann

1. Einwilligungstext freigeben (Einwilligungs-Lock).
2. GPU-Heimat: Salad zurück (bestehend) oder neuer Anbieter (Rote Liste).
3. Budgetdeckel bestätigen: 10 USD/Monat für Training.
4. Qwen3-4B als 1.x-Basis (Empfehlung) oder Schema strikt (2.0).
5. 1,35 TB fremde Gewichte im Lager behalten oder auf archive-only reduzieren (Speicherkosten).

Erst mit 1–4 wird gebaut. Bis dahin bleibt die Trainingsruhe in Kraft.
