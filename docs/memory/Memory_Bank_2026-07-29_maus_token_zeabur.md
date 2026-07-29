# Memory_Bank — Auslagerung 2026-07-29: Maus-Ursachen und Control-Server auf Zeabur

Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel. Nichts geloescht.
Capsule: `docs/task-capsules/2026/07/job_maus_token_zeabur_20260729/CAPSULE.md`.

### [2026-07-29] CONTROL-SERVER LAEUFT AUF ZEABUR (job_maus_token_zeabur_20260729)

Freigabe des Betreibers am 2026-07-29 (FREE_ONLY_MASTER_POLICY, Ausnahme 2):
Dienst `smejj-control` auf dem BESTEHENDEN 6-$-Server, **0,00 USD zusaetzlich**.
Dienst `service-6a697bf60d0b094201bcc1ee`, Status "Running 1/1".

- BELEG im Container (Tab "Command"): `HEALTH ok= true app= smejj.com Code`;
  Laufzeit-Protokoll `smejj.com Code MVP: http://0.0.0.0:8080`.
- **Dienstname MUSS `smejj-control` sein.** Zeabur schlaegt den Repo-Namen vor
  (`smejj.com-app`); nur unter dem richtigen Namen greift
  `Dockerfile.smejj-control`. Im Dialog "Configure Build Plan" setzen, VOR dem
  Deploy-Klick.
- **Die Build-Plan-Vorschau luegt.** Sie zeigt weiter zbpack (`pnpm build:i18n`),
  auch wenn das Dockerfile gewinnt. Kein Abbruchgrund — die Auswahl nach
  Dateinamen passiert erst im Bau. Beleg: Abbild 81,7 MB statt eines
  pnpm-Install-Baus, plus Docker-Symbol am Dienst.
- **Der alte `deploy/control-server/Dockerfile` war kaputt** (ohne `workers/`
  und `schemas/` bootet der heutige Code nicht). Im neuen Abbild nachgewiesen:
  beide Maus-Schemata vorhanden, `PLAN-SCHEMA lesbar: true`.
- **"Killing: Stopping container" war kein Absturz** — ein weiterer `git push`
  hatte einen neuen Bau ausgeloest. LEHRE: ein Push auf den Branch baut ALLE
  daran haengenden Dienste neu; die Kopfzeile im Portal hinkt der Wahrheit
  nach. Im Zweifel Bereitstellung und Protokoll lesen, nicht die Kopfzeile.
- OFFEN: Env-Werte im neuen Dienst (Betreiber, Zugangsdaten) und danach die
  Frontend-Umstellung — `public/config.js` und `public/index.html` stehen im
  START-LOCK und brauchen eine EIGENE Freigabe. Die Kostenfreigabe deckt sie
  ausdruecklich NICHT. Plan: `docs/deployment/CONTROL_SERVER_ZEABUR_UMZUG.md`.

### [2026-07-29] MAUS: ZWEI GETRENNTE URSACHEN, BEIDE VERMESSEN (job_maus_token_zeabur_20260729)

Commits `6c322d2` + `a77febc`. Capsule:
`docs/task-capsules/2026/07/job_maus_token_zeabur_20260729/CAPSULE.md`.

- **Die Engine ist intakt.** Direkter Lauf gegen
  `smejj-maus-engine.zeabur.app` mit dem lokalen Token: HTTP 200, `ok:true`,
  4 Schritte, 2 Artefakte — und beide **zurueckgelesen** (Protokoll entpackt,
  Screenshot 39.374 Byte). Nur die Verbindung Control-Server -> Engine fehlt.
- **Token:** beide Seiten 64 Zeichen, beide sauber getrimmt, aber
  verschiedene Werte (SHA-8 `c4e4ab90` vs `4cbb7a1f`). Die Engine akzeptiert
  den lokalen — also sendet der Control-Server einen anderen -> HTTP 401.
- **DIE ALTE DIAGNOSE "verschiedene Konten" WAR FALSCH.** Unterschiedliche
  Schluessel-Fingerabdruecke beweisen kein anderes Konto — ein Konto darf
  mehrere Zugangsschluessel haben. Gemessen ist es ein **Eimer**: die Engine
  schreibt nach `smejj-model-files`, der Control-Server liest Capsules aus
  `smejj-app`. Das erklaert die 14 Altordner vom 14./15. Juli und keinen
  einzigen neuen. Zu tun ist ein Eimer-NAME, kein Zugangsdaten-Abgleich.
- **LEHRE: einen Fingerabdruck-Unterschied nicht zur Ursache befoerdern.**
  Er sagt "nicht gleich", nicht "anderes Konto". Der Beweis kam erst aus
  einem echten Lauf plus HEAD auf beide Eimer.
- **Fehlermeldung entluegt:** `buildRunPlan()` prueft jetzt den HTTP-Status;
  Infrastruktur-Abbrueche tragen `infra:true` (markiert, NICHT geraten).
  Zwei Fehlversuche unterwegs, beide lehrreich: (1) `response.ok !== true`
  machte erfolgreiche Laeufe zu Fehlern, sobald eine Antwort nur `status`
  traegt — ein Fehler muss POSITIV belegt werden; (2) "abgebrochen ohne
  gelaufenen Schritt = Infrastruktur" stufte auch korrekt abgelehnte Plaene
  als Infrastrukturfehler ein.
- **Release aus sauberem Checkout bauen, nie aus der Arbeitskopie**, wenn
  parallele Sitzungen laufen — hier arbeiteten zwei fremde gleichzeitig im
  Baum. `git archive <commit> | tar -x` statt Arbeitsbaum.
- **`deploy/control-server/Dockerfile` ist kaputt:** kopiert `workers/` und
  `schemas/` nicht; damit bootet der heutige Code nicht (rc1-Klasse).
  Neu: `Dockerfile.smejj-control` (nachgebaut und gestartet, /api/health 200).
- Werkzeug: `node scripts/diagnose/maus-abgleich.mjs` — vergleicht Token und
  Eimer, fragt die Engine gegen, zeigt nie einen Geheimwert (nur Laenge +
  SHA-8). Ersetzt das Raten dauerhaft durch eine Messung.
- OFFEN (Betreiber): Token gleichmachen, Eimer gleichmachen. Der Fehlergrund-
  Fix ist committet und faehrt mit dem naechsten Control-Release mit.

