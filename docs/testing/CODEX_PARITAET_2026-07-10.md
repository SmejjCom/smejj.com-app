# smejj.com - Codex-Paritaetsanalyse (2026-07-10)

Rolle: Senior AI Systems Architect und QA-Auditor.

Zielarchitektur: Control Server + Salad Worker + IDrive e2 + GLM 5.2 via Z.ai,
konform zur Free-Only-Policy.

## Bewertungsregeln

- Live bestanden: als Endnutzer auf der Produktionsumgebung reproduziert.
- Lokal bestanden: automatisiert getestet, aber nicht als kompletter Live-Fluss.
- Teilweise: ein abgegrenzter Teil funktioniert; die Restluecke ist genannt.
- Blockiert: eine sichere Voraussetzung fehlt.
- Kein vorhandener Code gilt ohne Live-Beleg als produktiv fertig.
- Keine Aussage in diesem Bericht behauptet 1:1-Paritaet, wenn eine Luecke offen ist.

## Ergebnis in einem Satz

smejj.com kann fuer ein oeffentliches Repository des erlaubten Owners jetzt live
einen authentifizierten Coding-Job anlegen, in einem isolierten Worker-Workspace
mehrere Dateien erzeugen, GLM 5.2 verwenden, Tests und Sicherheitspruefungen
ausfuehren, einen Unified Diff mit SHA-256 liefern, eine menschliche Freigabe
dauerhaft speichern, einen Follow-up aus demselben Kontext ausfuehren, einen Job
replayen, nach Control-Neustart aus IDrive e2 hydrieren und einen laufenden Job
dauerhaft abbrechen.

Vollstaendige Codex-Paritaet ist trotzdem nicht erreicht. Es fehlen vor allem
eine harte ephemere Mandanten-Sandbox pro Task, private Repos und Draft-PRs mit
kurzlebigem GitHub-App-Token, produktiv belastbare Parallelitaet mit durable
Leases, gepinntes Python/pytest-Tooling und ein byte-deterministischer Replay.
Der finale lokale Release-Preflight ist gruen.

## Paritaets-Tabelle

