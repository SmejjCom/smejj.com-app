# Auftrag: Maus-Engine zum Laufen bringen + Umzug von Salad nach Zeabur

Du arbeitest an **smejj.com** (immer klein, nie "SMEJJ"). Projektordner ist die
lokale Arbeitskopie; Arbeits-Repo `SmejjCom/smejj.com-app`, Branch
`feature/auth-redesign-github-magiclink`.

Lies zuerst `AI_Guidelines.md`, `Memory_Bank.md`, `Project_Goals.md` und
`docs/task-capsules/2026/07/job_maus_sichtbarkeit_20260728/CAPSULE.md`.
Die Capsule enthält die komplette Vorgeschichte mit Messwerten.

---

## 1. Sofort-Blocker: die Maus wird abgewiesen

**Symptom:** Jeder Maus-Auftrag über die App endet mit
`planner_budget_erschoepft`. Das ist irreführend.

**Echte Ursache (gemessen, bestätigt):** Die Engine antwortet mit HTTP 401
`nicht_autorisiert`. Control-Server (Salad) und Maus-Engine (Zeabur) haben
**unterschiedliche Werte** für `SMEJJ_MAUS_ENGINE_TOKEN`.

**Fix (nur der Betreiber, Zugangsdaten):** Denselben Token auf beiden Seiten
eintragen, ohne Leerzeichen und ohne Zeilenumbruch:
- Salad → Container Group `smejj-control` → `SMEJJ_MAUS_ENGINE_TOKEN`
- Zeabur → Dienst `smejj-maus-engine` → `SMEJJ_MAUS_ENGINE_TOKEN`

**So machst du den echten Fehler sichtbar** (wichtigstes Diagnose-Werkzeug,
gilt für jeden Maus-Fehler):

```js
// Auf smejj.com in der Browser-Konsole, angemeldet:
fetch(`${API_ORIGIN}/api/maus/run`, {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    task: "Oeffne https://smejj.com/ und mache einen Screenshot.",
    capsuleRef: "job_diagnose", domainAllowlist: ["smejj.com"],
    mode: "interaktiv",   // <— entscheidend
    async: true
  })
})
// danach GET /api/maus/run?runId=... -> result.error
```

**Warum:** Der normale Plan-Pfad verschluckt die Fehlermeldung.
`buildRunPlan()` in `control-server/src/routes/mausEngineRoutes.js` prüft den
**HTTP-Status nicht** und reicht den Fehler-Body als `summary` weiter;
`planner-roundtrip.mjs` behält davon nur `failedStep`/`aborted`/`abortReason`.
Der Loop-Pfad (`mode:"interaktiv"`) gibt `result.error` dagegen durch.

**Merkmal eines verschluckten Fehlers:** `ok:false` **und** `failedStep:null`
**und** `aborted:false` **und leeres `actionLog`**. Diese Kombination kann der
Interpreter gar nicht erzeugen — sie bedeutet immer: die Engine hat nie
gearbeitet.

**Nebenaufgabe (Code, erlaubt):** `buildRunPlan()` soll den HTTP-Status prüfen
und `summary.error` durchreichen, damit das nie wieder Stunden kostet. Achtung:
Der Control-Server-Deploy endet in `scripts/deploy/set_control_artifact_env.mjs`
und damit in einem Env-Variablen-Schreibzugriff — den blockiert der
Umgebungs-Classifier. Deploy also mit dem Betreiber abstimmen.

---

## 2. Zweiter Blocker: Engine schreibt in ein fremdes Konto

Die Zeabur-Engine legt ihre Lauf-Artefakte in einem **anderen IDrive-e2-Konto**
ab als der Control-Server liest. Belegt per Sichtprüfung: Unter
`capsules/maus-engine/` im Konto des Betreibers liegen 14 Ordner, alle vom
14./15. Juli — kein einziger Lauf der Zeabur-Engine.

Der Control-Server ist korrekt konfiguriert: Bucket `smejj-app`,
Region `us-west-2`, Endpoint `https://s3.us-west-2.idrivee2.com`.

**Fix (nur der Betreiber):** `IDRIVE_E2_ACCESS_KEY` und `IDRIVE_E2_SECRET_KEY`
beim Zeabur-Dienst `smejj-maus-engine` auf dieselben Werte wie beim
Control-Server setzen.

**Prüfbar ohne Programmierkenntnisse:** Danach einen Lauf starten und in der
IDrive-Console unter `capsules/maus-engine/` nachsehen — erscheint ein neuer
Ordner, stimmt es.

---

