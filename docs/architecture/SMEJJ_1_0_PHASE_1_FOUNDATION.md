# smejj 1.0 Phase 1 Foundation

Status: lokales Fundament implementiert, nicht für Produktion freigegeben  
Stand: 2026-07-10  
Zielmodell: `smejj-1-0`

Dieses Dokument beschreibt den belastbaren Startpunkt für smejj 1.0. Es ist
keine Trainingsfreigabe. Datenerfassung, Datensatz-Promotion, Training,
Modellaktivierung und Deployment bleiben standardmäßig gesperrt.

## Architektur

Die Steuerung bleibt Eigentum von smejj.com und ist von einzelnen
Modellanbietern entkoppelt:

```text
Task Capsule
  -> Kontext- und Rollenplanung
  -> deterministisches Modell-Routing
  -> isolierte Werkzeuge
  -> unabhängige Review-, Test- und Sicherheitsprüfung
  -> operatives Ergebnis
  -> getrennte Trainingskandidaten-Prüfung
  -> Sanitization im Arbeitsspeicher
  -> Einwilligungs-, Rechte- und Qualitäts-Gates
  -> AES-256-GCM-Verschlüsselung
  -> immutable Ablage in IDrive e2
  -> manuell freizugebende Datensatzversion
  -> budgetbegrenztes LoRA-/QLoRA-Training auf stateless Salad Workern
  -> Evaluation und gesonderte Modellfreigabe
```

Task Capsules sind operative Audit-Artefakte. Sie sind niemals automatisch
Trainingsdaten. Nur die separate Trainingspipeline darf aus einem ausdrücklich
freigegebenen, bereinigten und vollständig geprüften Ergebnis einen Kandidaten
erzeugen.

### Modell-Routing

| Aufgabenklasse | Primärmodell | Schutzregel |
| --- | --- | --- |
| Einfach und sicher | smejj 1.0 erst nach signierter Benchmark-Promotion, sonst GLM-5.2 | Fallback auf GLM-5.2 |
| Normal | GLM-5.2 | API-Ausgabe nicht für Training verwenden |
| Komplex | Kimi K2.7 Code, falls verfügbar | Fallback auf GLM-5.2 |
| Kritisch oder unsicher | stärkeres Modell plus unabhängiges zweites Modell | keine automatische Ausführung, menschliche Freigabe erforderlich |

Eine lokale Übernahme ist nur zulässig, wenn smejj 1.0 im freigegebenen Scope
mindestens die Erfolgs- und Sicherheitswerte des aktiven Modells erreicht, keine
Security- oder Non-Regression-Fehler aufweist und der Runtime-Artefaktbezug
eindeutig ist.

### Infrastrukturgrenzen

- IDrive e2 ist das zentrale Object Brain für verschlüsselte Kandidaten,
  Datensatzmanifeste, Modellartefakte, Checkpoints, Benchmarks und Backups.
- Salad Worker sind stateless, werden nur bei echter Rechenarbeit gestartet und
  müssen hinter Budget-Gate, Laufzeit-Watchdog und automatischer Abschaltung
  bleiben.
- Der Control Server verarbeitet Metadaten, Routing, Berechtigungen und signierte
  Objektzugriffe, aber keine großen Modelle oder Trainingsläufe.
- GitHub.com bleibt auf Quellcode und kleine Dokumentation im dauerhaft
  kostenlosen Tarif begrenzt. GitHub Actions, Packages, LFS und andere
  kostenpflichtige GitHub-Dienste sind ausgeschlossen.
- Cloudflare.com wird nicht verwendet.

## Bestandsanalyse

Die Phase-1-Analyse hat folgende belastbare Ausgangslage ergeben:

- Modell-Registry, GLM-/Kimi-Routing, Task Capsules, Worker, Browser-Werkzeuge,
  Budgetkontrollen, IDrive-e2-Zugriff und ein lokales RAG-System sind vorhanden.
- Die bestehende UI-Bezeichnung `smejj 1.0` ist im produktionsnahen
  Runtime-Registry-Pfad noch ein Kompatibilitaetsalias fuer GLM-5.2. Sie ist
  kein Nachweis fuer das neue Zielmodell. Phase 1 trennt deshalb angefordertes
  Modell, tatsaechlichen Provider, tatsaechliches Modell und Trainingsrechte in
  der Task Capsule. Der Alias darf erst nach Artefaktattestierung, Evaluation
  und schriftlicher Promotion auf das lokale Modell umgestellt werden.