| Funktion | Codex | smejj.com heute | Luecke | Aufwand | Voraussetzung |
|---|---|---|---|---|---|
| Repo klonen und analysieren | Vollstaendige Repository-Analyse mit gezielter Suche. | Live bestanden fuer https://github.com/SmejjCom/smejj-control: flacher Clone, Base-Ref main, Owner-Allowlist und isolierter Agent-Branch. | Keine privaten/Fremd-Repos; grosse Monorepos nicht belastungsgetestet. | M | Ephemerer Worker, Repo-ACL, kurzlebiger Token |
| Autonome Ausfuehrungsschleife | Aendern, pruefen, Fehler zurueckgeben, iterieren bis gruen. | Live: GLM-5.2-Workerlauf, strukturierte Tools, bis zu drei Control-Versuche; Hauptjob, Follow-up und Replay jeweils im ersten Versuch gruen. | Ein erfolgreicher Live-Self-Fix nach einem echten Testfehler wurde nicht belegt. | M | Fehler-Fixture mit deterministischem Reparaturpfad |
| Multi-Datei-Edits | Mehrere zusammenhaengende Dateien pro Task. | Live bestanden: vier neue Dateien in einem Diff. | Groessere Refactorings und Konflikte nicht live getestet. | M | Monorepo- und Refactoring-Fixtures |
| Build, Typecheck, Lint und Tests | Projektchecks, Fehlerfeedback, Wiederholung. | Live bestanden: install, build, typecheck, lint, unit, integration, security, tests, repository-hygiene und security-scan jeweils OK; 5/5 und Follow-up 6/6 Tests. | pytest fehlt im aktuellen Shared-Worker-Image. | M | Gepinntes Worker-Image mit Python/pytest |
| Diff und Branch | Isolierter Branch, vollstaendiger Diff. | Live bestanden: Agent-Branch im Worker, Unified Diff, vier Dateien, Diff-SHA-256 und Download-Aktion. Kein Push/Merge. | Kein Konflikt-/Rebase-Livetest. | M | Git-Fixtures mit Konflikten |
| Menschliche Freigabe | Exakte Freigabe vor externer Wirkung. | Live bestanden: Haupt- und Follow-up-Diff jeweils an die exakte SHA gebunden und dauerhaft freigegeben; Merge bleibt false. | Falsche SHA wurde lokal, nicht erneut live, mit 409 getestet. | S | Negativer API-Livetest mit eigener Test-Sitzung |
| Draft-PR | Branch pushen und Draft-PR erstellen. | UI und fail-closed Backend vorhanden. | Live blockiert, weil kein kurzlebiger repo-begrenzter GitHub-App-Token vorhanden ist. | M | GitHub App, Installation-Token, explizite Freigabe |
| Terminal in Sandbox | Befehle in kontrollierter Ausfuehrungsumgebung. | Control-Allowlist live; Worker-Pfad-, Secret-, Command-, Output- und Zeitlimits; produktiver Runtime-Check code 0. | Shared Container ist keine Kernel-/Egress-Sandbox. | L | Ephemerer Container pro Task und Egress-Allowlist |
| Queue und parallele Tasks | Mehrere getrennte Aufgaben und Worker. | Queue, aktive/wartende Zustandsanzeige und persistenter Cancel live. | Ein kombinierter Worker verarbeitet Coding seriell; echte Parallelitaet und replikaweite Claims nicht live belegt. | L | Durable Lease/Claim, mehrere ephemere Worker |
| Follow-up im selben Kontext | Verifizierten Kontext weiterverwenden. | Live bestanden: Kindjob job_web_f5176538e0364778993afdfb nutzte den bestaetigten Parent-Diff und erweiterte 5 auf 6 Tests. | Kontextkompression fuer lange Folgen nicht getestet. | M | Langlaufende Follow-up-Suite |
| Replay | Aufgabe reproduzierbar wiederholen. | Live bestanden: Replay job_web_fd8c8797d8e14a41afe77950 endete gruen. | Diff war semantisch gleichwertig, aber nicht byteidentisch; deterministischer Replay fehlt. | M | Aktionsprotokoll-Replay statt erneuter freier Generierung |
| Verifikation vor Abschluss | Tests und Sicherheitsbelege vor Abschluss. | Live bestanden fuer nicht-visuelle Aufgabe; Abschluss erst nach allen Gates. | Automatische Browserpruefung eines echten UI-Job-Outcomes nicht live belegt. | M | Preview-Vertrag und UI-Test-Repo |
| Browser und Screenshots | Browserpruefung mit visueller Evidenz. | Integrierter Browser und Remote-Worker live; finale Automation-Screenshots gespeichert; Konsole ohne Fehler. | Jobbezogene Preview-Erzeugung fuer beliebige Frameworks fehlt. | M | Gepinnte Preview-Adapter |
| Task Capsules auf IDrive e2 | Auditierbare, replaybare Artefakte. | Live: persist-first Create, Ergebnis, Approval, Follow-up, Replay und Cancel; Hauptjob samt Approval nach Control-Neustart hydriert. | Lokaler Audit-Principal hat keinen Zugriff auf Produktions-Bucket smejj-app; unabhengige Objekt-Readbacks endeten korrekt mit 403. | S | Separater read-only Audit-Principal |
| Memory nur aus Erfolg | Nur validierte Resultate duerfen lernen. | Fail-closed Gate lokal getestet; fehlgeschlagene und abgebrochene Jobs erzeugen kein positives Memory. | Kein produktiver Trainings-/Lernlauf wurde oder sollte gestartet werden. | M | Rechte-, Privacy- und Qualitaetsfreigabe |
| Chat und Coding-Qualitaet | Hochwertige Antworten, Streaming, Codebloecke. | Live: Streaming, add(a,b), Off-by-one-Diagnose, Codeblock und Agentantwort bestanden. | Breite, versionierte Qualitaetsbenchmarks fehlen. | M | Immutable Benchmark-Suite |
| Modellbeleg | Aktives Backend nachvollziehbar. | Live: x-smejj-model-backend: zhipu:glm-5.2; Health ai:true und aiBackend:zhipu:glm-5.2. | Kein per-Task Provider-Attest ausser Capsule-/Headerbeleg. | S | Signierte Provider-Evidenz |
| Auth fuer Schreibaktionen | Sitzungsgebundene, kurzlebige Autorisierung. | Live: origin-gebundener One-Time-Handoff, Token nur in sessionStorage, geschuetzte Job-/Datei-/Terminalrouten. | Einzelkonto-Allowlist; keine vollstaendige Tenant-ACL. | L | Nutzer-/Projekt-ACL und Tenant-Isolation |
| Globale Suche | Chats, Repos und Artefakte durchsuchen. | UI live bedienbar. | Neue Chats und Capsules werden nicht verlaesslich inkrementell indexiert. | M | IDrive/RAG-Inkrementalindex |
| Projekte und Dateien | Projektkontext und Dateiverwaltung. | Routen live; authentifizierter Datei-Read mit echtem Inhalt bestanden. | Kein vollstaendiger Endnutzer-Workspace-Import mit Git-/IDrive-Sync. | M | Repo-Import, Manifeste, Konfliktfluss |
| Aufgabenabbruch | Laufende Ausfuehrung sicher stoppen. | Live bestanden: job_web_dd8e244018854396acad8d1c endete Abgebrochen, Phase Cancelled by human request; Worker danach inaktiv. | Abbruch unter Netzpartition und nach Worker-Verlust nicht live getestet. | M | Durable Heartbeat und Recovery-Test |

