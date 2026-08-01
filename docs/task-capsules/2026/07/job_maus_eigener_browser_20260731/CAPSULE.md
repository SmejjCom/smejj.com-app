# Task Capsule — job_maus_eigener_browser_20260731

Datum: 2026-07-31
Auftrag: `PROMPT_MAUS_EIGENER_BROWSER.md` — die Maus soll in einem eigenen
Browser frei arbeiten: eigener Browser, Schritt fuer Schritt sichtbar, die Seite
bleibt stehen statt neu zu starten, zusaetzlich Bedienung des echten Chrome.
Status: **Teil 1, 2, 3 und 4 gebaut und gemessen. Teil 0 weiterhin Rote Liste
(Betreiber). Teil 5 bewusst nicht gebaut** (siehe unten).

## Kurzfassung

| Teil | Ergebnis |
| --- | --- |
| 0 — Token + Eimer | **BLOCKIERT**, live nachgemessen: `maus-abgleich.mjs` Exit 2 |
| 1 — Sitzung am Leben halten | **fertig**, mit echtem Browser bewiesen |
| 2 — Live zuschauen | **fertig**, Frontend-Teil lokal verifiziert |
| 3 — Chrome-Adapter | **fertig** bis auf den Transportweg (braucht Deploy) |
| 4 — Angemeldet bleiben | **fertig** (Cookie-Krug an die Sitzung gekoppelt) |
| 5 — Signierte Upload-Adressen | **nicht gebaut** — der Auftrag selbst sagt: erst wenn der Ausrollweg offen ist |

## Teil 0 — nachgemessen, nicht angenommen (2026-07-31)

```
node scripts/diagnose/maus-abgleich.mjs   ->  Exit-Code 2
```

| Messpunkt | Ergebnis |
| --- | --- |
| Control-Server | Version 125, Zustand running |
| `IDRIVE_E2_CAPSULES_BUCKET` (Control) | `smejj-app` — unveraendert |
| Artefakte der Engine liegen in | `smejj-model-files` (7 Objekte gefunden) |
| `smejj-app` mit lokalen Zugangsdaten | HTTP 403 — anderes Konto |
| Engine gegen lokalen Token | HTTP **422 (akzeptiert)** |
| Engine gegen Token des Control-Servers | HTTP **401 (ABGELEHNT)** |

Beide Abweichungen vom 2026-07-29 bestehen unveraendert. Der Agent darf die
Werte nicht setzen (Env-Schreibzugriff gesperrt, dreimal geprueft); es wurde
kein weiterer Versuch unternommen. **Solange das offen ist, sind die
Abnahmepunkte 1-3 ueber die App nicht erreichbar** — nicht weil etwas fehlt,
sondern weil die Engine den Control-Server an der Tuer abweist.

## Teil 1 — Sitzung am Leben halten

**Erst gelesen, dann entschieden.** `workers/remote-browser/session-engine.js`
existiert bereits, gehoert aber zum Live-Browser-Dienst: eigene Aktionssprache
(click/type/scroll mit Prozentkoordinaten), eigener Worker, eigenes Dockerfile,
Zustand rein im Serverspeicher. Die Maus arbeitet nach dem Plan-Schema durch den
Interpreter mit Allowlist, Budget und Vault. Ein Zusammenlegen haette eine der
beiden Aktionssprachen gebrochen. Uebernommen wurde deshalb sein **Muster**
(Idle-Timeout + Hartlimit + Obergrenze), nicht sein Code — plus der Lease auf
e2, den er nicht hat. Die Begruendung steht im Dateikopf von
`session-registry.mjs`, damit sie nicht noch einmal neu erarbeitet wird.

Neu:
- `workers/maus-engine/session-lease.mjs` (142 Z.) — Lease auf IDrive e2:
  wer haelt die Sitzung, bis wann. `leaseVerdict()` ist eine reine Funktion.
- `workers/maus-engine/session-registry.mjs` (254 Z.) — lebende Sitzungen im
  Prozess, Abbau nach Leerlauf (10 min) bzw. Hartlimit (60 min).
- `scripts/diagnose/maus-sitzung-beweis.mjs` (131 Z.) — misst die Abnahmefrage
  mit einem ECHTEN Browser, ohne Control-Server und ohne Modellkosten.

Geaendert, rein additiv:
- `interpreter.mjs` — `sessionState` + `keepAlive`; der Browser wird am Ende
  nur noch geschlossen, wenn KEINE Sitzung laeuft. `executedActions` wird je
  Auftrag zurueckgesetzt (sonst waere der zweite Auftrag einer langen Sitzung
  schon beim Start verbraucht).
- `actions/nav-actions.mjs` — `openBrowser` benutzt einen offenen Browser
  weiter, statt `browser_bereits_offen` zu werfen. Ohne Sitzung unveraendert.
- `worker.mjs` — `sessionId` auf `POST /run`, neuer `POST /session`
  (status/list/close), und exit-after-run unterbleibt, solange eine Sitzung lebt.

### Der Beweis (echter Browser, 2026-07-31)

```
SMEJJ_PLAYWRIGHT_PFAD=... node scripts/diagnose/maus-sitzung-beweis.mjs
```

