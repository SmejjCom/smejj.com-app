# smejj 1.0 – Phase 1 Abschlussstand

Stand: 2026-07-11  
Entscheidung: lokales fail-closed Fundament verifiziert; Training, Promotion und
Produktionsänderungen gesperrt  
Task Capsule: `smejj-1-completion-2026-07-10`

## Architektur

Phase 1 trennt operative Ausführung strikt von Lernen. GLM-5.2 und Kimi K2.7
Code bleiben austauschbare Inferenz- und Prüfmodelle. Routing, Rollen,
Werkzeugrechte, Memory, RAG, Task Capsules, Datenschutz, Evaluation und
Freigaben gehören smejj.com.

```text
Task Capsule
  -> Context Planner und deterministischer Modell-Router
  -> Planning / Coding / Review / Test / Browser / Terminal / Git / Security
  -> Sandbox-, Rechte-, Budget- und Human-Gates
  -> Build / Typecheck / Lint / Tests / Security / Non-Regression / Rollback
  -> operatives Ergebnis und getrenntes Memory-Gate

ausdrücklich freigegebene First-Party-Aufgabe
  -> signierte, frische Einwilligung
  -> Secret-/PII-Sanitization
  -> autoritative Rechte-, Capsule- und Qualitätsevidenz
  -> AES-256-GCM und getrennte HMAC-Fingerprints
  -> familienbasierter, leakage-sicherer 80/10/10-Split
  -> immutable IDrive-e2-Neuanlage mit 412- und Digest-Beweis
  -> getrennt signierter Record Proof
  -> unfreigegebene Datensatzversion
  -> erst nach schriftlicher Freigabe: kleiner LoRA-/QLoRA-Lauf
```

Task Capsules, Logs, Screenshots, Browseraufzeichnungen und historische Jobs
sind keine Trainingsdaten. GLM-/Z.ai- und Kimi-/Moonshot-API-Ein- oder -Ausgaben
sind nach dem aktuellen Rights Review vollständig für Training, Labels,
Distillation und modellbasierte Optimierung gesperrt.

## Ordnerstruktur

```text
src/
  agent/roleRegistry.js
  ai/taskRoutingPolicy.js
  evaluation/modelPromotion.js
  shared/env.js
  training/
    consent.js
    encryption.js
    evidence.js
    idrive-conditional-writer.js
    persistence.js
    pipeline.js
    policy.js
    sanitize.js
    split.js
    training-writer.js

control-server/src/
  budget/runtimeWatchdog.js
  budget/watchdogLeaseStore.js
  github/githubApp.js
  jobs/jobAccess.js
  jobs/jobClaimStore.js
  routes/saladRoutes.js
  routes/trainingConsentRoutes.js
  training/consentLedger.js

scripts/
  check-backup-archives.mjs

schemas/
  benchmark-suite.schema.json
  dataset-version.schema.json
  provider-training-rights.schema.json
  training-candidate.schema.json
  training-consent-ledger-entry.schema.json

idrive-layout/manifests/
  evaluations/phase1-foundation-benchmark.json
  training/legacy-capsules-policy.json
  training/provider-rights.json
  training/smejj-1-0-base-model-gate.json
```

## Implementierung

### Trainingsdaten, Einwilligung und Evidenz

- Capture, Consent-API, echte IDrive-Probe, Training und Promotion sind
  standardmäßig deaktiviert oder nicht freigegeben.
- Grant, Revoke und Widerrufssentinel sind signiert, append-only, an opake
  Nutzer-/Repository-Referenzen und den Datenschutzhinweis gebunden. Eine
  Entscheidung ist höchstens 60 Sekunden alt; unklare Zustände sperren.
- Die Pipeline prüft Einwilligung und autoritative Evidenz vor und nach der
  Persistenz. Ein Widerruf während der finalen Datensatzbarriere blockiert.
- Ein eigener Evidence-Issuer darf nur exakt zurückgelesene Task-Capsule- und
  Finalstatus-Bytes attestieren. Er verwendet einen getrennten
  `IDRIVE_E2_TRAINING_ATTESTOR_*`-Prinzipal mit eng begrenztem `jobs/`-Zugriff.
- Der normale Training-Principal ist auf `training/` begrenzt. Evidence- und
  Record-Proof-Schlüssel sind getrennte Ed25519-Identitäten; private Schlüssel
  werden nicht über Konfigurationsobjekte exportiert.
- Sanitization entfernt sensible Felder, bekannte Secret-/PII-Muster, private
  Pfade, Browser-Captures und gemischt hochentropische Tokens. Ein gesondertes
  Datenschutzreview bleibt Pflicht; Regex allein autorisiert nie Training.
- Der Split gruppiert verwandte Aufgaben über Repository-Fingerprint,
  Basis-Commit, betroffene Pfade und Domäne. Nahe Duplikate können dadurch
  nicht zwischen Training, Validierung und Test leaken.