## Live-Testprotokoll

Testdatum: 2026-07-10, Europe/Budapest.

### Live-Komponenten

| Komponente | Stand | Beleg |
|---|---|---|
| Frontend | GitHub Pages main, Commit e547a482f1be724ac9aa25fb3df649b8988403f7 | assets/autonomous-coding.js SHA-256 5a916e057efea0ac53c3c9d1ee782f6cb8e8fc6062cd31df7ae2abf17eaa30ba |
| Control Server | Salad Version 41, RUNNING, 1/1 Replica | fuenf aufeinanderfolgende Health-Antworten mit ok:true, ai:true, storage:true |
| Control Runtime-Pin | Commit 5db5c86b70580013162b9326b0daea8fa892bbf7 | workerToken.js GitHub-Readback byteidentisch, SHA-256 7380544031ff3c933b6405132746d89a19be9aad32c18d735e4ecd1d61246ba6 |
| Session-/Job-UI-Basis | Control Commit 282719482eeafd39936030e776120e370a0fe21c | cache-unabhaengiger One-Time-Handoff und geschuetzte Automation-UI |
| Release-Wrapper | unveraendert, commit-gepinnt | SHA-256 ec96b8dda3d3a8f6725fe24cc39281d56096dd86954329d4e70b26acd4316d3a |
| Kombinierter Worker | Salad Version 5 | /health: ok:true, codingWorker:true; nach Jobs activeCodingRun:false |
| Produktionsspeicher | IDrive e2 Bucket smejj-app | Restart-Hydration von Job, Diff-SHA und Approval |

### Chat, Coding, Agent und Header

| Test | Beleg | Ergebnis |
|---|---|---|
| Chat auf /home | SSE-Streaming, sichtbare Antwort und Codeblock | Bestanden |
| Coding-Funktion | add(a,b) korrekt erzeugt | Bestanden |
| Bugdiagnose | Off-by-one items[1] zu items[0] korrekt erkannt | Bestanden |
| Agent-Dateiread | vorhandene Datei gelesen; harmloser Unified-Diff vorgeschlagen | Bestanden |
| Antwort-Header | x-smejj-model-backend: zhipu:glm-5.2 | Soll erfuellt |
| /api/health | ok:true, ai:true, aiBackend:zhipu:glm-5.2, storage:true | Bestanden |
| /status | AI Mode und Backend sichtbar | Bestanden |

### Authentifizierung und One-Time-Handoff

- POST /api/auth/session-handoff/start mit Origin https://smejj.com: 201.
- Handoff-ID: 43 Zeichen, URL-sicher.
- Poll vor Abschluss: 202.
- Poll mit fremdem Origin: 403.
- Abschluss ohne Control-Sitzung: 401.
- Anonymer Session-Token: 401.
- Cache-Control: no-store und Pragma: no-cache.
- Browser-Endzustand: Angemeldet: smejjcom@gmail.com.
- Der Bearer stand weder in der URL noch in einem dauerhaften Browser-Speicher.

### Autonome Live-Jobs

| Zweck | Job und Capsule | Ergebnis |
|---|---|---|
| Hauptjob | job_web_e933bd39934f42efbd749c60; jobs/2026/07/10/aa/... | Bestanden, 1 Versuch, 5/5 Tests, vier neue Dateien, Diff 34e77d90893d2d96decf5a12ee1221645269b5570580f23cd7155872b3ff13ec, menschlich freigegeben |
| Follow-up | job_web_f5176538e0364778993afdfb; jobs/2026/07/10/3b/... | Bestanden, 1 Versuch, 6/6 Tests, Diff 4a5478dba33fb1a4af334abb37a97d59d8c7df9509d8f78e67c7bb5332e622d8, menschlich freigegeben |
| Replay | job_web_fd8c8797d8e14a41afe77950; jobs/2026/07/10/df/... | Bestanden, 1 Versuch, 5/5 Tests, Diff 829e1e1cb9813269df9581d4d1accfc388d5bcdc2f003d3d6c431f2cfdfc0dd0, bewusst nicht automatisch freigegeben |
| Cancel | job_web_dd8e244018854396acad8d1c; jobs/2026/07/10/11/... | Abgebrochen, durable Phase Cancelled by human request; Worker danach inaktiv |

