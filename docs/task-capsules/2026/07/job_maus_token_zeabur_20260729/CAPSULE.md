# Task Capsule — job_maus_token_zeabur_20260729

Datum: 2026-07-29
Auftrag: "Maus-Engine zum Laufen bringen + Umzug von Salad nach Zeabur"
(Wof Kadavanich)
Status: **teilweise abgeschlossen.** Alles, was ohne Zugangsdaten-Schreibzugriff
und ohne Kostenfreigabe machbar war, ist umgesetzt, geprueft und gepusht.
Zwei Punkte bleiben Betreiber-Handarbeit; beide sind exakt vermessen.

Rollback-Punkt vor Arbeitsbeginn: `30d2fee`.
Commits dieser Runde: `6c322d2` (Fehlergrund), `a77febc` (Zeabur + Eimer).

---

## 1. Die Maus laeuft — bewiesen, nicht vermutet

Statt weiter ueber die App zu raten, wurde die Engine **direkt** beauftragt,
mit dem Token aus der lokalen Ablage:

```
POST https://smejj-maus-engine.zeabur.app/run   -> HTTP 200 in 3,77 s
ok: true | aborted: false | failedStep: null | actionLog: 4 Schritte
s1 openBrowser ok=true · s2 navigate ok=true · s3 screenshot ok=true · s4 closeBrowser ok=true
uploaded: true | 2 Artefakte
```

Beide Artefakte wurden danach **zurueckgelesen** (nicht nur gemeldet):
`aktionsprotokoll.json.gz` entpackt zu 4 Schritten, `startseite.png.gz`
liegt mit 39.374 Byte vor.

**Die Maus-Engine ist also intakt.** Was fehlt, ist ausschliesslich die
Verbindung vom Control-Server zu ihr.

## 2. Blocker A: Token-Unterschied — bestaetigt und eingegrenzt

Die frueheren Runden vermuteten "irgendwo ein Leerzeichen". Gemessen:

| | Laenge | SHA-256 (8) | Leerzeichen |
| --- | --- | --- | --- |
| Salad `smejj-control` | 64 | `c4e4ab90` | keine |
| lokale Ablage | 64 | `4cbb7a1f` | keine |

Beide Werte sind sauber — sie sind schlicht **verschiedene Werte**.
Gegenprobe an der Engine: ohne Token HTTP 401, mit dem **lokalen** Token
HTTP 422 ("Plan ist kein Objekt", also Anmeldung bestanden).

**Damit ist die Richtung eindeutig:** Die Engine kennt den lokalen Wert.
Der Control-Server sendet einen anderen. Jeder Maus-Auftrag ueber die App
endet an der Engine mit HTTP 401 `nicht_autorisiert`.

Kein Geheimwert wurde dabei angesehen — nur Laenge und Hash-Praefix.

## 3. Blocker B: Es war nie ein Konto-Problem, sondern ein Eimer

Die alte Diagnose lautete: Engine und Control-Server haetten verschiedene
IDrive-e2-**Konten**. Das ist **falsch** — und die Begruendung war ein
Fehlschluss: unterschiedliche Schluessel-Fingerabdruecke beweisen kein
anderes Konto, denn ein Konto darf mehrere Zugangsschluessel haben.

Der Lauf aus Abschnitt 1 hat es entschieden. Seine Artefakte liegen unter:

```
Eimer smejj-app          -> HTTP 403
Eimer smejj-model-files  -> HTTP 200, 39.374 Byte
```

Die Engine schreibt nach **`smejj-model-files`**. Der Control-Server liest
Capsules aus **`smejj-app`** (`IDRIVE_E2_CAPSULES_BUCKET=smejj-app`, per
Salad-API gelesen, kein Geheimnis).

**Das erklaert den gesamten bisherigen Befund lueckenlos:** Der Betreiber sah
unter `smejj-app/capsules/maus-engine/` 14 Ordner vom 14./15. Juli — aus der
Zeit, als die Engine noch auf Salad mit der `smejj-app`-Konfiguration lief —
und danach nie wieder einen neuen. Die Zeabur-Engine legt seither in einem
anderen Eimer ab.