## 3. Strategisches Ziel: weg von Salad, hin zu Zeabur

**Beschluss des Betreibers:** Salad soll schrittweise abgelöst werden, Zeabur
ist der Hauptserver.

**Bereits auf Zeabur** (Projekt "untitled", `project-6a6666899949111176cddefb`,
Server "Tencent Ashburn 2C 8GB", 6 USD/Monat):
`smejj-maus-engine`, `smejj-chat-bridge`, `smejj-voice-piper`,
`smejj-remote-browser`, `smejj-training-loop`.

**Noch auf Salad:** der **Control-Server** `smejj-control`
(`https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud`) — Auth, API-Gateway,
Modell-Router, Presign. Das ist das letzte große Stück.

**Vor dem Umzug zwingend beachten:**
`docs/architecture/FREE_ONLY_MASTER_POLICY.md` erlaubt Zeabur nur als **enge,
namentlich benannte Ausnahme für genau einen Server**. Wortlaut: *"jede
Erweiterung (größeres Paket, weitere Server/Dienste) braucht erneut eine
schriftliche Freigabe mit Dienst und Betrag."*
→ **Erst Freigabe mit Dienstname und Betrag einholen, dann deployen.**
Code bauen, lokal testen und Dockerfile vorbereiten ist ohne Freigabe erlaubt.

Beim Umzug ändern sich mindestens: `API_ORIGIN` in `public/config.js`, die
`connect-src`-Liste der Meta-CSP in `public/index.html` (Test
`tests/csp-hosts.test.mjs` erzwingt das) und der GitHub-OAuth-Callback
(App-ID 3737209).

---

## 4. Vier gemessene Fallen bei neuen Zeabur-Diensten

1. **Ohne Startbefehl startet Zeabur den falschen Prozess.** Die Auto-Erkennung
   führt `pnpm start` aus — das ist der Control Server, nicht der Worker.
   Startbefehl immer festnageln.
2. **zbpack: `install_command` überschreiben zerstört den Kopiervorgang**
   (`Cannot find module /src/workers/...`).
3. **`pnpm build:i18n` bricht im Zeabur-Bau ab** — für Worker überspringen.
4. **`.dockerignore` ist die häufigste Wurzel.** Sie schließt `scripts`
   komplett und `workers/*` per Erlaubnisliste aus. Neue Worker dort eintragen;
   `scripts` muss `scripts/*` heißen, sonst greifen Ausnahmen darunter nicht.

**Bau-Weg, der funktioniert:** `Dockerfile.<dienstname>` im Repo-Wurzelverzeichnis.
**Betriebs-Falle:** Ein `git push` löst einen Webhook-Bau aus — danach **nicht**
zusätzlich "Redeploy" klicken, sonst brechen beide ab.
**Prüfen ohne öffentliche Domain:** Dienst-Tab "Command" öffnet eine Shell im
Container; dort kurze Befehle wie
`node -e "fetch('http://127.0.0.1:8080/health').then(r=>r.text()).then(console.log)"`.

---

## 5. Was der Agent NICHT darf (harte Grenzen)

- **Keine Zugangsdaten lesen, eintippen, kopieren oder einfügen.** Der
  Umgebungs-Classifier blockiert **jeden** Schreibzugriff auf
  Env-Variablen-Formulare — auch wenn der Wert nur eine öffentliche URL ist.
  Getestet und blockiert: Salad-API-PATCH, Formularfeld per JavaScript, Tippen
  im Portal. **Nicht umgehen** — an den Betreiber übergeben.
- **Zeaburs "Exposed"-Schalter nicht anklicken:** Das Bearbeiten-Fenster zeigt
  den Wert im Klartext.
- **Konfiguration ohne Wertesicht prüfen:** Längen vergleichen, z. B.
  `echo "B=${#IDRIVE_E2_BUCKET} A=${#IDRIVE_E2_ACCESS_KEY}"`.
- **Nur lesend erlaubt und nützlich:** Die Salad-API mit `SALAD_API_KEY` aus
  `~/.config/smejj.com/env.local`, gefiltert auf einzelne, nicht geheime
  Schlüssel — so gelangen keine Secrets in den Kontext:
  `GET https://api.salad.com/api/public/organizations/$ORG/projects/$PROJ/containers/smejj-control`
- **Start-Lock:** 31 Startseiten-Dateien sind eingefroren
  (`docs/frontend/start-lock-manifest.json`). Änderung nur mit ausdrücklicher
  schriftlicher Freigabe, danach
  `node scripts/check-start-lock.mjs --freeze --confirm "<Wortlaut>"`.