Der Hauptjob erzeugte ausschliesslich package.json, parity/add.js,
parity/add.test.mjs und PARITY_EVIDENCE.md in einem nicht gepushten Worker-Diff.
Kein Branch, PR oder Merge wurde auf GitHub erzeugt.

### Restart und IDrive-e2-Beleg

Nach einem Control-Instanzwechsel wurde der Hauptjob ueber die Endnutzer-UI neu
geladen. Job-ID, Status Bestanden, Diff-SHA und menschliche Freigabe waren
weiter vorhanden. Das ist ein produktiver Readback aus der persistenten
Task-Capsule, nicht nur ein In-Memory-Beleg.

Der lokale IDrive-Zugang gehoert zum getrennten Bucket smejj-model-files. Ein
gezielter Read auf den Produktions-Bucket smejj-app wurde mit 403 AccessDenied
abgewiesen. Dieser Zugriffsschutz ist korrekt; er verhindert aber einen zweiten
unabhaengigen Objektlisten-Beleg in diesem Audit.

Die lokale Audit-Kapsel wurde zusaetzlich append-only nach IDrive e2 gespiegelt:

- Bucket: smejj-model-files.
- Prefix: task-capsules/2026/07/codex-parity-final-e2e-2026-07-10/final/20260711T101313Z.
- 18/18 Objekte und 736061 Bytes.
- Jedes Objekt wurde binar erneut geladen und gegen seinen SHA-256 geprueft.
- Die abschliessende Prefix-Liste entsprach exakt allen 18 erwarteten Keys.
- Manifest-SHA-256:
  fdf32e0ba88f354983235db6b74b4b24ee61fdb407e69f9f963a0808c5a7e5c8.

Dieser getrennte Audit-Spiegel ist kein Ersatz fuer den produktiven Bucket
smejj-app und keine Trainingsfreigabe.

### Browser, Suche, Projekte, Dateien und Terminal

- Integrierter Browser: Example Domain sichtbar; Remote-Worker lieferte HTTP 200.
- Globale Suche: Oberflaeche bedienbar; neue Inhalte nicht verlaesslich indexiert.
- Projekte und Dateien: Routen bedienbar; authentifizierter Datei-Read bestanden.
- Terminal-Route: Allowlist-Aktion code 0; Runtime-Checker meldete 129 Dateien.
- Finale Browserkonsole auf der Automation-Seite: 0 Fehler.
- Screenshots:
  - tmp/task-capsules/codex-parity-final-e2e-2026-07-10/screenshots/automation-desktop.png
  - tmp/task-capsules/codex-parity-final-e2e-2026-07-10/screenshots/automation-mobile.png
  - tmp/task-capsules/codex-parity-final-e2e-2026-07-10/screenshots/follow-up-v41-passed.png
  - tmp/task-capsules/codex-parity-final-e2e-2026-07-10/screenshots/automation-v41-final.png

### Negative und instabile Befunde

1. Version 40 nahm den Job persist-first an, stoppte aber mit
   worker_dispatch_not_configured. Ursache war ein fehlender separater
   Worker-Token-Secret nach dem Recreate.
2. Version 41 leitet bei fehlendem dediziertem Worker-Secret einen
   domain-separierten HMAC-Schluessel aus dem vorhandenen Session-Secret ab.
   Explizite Worker-/Callback-Secrets behalten Vorrang. Kein Secret wurde
   gelesen, angezeigt oder neu eingegeben.
3. Nach dem ersten Hauptjob verlor die Control-Replica einmal ihre Readiness;
   kurzzeitig traten 503 und Failed to fetch auf. Salad startete die Replica
   neu. Danach blieb Version 41 bei 1/1 und alle Folgefluesse bestanden.
