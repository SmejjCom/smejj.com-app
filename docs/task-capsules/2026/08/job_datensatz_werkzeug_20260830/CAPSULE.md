# Task Capsule — job_datensatz_werkzeug_20260830

**Status:** FERTIG — Datensatz-Werkzeug (Phase 2 des smejj-1-1-Plans) komplett
gebaut, Einwilligungstext-Entwurf vorgelegt. Alle Pflichtpruefungen gruen.
**Rollback:** `backups/lora-gate/package.json.vor-2026-08-30-werkzeug` plus
`git revert` des Commits. Alle neuen Dateien sind ZUSAETZE; bestehende
src/training-Module wurden NICHT veraendert.

## Ziel (Betreiber-Freigabe 2026-08-30: "Ja, Werkzeug bauen")

Schritt 1 und 4 des smejj-1-1-Wegs: das Bau-Werkzeug fuer den Stil-Datensatz
(Scruber -> Familien-Split -> Manifest -> immutable Upload) und der Entwurf des
Einwilligungstexts.

## Wichtiger Befund vor dem Bau

Die Policy-Bibliothek EXISTIERT bereits fast vollstaendig in src/training/
(sanitize.js, split.js, consent.js, pipeline.js, idrive-conditional-writer.js,
encryption.js) — gebaut fuer die Task-Capsule-Kandidaten des Betriebs. Der
echte Fehlanteil war NUR die Orchestrierung zu einem QA-Datensatz im
Trainer-Format. Das Werkzeug kopiert daher KEINE Logik; es ruft die getesteten
Module auf (duplikatfreie Kette: sanitizeTrainingValue -> scanSensitiveStrings,
trainingFamilyFingerprint -> assignDatasetSplit -> assertNoDatasetLeakage).

## Umsetzung

- `src/training/datensatzbau.js` (NEU) — reiner Kern:
  bereitePaarVor (Pflichtfelder inkl. Einwilligungsbezug -> sonst Quarantaene;
  personen-Ersetzung; Sanitization; Residuum-Nachpruefung; deterministische
  recordId; Familie via HMAC-Fingerprint), baueDatensatz (Duplikate ->
  Quarantaene, Leakage-Sperre als Pflichttor, proSplit-Manifest fuer die
  Schleifen-Datenpruefung, Version vJJJJ.MM.TT), pruefeVollstaendigkeit,
  STANDARD_SYSTEMPROMPT (die Stil-Form des bewiesenen ersten Laufs).
- `scripts/training/baue_smejj_datensatz.mjs` (NEU) — CLI: liest
  Quellenpaket (paare.jsonl + personen.txt, Format siehe
  datensaetze/quellen/README.md), schreibt train/validation/test.jsonl +
  manifest.json + quarantaene.jsonl + bericht.md. fail-closed: ohne
  SMEJJ_TRAINING_FINGERPRINT_KEY_* oder mit leerem Split wird NICHTS
  geschrieben. Upload bewusst NICHT hier.
- `scripts/training/lade_datensatz_hoch.mjs` (NEU) — separater, bestätigter
  Upload (CONFIRM_DATENSATZ_UPLOAD=YES). IMMUTABILITAET ALS CODE: GET vor jedem
  PUT, existiert das Ziel -> Abbruch (nie Ueberschreiben; Korrekturen = neue
  Version). Nutzt die allgemeinen IDrive-Zugaenge (idriveConfigFromEnv +
  signedS3Request), die bewusst kein Listenrecht haben — GET gegen bekannte
  Schluessel statt Listing (Capsule-2026-08-04-Falle).
- `tests/datensatzbau.test.mjs` (NEU) — 15 Tests, darunter ZWEI echte
  CLI-Laeufe (Temp-Verzeichnis: drei JSONL + Manifest + Bericht erzeugt,
  Zeilenzahlen = proSplit; ohne Schluessel: Exit 1, nichts geschrieben) und
  der CONFIRM-Abbruch des Uploads.
- `package.json` — check:datensatz-werkzeug (in check:all nach check:lora-loop
  verankert) + bau:datensatz-Komfortscript.
- `datensaetze/quellen/README.md` (NEU) — Quellenpaket-Format.
- `docs/architecture/SMEJJ_1_1_EINWILLIGUNG_TRAINING_ENTWURF_2026-08-30.md`
  (NEU) — Textvorschlag fuer die PWA (kurz, Deutsch, Widerruf, kein Zwang)
  plus Einbauhinweise (consent.js, privacyNoticeSha256, Platzierung).

## Verifikation

1. `npm run check:datensatz-werkzeug` — **15/15 gruen** (NEU).
2. `npm run check:lora-loop` — **107/107** (Non-Regression).
3. `npm run check:training` — **135/135** (src/training unveraendert).
4. `npm run check:architecture` — **7/7** (FREE-ONLY unberuehrt, keine neuen
   Abhaengigkeiten: nur node:crypto/node:fs + bestehende Module).
5. `npm run check:guidelines` — **OK, 2021 Dateien**.

## Messfallen dieses Fensters

- `new URL(import.meta.url).pathname` ist percent-encoded — als cwd ergab das
  ENOENT, und der Abbruch-Test bestand zufaellig MIT (assert.throws fing den
  falschen Fehler). Behoben mit fileURLToPath + expliziter Exit-Code-Pruefung.
  Regel: bei Prozessen den STATUS pruefen, nicht nur "es warf etwas".
- base64 eines 32-Byte-Keys endet auf GENAU einem "=" (32 = 3x10 + 2) — der
  decode-Regex verlangt genau das; ein Test-Key aus Buffer.alloc(32, 7) passt.
- Splits 80/10/10: ein Test, der alle drei Splits belegen will, muss Familien
  SUCHEN (Schleife bis der deterministische Fingerprint trifft) — nicht raten.

## Offen / Betreiber

- Einwilligungstext freigeben oder aendern (docs/.../EINWILLIGUNG_TRAINING_ENTWURF).
- Erstes Quellenpaket billigen: 100 Paare laut Plan, danach erster Bau.
- Einwilligungserhebung in der PWA bleibt bis zur Freigabe AUS (Capture ist
  und bleibt fail-closed: SMEJJ_TRAINING_CAPTURE_ENABLED != YES).