### Immutable Persistenz im Object Brain

- Kandidaten verwenden AES-256-GCM und einen getrennten HMAC-Schlüssel für
  Fingerprints.
- Neuanlagen verwenden `If-None-Match: *`. Erfolg verlangt ersten `200/201`,
  zweiten PUT mit `412` und GET-Readback mit exakter Größe und SHA-256.
- Das verschlüsselte Objekt wird zuerst geschrieben; Status und signierter
  Record Proof entstehen nur aus autoritativ zurückgelesenen Bytes.
- Receipt, Evidence, Consent, Datensatzstatus und Zielobjekt sind miteinander
  gebunden. Eine öffentliche Rohsignierfunktion existiert nicht.
- Ungeprüfte oder fehlgeschlagene Beispiele bleiben getrennt und können keine
  Trainingsfreigabe erzeugen.

### Mandantenschutz, Claims und Replay

- Joblisten, Queue, Status, Events, Abbruch, Freigabe und autonome Ausführung
  werden auf den authentifizierten Eigentümer begrenzt. Fremde Job-IDs liefern
  keine Metadaten.
- Replikaübergreifende Job-Claims verwenden IDrive-e2-Compare-and-Swap,
  Fencing, Heartbeats und append-only Audit-Ereignisse. Ohne dauerhaft
  bestätigten Claim startet keine autonome Ausführung.
- Analyseaufgaben laufen read-only. Schreibwerkzeuge werden blockiert und ein
  unerwarteter Diff lässt die Prüfung fehlschlagen.
- Erfolgreiche Action Logs sind SHA-gebunden und nur für denselben Nutzer,
  dieselbe Aufgabe, denselben Repository-Stand und denselben Modus replaybar.
  Ein abweichender Basis-Commit oder Ergebnis-Diff sperrt den Replay.
- Private Repository-Zugriffe können optional kurzlebige,
  repository-begrenzte GitHub-App-Installationstokens mit ausschließlich
  `contents:read` und `metadata:read` verwenden. Owner-/Repository-Allowlist
  bleibt Pflicht; Tokens werden nicht persistiert. Die Providerantwort wird
  nur akzeptiert, wenn sie exakt ein Ziel-Repository, exakt diese zwei Rechte
  und keinerlei zusätzliches oder höheres Recht bestätigt.
- GitHub-Schreib-Tokens, Push und Draft-PR-Erstellung sind technisch dreifach
  gesperrt: Route vor Claim/Dispatch, Token-Issuer vor JWT/Netzwerk und Worker
  ohne Push-/PR-Implementierung. Freischaltung verlangt einen separaten,
  vertrauenswürdigen Publisher mit Remote-Base-, Patch- und PR-Attestierung.

### Salad-Kosten- und Laufzeitschutz

- Parallel gestartete Worker können durch atomar vorbereitete Watchdog-Leases
  keine zweite Startfreigabe erhalten.
- Vor jedem Persistenz-Retry werden Stop- und Providerstatus neu geprüft.
- Reconciliation paginiert begrenzt und sperrt bei wiederholten Tokens oder
  unvollständiger Sicht. Das Recovery-Limit wird auf tatsächlich unfertige
  Leases angewendet, nicht auf abgeschlossene Historie. Stop-Prozesse starten
  mit begrenzter Parallelität unabhängig voneinander und werden erst danach
  gesammelt bewertet, damit ein fehlerhaftes Ziel andere Stops nicht blockiert.
- `completion.json` ist immutable; Abschluss verlangt `stopped` und null aktive
  Replikate beziehungsweise Instanzzähler.
- Start bleibt hinter Budget-Gate, ausdrücklicher Bestätigung, Recovery und
  Kill-Switch. Unklarer Zustand erzwingt Stop.
- Die neue per-Job-Ephemeral-Erstellung ist unabhängig von Env-Flags im Code
  gesperrt. Planung liefert `ephemeral_worker_security_review_required`, der
  Dispatch ist `null`, und kein Create-/Start-Provideraufruf ist erreichbar.
  Die Recovery bleibt davon getrennt aktiv und stoppt historische Leases auch
  bei deaktivierter Erstellung. Freischaltung verlangt mindestens ein
  unveränderliches IDrive-e2-Image, authentifizierten Ingress, ein dauerhaftes
  globales Budget sowie crash-sichere Kapazitäts-Reconciliation. Auch der
  getrennte, künftig vorgesehene Dispatch-Export liefert derzeit immer `null`.

### Geschützter Salad-Status

- Der lokale Control-Stand schützt `/api/workers/salad/status` durch dieselbe
  Authentifizierungsrichtlinie wie andere private Control-Routen.
- Anonym liefert der lokale Smoke-Test `401`; authentifiziert werden exakt neun
  unkritische Statusfelder ausgegeben. Beide Antworten tragen
  `Cache-Control: private, no-store`.