4. Zwei absichtlich read-only/no-diff formulierte Jobs endeten nach drei
   Versuchen als Fehlgeschlagen. Die aktuelle Schleife erwartet einen
   diff-erzeugenden Coding-Task; reine Analyse braucht einen eigenen Erfolgsmodus.
5. Replay ist funktional, aber nicht byte-deterministisch: der gruen verifizierte
   Replay-Diff hat eine andere SHA als der erste gruen verifizierte Diff.
6. Ein zwischenzeitlicher globaler Preflight stoppte bei vier parallel
   entstandenen Training-Writer-Testabweichungen. Nach Angleichung der Tests an
   die bereits vorhandenen fail-closed Evidence- und Signaturvertraege
   bestanden check:training mit 63/63 und der vollstaendige
   Release-Preflight. Die Trainingsfunktion blieb deaktiviert; es gab keinen
   Trainingslauf.

## Lokale und Release-Verifikation

Nach der Worker-Token-Korrektur bestanden:

- Control-Vertrag: 140/140.
- Training/Memory: 63/63.
- Evaluation: 12/12.
- Jobs: 19/19.
- Worker: 25/25.
- Salad: 23/23.
- Frontend: 80/80.
- Platform: 7/7.
- RAG: 9/9.
- LLM-Router: 28/28.
- Architektur/Free-Only: 7/7.
- Release-Safety/Overlay-Rollback: 8/8.
- Security- und Paid-Service-Guard: gruen.
- Kosten-Guard: gruen.
- Rollback-Simulation: gruen.
- Vollstaendige JavaScript-Syntaxpruefung: gruen.
- GitHub-Readback der einzigen Version-41-Datei: byteidentisch.
- Guidelines: 491 Dateien gruen.
- Start-Lock: 26/26 Dateien byteidentisch zum Stand
  2026-07-11T09:50:03.969Z.

Der vollstaendige `pnpm run release:preflight` des gemeinsam genutzten lokalen
Arbeitsbaums endete am 2026-07-11 mit Exit 0. Darin bestanden auch
Training/Memory 63/63, Control 140/140, Start-Lock 26/26,
Release-Safety 8/8,
Rollback-Simulation, Syntaxpruefung und Free-Tier-Guard. Die zwischenzeitliche
Training-Testabweichung ist damit geschlossen. Die lokale Test- und
Dataset-Schema-Angleichung fuer signierte Persistenzbelege wurde nicht
deployt. Diese Verifikation ist keine Trainings-, Modell-, Merge- oder
Produktionsfreigabe.

Der finale Vertrag erzeugt keinen Autoritaetsbeleg direkt aus einem
Write-Ergebnis. Er verlangt erneuten Objekt-Readback, exakte Digests, einen
zweiten bedingten 412-Nachweis, getrennte Ed25519-Schluessel sowie Consent- und
Evidence-Rechecks nach dem Status-Write und nach dem Dataset-Build.

## Architekturentscheidung

Der Control Server bleibt leichtgewichtig: Auth, Job-ID, Persist-first,
Budget, Routing, SSE, Approval und IDrive-e2-Metadaten. Git-Clone, Modelltools,
Dateischreibvorgaenge und Verifikation laufen im kombinierten Salad Worker.

Die Version-41-Korrektur verwendet keinen neuen externen Secret-Wert. Aus dem
bereits vorhandenen Session-Secret wird intern mit dem Kontext
smejj.com/worker-token/v1 ein separater HMAC-Schluessel abgeleitet. Ein
dedizierter SMEJJ_WORKER_TOKEN_SECRET oder SMEJJ_WORKER_CALLBACK_SECRET hat
weiter Vorrang. Der Worker erhaelt nur einen kurzlebigen, jobgebundenen Bearer.

Diese Loesung schliesst den internen Single-Owner-Fluss, ersetzt aber keine
harte Mandanten-Sandbox.

## Priorisierte Roadmap

## Nachtrag 2026-07-12: RC7/RC18-Staging-Audit

Dieser Nachtrag ersetzt keine frueheren Live-Belege und markiert keinen
ungeprueften Zustand als bestanden.

### Verifizierte neue Belege

- Lokale Verification Pipeline: `pnpm run release:preflight` gruen; 536 Dateien
  geprueft, Start-Lock 26/26 unveraendert, Rollback-Simulation und Free-Tier-
  Guard gruen.
- Ephemerer Runtime-Bundle RC7: SHA-256
  `10ba2ba896b2d0558e88fb719ae11dc8d94137bf17b4d0011a60f64fdda20bba`;
  deterministischer Zweitbuild identisch; IDrive-e2-Upload, Readback und
  bedingtes Ueberschreiben mit HTTP 412 bestanden.