- **800 Zeilen pro Datei** (`scripts/check-guidelines.mjs`). `browser-pane.js`
  steht bei 795 — dort nur per `export`-Schlüsselwort erweitern, nie neue
  Funktionen einfügen; neue Logik gehört in eine eigene Datei (SRP).
- Nie `git add -A` — es arbeiten parallele Sitzungen im selben Arbeitsbaum.

---

## 6. Drei Cache- und JavaScript-Fallen, die schon Stunden gekostet haben

1. **`?v=`-Query in `index.html`.** Unter der alten Query behält der Browser
   seine alte Modulkopie, egal was am Pfad neu ist. Wer `browser-pane.js`
   ändert, muss die Query in `index.html` **und** im Import von `maus-panel.js`
   gleichzeitig erhöhen — zwei verschiedene Spezifizierer sind zwei
   Modul-Instanzen mit getrenntem `state`.
2. **Service Worker:** Precache-Datei geändert → `CACHE_NAME` in `sw.js`
   erhöhen, sonst erreicht nichts die Bestandsnutzer. Live ist aktuell **v190**;
   die Live-`sw.js` läuft dem lokalen Repo voraus — **immer auf Live-Basis
   bauen**, nie lokal überschreiben.
3. **Modul-Startaufrufe gehören ans Dateiende.** Steht `init()` über den
   `const`-Deklarationen, liegen diese in der temporalen Totzone; der
   ReferenceError wurde von einem weiten `catch` lautlos verschluckt und alle
   Checks blieben grün. Nur die Live-Messung fand es.

---

## 7. Deploy-Wege

**Frontend (live = smejj.com):** Repo `SmejjCom/smejj-app-frontend`, Branch
`main`, Layout `assets/`. HTTPS-`git push` funktioniert (macOS-Keychain hat
Schreibrecht); der SSH-Deploy-Key **nicht**.

```bash
git clone --depth 1 https://github.com/SmejjCom/smejj-app-frontend.git fe
cp public/<datei>.js fe/assets/<datei>.js
# CACHE_NAME in fe/sw.js erhöhen, dann committen und pushen
```

Vor jedem Deploy den Live-Stand gegen die eigene Basis diffen und **nur die
eigenen Änderungen** übernehmen — parallele Sitzungen deployen mit.
Nach dem Deploy live per SHA-256 gegenprüfen.

**Pflicht-Checks:** `npm run check:guidelines`, `check:start-lock`,
`check:frontend`, bei Architektur-/Kostenänderungen `check:architecture`.
`pnpm` ist **nicht** installiert — neue Skripte dürfen es nicht aufrufen.

---

## 8. Bereits erledigt — nicht noch einmal machen

- Maus-Knopf auf der Startseite; `maus-replay.html` wird direkt im rechten
  Browser-Panel eingebettet (nicht über den HTML-umschreibenden Proxy).
- Die Wiedergabe **funktioniert vollständig mit Bildern** für Läufe im
  richtigen Konto. Verifizierter Demo-Lauf:
  `capsuleRef=maus-demo-sprachwelle-2026-07-15-r5`,
  `planId=httpbin-form-post-demo` → 10 Schritte, 2 Screenshots.
- Die Wiedergabe überlebt fehlende Artefakte: Das Aktionsprotokoll kommt dann
  aus dem Lauf-Status (`GET /api/maus/run?runId=`), Teil-Erfolg wird ehrlich
  gemeldet statt als voller Erfolg.
- `SMEJJ_MAUS_ENGINE_WORKER_URL` zeigt korrekt auf
  `https://smejj-maus-engine.zeabur.app` (vorher tote Salad-Adresse).

**Ausdrücklich gestrichen (nicht bauen):** Anhalten, Abbrechen,
Abschlussbericht, Wiederholen, Sicherheitsgrenzen rund um die Maus.

---

## 9. Fertig ist der Auftrag, wenn

1. Ein Maus-Auftrag über die App **durchläuft**: kein `nicht_autorisiert`,
   `ok:true`, gefülltes `actionLog`.
2. Unter `capsules/maus-engine/` erscheint ein **neuer Ordner** für diesen Lauf.
3. Die Wiedergabe im rechten Panel zeigt diesen neuen Lauf **mit Screenshots**.
4. Task Capsule geschrieben, `Memory_Bank.md` aktualisiert, Ergebnis mit Beleg
   berichtet (Live-URL, Messwerte, Screenshot).

Melde **echte Blocker sofort** — insbesondere alles, was Zugangsdaten oder eine
Kostenfreigabe braucht. Rate nicht, sondern miss live.
