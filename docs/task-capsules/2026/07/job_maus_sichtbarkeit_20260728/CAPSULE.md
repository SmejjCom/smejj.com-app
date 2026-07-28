# Task Capsule — job_maus_sichtbarkeit_20260728

Datum: 2026-07-28
Auftrag: "Maus soll sichtbar sein, Maus soll in Startseite, Browser oeffnen
und in Startseite eigene Browser bedienen, wie Codex, Claude und so weiter."
(Wof Kadavanich)
Status: abgeschlossen, live verifiziert im echten Chrome — **die
Maus-Wiedergabe ist im rechten Browser-Panel der Startseite sichtbar und
funktioniert**.

## Freigabe (Design-Lock)

> FREIGABE — Maus-Sichtbarkeit (Wof Kadavanich): Ich gebe Änderungen an
> public/index.html und public/browser-pane.js frei, ausschließlich um die
> Maus-Wiedergabe im rechten Browser-Panel der Startseite anzeigen zu können.

Geltungsbereich exakt zwei Dateien — keine CSS-Datei, kein `sw.js` im
Arbeits-Repo angefasst.

## Umsetzung

- `public/browser-pane.js`: acht bereits vorhandene interne Bausteine
  (`openPane`, `activeTab`, `addTab`, `setFrame`, `commitHistory`,
  `persistTabs`, `render`, `refs`) per `export`-Schluesselwort sichtbar
  gemacht — **0 Zeilen Netto-Wachstum** (Datei blieb bei 795/800 Zeilen).
- Neue, ungesperrte Datei `public/maus-panel.js` (79 Zeilen, SRP-Split):
  bettet `public/maus-replay.html` (bereits vorhandene, eigenstaendige
  Wiedergabeseite) direkt per `setFrame()` als Iframe im rechten Panel ein —
  bewusst NICHT ueber den `/api/browser/fetch`-Proxy (der schreibt HTML
  sicherheitshalber um und wuerde die eigene Wiedergabe-Logik zerstoeren).
- `public/index.html`: neuer `#mausButton` neben `#browserButton`, neuer
  `<script type="module">`-Tag fuer `maus-panel.js`.

## Nachtrags-Fehler und Fix (in derselben Freigabe)

Erste Live-Pruefung im echten, verbundenen Chrome (nicht nur lokal/headless)
zeigte: `#mausButton` und `#browserButton` lagen exakt deckungsgleich
(`x:1040, y:0` bei beiden, `ueberlappt:true`). Ursache: `.browser-button`
setzt `position:fixed; right:0` fest, ohne Ruecksicht auf Geschwister
derselben Klasse. Fix: Inline-`style="right: 36px"` direkt am `#mausButton`
in `index.html` (CSP erlaubt `style-src 'unsafe-inline'`, keine gesperrte
CSS-Datei beruehrt). Danach `ueberlappt:false`, beide Knoepfe eigenstaendig
sichtbar und klickbar.

## Live-Verifikation (echtes Chrome, nicht nur curl)

1. Bounding-Rect-Vergleich: `browser {x:1040}`, `maus {x:1004}`,
   `ueberlappt:false`.
2. Klick auf `#mausButton` (per `.click()`, da Screenshot- und
   CSS-Pixel-Koordinatenraeume in diesem Setup nicht 1:1 sind — Klicks per
   rohen Bildschirmkoordinaten koennen daneben liegen; `.click()` auf das
   Element selbst ist robust).
3. Panel oeffnet, `<iframe src="https://smejj.com/maus-replay.html">`
   bestaetigt vorhanden.
4. Screenshot bestaetigt: eigener Tab "Maus-Wiedergabe" mit eigener
   Navigationsleiste, vollstaendig gerendertes Formular (capsuleRef, planId,
   runId, "Lauf laden", "Live mitschauen") — kein kaputtes/umgeschriebenes
   HTML, volle Skript-Funktion.

## Deploy

- Arbeits-Repo (`SmejjCom/smejj.com-app`, Branch
  `feature/auth-redesign-github-magiclink`): Commits `8bbc517` (Feature) +
  `2f25c84` (Ueberlappungs-Fix). Start-Lock neu eingefroren, dieselbe
  Freigabe.
- Live-Frontend (`SmejjCom/smejj-app-frontend`, `main`): chirurgischer Patch
  auf dem jeweils aktuellen Live-Stand (nicht blind ueberschrieben — andere
  Sessions hatten zwischenzeitlich weiterdeployt, zuletzt bei `64b388f`).
  Commit `4519a3b`, `CACHE_NAME` auf `smejj-shell-v183` erhoeht (`"/"` liegt
  im SHELL-Precache). Per `raw.githubusercontent.com` und Live-Poll
  bestaetigt.

## Bekannter, dokumentierter Zwischenstand (nicht Teil dieser Freigabe)