- Das deterministische Backend-Overlay RC2 enthält alle neun benötigten
  Dateien, kein Frontend und keine Secrets. Zwei Builds waren bytegleich.
- Das laufende Produktionsrelease enthält diesen Patch noch nicht. Ein
  read-only Live-Probe akzeptierte die Route weiterhin anonym. Der Body wurde
  bewusst weder abgerufen noch protokolliert. Das ist ein P0-Release-Stopper.

### Secret- und Archivschutz

- Ein synchronisiertes Rollback-Archiv und eine eigenständige `.env.local`
  enthielten aktive Zugänge. Bekannte Kopien wurden unverändert aus dem
  Workspace in restriktive lokale Quarantäne verschoben; nichts wurde heimlich
  gelöscht.
- Die aktive lokale Env-Datei liegt nun außerhalb des synchronisierten
  Projekts unter dem sicheren Benutzer-Konfigurationspfad mit `0700/0600`.
  Server-, Deploy- und Modellverwaltungsskripte verwenden nur diesen Pfad oder
  einen absoluten Override.
- Der Archivguard sperrt private Env-Dateien, Credential-Pfade,
  Pfadtraversal und AppleDouble-Einträge und prüft zusätzlich den Workspace auf
  private Env-Dateien.
- Google Drive listet aktuell keine `.env.local` im Projekt. Das beweist keine
  endgültige Löschung aller Provider-Versionen; deshalb bleibt Rotation Pflicht.

### Modelle, Rechte und Evaluation

- Normale Aufgaben routen zu GLM-5.2, komplexe zu Kimi K2.7 Code. Kritische
  Aufgaben benötigen ein unabhängiges Zweitmodell und menschliche Freigabe.
- smejj 1.0 erhält Aufgaben erst nach exakter Artefaktidentität, Lizenzarchiv,
  signierter Benchmark-Promotion, mindestens gleicher Sicherheit und
  Erfolgsquote sowie null Security-, Leakage- und Non-Regression-Fehlern.
- Qwen/Qwen3-8B ist als Apache-2.0-Upstream-Kandidat geeignet. Das konkrete
  Laufzeitartefakt bleibt ohne Weight-, Tokenizer-, Quantisierungs- und
  Image-Digest-Attestierung gesperrt.
- Die Foundation-Suite ist immutable, content-addressed und für Training
  gesperrt: Version `2026-07-11.1`, SHA-256
  `be724d8d4e2f9e37a1538fc7a9e6aa3fe8ff739d4165455925ada18c5ab968af`.

## Tests

Der finale lokale `pnpm run release:preflight` war vollständig grün:

- Security- und Archivschutz: 3/3;
- Guidelines: 512 geprüfte Dateien;
- Architektur: 7/7;
- Training, Consent, Evidence und Persistenz: 69/69;
- Evaluation und Promotion: 12/12;
- Control Server: 155/155;
- Ephemeral-Worker, Recovery und Kapazitätsvertrag: 12/12;
- Worker: 27/27;
- Passkey: 7/7;
- Salad: 23/23;
- Frontend: 80/80;
- PWA/Plattform: 7/7;
- RAG: 9/9;
- Modellrouter: 28/28;
- Release Safety: 10/10;
- Start-Lock: 26/26;
- Rollback-Simulation, Free-Only-Guard und Syntaxprüfung: bestanden.

Die Startseite, das untere Eingabefeld und das bestehende Design wurden in
dieser Sicherheitsstufe nicht verändert.

## Abnahmeentscheidung

Das lokale Phase-1-Softwarefundament ist fail-closed und vollständig
verifiziert. Die lokale Release-Prüfung ist kein Deployment und keine Erlaubnis
für Capture, Training, Qwen-GPU-Betrieb, Datensatz-/Modell-Promotion, Staging
oder Produktion.

Die externe Sicherheitsstufe ist nicht abgeschlossen. Neue Credentials,
Staging, Produktionspatch, Old-key-fail-Nachweise, Widerruf der alten Zugänge
und gegebenenfalls irreversible Versionsbereinigung benötigen die getrennten
schriftlichen Freigaben aus dem Deployment- und Change-Lock. Bis dahin bleiben
Produktionsfreigabe, Training und Memory-Übernahme für diese Task Capsule aus.

## Nächster Schritt

Nach schriftlicher Freigabe zuerst neue Least-Privilege-Zugänge parallel
erzeugen und RC2 mit wertlosen Staging-Zugängen prüfen. Erst nach vollständiger
Staging-Abnahme darf eine separate Produktionsfreigabe angefordert werden.
Danach folgen Produktionspatch, Credential-Umschaltung, Old-key-fail-Tests und
Widerruf. Phase 2 beginnt erst nach geschlossenem Sicherheitsvorfall.
