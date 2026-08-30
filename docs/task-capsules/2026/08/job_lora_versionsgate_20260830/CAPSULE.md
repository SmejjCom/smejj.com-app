# Task Capsule — job_lora_versionsgate_20260830

**Status:** FERTIG — Versionsschema `smejj-x.y`, Aktivierungs-Gate und
Versionsregister in der Dauertrainings-Schleife umgesetzt; Datensatz-Plan
fuer smejj-1-1 verabschiedet. Alle Pflichtpruefungen gruen.
**Rollback:** `backups/lora-gate/` (cycle.js, state.js, loop.js, config.js,
package.json.vor-2026-08-30) plus `git revert` des Commits.

## Ziel (Betreiber-Freigabe 2026-08-30, schriftlich, "alle Rechte A bis Z")

1. Versionsschema smejj 1.0 / 1.1 / 2.0 fuer trainierte Adapter.
2. Aktivierungs-Gate: ein Stand wird nur dann benannt und gefuehrt, wenn er
   die bestehende Eval-Suite BEWEISEN schlaegt; alles andere wird verworfen.
3. Datensatz-Plan (Fragequellen, Anonymisierung, DSGVO) fuer smejj-1-1.

## Design-Entscheidungen

- **Zwei Tore, keine Doppeltuer.** Das mechanische Tor bleibt sweep.js#istNeuerBester
  (Vorsprung > Rauschschwelle 3 %, null kritische Fehler). Nur ein Gate-Sieger
  bekommt einen Versionsnamen. Die LIVE-Schaltung bleibt unveraendert bei
  src/evaluation/modelPromotion.js und dort ein Mensch (promotionStatus bleibt
  "not-approved", state.js#schreibeBestenStand steht unveraendert).
- **Hauptversion = Basismodell-Generation, Nebenversion = Nachtraining.**
  gleiche Basis -> smejj-1-1, smejj-1-2, ...; neue Basis -> smejj-2-0.
  Rein deterministisch aus (bisheriger Stand, Basis) ableitbar — neustartfest.
- **Vor-Schema-Staende:** der reale bester-stand ohne Versionsfeld zaehlt als
  implizites smejj-1-0; sein Nachfolger wird smejj-1-1. Ein Generationswechsel
  ist nur beweisbar, wenn die Basis im Stand mitreist — darum legt der Zyklus
  das Basismodell ab jetzt im besten-stand ab.
- **Kein Artefakt, keine Version.** versionsEintrag wirft ohne
  adapterSchluessel (dieselbe Regel wie motor.py nach der Capsule-2026-08-04-
  Falle). In cycle.js fail-soft mit lauter Meldung: ein verweigerter Name darf
  den bereits bezahlten Zyklus nicht sprengen.
- **Register ist Chronik, nicht Tor.** ops/smejj-lora-loop/versionen.json auf
  IDrive e2 haelt alle Versionen mit Metadaten (Basis, Datensatz, Kennzahlen,
  Freigabe-ID). Ein Register-Ausfall veraendert den besten-stand NICHT, wird
  aber laut protokolliert (versionAbgelegt=false). leseRegister loescht bei
  404 NICHT still die Geschichte: nur 404 liefert das leere Register, jeder
  andere Lesefehler wird geworfen.
- **/health zeigt die aktive Version** (loop.getStatus().aktiveVersion) —
  Lesefeld, kein Schalter. Es bleibt dabei: kein Endpunkt der Schleife
  schaltet etwas ein.

## Umsetzung

- `workers/smejj-lora-loop/versionen.js` (NEU) — VERSIONS_MUSTER,
  versionsAnzeige, naechsteVersion, versionsEintrag, leeresRegister,
  registerMitEintrag, REGISTER_MAX=200.
- `workers/smejj-lora-loop/cycle.js` — Schritt 4: Gate-Sieger erhaelt Version,
  Basis reist im besten-stand mit, Registry-Schreiben fail-soft,
  Ergebnisfelder version/versionAbgelegt.
- `workers/smejj-lora-loop/state.js` — leseRegister (404 -> leer, sonst
  Wurf), schreibeRegister (ein Versuch, Rueckgabewert).
- `workers/smejj-lora-loop/config.js` — versionsKey
  (SMEJJ_LORA_VERSIONEN_KEY, Standard ops/smejj-lora-loop/versionen.json).
- `workers/smejj-lora-loop/loop.js` — speichereVersion-Default-Weg,
  aktiveVersion im Status, Version im Verlaufseintrag.
- `tests/lora-loop-versionen.test.mjs` (NEU) — 23 Tests: Schema, Generation-
  Ableitung, Vor-Schema-Fall, Metadaten-Pflichten, Register, state-Ablage,
  Zyklus-Integration (Sieger/Verlierer/Artefakt-frei/Register-Ausfall) und
  zwei Loop-Ende-zu-Ende-Laeufe (smejj-1-0, dann smejj-1-1 mit fester Uhr).
- `package.json` — check:lora-loop prueft versionen.js und den neuen Test.
- `docs/architecture/SMEJJ_1_1_DATENSATZ_PLAN_2026-08-30.md` (NEU) —
  Fragequellen mit Zielanteilen und Rechten, fail-closed-Anonymisierung,
  Familien-Split, immutable Ablage auf IDrive, Mengenbar 3.000–10.000,
  Aktivierungsweg, ausdrueckliche Betreiber-Entscheidungen.

## Verifikation

1. `npm run check:lora-loop` — **107/107 gruen** (84 bestehende + 23 neue).
2. `npm run check:training-loop` — **34/34 gruen** (Non-Regression ueber die
   Schwester-Schleife).
3. `npm run check:architecture` — **7/7 gruen** (FREE-ONLY-Vertrag unberuehrt).
4. `npm run check:guidelines` — **OK, 2014 Dateien** (max 800 Zeilen,
   Naming-Regel).
5. End-zu-Ende-Beweis im Test: erster Gewinn schreibt Version smejj-1-0 in
   besten-stand UND Register UND Status; zweiter besserer Lauf wird smejj-1-1;
   ein gleich guter Lauf wird korrekt verworfen (keine Version).

## Messfallen dieses Fensters

- Gleiche Punktzahl ist KEIN neuer Bester (Rauschschwelle) — der zweite
  End-zu-Ende-Test braucht steigende Messwerte.
- Der Loop-Takt hat einen 10-Minuten-Zyklusabstand: der zweite tick braucht
  eine feste Uhr mit Vorlauf, sonst liefert er korrekt "wartet".
- leseRegister ohne 404-Fang haette beim ALLERERSTEN Eintrag den Schreibweg
  zum Scheitern gebracht (Lesefehler vor dem ersten PUT) — der Test an Zeile
  "Register ... undefined is not valid JSON" fing das, bevor es live konnte.

## Offen / Betreiber (unveraendert, bewusst NICHT von diesem Fenster beruehrt)

- Trainingsruhe (Charta v1.2) bleibt: nichts trainiert ohne Betreiber-Freigabe;
  alle Schalter stehen weiterhin auf AUS (fail-closed).
- GPU-Heimat nach Salad-Exit (2026-08-11) entscheiden (Zeabur-Klasse oder
  FREE-ONLY-Alternative).
- ZEABUR_API_TOKEN fuer Deploys des Loop-Dienstes in
  ~/.config/smejj.com/env.local.
- Datensatz-Plan umsetzen: Einwilligungstext, 100-Paar-Stichprobe billigen.