- Eine SFT-, LoRA-/QLoRA- oder Datensatz-Pipeline war nicht vorhanden.
- Historische Task Capsules, Job-Artefakte und Logs besitzen keine hinreichende
  Trainings-Einwilligung, Rechteprovenienz oder Datenschutzfreigabe. Sie bleiben
  vollständig vom Training ausgeschlossen.
- In IDrive e2 wurde kein bestehender Datensatz für `smejj-1-0` festgestellt.
- Die lesende IDrive-e2-Inventur fand die bestehenden Kimi- und GLM-Vaults,
  jedoch keine Objekte unter dem neuen Dataset-Präfix. Die vorhandenen
  allgemeinen Writer beweisen weder bedingte Neuanlage noch
  Anwendungsschicht-Verschlüsselung und werden deshalb nicht als
  Trainingswriter wiederverwendet.
- Der Salad-Audit fand einen Qwen3-8B-kompatiblen TGI-Container, jedoch ohne
  nachgewiesenes Modell-Repository, Revision, Quantisierung, Tokenizer,
  Lizenzarchiv, Datei-Checksums oder unveränderlichen Image-Digest. Die alte
  Gruppe und eine nach Schlüsselrotation erzeugte Ersatzgruppe sind deshalb
  gestoppt, `autostart` ist aus und alle aktiven Instanzzähler stehen auf null.
  Der Ersatz erreichte innerhalb des Kostenfensters keinen laufenden Zustand
  und wurde ohne Modellfreigabe abgeschaltet.
- Der kombinierte Coding Worker besitzt Anwendungs-Allowlist, Pfadschutz,
  Zeitlimits und Secret-Redaction, aber noch keinen nachgewiesenen harten
  Kernel- und Egress-Sandboxvertrag für Trainingsjobs. Training Worker bleiben
  deshalb gesperrt und müssen als eigene stateless Laufzeit gebaut werden.
- Die aktuellen API-Bedingungen von Z.ai und Moonshot/Kimi geben keine zulässige
  Grundlage für Training oder Distillation von smejj 1.0 aus API-Prompts,
  API-Ausgaben oder daraus abgeleiteten Labels. Details stehen in
  `SMEJJ_1_0_TRAINING_RIGHTS_2026-07-10.md`.

## Ordnerstruktur

```text
src/
  agent/roleRegistry.js              Rollen- und Werkzeugverträge
  ai/taskRoutingPolicy.js            deterministische Routing- und Freigabelogik
  training/
    consent.js                       signierte Einwilligung und Widerruf
    constants.js                     Zustände, Domains und Pflicht-Gates
    sanitize.js                      Secret-/PII-Filter vor Persistenz
    policy.js                        Consent-, Rechte- und Qualitätsentscheidung
    encryption.js                    AES-256-GCM und HMAC-Schlüsselprüfung
    split.js                         familienbasierter Train/Validation/Test-Split
    pipeline.js                      Kandidat, immutable Write-Plan, Dataset-Manifest
    idrive-conditional-writer.js     SigV4, 412-Proof und Digest-Readback
    training-writer.js               Produktionsadapter mit Consent-Recheck
  evaluation/
    modelPromotion.js                Vergleich, Leakage-, Safety- und Promotion-Gate
control-server/src/training/
  consentLedger.js                   append-only IDrive-e2-Consent-Ledger
control-server/src/budget/
  runtimeWatchdog.js                 Deadline, Stop-Retry und Nullinstanz-Proof
  watchdogLeaseStore.js              append-only Watchdog-Leases
control-server/src/routes/
  trainingConsentRoutes.js           authentifizierte Grant/Revoke/Decision-Routen
  saladRoutes.js                     Budget-, Lease- und Stop-Reconciliation
control-server/src/jobs/
  memoryEligibility.js              Rechte-, Privacy- und Vollqualitaets-Gate
schemas/
  training-candidate.schema.json
  dataset-version.schema.json
  provider-training-rights.schema.json
  benchmark-suite.schema.json
idrive-layout/manifests/training/
  provider-rights.json
  legacy-capsules-policy.json
  smejj-1-0-base-model-gate.json
idrive-layout/manifests/evaluations/
  phase1-foundation-benchmark.json
scripts/evaluation/
  run_foundation_benchmark.mjs       shell-freier Runner ohne Log-Persistenz
tests/
  training-pipeline.test.mjs
  task-routing-policy.test.mjs
  model-promotion.test.mjs
docs/architecture/
  SMEJJ_1_0_PHASE_1_FOUNDATION.md
  SMEJJ_1_0_TRAINING_DATA_POLICY.md
  SMEJJ_1_0_TRAINING_RIGHTS_2026-07-10.md
```