| Messpunkt | Ergebnis |
| --- | --- |
| Auftrag 1 (oeffnen + navigieren) | ok, 3 von 3 Schritten, **3,3 s** |
| Sitzung nach Auftrag 1 | offen, aktive Seite `https://smejj.com/auth/login/` |
| Auftrag 2 (BEWUSST ohne navigate) | ok, 3 von 3 Schritten, **0,0 s** |
| aktive Seite bei Auftrag 2 | `https://smejj.com/auth/login/` — **unveraendert** |
| Browserstarts fuer zwei Auftraege | **1** (vorher 2) |
| `wiederverwendet` im Protokoll | true |

Der zweite Auftrag findet die Seite des ersten vor. Das ist Abnahmepunkt 4 —
auf Engine-Ebene gemessen, nicht behauptet.

## Teil 2 — Live zuschauen

Die Luecke war praeziser als gedacht: `live-publisher.mjs` schreibt pro Schritt
mit, `maus-replay.js` kann live — aber der Live-Pfad in der Capsule braucht
`capsuleRef` UND `planId`, und **der Control-Server kannte die planId erst am
Ende des Laufs**. Genau dazwischen lag "der Lauf laeuft, aber niemand kann
zuschauen".

- `planner-roundtrip.mjs` — neuer, fail-safe gekapselter `onPlan`-Rueckruf,
  ausgeloest sobald ein Plan gueltig ist, VOR der Ausfuehrung.
- `mausEngineRoutes.js` — veroeffentlicht die `planId` daraufhin sofort im
  Spiegel und auf e2; `GET /api/maus/run?runId=` gibt sie waehrend `laeuft` mit.
- `public/maus-replay.js` — `warteAufLaufKennung()` holt die fehlenden Werte
  selbst; `?runId=...&live=1` reicht jetzt allein. 401 bricht sofort ab, statt
  zwei Minuten gegen eine Anmeldeschranke zu pollen.
- `public/maus-panel.js` — hoert auf `smejj:maus-lauf-gestartet` und oeffnet die
  Wiedergabe live.
- `public/maus-auftrag.js` (NEU, 88 Z.) — schliesst die eigentliche Luecke: im
  Frontend gab es bisher gar keinen Weg, einen Lauf zu STARTEN, nur einen, ihn
  hinterher anzusehen.

**Startseiten-Budget beachtet:** `maus-auftrag.js` wird bewusst *dynamisch*
importiert (`starteAuftrag()` in `maus-panel.js`), nicht als Abhaengigkeit oben.
Die gelockte Startseite wird dadurch um kein einziges Byte schwerer fuer
Besuche, die gar keinen Auftrag ausloesen.

Lokal verifiziert: `/maus-replay.html?runId=maus-test-1234&live=1` betritt jetzt
den Live-Pfad und meldet ehrlich "Bitte zuerst auf smejj.com anmelden" (401).
Vorher passierte bei dieser Adresse nichts.

## Teil 3 — Chrome-Adapter

Der tragende Entwurfsschritt: der Adapter setzt an **derselben Naht** an wie
Playwright, naemlich an der `browserFactory`. Interpreter, Domain-Allowlist,
Schritt- und Zeitbudget, Datei-Grenzen und Secret-Vault bleiben unveraendert und
gelten damit **bauartbedingt** fuer beide Adapter — es gibt keinen Weg daran
vorbei, weil es keinen zweiten Interpreter gibt.

- `workers/maus-engine/adapters/chrome-befehl.mjs` (128 Z.) — Befehlssprache,
  rein und testbar.
- `workers/maus-engine/adapters/chrome-adapter.mjs` (190 Z.) — browserFactory
  gegen die Erweiterung.
- `extensions/smejj-maus-bruecke/` — MV3-Erweiterung mit sichtbarer Freigabe je
  Herkunft, Ablauf nach 30 Minuten, Chromes eigenem Berechtigungsdialog.

**Nie `--remote-debugging-port`.** Begruendung im Dateikopf und im README der
Erweiterung: dieser Port kennt keine Herkunftspruefung und gibt in einem Zug
alle angemeldeten Konten frei.

Zusaetzliche Einengungen gegenueber dem eigenen Browser: nur die fuenf Aktionen
navigate/click/type/assert/screenshot, nur https, keine Secrets, keine Cookies,
kein `storageState`, keine Dateien, kein `evaluate`, kein xpath, keine
Passwortfelder. Alles davon scheitert **ehrlich** statt halb zu laufen.

**Offen: der Transportweg.** Zwischen Engine im Serverraum und dem Chrome des
Betreibers fehlt ein Endpunkt am Control-Server — dessen Deploy endet im
gesperrten Env-Schreibzugriff. Der Adapter nimmt den Transport deshalb als
injizierte Abhaengigkeit; sobald der Weg offen ist, wird nur dieser eine
Baustein eingesetzt, ohne dass sich am Tor etwas aendert.

## Teil 4 — Angemeldet bleiben