Zu tun ist also **ein Eimer-Name**, kein Zugangsdaten-Abgleich. Zwei Wege:

- **A (empfohlen):** Beim Control-Server `IDRIVE_E2_CAPSULES_BUCKET` auf
  `smejj-model-files` setzen. Vorteil: der Schluessel der Engine muss keine
  neuen Rechte bekommen, und die 14 Altlaeufe bleiben unangetastet liegen.
- **B:** Beim Zeabur-Dienst `IDRIVE_E2_BUCKET` auf `smejj-app` setzen. Nur
  richtig, wenn der Schluessel der Engine dort auch schreiben darf — ungeprueft.

Beides sind **keine Geheimnisse**, sondern Eimer-Namen.

## 4. Umgesetzt: der Fehler luegt nicht mehr

`buildRunPlan()` prueft den HTTP-Status jetzt. Bisher kam die 401 der Engine
als Fehler-Body durch, wurde zu `{ok:false}` ohne `failedStep`, ohne
`aborted`, mit leerem `actionLog` — und der Roundtrip meldete am Ende
`planner_budget_erschoepft`. Diese Meldung schickt die Fehlersuche ans falsche
Ende; genau das hat mehrere Runden gekostet.

- `workerStatusFehler()` belegt einen Fehler **positiv**. Erster Anlauf pruefte
  `response.ok !== true` — das machte einen erfolgreichen Lauf zum Fehler,
  sobald eine Antwort nur `status` traegt (ein bestehender Test fiel sofort
  darauf). `waitForWorkerReady()` ist oben aus demselben Grund tolerant.
- Infrastruktur-Abbrueche tragen `infra: true` — **markiert, nicht geraten.**
  Zweiter Anlauf schloss aus "abgebrochen ohne gelaufenen Schritt" auf
  Infrastruktur und stufte damit auch einen korrekt abgelehnten Plan als
  Infrastrukturfehler ein. Eine Regel, die zwei Dinge verwechselt, erzeugt
  Fehlalarm genau bei den Faellen, die richtig laufen.
- 401/403 nennen im Klartext den Token-Unterschied.

`planner-roundtrip.mjs` meldet bei markierten Infrastruktur-Abbruechen den
echten Grund statt `planner_budget_erschoepft`; ein abgelehnter Plan bleibt
ein Planungsfehler.

**Belege:** 12 neue Tests in `tests/maus-fehler-durchreichen.test.mjs`,
`check:maus-engine` 125 gruen, `check:control-server` 190 gruen,
`check:guidelines` gruen (1098 Dateien).

### Nicht live — der letzte Schritt ist blockiert

Das Release-Artefakt ist gebaut, geprueft und hochgeladen:

```
deployments/control/smejj-control-maus-fehlergrund-2026-07-29.tar.gz
sha256 ba3a171c4f3a53ec9a2b5a680ded1ad710ca1be5dde9d5a431731d2b8f943c9d
829 Dateien, 1.812.280 Byte, immutable (overwriteProof 412)
```

Gebaut **aus einem sauberen Checkout von `6c322d2`**, nicht aus dem
Arbeitsbaum — dort arbeiteten gleichzeitig zwei fremde Sitzungen
(Web-Suche, Maus-Screencast). Ein Bau aus der Arbeitskopie haette deren
halbfertigen Code mit ausgeliefert.

Vorher entpackt und **wirklich gestartet**: `/api/health` -> HTTP 200.
`check:release-imports` gruen (168 Dateien transitiv).

Der Zeiger-Wechsel (`set_control_artifact_env.mjs`) wurde vom
Umgebungs-Classifier blockiert — wie in der Vorgaenger-Capsule beschrieben.

