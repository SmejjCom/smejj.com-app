# Interaktiver Remote-Browser — Architektur & Plan (Phase 0)

Status: UMGESETZT (Code + Tests, 2026-07-15) — Deployment auf Staging/Prod steht aus.
Schriftliche Freigabe: "Ja — Freigabe erteilt" (Wof Kadavanich, 2026-07-15) fuer
"Freigabe: Interaktiver Remote-Browser gemaess REMOTE_BROWSER_INTERAKTIV.md —
Umsetzung Phase 1-4 inkl. Staging und Prod."
Rollback-Punkt: backups/rollback-2026-07-15-remote-browser-interaktiv/

Umgesetzte Dateien:
NEU  workers/remote-browser/session-engine.js (Session-Manager, Aktions-Interpreter)
NEU  control-server/src/routes/browserSessionRoutes.js (Bridge, fail-closed)
NEU  public/browser-pane-session.js (Client-Session-Modul, Act-Queue)
NEU  tests/remote-browser-session.test.mjs (12 Tests, in check:frontend verdrahtet)
GEAENDERT  workers/remote-browser/worker.js (+POST /session,/session/act,/session/close)
GEAENDERT  src/server.js, src/shared/platform.js, public/config.js (Routen)
GEAENDERT  public/browser-pane.js (Live-Browser zuerst, Standbild als Fallback)
GEAENDERT  public/browser-pane-render.js (+buildLiveBrowserHtml, interaktive Shell)
GEAENDERT  public/sw.js (Precache +browser-pane-session.js), package.json (Testsuite)
Start-Design-Lock mit Freigabe-Wortlaut neu eingefroren (zuletzt 2026-07-15T17:17:56Z, sw v121).

## Livegang-Status (2026-07-15)

Architektur-Korrektur beim Deploy verifiziert: Der Browser-Pfad des Frontends
laeuft NICHT ueber den Control Server (redbean), sondern:
  Frontend (GitHub Pages) -> Bridge `smejj-remote-browser-bridge-live`
  (loganberry, laeuft public/remote-browser-bridge.js) -> Worker
  `smejj-remote-browser-live` (cherry-wasabi, GHCR-Image mit Playwright).
Deshalb wurden die Session-Routen zusaetzlich in die Bridge
(public/remote-browser-bridge.js) und in das Worker-Image (Dockerfile +
session-engine.js) aufgenommen. Die Control-Server-Route
(browserSessionRoutes.js) bleibt als konsistenter Zweitpfad bestehen.

Von hier (Sandbox) erledigt: gesamter Code, 60 gruene Tests, Control-Release
rc5-Artefakt gebaut, Upload-Bundle UPLOAD-ZU-GITHUB/2026-07-15-live-browser/,
Dockerfile + Build-Script um Session-Smoke erweitert, Locks gruen.

NUR am Mac moeglich (Docker + git), daher offen — Reihenfolge zwingend:
  A) `bash scripts/deploy/build_and_push_remote_browser_image.sh` (Docker),
     dann Salad `smejj-remote-browser-live` Stop->Start; /health + /session pruefen.
  B) GitHub-Pages-Upload (5 assets-Dateien + sw.js), dann Salad
     `smejj-remote-browser-bridge-live` Stop->Start; /api/browser/session pruefen.
  C) Live-Test amazon.de im smejj-Browser (klicken/tippen/suchen).
Grund: GitHub Actions ist per Free-only-Policy verboten; das Worker-Image muss
lokal gebaut und nach ghcr gepusht werden, der Pages-Deploy braucht Repo-Zugriff.
Bis A+B live sind, faellt der Browser sauber auf die bisherige Standbild-Ansicht
zurueck (Non-Regression, nichts geht kaputt).

---

## 1. Problem (verifiziert am Code, 2026-07-15)

Nutzer-Befund: Amazon im smejj Browser — Scrollen geht, Klicken geht nicht.

Ursache (Code-Pruefung):

1. Amazon blockiert das direkte Einbetten (X-Frame-Options/CSP) → `browser-pane.js`
   faellt auf den Remote-Browser-Modus zurueck (`tryRemoteBrowser`).
2. Der Remote-Modus ist heute **ein einmaliges Standbild**: der Worker
   (`workers/remote-browser/worker.js`) hat nur `/health`, `/run` (Coding) und
   `/render`. `/render` liefert EINEN Full-Page-Screenshot + Link-Hotspots,
   danach ist die Browser-Session weg.
3. Klickbar sind nur die vom Worker erkannten `<a href>`-Links (max. 200,
   `browser-pane-render.js` → `buildRemoteBrowserHtml`). Amazons Buttons,
   Suchfeld, Menues und Warenkorb sind JavaScript-Elemente ohne einfache
   Links → kein Hotspot → kein Klick moeglich.