Vorgesehene IDrive-e2-Präfixe sind logisch getrennt:

```text
  training/quarantine/<jahr>/<monat>/<shard>/<record-id>/
  training/sanitized/candidates/<jahr>/<monat>/<shard>/<record-id>/
training/consents/v1/<scope>/<event>/
workers/salad/watchdogs/<gruppe>/<lease>/
datasets/smejj-1-0/<version>/
training-runs/smejj-1-0/<run-id>/
checkpoints/smejj-1-0/<model-version>/
evaluations/smejj-1-0/<model-version>/
```

## Implementierung

Das Phase-1-Fundament erzwingt folgende Regeln im Code:

1. Training Capture ist ohne explizite Aktivierung aus. Ist Capture aus, wird
   kein Trainingsobjekt erzeugt.
2. Sanitization läuft rekursiv im Arbeitsspeicher vor jeder Persistenz. Secrets,
   direkte Identifikatoren, private lokale Pfade, Cookies, HAR-Dateien,
   Screenshots und Browseraufzeichnungen werden entfernt oder blockiert.
3. Ein Kandidat benötigt nachweisbare menschliche Einwilligung einschließlich
   Widerrufsreferenz, bestätigte Repository-Rechte und explizite Rechte für jede
   Datenquelle.
4. Modellgenerierte Labels sowie GLM-, Kimi- und andere Provider-API-Ausgaben
   sind als Trainingsquelle gesperrt und werden bei permanentem Denial nicht im
   Trainings-Namespace persistiert. Zulässige Labels stammen ausschließlich von
   Menschen, deterministischen Tests oder statischer Analyse.
5. Build, Typecheck, Lint, Unit-, Integrations-, Datenschutz-/PII-, Security-,
   Non-Regression-, Rollback- und Staging- oder Live-Prüfung müssen jeweils
   `passed` sein.
6. Kandidaten werden mit AES-256-GCM verschlüsselt. Deduplizierung und
   Familienbildung verwenden HMAC-SHA-256 mit einem getrennten Schlüssel; es
   werden keine öffentlichen Hashes sensibler Rohdaten gespeichert.
7. IDrive-e2-Schreibpläne verwenden ausschließlich neue, immutable Objekte mit
   `If-None-Match: *`. Der Status wird zuletzt geschrieben. Ohne nachgewiesene
   serverseitige Bedingung und Neuanlage schlägt der Schreibvorgang fehl.
8. Aufgabenfamilien werden deterministisch als Einheit im Verhältnis 80/10/10
   auf Training, Validierung und Test verteilt. Familienüberschneidungen und
   doppelte Record-IDs blockieren die Datensatzversion.
9. Jede neue Datensatzversion beginnt mit `promotionStatus: not-approved`.
   Dasselbe Fail-closed-Prinzip gilt für Training, Checkpoint-Promotion,
   Shadow Mode und Produktion.
10. Die Phase-1-Benchmark-Suite ist immutable, content-addressed und vom
    Training ausgeschlossen. Kandidat und Vorgänger müssen exakt dieselbe
    Suite und dasselbe geschützte Evaluationsdataset verwenden. Security- oder
    Funktionsschäden, Leakage, Kostenüberschreitung oder jede geschützte
    Metrikregression blockieren die Promotion. Selbst ein besserer Kandidat ist
    höchstens `eligible-for-human-approval`; automatisches Deployment ist aus.
11. Operatives Memory und Training bleiben getrennt, verwenden aber beide
    Fail-closed-Evidenz. Ein Worker-Erfolg allein darf nicht lernen. Memory
    benötigt explizit geklärte Provider-, Datenschutz- und Repository-Rechte,
    nicht übersprungene Build-, Typecheck-, Lint-, Test-, Security- und
    Repository-Prüfungen, Diff-Hash sowie Rollback-Evidenz. Legacy- und
    Free-Executor-Ergebnisse bleiben bis dahin `learn: false`.
12. Grant, Revoke und ein separater Widerrufssentinel werden signiert und nur
    unter opaken Nutzer-/Repository-Referenzen gespeichert. Entscheidungen
    verfallen nach 60 Sekunden und werden vor Record und Status erneut aus dem
    Ledger aufgelöst; ein Widerruf vor dem Status verhindert die Freigabe.
13. Der IDrive-e2-Writer akzeptiert eine Anlage erst nach bedingtem PUT,
    zweitem PUT mit `412` und GET-Readback mit exakter Größe und SHA-256. Er
    verwendet ausschließlich einen getrennten Training-Principal.