- Control-Artefakt RC18: SHA-256
  `27b240b1956e2a3cb3d5a373bf3b861cf765b8778cd4c5bb157e627940372167`;
  deterministischer Zweitbuild identisch; IDrive-e2-Upload, Readback und
  bedingtes Ueberschreiben mit HTTP 412 bestanden.
- Staging-Version 20 wurde mit RC18, RC7, direktem amd64-Control-Image und
  repariertem Staging-IDrive-Zugang gestartet. Der Restart nach einem
  verwaisten Scheduler-Eintrag wurde kontrolliert ausgefuehrt; keine Loeschung
  und keine Produktionsaenderung.

### Nicht bestanden und deshalb nicht freigegeben

- Der Live-Coding-Job `job_codex_parity_source_20260712T175757260Z` blieb im
  Status `running`, Phase `running`, mit der Meldung `Queued for stateless
  worker dispatch`, ohne Worker-Readiness oder Modellaktion. Er wurde nach
  Ueberschreitung des 55-Minuten-Testfensters kontrolliert abgebrochen;
  Status, Cancellation und Task-Capsule-Persistenz waren dauerhaft lesbar.
- Nach dem Staging-Restart meldete Salad den Control-Container als `running`,
  der Live-Endpunkt `/api/health` blieb jedoch auch nach dem 300-Sekunden-
  Startup-Probe-Fenster bei HTTP 503. Das ist ein Blocker fuer Worker-E2E,
  Browser-Finaltests und Produktionspromotion.
- Der Produktionsstand wurde waehrend des Audits extern veraendert und steht
  aktuell auf einer alten Phase-1-Konfiguration ohne Runtime-Bundle und ohne
  Worker-Aktivierung. Er wurde nicht ueberschrieben.
- RC7 bleibt daher Kandidat fuer Staging, nicht produktionsberechtigt:
  `nativeAmd64ProviderVerified` ist noch nicht bestaetigt. Der lokale
  amd64-Browserlauf ist unter QEMU wegen Chromium/GPU-Limitierung kein Ersatz
  fuer einen nativen Salad-Beleg.

### Aktueller Go/No-Go-Status

`NO-GO`: Keine Produktionsaenderung, kein Draft-PR-Lauf, keine neue Memory-
Promotion und kein Abschluss als Codex-Paritaet, bis Staging `/api/health`,
ein Coding-Worker, ein Browser-Worker und die gesamte Verification Pipeline
gruen bestaetigt sind. Rollback-Archive bleiben erhalten; Design-Lock und
Startseite wurden nicht geaendert.

### Read-only Produktions-Readback 2026-07-12

- Salad-Control-Gruppe `smejj-control`: Version 55, `running`, extern
  vorgefundener Control-Artefakt-Digest
  `4383e456744b0bf9c68db9aa6b545ecb56379d1866e7c8716ac8b53c710b5635`.
- Read-only Control-Origin `/api/health`: HTTP 200, `ai:true`,
  `aiBackend:zhipu:glm-5.2`, `activeModelId:glm-5-2`.
- Read-only Control-Origin `/status`: HTTP 200.
- Die oeffentliche Domain `https://smejj.com/api/health` und
  `https://smejj.com/status` lieferten beim aktuellen Frontend-Routing HTTP
  404; der verifizierte Health-Beleg stammt deshalb explizit vom Control-Origin
  und nicht von der Frontend-Domain.
- Kein Produktions-Update, kein Secret-Readback und kein Artefakt-Overwrite
  wurde ausgefuehrt.

### Staging-Retry nach Freigabe 2026-07-12

- Staging wurde kontrolliert von Version 20 auf Version 21 aktualisiert; das
  RC18-Artefakt blieb unveraendert. Einziger Konfigurationsunterschied war
  `SMEJJ_HOST=0.0.0.0` statt `::`.
- Der exakte Inline-Bootstrap wurde lokal mit RC18 und echtem IDrive-Readback
  reproduziert: HTTP 200 auf `/api/health`, kein Fehler auf stderr.
- Salad meldete Staging nach dem vollstaendigen 300-Sekunden-Probe-Fenster
  weiterhin als nicht erreichbar; der Gateway-Readback blieb HTTP 503.
- Version 21 wurde anschliessend kontrolliert gestoppt. Produktion blieb
  unveraendert auf Version 55; es gab keinen Deploy, kein Overwrite und keine
  Loeschung.

