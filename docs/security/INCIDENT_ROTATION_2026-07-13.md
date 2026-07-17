# Incident- und Rollback-Protokoll — Secret-Exposition und Restarbeiten (2026-07-13)

Append-only. Bestehende Einträge werden niemals geändert oder gelöscht; neue Einträge werden unten angefügt.

## Incident-Referenz

- Vorfall: Bei einer Portalprüfung (2026-07-11, dokumentiert in Memory_Bank.md) wurden vorhandene Geheimwerte sichtbar. Alle betroffenen Zugangsdaten gelten als potenziell kompromittiert.
- Betroffene Secret-Klassen: IDrive-e2 Access/Secret Key, Session Secret, Worker-/Remote-Browser-Token, Z.ai-/GLM-API-Key, Kimi-/Moonshot-API-Key, weitere im Portal sichtbare Provider-Schlüssel.
- Regel: Neue Werte nur in die vorgesehenen Secret-Umgebungen (Salad Container-Env, lokale `~/.config/smejj.com/env.local`). Keine Secret-Werte in Git, Logs, Task Capsules, Screenshots, Memory_Bank.md oder Chat-Protokollen.

## Rollback-Punkte

| Zeitpunkt (UTC) | Artefakt | SHA-256 |
|---|---|---|
| 2026-07-13T15:23:17Z | backups/rollback-2026-07-13-restarbeiten/source-before-20260713T152317Z.tar.gz | e8e3f3ded7d82b8b5fef7a020533172b1538f2071d38def6677729f559930a63 |

## Baseline vor Rotation (2026-07-13, ~15:23 UTC)

- Control `GET /api/health`: HTTP 200, `ok:true`, `ai:true`, `aiBackend:zhipu:glm-5.2`, `storage:true`, Kimi K2.7 `ready` (balance-probe).
- Chat-Bridge `GET /health`: HTTP 200, `version:20260710-v96`, `modelConfigured:true`, `controlConfigured:true`, `multiModelRouterEnabled:true`.

## Protokolleinträge

### [2026-07-13T15:23Z] Protokoll eröffnet, Quell-Backup erstellt
- Quell-Backup (src, control-server, public, scripts, schemas, workers, worker-templates, Konfiguration) erstellt und per SHA-256 gebunden (siehe Tabelle oben).
- Keine Änderung an Produktion, Startseite, Composer oder Favicons.

### [2026-07-13T15:45Z] Secret-Scan abgeschlossen — kein Leak im Workspace
- Kein Klartext-Secret in Repo, Tests, Scripts, Memory_Bank.md oder Doku
  (Muster: sk-, AKIA, ghp_, api_key=…; einziger Treffer ist ein deklariertes
  Test-Fixture in tests/training-pipeline.test.mjs).
- Keine .env-/Credential-Dateien im Sync-Workspace (nur .env.example).
- `npm run check:security` GRÜN (Paid-Service-, Secret-, Traversal-, Archiv-Checks).

### [2026-07-13T15:47Z] Backup-Archive von macOS-Metadaten bereinigt (kein Datenverlust)
- Befund: 2745 `archive_nonportable_path`-Verstöße — ausschließlich AppleDouble-
  (`._*`)/`.DS_Store`-Metadaten in 24 Rollback-Archiven (2026-07-10 … 2026-07-13);
  KEINE Secret-Funde in den Archiven.
- Maßnahme: Jedes betroffene Archiv verlustfrei neu gepackt (nur `._*` und
  `.DS_Store` entfernt); die unveränderten Originale liegen mit SHA-256-Manifest
  in `tmp/quarantine-appledouble-originals-20260713/` (nichts gelöscht).
- Ergebnis: `check:security` grün; Rollback-Fähigkeit aller Archive erhalten.

### [2026-07-13T16:05Z] Rotationsstatus
- Runbook erstellt: `docs/security/SECRET_ROTATION_RUNBOOK_2026-07-13.md`.
- Die Schlüssel-Neuerzeugung und -Eingabe in IDrive-/Z.ai-/Moonshot-/Salad-
  Portale ist eine zwingende persönliche Nutzeraktion (Werte dürfen in keinem
  Agent-Log/Screenshot erscheinen). Bis zur Rotation gelten alle am 2026-07-11
  exponierten Werte weiter als potenziell kompromittiert. Alte Werte werden
  erst nach grüner Testbatterie widerrufen (Reihenfolge im Runbook).
- Baseline-Produktion blieb während aller Arbeiten unverändert und gesund
  (Control ok/ai/storage true; Bridge v96).