Der Cookie-Krug (`storageState`) haengt jetzt an der SITZUNG statt nur an
einzelnen Plan-Schritten: beim Sitzungsende wird er auf e2 gesichert, beim
naechsten Start wieder in den frischen Kontext gelegt
(`registry.browserFactoryFuer(sessionId)`). Eine einmal im Beisein des
Betreibers gemachte Anmeldung ueberlebt damit das Sitzungsende — ohne dass je
ein Passwort in Plan, Prompt oder Log auftaucht.

Ehrlich bleibt: ChatGPT/Codex, Claude und Gemini wehren Automatisierung ab. Wo
es eine API gibt, gehoert sie ueber den zentralen Modell-Router.

## Teil 5 — bewusst nicht gebaut

Der Auftrag sagt es selbst: "Braucht Deploy beider Dienste — erst bauen, wenn
der Ausrollweg offen ist." Beide Dienste sind fuer den Agenten gesperrt. Code,
der nie laeuft, waere hier kein Fortschritt, sondern Ballast.

## Verifikation

| Check | Ergebnis |
| --- | --- |
| `check:maus-engine` | **189 Tests, 189 pass** (vorher 139) |
| davon neu | 22 Sitzung, 13 Chrome-Adapter, 12 Live-Anhaengen |
| `check:guidelines` / `json` / `paths` / `security` | OK |
| `check:architecture` / `cost` / `abuse` / `gatekeeper` | OK |
| `check:start-lock` / `favicon-lock` / `branding` | OK |
| `check:frontend` / `control-server` | OK |
| `check:precache-imports` / `module-queries` / `start-styles` | OK |
| Sitzungs-Beweis mit echtem Browser | BESTANDEN |
| Groesste neue Datei | 254 Zeilen (Grenze 800) |

### Web-Vitals

`docs/benchmarks/webvitals-maus-sitzung-2026-07-31.json`. LCP p75 84 ms (kalt) /
92 ms (warm), CLS 0, INP p75 56/40 ms, TTFB p75 1/4 ms — alle weit im Budget,
LCP-Element unveraendert H2.

Statt zwei verschieden gehostete Zahlen zu vergleichen, ist die einzige
moegliche Ursache eines Mehrgewichts exakt beziffert: die Startseite laedt genau
EINE geaenderte Datei (`maus-panel.js`), **+711 Byte gzip** = 0,24 % des
Live-Kaltgewichts (284 KB). `maus-replay.js` liegt nicht auf der Startseite,
`maus-auftrag.js` wird dynamisch geladen. **Keine Verschlechterung.**

## Rollback

`backups/rollback-2026-07-31-maus-sitzung/` — die sieben geaenderten Dateien im
Stand vor der Aenderung, HEAD `e603802`. Rueckweg: die neuen Dateien entfernen
(`session-lease.mjs`, `session-registry.mjs`, `adapters/`, `maus-auftrag.js`,
`maus-sitzung-beweis.mjs`, `extensions/smejj-maus-bruecke/`, die vier neuen
Testdateien) und die gesicherten zuruecklegen. Es gibt keinen Deploy, der
zurueckgenommen werden muesste.

## Was als Naechstes ausgerollt werden muss

1. **Betreiber, Rote Liste:** die zwei Env-Werte auf Salad (Teil 0).
2. **Maus-Engine:** laeuft aus `ghcr.io/smejjcom/smejj-maus-engine:v1`; ein
   `git push` baut sie NICHT neu. Teil 1 und 4 wirken erst nach einem neuen
   Abbild — die Umstellung auf Git-Bau hat der Betreiber zurueckgestellt.
3. **Control-Server:** Teil 2 (planId frueh veroeffentlichen) braucht einen
   Release; der endet im gesperrten Env-Schreibzugriff.
4. **Frontend:** ausrollbar (gruene Liste), aber bewusst noch nicht ausgerollt —
   ohne Teil 0 laesst sich die Kette live nicht nachweisen. Beim Deploy
   beachten: `CACHE_NAME` in `sw.js` auf LIVE-Basis bumpen und die Query
   `maus-panel.js?v=3` in `index.html` erhoehen, sonst liefert der Cache das
   alte Modul.

## Gemessene Fallen dieser Sitzung

1. **ESM ignoriert `NODE_PATH`.** Der erste Beweislauf meldete "Playwright ist
   nicht installiert", obwohl es installiert war. Deshalb nimmt
   `maus-sitzung-beweis.mjs` jetzt `SMEJJ_PLAYWRIGHT_PFAD` als ausdruecklichen
   Pfad — und meldet den echten Ladefehler mit, statt nur "fehlt".
2. **Ein zu freundliches Testdouble misst sich selbst.** Der Mock des
   Chrome-Adapters meldete auf jede Abfrage einen Treffer; dadurch "fand" die
   Cookie-Banner-Heuristik einen Banner, den es nicht gab, und der Test schlug
   fehl — am Mock, nicht am Adapter. Testdoubles muessen "nicht da" koennen.
3. **Das Tor greift frueher als vermutet.** Ein Ziel ausserhalb der Allowlist
   scheitert schon im Plan-Validator, nicht erst im Lauf. Gut so — aber wer
   `run()` erwartet, schreibt den Test falsch herum.
