# Control Server: Umzug von Salad nach Zeabur — Dienst laeuft, Werte fehlen

Stand: 2026-07-29 · Capsule `job_maus_token_zeabur_20260729`

Der Betreiber hat entschieden: Salad wird schrittweise abgeloest, Zeabur ist
Hauptserver. Der Control-Server `smejj-control` ist das letzte grosse Stueck auf
Salad. Dieses Dokument haelt fest, was **erledigt** ist, was **noch fehlt**
und was der Umzug **kostet**.

## Status

| Teil | Zustand |
| --- | --- |
| `Dockerfile.smejj-control` | fertig, im Repo-Wurzelverzeichnis |
| `.dockerignore` fuer den Control-Server tauglich | erledigt (zweites Maus-Schema ergaenzt) |
| Freigabe nach FREE_ONLY_MASTER_POLICY | **erteilt 2026-07-29** (Ausnahme 2) |
| Zeabur-Dienst angelegt | **ja, 2026-07-29** — `service-6a697bf60d0b094201bcc1ee` |
| Erster Bau | **erfolgreich**, "Running 1/1" |
| Gesundheitsabruf im Container | **bestanden** — `ok=true, app=smejj.com Code` |
| Env-Werte im neuen Dienst | **offen — nur der Betreiber** |
| Domain vergeben | **ja** — https://smejj-control.zeabur.app (HTTP 200) |
| CSP `connect-src` vorbereitet | **ja, live** (sw v191) — additiv, ohne Wirkung |
| Frontend auf neue Adresse umgestellt | **nein — wartet auf die Env-Werte** |

### Was beim Anlegen gemessen wurde (2026-07-29)

- Dienstname **muss** `smejj-control` heissen. Zeaburs Vorschlag war
  `smejj.com-app` (aus dem Repo-Namen). Nur unter dem richtigen Namen greift
  `Dockerfile.smejj-control`. Der Name wird im Dialog "Configure Build Plan"
  gesetzt, **bevor** man auf Deploy klickt.
- Die "Build Plan Preview" zeigt trotzdem weiter zbpack (nodejs, pnpm,
  `pnpm build:i18n`, `pnpm start`). **Das ist nur eine Schaetzung** und kein
  Grund abzubrechen: die Auswahl nach Dateinamen passiert erst im Bau.
  Beleg, dass das Dockerfile gewonnen hat: Docker-Symbol am Dienst und
  Abbildgroesse **81.689.535 Byte** — ein pnpm-Install-Bau waere ein
  Vielfaches davon.
- Branch `feature/auth-redesign-github-magiclink` waehlen, **nicht** `main`:
  `main` hat im Arbeits-Repo eine getrennte Historie.
- Der Dienst wurde bewusst **ohne Env-Werte** angelegt. Das ist gefahrlos,
  weil der Control-Server ohne sie sauber startet statt in einen
  Absturz-Kreislauf zu laufen (lokal gemessen, siehe Schritt 1 unten).
- **Bestaetigt im Container** (Dienst-Tab "Command"):
  `HEALTH ok= true app= smejj.com Code`. Laufzeit-Protokoll zeigt
  `smejj.com Code MVP: http://0.0.0.0:8080` — also der richtige Prozess auf
  dem richtigen Port.
- **Beide Dockerfile-Korrekturen im Abbild nachgewiesen:**
  `ls schemas/` -> maus-action-plan **und maus-step-decision** (die zuvor
  fehlende Datei), `ls workers/` -> glm-salad, maus-engine, remote-browser,
  smejj-training-loop, smejj-worker. Und der Plan-Validator hat sein Schema
  zur Laufzeit wirklich gelesen (`PLAN-SCHEMA lesbar: true`) — kein ENOENT.
- **Kopfzeile hinkt nach.** Sie stand noch auf "Building", als die
  Bereitstellung schon "Running" meldete, und der erste Container wurde nach
  zwei Minuten mit "Killing: Stopping container" beendet. **Das war kein
  Absturz:** ein weiterer `git push` hatte einen neuen Bau ausgeloest, der den
  alten Container ersetzt. Erst danach stand "Running 1/1".
- **WICHTIG, betrieblich:** Ein `git push` auf diesen Branch loest einen
  Neubau **aller** Dienste aus, die daran haengen — auch
  `smejj-training-loop`. Waehrend einer Umzugsphase also sparsam pushen und
  nach dem Push den Dienst-Zustand nachsehen, statt eine alte Anzeige zu
  glauben.
- Non-Regression direkt danach geprueft: `smejj-maus-engine` HTTP 200,
  `smejj-chat-bridge` HTTP 200, Salad-Control HTTP 200, smejj.com HTTP 200.

## Was die Freigabe deckt — und was nicht

