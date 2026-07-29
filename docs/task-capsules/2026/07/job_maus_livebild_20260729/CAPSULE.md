# Task Capsule — job_maus_livebild_20260729

Datum: 2026-07-29
Auftrag: "Weg A" — die Maus soll live sichtbar arbeiten, wie bei Codex/Claude,
statt eine Diashow aus Einzelfotos abzuspielen.
Status: **Kern gebaut und getestet, NICHT live** — Engine-Deploy ist blockiert.

## Architekturentscheidung

Chrome filmt sich selbst per CDP (`Page.startScreencast`) und liefert
JPEG-Einzelbilder, sobald sich etwas aendert. Der Alternativweg — wiederholtes
`page.screenshot()` — blockiert den Renderer und wuerde den Lauf verlangsamen;
die Anzeige darf den Lauf aber nie ausbremsen.

**Uebertragungsweg bewusst OHNE WebSocket und ohne neuen Dienst:**
Die Engine schreibt **ein** Objekt `live/frame.jpg` in die bestehende Capsule und
ueberschreibt es laufend. Die Anzeige signiert diese Adresse **einmal** (300 s
gueltig) und pollt danach direkt gegen IDrive e2.

Warum so:
- **Control Server bleibt lastfrei:** ein Presign-Aufruf alle paar Minuten je
  Zuschauer statt einer je Bild. Architekturregel: der kleine Server traegt
  keine Last, die woanders geloest werden kann.
- **Konstanter Speicher:** ein Objekt statt eines je Bild. Ein 60-s-Lauf bei
  2 Bildern/s haette sonst 120 Objekte erzeugt.
- **Keine neue Erlaubnisliste:** kein neuer Host, keine CSP-Aenderung, kein
  WebSocket-Server auf 2 vCPU.
- **IDrive e2 traegt die Last** — genau seine Rolle laut Server-Uebersicht.

**Ehrliche Einordnung:** Das ergibt 2-4 Bilder/s, keinen 30-fps-Videostrom. Fuer
"ich will zusehen, wie die Seite bedient wird" reicht das voellig und passt zu
6 USD/Monat. Ein echter Videostrom braucht Weg B (Bildschirm im Container).

## Ordnerstruktur (geaendert/neu)

```
workers/maus-engine/
  screencast.mjs        NEU  — Drosselung, Bestaetigung, Start/Stop (kein Playwright-Bezug)
  live-publisher.mjs    +publishFrame() -> live/frame.jpg (image/jpeg, kein gzip)
tests/
  maus-screencast.test.mjs      NEU — 7 Tests
  maus-live-publisher.test.mjs  +2 Tests
```

## Umgesetzt und geprueft

- **Jedes Einzelbild wird bestaetigt** (`Page.screencastFrameAck`), auch ein
  verworfenes. Fehlt das, stellt Chrome den Strom nach wenigen Bildern ein —
  die klassische Falle bei CDP-Screencast. Durch Test abgesichert.
- **Drosselung** auf die Bildrate, mit Testuhr geprueft (2/s: Bild bei 0 ms
  durch, bei 200 ms verworfen, bei 600 ms wieder durch).
- **Fail-closed:** ohne `SMEJJ_MAUS_LIVE_FPS` ist die Funktion komplett AUS;
  unbrauchbare Werte schalten aus statt zu raten; harte Obergrenze 10/s.
- **Fail-safe:** Veroeffentlichungsfehler werden geschluckt, der Strom laeuft
  weiter, der Lauf bleibt unberuehrt.
- **Sauberes Beenden:** `stop()` haelt den Strom an und raeumt den Listener ab;
  ein zweiter Aufruf ist wirkungslos, nicht fehlerhaft.

Belege: 20 Tests gruen (7 neu + 2 neu + 11 Bestand unveraendert),
`check:guidelines`, `check:start-lock`, `check:architecture` (7/7) und
`check:frontend` (262/262) gruen. Commit im Arbeits-Repo.

## Was noch fehlt — und warum es hier endet

### 1. Verdrahtung in der Engine (klein, aber nicht blind machbar)

Der Screencast braucht eine **Seite**, die erst nach `openBrowser`/`navigate`
existiert. `createInterpreter()` in `interpreter.mjs` kennt heute nur `onStep`.
Noetig ist ein zweiter Haken, z. B. `onPageReady(page)`, und in `worker.mjs`:

```js
const cast = createScreencast({ fps: resolveLiveFps(), publish: (b) => livePublisher.publishFrame(b) });
// bei onPageReady:  await cast.start(await page.context().newCDPSession(page));
// nach interpreter.run():  await cast.stop();
```

Bewusst **nicht** blind eingebaut: Ohne lauffaehige Engine liesse sich diese
Verdrahtung nicht ein einziges Mal ausfuehren. Ungepruefte Aenderungen an einer
Produktionsdatei widersprechen der Verifikationspflicht.

### 2. Anzeige-Seite (`public/maus-replay.js`)

Im Live-Modus `live/frame.jpg` einmal signieren, danach mit Cache-Brecher
pollen und das `<img>` tauschen; bei 404 auf das heutige Verhalten
zurueckfallen. Erst sinnvoll, wenn die Engine Bilder liefert — sonst waere es
eine Anzeige ohne Inhalt.

### 3. HARTER BLOCKER: Engine-Deploy

Die Engine laeuft als fertiges Abbild `ghcr.io/smejjcom/smejj-maus-engine:v1`.
Ein neues Abbild braucht Bau **und** Push nach ghcr.io. Gemessen:

- Docker Desktop ist installiert, der Daemon **laeuft nicht**.
- `~/.docker/config.json` kennt **nur** `https://index.docker.io/v1/` —
  **kein ghcr.io**. Ein Login dorthin waere Zugangsdaten-Handhabung und wird
  vom Umgebungs-Classifier blockiert.

Zwei Auswege, beide Betreiber-Entscheidung:
1. **Betreiber baut und pusht** das Abbild (`scripts/deploy/build_and_push_maus_engine_image.sh`).
2. **Dienst auf Git-Bau umstellen:** `Dockerfile.maus-engine` im Repo, Zeabur
   baut bei jedem Push selbst — dann entfaellt die Registry dauerhaft. Passt
   zum Umzug weg von Salad. Ist eine Umkonfiguration eines Produktionsdienstes,
   deshalb mit Freigabe und mit dem alten Abbild als Rueckfall.

### 4. Live-Test derzeit ohnehin unmoeglich

Die Maus wird aktuell mit `nicht_autorisiert` abgewiesen
(`SMEJJ_MAUS_ENGINE_TOKEN` unterscheidet sich zwischen Control-Server und
Engine, siehe `job_maus_sichtbarkeit_20260728`). Solange das offen ist, kann
kein Lauf und damit kein Live-Bild verifiziert werden.

## Non-Regression

Nichts Bestehendes wurde veraendert oder abgeschaltet: `screencast.mjs` ist neu
und wird nirgends aufgerufen, `publishFrame()` ist additiv, und ohne
`SMEJJ_MAUS_LIVE_FPS` bleibt das Verhalten der Engine byte-gleich. Alle 11
bestehenden Live-Publisher-Tests laufen unveraendert gruen.

## Naechster Schritt

`SMEJJ_MAUS_ENGINE_TOKEN` angleichen (Betreiber) → Maus laeuft wieder →
Verdrahtung nach Punkt 1 mit echtem Lauf verifizieren → Anzeige-Seite →
`SMEJJ_MAUS_LIVE_FPS=2` setzen und live abnehmen.