4. Scrollen funktioniert, weil nur das Bild im Client gescrollt wird.

Fazit: Kein Bug, sondern eine Architektur-Grenze. Loesung: interaktive
Remote-Sessions.

## 2. Ziel

Der smejj Browser soll sich bei Seiten, die Einbettung blockieren (Amazon,
Google, YouTube, Banken, ...), **wie Chrome bedienen lassen**: klicken, tippen,
scrollen, Enter, Zurueck/Vor — ohne die Seite extern oeffnen zu muessen.

Nicht-Ziele dieser Stufe: Live-Video-Streaming (WebRTC/Screencast), Audio,
Datei-Downloads in der Remote-Session, dauerhaft laufende Worker.

## 3. Architektur (verbindlich)

```
Browser-Pane (Client, GitHub Pages)
   │  faengt Klick/Tastatur/Scroll in der Remote-Ansicht ab (postMessage)
   ▼
browser-pane.js  ──►  Remote-Browser-Bridge (bestehend, erweitert)
   │                    Origin-Check, Rate-Limit, Token — wie heute
   ▼
Remote-Browser-Worker (Salad, pay-per-use)
   ├── POST /session          → oeffnet Playwright-Session, navigiert, liefert
   │                            sessionId + Screenshot (Viewport, JPEG)
   ├── POST /session/act      → fuehrt EINE Aktion aus (click x/y, type, key,
   │                            scroll, back, forward, reload) und liefert
   │                            neuen Screenshot + finalUrl + title
   └── POST /session/close    → schliesst Session sofort
        + Idle-Timeout (90 s) und Hard-Limit (10 min) schliessen automatisch
```

Ablauf aus Nutzersicht: Klick auf das Bild → Koordinate (in Prozent) geht an
den Worker → Playwright klickt echt → neues Bild kommt zurueck (~0,5–1,5 s).
Fuer den Nutzer fuehlt es sich wie ein etwas langsameres Chrome an.

### Entscheidungen

- **Session-basiert statt render-once.** Cookies, Login-Status und JS-State
  bleiben innerhalb der Session erhalten (Warenkorb funktioniert).
- **Viewport-Screenshot statt Full-Page** im interaktiven Modus: kleiner,
  schneller; Scrollen wird als Aktion (`scroll`) an den Worker gegeben.
  Der bisherige Full-Page-Modus bleibt als Fallback erhalten, wenn keine
  Session moeglich ist (Non-Regression).
- **JPEG statt PNG** fuer Interaktions-Frames (kleiner, schneller); Qualitaet ~70.
- **Koordinaten in Prozent** vom Client, Worker rechnet auf Viewport-Pixel um
  (unabhaengig von Zoom/Skalierung).
- **Max. 2 gleichzeitige Sessions pro Worker**, Rest bekommt 429 (fail-closed).

## 4. API-Skizze

`POST /session`  Body: `{ url, viewport: {width,height} }`
→ `{ ok, sessionId, screenshot, finalUrl, title, expiresInMs }`

`POST /session/act`  Body: `{ sessionId, action }` mit `action` als eines von:

```
{ type: "click",  xPct, yPct, button?: "left"|"right", clicks?: 1|2 }
{ type: "type",   text }                 // max. 2000 Zeichen
{ type: "key",    key }                  // Allowlist: Enter, Tab, Escape,
                                         // Backspace, Pfeile, PageUp/Down, Home, End
{ type: "scroll", deltaY }               // Worker: mouse.wheel
{ type: "navigate", url }                // erneute SSRF-Pruefung
{ type: "back" | "forward" | "reload" }
```
→ `{ ok, screenshot, finalUrl, title, expiresInMs }`

`POST /session/close`  Body: `{ sessionId }` → `{ ok }`

Validierung fail-closed: unbekannter `action.type`, fehlende/ungueltige Felder,
unbekannte `sessionId` → 400, keine Aktion.

## 5. Sicherheit (Pflicht, fail-closed)

1. **SSRF-Schutz bleibt vollstaendig**: bestehende Blockliste (localhost,
   private Netze, .local usw.) gilt fuer `POST /session` UND fuer jede
   `navigate`-Aktion; `page.route`-Pruefung (assertPublicRequest) unveraendert.
2. **Origin-Allowlist** der Bridge (nur smejj.com/www.smejj.com) und
   **Rate-Limit** gelten auch fuer die neuen Endpunkte; Act-Aktionen bekommen
   ein eigenes, hoeheres Token-Budget (Interaktion braucht mehr Requests).
3. **Worker-Token** (Bearer) wie bisher; sessionId ist zufaellig (128 bit),
   nur serverseitig gueltig, nie im HTML persistiert.