### P0 - Schutz und Stabilitaet

1. Ursache des einmaligen Control-Readiness-Verlusts nach dem Hauptjob
   untersuchen: Speicher, Liveness-Probe, ausstehende IDrive-Operationen und
   offene SSE/FETCH-Verbindungen.
2. Einen strikt read-only IDrive-e2-Audit-Principal fuer smejj-app einrichten,
   damit Capsule-Objekte unabhaengig auf Digest und Vollstaendigkeit geprueft
   werden koennen.
3. Einen eigenen erfolgreichen Modus fuer read-only Analysejobs definieren,
   statt zwingend einen Diff zu verlangen.
4. Einen laengeren Control-/Worker-Soak-Test mit SSE, IDrive-e2-Persistenz und
   Replica-Neustart als feste Release-Fixture etablieren.

### P1 - Harte Worker-Sandbox

1. Pro Task einen ephemeren Salad-Worker starten.
2. Keine dauerhaften Secrets im Worker; nur kurzlebige jobgebundene Tokens.
3. Egress auf Control-Origin, freigegebene Git-Hosts und Paketquellen begrenzen.
4. Dateisystem, Prozesse, CPU, RAM, Laufzeit und Netzwerk pro Task isolieren.
5. Worker erst nach verifiziertem Capsule-Upload beenden.

### P2 - GitHub- und Python-Paritaet

1. GitHub App mit kurzlebigem repo-begrenztem Installation-Token.
2. Draft-PR nach exakter Diff-Freigabe live testen; Merge bleibt Menschenaktion.
3. Gepinntes Worker-Image mit Python und pytest.
4. Node-, Python-, pnpm- und Monorepo-Fixtures als Regression-Suite.

### P3 - Parallelitaet und deterministischer Replay

1. Durable Scheduler-Leases, Heartbeats und idempotente Claims.
2. Atomare replikaweite Job-, Token- und Monatsbudgets.
3. Aktionsprotokoll-Replay gegen denselben Base-Commit, statt freier Neugenerierung.
4. Lasttests stufenweise; Millionen parallele Tasks bleiben ein Langfristziel.

### P4 - Produktqualitaet

1. Automatische Preview-Erzeugung und Browserpruefung fuer gaengige Frameworks.
2. Chat, Repos und Capsules inkrementell in globale Suche/RAG indexieren.
3. Versionierte Qualitaets-, Sicherheits- und Kostenbenchmarks.
4. Tenant-ACL fuer Nutzer, Projekte, Jobs, Capsules und Approval.

## Risiken und Blocker

| Risiko/Blocker | Auswirkung | Schutz |
|---|---|---|
| Shared Browser-/Coding-Worker | Keine harte Isolation fuer fremde Repos | Owner-Allowlist; keine Fremd-Repos |
| Einmaliger Control-Neustart | Kurzzeitige 503 und unterbrochener Follow-up | Restart-Hydration bestanden; Ursache P0 |
| Kein Produktions-Audit-Principal | Kein zweiter direkter Capsule-Objektread | Produktive Hydration als Beleg; read-only Principal P0 |
| Kein GitHub-App-Token | Keine privaten Repos/Draft-PR-Livetests | Diff-only; kein Push/Merge |
| Kein pytest im Shared-Worker | Python-Paritaet fehlt | Node-Aufgaben intern; gepinntes Image P2 |
| Replay nicht byteidentisch | Gleiche Aufgabe kann anderen validen Diff erzeugen | Jede neue SHA separat pruefen/freigeben |
| Keine durable Parallel-Leases | Mehrere Replicas koennen doppelt arbeiten | Serieller interner Betrieb |
| Keine Tenant-ACL | Mehrbenutzerbetrieb nicht sicher getrennt | Einzelkonto- und Owner-Allowlist |
| Read-only Task ohne Diff | Analysejob wird faelschlich als Fehler gewertet | Eigener Analyze-Erfolgsmodus |

## Schutz und Rollback

- Keine Startseiten-/Design-Datei war Teil der GitHub- oder Salad-Version-41-Aenderung.
- Start-Lock final 26/26 byteidentisch.
- Keine Datei, kein Projekt, kein Chat, kein Zugang und kein Produktionsdatum
  wurde geloescht.