Die Freigabe vom 2026-07-29 ist eine **Kosten- und Dienste-Freigabe**. Sie
erlaubt, den Dienst `smejj-control` auf dem bestehenden Zeabur-Server zu
betreiben.

Sie deckt **nicht** die Aenderung von `public/config.js` und
`public/index.html`. Beide stehen im Start-Lock
(`docs/frontend/start-lock-manifest.json`, 31 eingefrorene Dateien) und
brauchen einen eigenen, ausdruecklichen Satz des Betreibers. Vorschlag:

> FREIGABE — Start-Lock fuer den Umzug: Ich gebe Aenderungen an
> public/config.js und public/index.html frei, ausschliesslich um die
> API-Adresse auf den Zeabur-Control-Server umzustellen.

Das ist keine Formalie: `config.js` und die CSP in `index.html` entscheiden,
ob die Seite ueberhaupt noch mit einem Server sprechen darf. Ein Fehler dort
legt die App fuer alle lahm.

## Was die Freigabe kosten wuerde

Der Control-Server laeuft auf dem **bereits bezahlten** Zeabur-Server
(Projekt "untitled", `project-6a6666899949111176cddefb`, Tencent Ashburn,
2 vCPU / 8 GB, 6 USD pro Monat). Dort laufen heute schon fuenf Dienste
(`smejj-maus-engine`, `smejj-chat-bridge`, `smejj-voice-piper`,
`smejj-remote-browser`, `smejj-training-loop`).

- **Zusaetzliche laufende Kosten durch den Umzug: 0,00 USD pro Monat.**
- Der Umzug **spart** die Salad-Kosten der Container-Gruppe `smejj-control`,
  die heute dauerhaft laeuft (pay-per-use, also nicht null).
- Neuer Anbieter: keiner. Zeabur ist bereits im Betrieb.

Trotzdem ist eine Freigabe noetig: `docs/architecture/FREE_ONLY_MASTER_POLICY.md`
erlaubt Zeabur ausdruecklich nur als enge, namentlich benannte Ausnahme fuer
genau einen Server und verlangt fuer **jede Erweiterung erneut eine
schriftliche Freigabe mit Dienst und Betrag**. Das ist hier ein sechster Dienst.

### Freigabetext, den es dafuer braucht

> FREIGABE — Control-Server auf Zeabur: Ich gebe den Betrieb des Dienstes
> `smejj-control` auf dem bestehenden Zeabur-Server (Projekt "untitled",
> 6 USD pro Monat, keine zusaetzlichen Kosten) frei.

**Erteilt am 2026-07-29** durch Wof Kadavanich; festgehalten in
`docs/architecture/FREE_ONLY_MASTER_POLICY.md`, Ausnahme 2.

## Was sich beim Umzug zwingend mitaendert

Der Control-Server ist die API-Adresse der App. Wird sie getauscht, muessen
drei Stellen gleichzeitig mitwandern — sonst ist die App entweder blind oder
die Anmeldung bricht:

1. **`public/config.js`** — `DEFAULT_API_ORIGIN`, heute
   `https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud`.
2. **`public/index.html`** — die `connect-src`-Liste der Meta-CSP. Der Browser
   verbietet sonst jede Anfrage an die neue Adresse.
   `tests/csp-hosts.test.mjs` erzwingt, dass beide zusammenpassen.
3. **GitHub-OAuth-Callback** (App-ID 3737209) — die Rueckkehradresse nach der
   Anmeldung. Wird sie vergessen, kommt niemand mehr ueber GitHub herein.

Reihenfolge, die Ausfall vermeidet: erst den Zeabur-Dienst hochfahren und
messen, dann Callback ergaenzen (nicht ersetzen — beide Adressen duerfen
gleichzeitig eingetragen sein), dann Frontend umstellen, dann Salad abschalten.
Der Rollback ist bis zum letzten Schritt ein Frontend-Deploy zurueck.

## Ablauf in der Reihenfolge, die keinen Ausfall erzeugt

1. **Dienst anlegen** — ERLEDIGT am 2026-07-29 (Zeabur-Portal, GitHub-App,
   Repo `SmejjCom/smejj.com-app`, Branch
   `feature/auth-redesign-github-magiclink`). Zeabur waehlt
   `Dockerfile.smejj-control` anhand des Dienstnamens.
   **Gemessen und wichtig:** Der Control-Server startet auch **ohne** gesetzte
   Env-Werte sauber durch — `/api/health` antwortet mit HTTP 200, die
   einzelnen Funktionen bleiben fail-closed aus. Es gibt also **keinen
   Absturz-Kreislauf**, der den geteilten 2-vCPU-Server belasten wuerde.
   Der Dienst darf daher gefahrlos vor den Env-Werten existieren.