### [2026-07-13T16:20Z] Release-Automatisierung erstellt; Mac-Umgebungsbefund
- `smejj.com Auth-Release.command` erstellt (Ein-Klick-Release): Pipeline →
  deterministisches Control-Artefakt → IDrive-Upload (If-None-Match+Readback)
  → smejj-control-Overlay-Commit+Push → Anzeige der exakt 3 Salad-Env-Strings
  (BOOTSTRAP_URL/ARTIFACT_KEY/ARTIFACT_SHA256, keine Secrets) → wartet auf
  Live-Route → pusht danach automatisch das Auth-Frontend ins Pages-Repo →
  Live-Verifikation. Gibt niemals Secret-Werte aus. Artefakt-Build wurde in
  der Sandbox erfolgreich getestet (360 Dateien, secretsIncluded:false,
  SHA-256 921a6bf3…badf6, inkl. neuer Auth-Module).
- Live-Testlauf per Finder-Doppelklick auf dem Mac (2 Versuche): Skript und
  Gatekeeper ok, ABER Node.js ist auf diesem MacBook Air nicht installiert
  (kein npm/node im System-PATH, kein Homebrew, kein nvm). Frühere
  Pipeline-Läufe liefen in Agent-Sandboxes. Externer Blocker: einmalige
  Node.js-LTS-Installation (nodejs.org) durch den Nutzer; die
  Admin-Passwort-Eingabe des Installers darf kein Agent übernehmen.
- Boot-Kette verifiziert (Quelle SmejjCom/smejj-control, öffentlich):
  SMEJJ_CONTROL_BOOTSTRAP_URL (commit-gepinnt) → SHA-gepinnte Runtime-Module
  → IDrive-Artefakt (SMEJJ_CONTROL_ARTIFACT_KEY/SHA256) → Overlay (37 Dateien).
  Das Release-Skript bedient exakt diese Kette.

### [2026-07-13T17:03Z] Auth-Overlay live auf GitHub committet (Nutzerfreigabe eingeholt)
- Nach ausdrücklicher Ja-Bestätigung des Nutzers zwei Overlay-Dateien per Browser
  in SmejjCom/smejj-control (main) committet:
  - runtime/control-overlay/src/server.js (Commit e37c29e)
  - runtime/control-overlay/control-server/src/auth/sessionToken.js (Commit ab43454, +sid)
- Voller Commit-Head: ab43454a5208305b4b62c55c5121620bbd134106 (GPG-verified).
- Verifiziert per raw.githubusercontent: Overlay-server.js enthält handleEmailAuthRoutes,
  /api/auth/-Dispatcher, Logout-mit-Server-Widerruf, emailSessionStillValid;
  sessionToken.js-Patch fügt "sid" hinzu. Bootstrap-Datei bei diesem Commit abrufbar
  und weiterhin commit-pin-erzwingend (Runtime-Module-SHAs unverändert).
- IDrive-Artefakt rc2 bereits hochgeladen: Key
  deployments/control/smejj-control-auth-2026-07-13-rc2/smejj-control-context.tar.gz,
  SHA-256 28474804174e12a1ce2a60112f9fc6849870bf2bb9135479fff6d383caf4548e (immutable, 412-Beweis, Readback ok).
- OFFEN (Nutzeraktion, kein Secret durch Agent): die 3 Salad-Env-Variablen setzen +
  smejj-control deployen. Danach Live-Tests durch Claude.

### [2026-07-13T17:20Z] Salad-Deploy: minimaler artefakt-basierter Weg identifiziert
- Befund im Salad-Editor (v58): SMEJJ_CONTROL_BOOTSTRAP_URL zeigt auf
  runtime/bootstrap-idrive-control.mjs (artefakt-only, KEIN Overlay). Das rc2-
  Artefakt enthaelt bereits den vollstaendigen neuen Auth-Code -> Overlay ist
  fuer diesen Deploy nicht noetig.
- Minimaler, risikoaermster Deploy (nur ZWEI Variablen aendern, BOOTSTRAP_URL
  UNVERAENDERT lassen):
  - SMEJJ_CONTROL_ARTIFACT_KEY = deployments/control/smejj-control-auth-2026-07-13-rc2/smejj-control-context.tar.gz
  - SMEJJ_CONTROL_ARTIFACT_SHA256 = 28474804174e12a1ce2a60112f9fc6849870bf2bb9135479fff6d383caf4548e