14. Salad-Starts verlangen vor dem Provideraufruf eine immutable, verifizierte
    Watchdog-Lease über einen getrennten Watchdog-Principal. Nach Deadline,
    unklarem Start oder unklarem Neustart wird Stop mit 5/15/30/60/60-Sekunden-
    Retry erzwungen, bis `stopped` und alle vier Instanzzähler null sind.

Die Zustände `denied`, `quarantined`, `candidate`, `promoted` und `revoked` sind
getrennt. Nur `candidate` darf in ein noch nicht freigegebenes Dataset-Manifest
aufgenommen werden; erst eine gesonderte Freigabe darf daraus `promoted` machen.

## Tests

Die gezielten Tests decken mindestens folgende Invarianten ab:

- Secret-/PII-Bereinigung ohne Übernahme ausgeschlossener Browserartefakte;
- Capture-off erzeugt keine Schreibobjekte;
- Z.ai- und Kimi-API-Provenienz bleibt auch transitiv gesperrt;
- übersprungene oder fehlende Qualitätsprüfungen werden abgelehnt;
- Verschlüsselung, Manipulationserkennung und Status-last-Write-Plan;
- Familien-Leakage, doppelte Records und ungültige Datensatz-Promotion;
- lokales Modell-Routing nur nach freigegebenem Benchmark;
- Zweitmodell- und Human-Gates für kritische Aufgaben.
- manipulationsgeschützte Benchmark-Suite, Dataset-Leakage, Kostenlimits und
  regressionsfreie Modell-Promotion.
- operatives Memory bleibt ohne vollständige Rechte-, Privacy- und
  Qualitätsbelege gesperrt.
- Grant, Widerruf, partielle Ledger-Schreibfehler, 60-Sekunden-Freshness und
  Recheck direkt vor Record sowie Status;
- echte bedingte IDrive-e2-Neuanlage mit zweitem `412`-Nachweis, Digest-Readback,
  Kollisions-, Timeout- und Backend-Missbrauchstests;
- Salad-Lease-First-Start, Neustart-Reconciliation, begrenzte Stop-Retries und
  verifizierte Nullinstanz-Abschaltung.

Der echte Phase-1-Foundation-Benchmark
`smejj-1-0-phase1-foundation/2026-07-10.1` lief mit Suite-SHA
`9c1a4ae4cbd41bc4810f7966615d19997cab0602981b4b36010d7c05469a28ca`
erfolgreich durch: 10 von 10 fest gepinnte Checks bestanden. Der Runner
speichert keine Log-Bodies und das Ergebnis ist ausdrücklich nicht als
Trainingsdatum zugelassen.

Vor einer Phase-1-Abnahme müssen im Repository erfolgreich laufen:

```bash
npm run check:all
npm run check:guidelines
npm run check:architecture
```

Vor einem Release sind zusätzlich die vollständigen Staging- und
Release-Gates aus `docs/deployment/DEPLOYMENT_PLAN.md` erforderlich. Dieses
Fundament wurde weder deployt noch für Live-Training aktiviert.

## Memory Update

Nur als Vorschlag für ein späteres, verifiziertes Update von `Memory_Bank.md`:

> 2026-07-10: Phase-1-Fundament für smejj 1.0 lokal eingeführt. Training Capture
> bleibt standardmäßig aus; historische Capsules und GLM-/Kimi-API-Ausgaben sind
> für Training gesperrt. Kandidaten benötigen Sanitization, Einwilligung, Rechte,
> vollständige Qualitäts-Gates, AES-256-GCM, HMAC-Familien-Split und immutable
> IDrive-e2-Ablage. Kein Training, keine Modell-Promotion und kein Deployment
> wurden freigegeben.

Der Eintrag darf erst nach vollständiger grüner Verification Pipeline in das
Memory übernommen werden.

## Nächster Schritt

1. Das Qwen-Basisartefakt offline anhand von Repository,
   Revision, Gewichtsformat, Quantisierung, Tokenizer, Checksums, Lizenz,
   Notices und Trainer-Image-Digest vollständig attestieren; kein GPU-Start ist
   dafür erforderlich.
2. Die getrennten Training- und Watchdog-Principals in IDrive e2 mit
   serverseitiger Prefix-Policy anlegen und ihre Rotation dokumentieren.
3. Einen kleinen, ausschließlich menschlich freigegebenen First-Party-Seed-Satz
   erstellen, deduplizieren und gegen separate unveränderte Benchmarks prüfen.
4. Erst nach schriftlicher Budget- und Trainingsfreigabe einen kleinen
   LoRA-/QLoRA-Lauf starten. Direkte Produktionsänderungen bleiben gesperrt.