2. **Env-Werte eintragen** — OFFEN, nur Betreiber (Zugangsdaten). Mindestens:
   `SMEJJ_SESSION_SECRET`, `IDRIVE_E2_*`, `SMEJJ_MAUS_ENGINE_*`,
   `SMEJJ_GITHUB_LOGIN_*`. Am einfachsten aus der Salad-Gruppe
   `smejj-control` uebernehmen — dieselben Werte, damit sich beim Umzug
   nichts anderes aendert als die Adresse.
3. **Messen, bevor irgendetwas umgestellt wird.** Dienst-Tab "Command":
   `node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>r.text()).then(console.log)"`.
   Erst wenn `ok:true` kommt, geht es weiter.
4. **GitHub-OAuth-Callback ergaenzen** (App-ID 3737209) — **ergaenzen, nicht
   ersetzen.** Beide Adressen duerfen gleichzeitig eingetragen sein. Damit
   funktioniert die Anmeldung waehrend der Umstellung auf beiden Wegen.
5. **Frontend umstellen.** Start-Lock-Freigabe liegt seit 2026-07-29 vor.
   In zwei Haelften geteilt, damit nicht alles auf einmal kippen kann:
   - **CSP `connect-src`: ERLEDIGT und live** (sw v191). Rein additiv — ein
     Eintrag erlaubt eine Verbindung, er stellt keine her. Live gemessen:
     `fetch('https://smejj-control.zeabur.app/api/health')` aus der laufenden
     Seite heraus -> HTTP 200, `ok:true`. Gleichzeitig unveraendert 13 Anfragen
     an Salad, alle 200, Anmeldung intakt.
   - **`config.js` `DEFAULT_API_ORIGIN`: OFFEN.** Erst drehen, wenn Schritt 2
     erledigt und Schritt 3 gruen ist — sonst ist die App sofort tot.
   **Vorher risikolos testen:** in der Browser-Konsole auf smejj.com
   `localStorage.setItem("smejj.apiOrigin.v1","https://smejj-control.zeabur.app")`
   setzen, Seite neu laden, anmelden und klicken. Das betrifft nur den eigenen
   Browser. Zuruecknehmen mit `localStorage.removeItem("smejj.apiOrigin.v1")`.
   Erst wenn das sauber laeuft, lohnt sich die Umstellung fuer alle.
   Bis dahin ist der Rollback ein Frontend-Deploy zurueck.
6. **Salad abschalten** — erst nach mehreren Tagen stabilem Betrieb, und als
   eigener Schritt mit eigener Freigabe (Rueckbau einer laufenden Funktion).

## Vier gemessene Fallen bei neuen Zeabur-Diensten

Alle vier stammen aus echten Fehlschlaegen (Memory 2026-07-28,
`job_smejj_training_loop_20260728`), nicht aus der Dokumentation:

1. **Ohne festen Startbefehl startet Zeabur den falschen Prozess.** Die
   Auto-Erkennung fuehrt `pnpm start` aus. Das Dockerfile nagelt `CMD` fest.
2. **zbpack `install_command` ueberschreiben zerstoert den Kopiervorgang**
   ("Cannot find module ..."). Nicht anfassen.
3. **`pnpm build:i18n` bricht im Zeabur-Bau ab** (MODULE_NOT_FOUND).
   Fuer Worker ueberspringen.
4. **`.dockerignore` ist die haeufigste Wurzel.** `workers/*` und `schemas/*`
   schliessen per Erlaubnisliste aus; wer etwas Neues braucht, traegt es dort
   ein. `scripts` muss `scripts/*` heissen, sonst greifen Ausnahmen darunter
   ueberhaupt nicht.

Betriebs-Falle: `git push` loest einen Webhook-Bau aus — danach **nicht**
zusaetzlich "Redeploy" klicken, sonst brechen beide Baeue ab.

Pruefen ohne eigene Domain: Dienst-Tab "Command", dann
`node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>r.text()).then(console.log)"`.

## Warum das Dockerfile mehr kopiert als das alte

`deploy/control-server/Dockerfile` (Salad) kopiert `workers` und `schemas`
**nicht**. Mit dem heutigen Code bootet der Server daraus gar nicht mehr:
`src/server.js` laedt ueber `control-server/src/routes/mausEngineRoutes.js`
statisch `workers/maus-engine/*`. Das ist dieselbe Klasse wie der rc1-Absturz
vom 2026-07-17 (zwei getrennt gepflegte Include-Listen driften auseinander).
`Dockerfile.smejj-control` kopiert daher genau den Satz aus
`scripts/deploy/release-include-paths.mjs` — der einen Quelle der Wahrheit.
