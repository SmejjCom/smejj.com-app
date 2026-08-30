# Quellenpaket für den smejj-1-1-Datensatz

Ein Quellenpaket ist ein VERZEICHNIS mit genau zwei Dateien. Es entsteht von
Hand oder aus gebilligten Exporten; das Bau-Werkzeug liest nichts anderes.

```
datensaetze/quellen/smejj-1-1/batch-01/
  paare.jsonl
  personen.txt
```

## paare.jsonl

Eine Zeile je Frage-Antwort-Paar, UTF-8, JSON:

```json
{"frage": "...", "antwort": "...", "quelle": "batch-01", "einwilligung": "consent-2026-08-30-001", "familie": "konto-a"}
```

| Feld | Pflicht | Bedeutung |
|------|---------|-----------|
| `frage` | ja | Die reale Frage, wie sie gestellt wurde |
| `antwort` | ja | Die gebilligte Idealantwort (kurz, Deutsch, Antwort zuerst) |
| `quelle` | ja | Bezuschbare Herkunft (z. B. Batch-Kennung) — ohne sie: Quarantäne |
| `einwilligung` | ja | Bezug auf die erteilte Trainingseinwilligung — ohne ihn: Quarantäne |
| `familie` | nein | Gruppierung (z. B. Konto/Quelle), die IM GLEICHEN Split bleiben muss. Fehlt sie, zählt `quelle` |

## personen.txt

Eine Person oder Kennung je Zeile (leere Datei erlaubt). Diese Begriffe werden
vor der automatischen Bereinigung durch `[person]` ersetzt und danach
nachgeprüft — auch in anderer Schreibweise.

## Was das Werkzeug daraus macht

```
npm run bau:datensatz -- --quellen datensaetze/quellen/smejj-1-1/batch-01 \
  --ausgabe ops/datensaetze/smejj-1-1/v2026.08.30 --version v2026.08.30
```

- Bereinigung nach `src/training/sanitize.js` (E-Mail, Telefon, Tokens, Pfade …)
- Familien-Split 80/10/10, deterministisch (Seed `smejj-1.0-dataset-family-v1`)
- `train.jsonl`, `validation.jsonl`, `test.jsonl` im Trainer-Format
  (`messages`, gelesen von `workers/smejj-lora-trainer/datenlader.py`)
- `manifest.json` (Feld `proSplit` — gelesen von der Schleifen-Datenpruefung)
- `quarantaene.jsonl` + `bericht.md` — jede abgelehnte Zeile MIT Grund

Ausgeschlossen bleiben laut Plan (`docs/architecture/SMEJJ_1_1_DATENSATZ_PLAN_2026-08-30.md`):
Inhalte ohne nachvollziehbare Quelle oder Einwilligung, synthetische
"Fakten"-Paare und Abschriften aus Dokumentation.