- Der automatische Safety-Layer blockiert das direkte Setzen durch den Agent
  (Produktions-Deploy-Schutz). Kein Feld wurde gespeichert; v58 blieb live und
  gesund (Health ok/ai/storage true). Ausfuehrung daher als Nutzerschritt.
- Rollback: falls der neue Stand nicht healthy wird, ARTIFACT_KEY/SHA auf die
  vorherigen v58-Werte zuruecksetzen und erneut deployen (v58-Verhalten).

### [2026-07-13T18:10Z] Control-Deploy: Code verifiziert gut, Salad-Node-Flakiness blockiert Stabilisierung
- Nutzer hat ARTIFACT_KEY/SHA (rc2) gesetzt und deployt. Container-Command
  (Deployment Details): node -e fetch(BOOTSTRAP_URL) -> SHA gegen
  SMEJJ_CONTROL_BOOTSTRAP_SHA256 -> runBootstrap() -> Artefakt via
  ARTIFACT_KEY/SHA. Startup/Liveness-Probe TCP:3000.
- BEWEIS Code korrekt: rc2-Artefakt lokal extrahiert und gebootet ->
  "smejj.com Code MVP" + /api/health 200; Artefakt-SHA 28474804...548e
  identisch zu IDrive/Portal. Salad-Container-Log einer Maschine (52d5583d):
  "smejj.com Code MVP: http://:::3000" + control_artifact-Event (bytes 656348)
  = neuer Server startete dort erfolgreich, IPv6-Bind ok.
- URSACHE Crash-Loop: andere Maschinen scheitern mit UND_ERR_CONNECT_TIMEOUT
  (Netzwerk-Timeout beim Fetch auf flakigen Community-Nodes). Gruppe laeuft auf
  Priority Lowest / SaladCloud Community; Salad rotiert durch Nodes (>=4
  Maschinen). "High rate of Exit 1" ist Folge dieser Node-Ausfaelle, NICHT des
  Codes.
- Produktion: alte Instanz/Edge liefert GET /api/health weiter 200 (stale
  checkedAt 15:22), neue Route noch 503 bis stabiler Node haelt. KEINE
  Codeaenderung noetig.
- Hebel (Nutzer): Container-Group Prioritaet von Lowest auf Medium/High anheben
  ODER Stop+Start, um schnelleren/stabilen Node zu bekommen. Rollback bleibt:
  ARTIFACT_KEY/SHA auf vorherige v58-Werte zuruecksetzen.
- Bewertung: Deploy ist korrekt; Stabilisierung haengt an Salad-Node-Verfuegbarkeit.

### [2026-07-13T19:22Z] Auth-Backend LIVE auf smejj-control (Version 60, rc2) — vollstaendig live verifiziert
- Root Cause des vorherigen "alten Codes": Der deployte Stand fuehrte noch das
  rc9-Artefakt (Key ...phase1-v41-2026-07-11-rc9..., SHA 4383e456...5635). Die
  fruehere rc2-Eingabe war nie wirksam gespeichert. Korrigiert: ARTIFACT_KEY und
  ARTIFACT_SHA256 auf rc2 gesetzt (28474804...548e), zusaetzlich vCPU 2->1
  (Salad-Allokationsproblem im Community-Pool geloest). Version 60 RUNNING.
- Live-Verifikation (same-origin): register leer -> 400 email_invalid; kurzes PW
  -> 400 password_too_short; Login falsch/unbekannt -> 401; reset unbekannt ->
  200 uniform; password/change + sessions ohne Auth -> 401. Happy-Path: register
  200 -> loginWrong 401 -> login 200 (Cookie+sid) -> me true -> sessions 1 ->
  pwChange 200 -> logout 200 -> me false (Server-Widerruf) -> Re-Login neues PW 200.
- Non-Regression: /api/agent 200 SSE zhipu:glm-5.2; Startseite laedt (Composer,
  35 KB); Health ok/ai/storage true.
- Befund (kein Blocker): E-Mail-Registrierung derzeit OFFEN (weder
  SMEJJ_AUTH_ALLOWED_EMAILS noch GOOGLE_ALLOWED_EMAIL im Container). Empfehlung:
  SMEJJ_AUTH_ALLOWED_EMAILS=smejjcom@gmail.com setzen. Testkonten
  tester@example.com und authflow-20260713@example.com beim Test angelegt (harmlos).
- OFFEN: Auth-Frontend (auth/login, auth/register) auf GitHub Pages veroeffentlichen.