4. **Keine Credentials im System**: Passwoerter tippt der Nutzer selbst in die
   Remote-Seite; smejj speichert nichts (Session-Cookies leben nur im
   Playwright-Kontext und sterben mit der Session).
5. **Timeouts**: 90 s idle, 10 min hart, 15 s pro Aktion. Session-Ende
   schliesst den Browser-Kontext vollstaendig (keine Datenreste).
6. **Kein Upload/Download** in der Remote-Session (Stufe A).
7. Seiteninhalt bleibt untrusted; es geht nie Seitentext als Instruktion an
   ein Modell (kein Modell beteiligt — reine Code-Engine).

## 6. Kosten (Free-only / COST_GUARDRAILS konform)

- Keine neuen Dienste, keine Fixkosten. Worker laeuft nur, wenn der Nutzer
  aktiv remote browst (pay-per-use, wie Maus-Engine-Laeufe).
- Idle-Timeout 90 s + Hard-Limit 10 min verhindern vergessene Sessions.
- JPEG-Frames ~50–150 KB statt Full-Page-PNG (weniger Transfer).
- Kein Modell-Aufruf, keine Vision — reine Playwright-Ausfuehrung.
- Client (Anzeige) bleibt 100 % GitHub Pages Free.

## 7. Umsetzung (Phasen, je < 800 Zeilen pro Datei)

**Phase 1 — Worker** (`workers/remote-browser/`):
Session-Manager (Map sessionId → Kontext, Timeouts), Endpunkte `/session`,
`/session/act`, `/session/close`, Aktions-Validierung, JPEG-Viewport-Shot.
Neue Datei z. B. `session-engine.js` (Single Responsibility), `worker.js`
nur um Routing erweitert. `/render` bleibt unveraendert (Non-Regression).

**Phase 2 — Bridge** (`remote-browser-bridge.js`):
POST-Durchleitung der drei Endpunkte mit Origin/Rate/Token wie heute;
GET `/` (render) unveraendert.

**Phase 3 — Client** (`public/`):
`buildRemoteBrowserHtml` bekommt interaktiven Modus: Klick-/Tasten-/Scroll-
Capture im sandboxed iframe → postMessage → `browser-pane.js` ruft `act` auf
und tauscht das Bild. Statuszeile "Verbunden — Remote-Browser aktiv" +
Beenden-Knopf. Start-Design-Lock und Favicon-Lock werden nicht beruehrt
(alles innerhalb des bestehenden Browser-Panes, additiv).

**Phase 4 — Fallback-Kette** (browser-pane.js):
Direkt-iframe (wie heute) → interaktive Session → Standbild (heutiger Modus)
→ "Extern oeffnen". Nichts Bestehendes wird entfernt.

## 8. Tests & Verifikation

- Unit: Session-Lifecycle (open/act/close/timeout), Aktions-Validierung
  (fail-closed), SSRF-Block bei navigate, Rate-Limit, 2-Session-Limit.
- E2E (Staging vor Prod): (a) example.com Link klicken → Navigation im Bild,
  (b) httpbin.org/forms Formular tippen + absenden, (c) amazon.de: Suchfeld
  klicken, Begriff tippen, Enter, Ergebnis sichtbar, Artikel anklicken,
  (d) Idle-Timeout schliesst Session, (e) private IP → Abbruch.
- Pflicht-Checks: `check:guidelines`, `check:frontend`, `check:start-lock`,
  `check:favicon-lock`, `check:architecture`, danach `check:all` +
  `release:preflight`.
- Rollback-Punkt: `backups/rollback-<datum>-remote-browser-interaktiv/`
  mit Kopien aller geaenderten Dateien vor der ersten Aenderung.

## 9. Akzeptanzkriterien (alle Pflicht)

1. Amazon.de laesst sich im smejj Browser bedienen: klicken, tippen, suchen,
   Artikel oeffnen — ohne "Extern oeffnen".
2. Reaktionszeit pro Klick im Normalfall unter ~2 s.
3. Keine Fixkosten; Sessions enden automatisch; Worker stoppt danach.
4. Fail-closed ueberall; SSRF-Schutz nachweislich aktiv (Test e).
5. Start-Design-Lock, Favicon-Lock, bestehender Standbild-Modus und
   Direkt-iframe-Modus unveraendert (Non-Regression).
6. Alle Pflicht-Checks gruen; Staging vor Prod; Rollback dokumentiert.

## 10. Offene Punkte / spaetere Stufen (separat freizugeben)

- Stufe B: Live-Frames per CDP-Screencast (fluessiger, mehr Transfer).
- Datei-Download/-Upload in Remote-Sessions.
- Mobile Touch-Gesten (Pinch-Zoom) in der Remote-Ansicht.
