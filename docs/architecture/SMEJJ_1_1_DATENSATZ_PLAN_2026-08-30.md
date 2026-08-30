# smejj 1.1 — Datensatz-Plan

Status: Plan, verabschiedet zur Umsetzung im Auftrag vom 2026-08-30  
Stand: 2026-08-30  
Verbindliche Rahmendokumente: `docs/architecture/FREE_ONLY_MASTER_POLICY.md`,
`docs/architecture/SMEJJ_1_0_TRAINING_DATA_POLICY.md`, Charta v1.2 (Trainingsruhe)

## Ausgangslage (gemessen, nicht vermutet)

1. Der Dokumentationskorpus von smejj.com ergibt rund **1.720 Fakten** — etwa
   6 % der fuer Faktenwissen noetigen ~30.000 (Vermessung 2026-08-05/06).
2. Jede Korpusverbesserung senkte die Trainingsnote (95,88 → 36,60 %), waehrend
   **RAG auf derselben Suite 96 %** erreicht. Darum ruht das Training (Charta v1.2).
3. Der erste echte LoRA-Lauf (smejj-1-0, 2026-08-04, 8,74 min auf RTX 3090)
   bewies die Wirkung am STIL: Denkblock zusammengebrochen, Sprache wechselte
   zum kurzen Deutsch der Trainingsdaten.

**Fazit des Plans:** Faktenwissen gehoert in RAG. Der LoRA-Datensatz liefert
STIL, SPRACHE und VERHALTEN — nicht Wissen. Damit ist der Datensatz klein genug,
um ihn wirklich gut zu bauen.

## Ziel

Ein versionierter, immutable Datensatz `smejj-1-1` mit **3.000–10.000
Frage-Antwort-Paaren**, der den smejj-Ton beweisbar trainiert und die
Aktivierungs-Gate-Regel der Schleife durchlaufen kann:

> Eine neue Version (smejj-1-1) wird nur Kandidat, wenn sie die bestehende
> Suite (evals/suites/smejj-chat-core-v1.json) mit Vorsprung ueber der
> Rauschschwelle schlaegt und null kritische Fehler hat. Die Live-Schaltung
> bleibt an die menschliche Freigabe gebunden (modelPromotion.js).

## Fragequellen (Reihenfolge nach Wert)

| # | Quelle | Zielanteil | Recht/Bedingung |
|---|--------|-----------|-----------------|
| 1 | Reale Nutzerfragen aus der Produkt-Nutzung, ergänzt um die vom Nutzer korrigierte/gebilligte Idealantwort | bis 60 % | Nur mit bestehender Trainingseinwilligung des Kontos (Einwilligungs-Lock). Kein automatisches Capture aus Task-Kapseln (Policy: keine automatische Trainingsberechtigung). |
| 2 | Betreiber-Fragen: echte Fragen von Wof K. an die App mit gebilligter Antwort | bis 20 % | Betreiber-Konto, Einwilligung trivial gegeben, dokumentiert. |
| 3 | Support-/Feedback-Nachrichten (E-Mail, PWA-Feedback) | bis 10 % | Anonymisiert, Absenderdaten entfernen, nur allgemein formulierte Faelle. |
| 4 | Synthetische Varianten aus Quelle 1–3 (Umlautungen, Tippfehler, Dialekt-Faerbung, kuerzere Laenge) | bis 10 %, gedeckelt | Nicht aus Dokumentation generieren (Beweis: senkt die Note). Nur echte Fragen variieren. |

**Ausgeschlossen:** Fragen aus Dritt-Webseiten, aus fremden Repos, aus
Dokumentations-Abschriften, synthetische "Fakten"-Paare, alle Inhalte ohne
nachvollziehbare Quelle.

## Anonymisierung (fail-closed, vor jedem anderen Schritt)

Bereinigung im Arbeitsspeicher, VOR dem Schreiben in die Kandidaten-Ablage:

- Namen, E-Mail-Adressen, Telefonnummern, Adressen, Kontokennungen,
  KI-Vertraenskarten-Nummern, URLs mit Pfaden zu privaten Projekten —
  ersetzen durch Platzhalter (`[person]`, `[kontakt]`, `[ort]`).
- Metadaten trennen: Wer-Wenn wird NICHT mit dem Paar gespeichert; im
  Datensatz steht nur Frage/Antwort.
- Ein Fall, der nicht sicher bereinigt werden kann, geht in die **Quarantaene**
  (`quarantine/`), nie in `train.jsonl` — laut Policy ist das keine Option.

## Format und Ablage (konform zur bestehenden Pipeline)

- JSONL, eine Zeile je Paar, Feld `messages` mit mindestens 2 Eintraegen
  (genau das liest `workers/smejj-lora-trainer/datenlader.py`).
- Antworten im smejj-Stil: kurzes Deutsch, direkte Antwort zuerst, kein
  Denk-/Vorueberlegungsblock — das ist die Form, deren Wirkung der Lauf vom
  2026-08-04 am Stil bewies.
- Familienbasierter Split (gleiche Nutzerfamilie nie in Train UND Test):
  `train.jsonl` / `validation.jsonl` / `test.jsonl` unter getrennten
  Schluesseln; der Trainer oeffnet per Coderegel NUR Dateien auf `train.jsonl`.
- Ablage: IDrive e2, Eimer `smejj-model-files`, Schluessel
  `datasets/smejj-1-1/v1/{train,validation,test}.jsonl` plus `manifest.json`
  (Felder `proSplit.train` usw. — gelesen von der Datenpruefung der Schleife).
- Immutable: eine gebaute Version wird nie ueberschrieben; Korrekturen
  ergeben `v2` (Policy-Pflicht).

## Mengen- und Qualitaetsbar

- Ziel: **mindestens 3.000** gute Paare vor dem ersten smejj-1-1-Lauf; oben
  10.000 (mehr ist bei Stil-Training nachlassender Grenznutzen).
- Je Paar gilt: Frage real moeglich, Antwort die gebilligte Idealform,
  Quellenfeld im sidecar (NICHT in der JSONL), Anonymisierung protokolliert.
- Stichprobenpruefung vor dem Bau: 100 zufaellige Paare vom Betreiber
  gebilligt, danach darf gebaut werden.

## Weg zur Aktivierung (nach Charta-Ende der Trainingsruhe)

1. Datensatz `smejj-1-1/v1` bauen, manifest ablegen, Datenpruefung der
   Schleife meldet `vorhanden`.
2. Trainingsruhe vom Betreiber aufheben (SMEJJ_LORA_TRAINING_ENABLED=YES,
   Freigabe-IDs gesetzt) — bewusst ein Betreiber-Schritt, kein Code-Schritt.
3. Die Schleife trainiert Kandidaten auf der (neuen) GPU-Heimat, misst gegen
   `smejj-chat-core-v1`, und vergibt bei Gate-Sieg automatisch den Namen
   `smejj-1-1`, `smejj-1-2`, … (versionen.js).
4. Live-Schaltung: nur ueber modelPromotion mit schriftlicher Freigabe.

## Betreiber-Entscheidungen, die dieser Plan nicht treffen kann

- Aufhebung der Trainingsruhe (Charta v1.2) und neue GPU-Heimat nach dem
  Salad-Exit (2026-08-11) — Zeabur-GPU-Klasse oder Alternativ-Anbieter im
  FREE-ONLY-Rahmen.
- Freigabetext fuer die Trainingsdatennutzung in der PWA (Einwilligung).
- Billigung der ersten 100 Paar-Stichprobe.