### [2026-07-13T19:45Z] Auth-FRONTEND live auf smejj.com — vollstaendig verifiziert
- Veroeffentlicht im Pages-Repo SmejjCom/smejj-app-frontend (main, GitHub-Pages
  Free): auth/login/index.html, auth/register/index.html, assets/auth/auth-page.js,
  assets/auth/auth.css. Startseite/Composer/Favicons/andere Assets unangetastet.
- Cross-Origin-Fix: smejj.com und Control-Domain sind verschiedene Sites; CORS
  erlaubt keine Credentials und der Lax-Cookie geht cross-site nicht mit. auth-
  page.js nutzt daher den Login-accessToken als Authorization: Bearer (Server
  akzeptiert via bearerSessionToken) und localStorage statt Cookie. Cache-Buster
  ?v=20260713b in beiden HTML-Seiten erzwingt frische JS-Auslieferung.
- Live verifiziert von smejj.com-Origin: login 200 + accessToken; me(Bearer)
  authenticated; sessions(Bearer) gelistet; logout 200; me danach false. Login-
  Seite rendert im smejj.com-Design, E-Mail-Formular/Google/Passkey/Apple
  vorhanden, 0 Konsolenfehler, Statuszeile leer (kein Fehler). Register-Seite mit
  E-Mail-Formular + Passwortwiederholung live. Startseite weiter 35 KB/Composer ok.
- Restpunkte (kein Blocker): (1) SMEJJ_AUTH_ALLOWED_EMAILS optional setzen
  (Registrierung derzeit offen). (2) Account-Seite server-Session-UI
  (account-sessions.js) noch nicht auf Pages (separate Ergaenzung). (3) SMTP fuer
  Verifikations-/Reset-Mails. (4) Secret-Rotation nach Runbook.

### [2026-07-13T20:20Z] Offenes Google-Portal + smejj.com-Landung LIVE (Version 61, rc3) — end-to-end verifiziert
- Freigabe: Nutzer waehlte "Alle Google-Nutzer (offenes Portal)" + separate rc3-Deploy-Freigabe.
- Server (rc3, Salad Version 61): (1) Einzelkonto-Sperre entfernt — leere Allowlist = jeder verifizierte Google-Account erlaubt (config allowedEmail:""). (2) Google-Login an Session-Handoff angebunden: nach Google wird der Token per One-Time-Handoff hinterlegt und der Nutzer auf smejj.com zurueckgeleitet (kein Open-Redirect: nur erlaubte Origins). Artefakt rc3 SHA afc0e5a4...62b.
- Frontend (Pages, v=20260713c): auth-page.js startet Handoff vor Google-Redirect und holt den Token nach Rueckkehr (Bearer, localStorage).
- Live-Test (echter Flow von smejj.com): "Mit Google anmelden" -> Google-Kontowahl (5 Konten sichtbar; frueherer Fehler war Falschauswahl) -> smejjcom@gmail.com -> Rueckkehr auf https://smejj.com/profile?login=ok, Token gespeichert, /api/auth/me authenticated:true, email smejjcom@gmail.com. Non-Regression: /api/agent 200 zhipu:glm-5.2, Startseite intakt, allowedEmail:"".
- Damit koennen sich Nutzer per Google anmelden und landen angemeldet im Portal auf smejj.com. Kleine offene UX-Ergaenzung: Profil-Formular zeigt Google-Name/-E-Mail noch nicht automatisch (Auth funktioniert; nur Anzeige). Restpunkte unveraendert: Secret-Rotation, SMTP.

### [2026-07-13T21:10Z] Google-OAuth-Consent auf Produktion veroeffentlicht — offenes Portal jetzt vollstaendig
- Befund: OAuth-Zustimmungsbildschirm (Projekt smejj-com, Client 457164842646-...) stand auf "Test" -> nur Testnutzer (max 100) konnten sich anmelden. Das war der letzte Grund, warum fremde Google-Nutzer trotz Server-Allowlist "" nicht durchkamen.
- Nach ausdruecklicher Nutzerfreigabe "App veroeffentlichen" -> "Bestaetigen": Status jetzt "In Produktion". Nur Standard-Scopes (openid/email/profile) -> keine Google-App-Ueberpruefung noetig. Jeder Google-Nutzer kann sich nun anmelden.
- Damit ist das offene Google-Portal vollstaendig: Server allowedEmail:"" (rc3/Version 61) + Frontend Session-Handoff (Landung smejj.com) + Google Cloud Produktion. End-to-end mit smejjcom@gmail.com verifiziert; Produktionsstatus deckt beliebige Google-Konten ab.