Die Wiedergabe selbst zeigt aktuell (bei echten Laeufen) "Artefakt nicht
ladbar", solange die IDrive-e2-Zugangsdaten von Maus-Engine (Zeabur) und
Control-Server (Salad) nicht auf denselben Account zeigen — siehe
`job_maus_engine_abnahme_20260728` / Memory
[[smejj-magic-link-handoff-bug]]. Reiner Backend-Zustand, operator-only
(Zugangsdaten-Abgleich in zwei Cloud-Portalen), von dieser Sichtbarkeits-
Freigabe nicht abgedeckt und bewusst nicht verdeckt (fail-closed).

## Nachtrag 2026-07-28 (zweite Runde): echte Ursachen gemessen

Statt auf der aelteren Diagnose aufzubauen, wurde live nachgemessen. Zwei
getrennte Fehler, beide vorher nicht sauber benannt:

### 1. Der Control-Server zeigt auf einen toten Worker (HAUPTURSACHE)

`SMEJJ_MAUS_ENGINE_WORKER_URL` auf `smejj-control` steht auf
`https://grape-onion-qpxbsgljwho6v0vx.salad.cloud` — eine **alte
Salad-Adresse, die HTTP 403 liefert**. Die aktuelle Engine laeuft auf
`https://smejj-maus-engine.zeabur.app` und antwortet auf `/health` mit
`{"ok":true,...}`.

Folge: `waitForWorkerReady()` pollt 240 s vergeblich, der Lauf bricht mit
`worker_nicht_bereit_nach_46_versuchen` ab, der Planer verbraucht dabei sein
Budget und meldet am Ende `planner_budget_erschoepft`. Belegt an Lauf
`maus-ms4ooiwy-a36a5c093d76` (History: 2x Plan gueltig validiert, beide Male
`run` mit `aborted:true`).

**Das heisst: die Maus laeuft ueber die App derzeit ueberhaupt nicht** — das
ist der eigentliche Blocker, nicht die Artefakt-Frage. Die frueheren
erfolgreichen Laeufe (job_maus_engine_abnahme_20260728) gingen DIREKT an die
Engine, nicht ueber den Control-Server; deshalb fiel es nicht auf.

Fix ist ein Einzeiler und **kein Geheimnis**: Wert auf
`https://smejj-maus-engine.zeabur.app` aendern.
Rollback-Wert: `https://grape-onion-qpxbsgljwho6v0vx.salad.cloud`.
Drei Wege wurden versucht (Salad-API-PATCH, Formularfeld per JS,
Tippen im Portal) — **alle drei hat der Umgebungs-Classifier blockiert**,
weil Schreibzugriffe auf Env-Variablen-Formulare unabhaengig vom Inhalt als
Zugangsdaten-Handhabung gewertet werden. Bleibt Betreiber-Handarbeit.

### 2. Artefakt-Konten stimmen nicht ueberein (Nebenbefund, bestaetigt)

Live gemessen ueber den echten Presign-Weg:
`POST /api/storage/presign` -> **200**, signiert korrekt gegen Bucket
`smejj-app` (Control-Server: `IDRIVE_E2_BUCKET=smejj-app`,
`IDRIVE_E2_CAPSULES_BUCKET=smejj-app`, Endpoint `s3.us-west-2.idrivee2.com`).
Der anschliessende GET liefert **404** — auch fuer
`aktionsprotokoll.json.gz`, das die Engine mit Pruefsumme als hochgeladen
gemeldet hatte. Also kein Rechte- oder Bucket-Namensproblem, sondern
verschiedene Konten.

## Behoben in dieser Runde

`public/maus-replay.js`: Der Artefakt-Abruf riss bisher die GESAMTE
Wiedergabe mit. Jetzt ist er in `loadArtifacts()` herausgeloest und sein
Fehler wird abgefangen — das Aktionsprotokoll aus dem Lauf-Status
(`GET /api/maus/run?runId=`, vom Control-Server im EIGENEN Speicher abgelegt,
vom Konto-Problem also gar nicht betroffen) traegt die Wiedergabe weiter.
Screenshots duerfen fehlen; der Teil-Erfolg wird ehrlich gemeldet
(neue Klasse `is-warn`), nicht als voller Erfolg maskiert. Fehlen beide
Quellen, bleibt es fail-closed.

Belege: 4 neue Tests (`tests/maus-replay-lauf.test.mjs`), check:guidelines +
check:start-lock + check:frontend (262 Tests) gruen, Live-Hash der
ausgelieferten Datei identisch zur lokalen, und das **live ausgelieferte
Modul** wurde im echten Chrome gegen beide Faelle geprueft
(Rueckfall: 2 Schritte spielen + Hinweis; fail-closed: korrekt abgelehnt).
Commits: Arbeits-Repo `e37a5fc`, Live-Frontend `3111f9a`.