**Und das ist hier sogar gut so.** Waehrend dieser Runde hat eine parallele
Sitzung den Control-Server zweimal weiter ausgerollt (Version 113 -> 114 ->
115, zuletzt Modul V). Mein Artefakt steht auf `6c322d2` und kennt deren
spaetere Commits nicht. Ein Zeiger-Wechsel darauf waere jetzt ein
**Rueckschritt** und damit ein Non-Regression-Verstoss.

**Richtiger Weg:** Der Fix ist committet und gepusht. Er faehrt automatisch
mit dem naechsten Control-Release mit, das aus dem aktuellen Branch gebaut
wird. Das hochgeladene Artefakt bleibt als Rueckfall liegen (immutable, kostet
nichts) und sollte nur verwendet werden, wenn nichts Neueres ausgerollt ist.

## 5. Umzug nach Zeabur: vorbereitet, nicht ausgerollt

`Dockerfile.smejj-control` ist fertig. Dabei fiel auf, dass der bestehende
`deploy/control-server/Dockerfile` `workers/` und `schemas/` **nicht** kopiert
— mit dem heutigen Code bootet daraus gar nichts mehr (`src/server.js` laedt
ueber `mausEngineRoutes.js` statisch `workers/maus-engine/*`). Dieselbe Klasse
wie der rc1-Absturz vom 2026-07-17.

`.dockerignore` liess ausserdem `maus-step-decision.schema.json` aussen vor,
obwohl `interactive-loop.mjs` es zur Laufzeit per fs liest — ergaenzt.

Docker-Daemon war lokal aus. Statt das ungeprueft zu lassen, wurde der
Abbild-Inhalt **nachgebaut** (COPY-Regeln plus `.dockerignore`-Erlaubnislisten)
und gestartet: `/api/health` HTTP 200, und der Plan-Validator las sein Schema
zur Laufzeit erfolgreich — also kein ENOENT im Abbild.

**Nicht ausgerollt.** `FREE_ONLY_MASTER_POLICY.md` verlangt fuer jeden
weiteren Zeabur-Dienst eine schriftliche Freigabe mit Dienst und Betrag.
Der fertige Freigabetext und die drei Stellen, die beim Umzug zwingend
mitwandern (`public/config.js`, CSP `connect-src` in `public/index.html`,
GitHub-OAuth-Callback 3737209), stehen in
`docs/deployment/CONTROL_SERVER_ZEABUR_UMZUG.md`.
Zusaetzliche laufende Kosten: 0,00 USD — der Server ist bereits bezahlt.

## 6. Non-Regression

- Kein Start-Lock-Deploy, kein Frontend-Deploy, keine CSS-Datei angefasst.
- Kein `git add -A`: nur eigene Dateien committet. Die Arbeit der beiden
  parallelen Sitzungen blieb unberuehrt und ungebaut.
- Der Control-Server laeuft unveraendert weiter (Version 114, Artefakt
  `smejj-control-modul-v-2026-07-29.tar.gz`) — der Zeiger wurde nicht
  gewechselt.
- Kein Geheimwert wurde gelesen, getippt, kopiert oder eingefuegt.

## 7. Offen (Betreiber, beides ohne Programmierkenntnisse pruefbar)

1. **Token gleichmachen.** `SMEJJ_MAUS_ENGINE_TOKEN` bei Salad
   `smejj-control` und bei Zeabur `smejj-maus-engine` auf **denselben** Wert
   setzen. Einen der beiden Werte kopieren, ohne Leerzeichen, ohne Zeilenumbruch.
2. **Eimer gleichmachen.** Weg A: beim Control-Server
   `IDRIVE_E2_CAPSULES_BUCKET` auf `smejj-model-files` setzen.
3. **Nichts.** Der Fehlergrund-Fix faehrt mit dem naechsten Control-Release
   automatisch mit — kein eigener Schritt noetig.

Danach pruefen mit einem einzigen Befehl:

```bash
node scripts/diagnose/maus-abgleich.mjs
```

Er vergleicht Token und Eimer, fragt die Engine gegen und nennt den Befund im
Klartext — ohne je einen Geheimwert anzuzeigen (nur Laenge und Hash-Praefix).