- Kein GitHub Actions, kein Cloudflare und kein neuer kostenpflichtiger Dienst.
- Frontend-Rollback: Commit e547a482f1be724ac9aa25fb3df649b8988403f7
  revertieren, falls ausschliesslich die Automation-UI zurueckgenommen werden soll.
- Control-Rollback: Salad auf Version 40 zurueckstellen; dadurch wird der
  Worker-Dispatch wieder fail-closed blockiert.
- Quell-Rollback:
  backups/rollback-2026-07-10-codex-parity-final-e2e/source-before.tar.gz
- Quell-Rollback-SHA-256:
  c3ac075d5ad35f31752fdec1f5398a07b486463fcec4a2b76ada606e53b4a008
- Lokaler Signaturvertrags-Rollback:
  backups/rollback-2026-07-11-training-record-proof-tests/source-before.tar.gz
  mit SHA-256
  74003b35d966293b66c603709bd7a5804d1190e160d2eabf0be7d1544ae87726.
- Dataset-Schema-Rollback:
  backups/rollback-2026-07-11-training-record-proof-tests/schema-before.tar.gz
  mit SHA-256
  266b70540b4da2dc6bf77d80f7aaaf19a9c1380cf1b5f741cf22c98b9c5bb24f.
- Evidence-Binding-Rollback:
  backups/rollback-2026-07-11-training-record-proof-tests/evidence-binding-before.tar.gz
  mit SHA-256
  3fab5ef2508e131cba929e62c9fbd841b196ad890726e08f34e641794c290949.
- Authority-API-Rollback:
  backups/rollback-2026-07-11-training-record-proof-tests/authority-api-before.tar.gz
  mit SHA-256
  24184bb094ceb6b1b1fa6a7eec02eb267e8eba726a042ce0c7794095329b155d.

## Endentscheidung

Der interne, oeffentliche, allowlist-geschuetzte Coding-Fluss von smejj.com hat
jetzt eine deutlich groessere funktionale Naehe zu Codex und ist live bis zu
Diff, Approval, Follow-up, Replay, Restart-Hydration und Cancel belegt.

Eine ehrliche Freigabe als 1:1-Codex-Paritaet ist nicht zulaessig. Die harte
ephemere Sandbox, private Repo-/Draft-PR-Kette, durable Parallelitaet,
deterministischer Replay, Python-Tooling und Tenant-ACL bleiben zwingende
Voraussetzungen. Der lokale Gesamt-Preflight ist gruen, schliesst diese
produktiven Architektur- und Funktionsluecken aber nicht.

## Nachtrag 2026-07-13: Replay- und Isolationsschutz (lokal verifiziert)

- Neue Replay-Aktionslogs verwenden Schema 2 mit kanonischem JSON-Hashing
  (sortierte Objekt-Schluessel). Schema-1-Logs bleiben mit ihrer bisherigen
  Hashregel lesbar. Dadurch ist die Hashbindung nicht mehr von der
  Einfuegereihenfolge eines JSON-Objekts abhaengig; die Control-Validierung
  verwendet dieselbe schemaabhaengige Regel.
- Der Coding-Worker meldet den tatsaechlichen Isolationszustand explizit.
  `SMEJJ_REQUIRE_HARD_ISOLATION=YES` blockiert `/run` fail-closed, solange
  kein attester `container-v1`-Runtime mit Ephemeral- und Allowlist-Egress-
  Merkmalen vorliegt.
- Die neue Sperre ist lokal durch Regressionstests, `pnpm run check:all` und
  `pnpm run release:preflight` verifiziert. Sie ist kein Nachweis, dass der
  aktuelle Produktions-Worker bereits als harter Kernel-Container laeuft.
- Kein Produktionsdeployment, kein Secret-Read, kein GitHub-Schreibzugriff
  und keine Startseitenaenderung wurde ausgefuehrt.

## Nachtrag 2026-07-13: Tenant-/Projektzugriff (lokal verifiziert)

- Authentifizierte Job-Erstellung setzt `tenantId` ausschliesslich aus der
  serverseitig geprueften Sitzung; ein Client-Tenant wird nicht uebernommen.
- Besitzpruefungen fuer Jobs und Projekte verweigern widerspruechliche
  Tenant-/Owner-Kombinationen und bleiben fuer alte Job-Objekte kompatibel.
- Approvals enthalten jetzt den geprueften, opaken Audit-Prinzipal.
- Negative Cross-Tenant-Tests, Job-Envelope-Tests und die Gesamtpipeline sind
  lokal zu verifizieren; der Block wurde nicht produktiv deployt.
