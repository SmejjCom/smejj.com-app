# Task Capsule — job_browser_panel_backdrop_20260803

**Status:** verified, LIVE (sw v206, smejj-app-frontend 9abf654).
**Rollback:** Frontend-Repo `eb101c9` (Stand vor dem Fix; `git revert 9abf654` genuegt,
der Fix ist ein additives Modul plus zwei Verdrahtungszeilen).

## Ziel

Betreiber-Meldung (2026-08-03, schriftlich): "Warum, wenn ich schreibfelde klicke
browser seite klapt zu, soll immer an bleiben bis ich manuel zu klappe." Das
Browser-Panel (Split-View) muss offen bleiben, bis es manuell geschlossen wird.

## Befund (live in Chrome gemessen, nicht geraten)

Im Split-View (body.browser-pane-open) blieb das Abdunkel-Backdrop aus
panel-backdrop.js sichtbar: `#sidebarBackdrop`, `inset: 0`, `z-index: 65` — ueber dem
gesamten linken Arbeitsbereich. Beweis: `document.elementFromPoint()` ueber dem
Schreibfeld lieferte `#sidebarBackdrop`, nicht das Feld. Jeder Klick links loeste den
Wegklick-Handler (`closeAll`) aus und schloss das Panel; getippt wurde nie.
Zusatzbefund: `setBrowserPanelOpen(false)` laesst `browser-pane-open` auf dem body
stehen (vorbestehend, unveraendert).

## Umsetzung

Neu (additiv, kein Lock beruehrt inhaltlich):
- `assets/browser-pane-backdrop.js` — Split-View-Waechter: unterdrueckt das Backdrop
  bei `body.browser-pane-open`; Ausnahme offenes linkes Menue (`left-panel-open`),
  damit der Sidebar-Fix vom 2026-07-18 sein Abdunkeln/Wegklicken behaelt.
  Zwei MutationObserver (Backdrop-`hidden`-Attribut + body-Klassen), Microtask vor
  dem Paint, kein Aufblitzen. Bewusst ohne Imports (keine ?v=-Modul-Instanz-Falle).

Geaendert (nur Verdrahtung, im Frontend-Repo):
- `index.html` — Script-Tag `browser-pane-backdrop.js?v=1` nach browser-pane.js
- `sw.js` — CACHE_NAME v205 -> v206, Precache-Eintrag, Versions-Kommentar

Warum eigenes Modul: browser-pane.js steht bei 795/800 Zeilen; panel-backdrop.js und
browser-pane.js stehen unter Start-Lock — dieselbe SRP-Loesung wie maus-panel.js.
Lokaler Spiegel: `public/browser-pane-backdrop.js` (Commit 87d9013); lokale
index.html/sw.js bleiben unangetastet (Start-Lock, Parallel-Sessions), Verdrahtung
folgt mit der naechsten freigegebenen Lock-Aktualisierung.

## Verifikation

1. Vor-Deploy: Fix-Logik in die Live-Seite injiziert — Panel blieb offen, Klick links
   traf ARTICLE statt Backdrop, Menue-Backdrop erhalten.
2. Nach-Deploy (sw v206 aktiv, 1 Reload): echter Klickpfad in Chrome —
   Klick ins Schreibfeld fokussiert, "Test: Panel bleibt offen" getippt, Panel blieb
   offen; X schloss das Panel; linkes Menue behielt Abdunkeln und Wegklicken.
3. Keine Konsolenfehler. Node-Syntaxcheck beider Dateien gruen.

## Benchmark (Messpflicht)

TTFB 64 ms (Budget 200), domInteractive 84 ms, load 326 ms, Transfer 40 KB,
Layout stabil (keine beobachteten Shifts), sw-Cache smejj-shell-v206 aktiv.
Keine Verschlechterung gegen den letzten Stand.

## Parallel-Session-Hinweis

Waehrend der Arbeit pushte eine Parallel-Session eb101c9 (sw v205, Chat v111).
Dieser Fix wurde fast-forward OBEN DRAUF gebaut (v206) — nichts ueberschrieben.

## Nacharbeit (2026-08-03, Freigabe "Ja" des Betreibers)

1. Lokale Verdrahtung nachgezogen: public/index.html und public/sw.js auf den
   live bewiesenen v206-Stand (byte-identisch zum Frontend-Repo). Versionspin in
   5 Tests v205 -> v206.
2. NEU: tests/browser-pane-backdrop.test.mjs (4/4 gruen) — Verdrahtung,
   gefahrloser Node-Import, Waechter-Regeln; in check:frontend aufgenommen.
3. Start-Lock-Manifest mit dokumentiertem Freigabe-Wortlaut neu eingefroren
   (31 Dateien gruen, Backup backups/start-design-lock/2026-08-03T22-20-03-263Z/).
4. Codeberg-Spiegel synchronisiert (committete Skriptfassung; smejj-app-frontend
   main auf 9abf654).
5. End-Abnahme live: sw v206 aktiv, Backdrop im Split-View hidden, Klick links
   traf Inhalt (P), Panel blieb offen, X schloss.

Zu diesem Zeitpunkt bewusst NICHT gemacht: das Aufraeumen der stehengebliebenen
Klasse browser-pane-open und das Wegklicken bei offenem linkem Menue. Beides ist
mit der zweiten Nacharbeitsrunde erledigt (siehe unten).

## Nacharbeit Runde 2 (2026-08-03, Freigabe "Ja" auf die Restpunktliste)

Erledigt sind damit beide Restpunkte aus der Abschlussmeldung.

### Punkt 2 — Wegklicken schliesst nur noch die oberste Ebene

`panel-backdrop.js` bekommt die reine Funktion `backdropCloseTarget({splitView,
menuOpen})`. Ist der Browser-Split-View offen UND zusaetzlich das linke Menue,
liefert sie `"menu"` — der Klick neben das Menue schliesst nur das Menue, das
Panel bleibt stehen. In jedem anderen Fall `"all"`, also das bisherige Verhalten
(Non-Regression zum Sidebar-Fix vom 2026-07-18). Escape bleibt bewusst
unveraendert: das ist eine ausdrueckliche Nutzeraktion und schliesst weiterhin
beides.

### Punkt 1 — kein Restzustand mehr nach dem Schliessen

Schliessen ueber Browser-Knopf, Backdrop oder Navigation laeuft durch
`setBrowserPanelOpen(false)` in `app.js` und nicht durch `closePane()` in
`browser-pane.js`. Dabei blieben `body.browser-pane-open`, `.is-browser-mode` am
Panel und `--right-panel-width` stehen — unsichtbar, aber jeder, der den Zustand
liest, sah einen Split-View, der in Wahrheit zu war. `browser-pane-backdrop.js`
raeumt diesen Rest jetzt ab (genau das, was `backToMenu()` sonst tut). Statt
`app.js` anzufassen (Ratchet-Baseline) liegt die Regel im Waechter, der den
Zustand ohnehin liest. `syncSplitViewBackdrop()` nimmt das Dokument jetzt als
Parameter — dadurch ohne Browser testbar.

### Geaenderte Dateien

- `assets/panel-backdrop.js` — `backdropCloseTarget()` + `closeFromBackdrop`
- `assets/browser-pane-backdrop.js` — Restzustand abraeumen, Dokument injizierbar
- `assets/app.js` — Import `panel-backdrop.js?v=panel-backdrop-20260803`
- `index.html` — `browser-pane-backdrop.js?v=2`
- `sw.js` — `smejj-shell-v206` -> `smejj-shell-v207`

### Verifikation Runde 2

Pflicht-Checks: `check:frontend` 320/320 gruen (`browser-pane-backdrop.test.mjs`
von 4 auf 12 Faelle), `check:guidelines`, `check:favicon-lock` gruen.

Live auf `https://smejj.com` (sw v207 aktiv, echter Klickpfad in Chrome), 5/5:

1. Split-View geoeffnet -> `backdrop.hidden = true`, `elementFromPoint` auf dem
   Schreibfeld traf `#startMessage`.
2. Linkes Menue geoeffnet -> Backdrop sichtbar (Menue behaelt sein Abdunkeln);
   daneben geklickt (260/300, dort lag `#sidebarBackdrop`) -> Menue zu, **Panel
   blieb offen**, Backdrop wieder unterdrueckt.
3. Ins Schreibfeld geklickt und getippt -> Fokus `#startMessage`, Text stand
   drin, Panel blieb offen (der urspruengliche Fehler bleibt behoben).
4. Ueber den Browser-Knopf geschlossen -> `body.classList` LEER,
   `is-browser-mode` weg, `--right-panel-width` entfernt, `aria-expanded=false`.
5. Ohne Split-View: Menue geoeffnet, daneben geklickt -> Menue zu (unveraendert).
   Escape im Split-View -> Panel zu.

Keine Konsolenfehler.

### Nachverifikation nach dem Fremd-Deploy (sw v208)

Kurz nach dem Deploy von v207 legte eine Parallel-Session `3c18f58`
("Gespraechsgedaechtnis repariert", sw v208) darueber — mit 79 geaenderten
Zeilen in `assets/app.js`, also genau in der Datei, die den Split-View
verdrahtet. Deshalb wurde der Klickpfad auf dem neuen Live-Stand WIEDERHOLT:

- Ausgeliefert bleibt unveraendert: `index.html` -> `browser-pane-backdrop.js?v=2`,
  `app.js` -> `panel-backdrop.js?v=panel-backdrop-20260803`, beide Waechter-Dateien
  live mit `backdropCloseTarget` bzw. `clearClosedSplitViewState`.
- Punkt 2 auf v208: Split-View + Menue geoeffnet, daneben geklickt -> Menue zu,
  Panel offen, Backdrop wieder unterdrueckt, Schreibfeld weiter erreichbar.
- Punkt 1 auf v208: ueber den Browser-Knopf geschlossen -> `body.classList` leer,
  `is-browser-mode` weg, `--right-panel-width` entfernt, `aria-expanded=false`.
- Keine Konsolenfehler.

Merkregel daraus: Ein Deploy ist erst dann abgenommen, wenn er auf dem
AKTUELLEN Live-Stand nachgemessen wurde — bei parallelen Sessions kann zwischen
Deploy und Abnahme eine fremde Version dazwischenkommen.

### Benchmark Runde 2 (Messpflicht)

Kalt ueber das Netz: TTFB 147 ms (Budget 200), Startseite 40 631 Bytes
(Budget 300 KB). Warm mit aktivem Service Worker: FCP/LCP 84 ms (Budget 1,5 s),
CLS 0 (Budget 0,1), domInteractive 19 ms, load 133 ms, 118 Ressourcen.
`panel-backdrop.js` 4 416 Bytes, `browser-pane-backdrop.js` 4 289 Bytes —
zusammen +2,3 KB gegenueber v206. Keine Budgetverletzung, keine
Verschlechterung gegenueber dem letzten Benchmark.

### Absicherung Runde 2

Start-Lock neu eingefroren (31/31 gruen, Backup
`backups/start-design-lock/2026-08-03T23-58-05-089Z/`). Der Freigabe-Wortlaut im
Manifest haelt ausdruecklich fest, dass `app.js` und `sw.js` (v208) aus dem
Parallel-Session-Commit `c518e44` mit eingefroren, aber NICHT von dieser Freigabe
gedeckt sind und zum Zeitpunkt des Einfrierens noch nicht live waren.

### Testumgebung (offen dokumentiert)

Das benutzte Chrome-Profil hatte keine smejj.com-Sitzung. Anmelden nimmt der
Agent dem Betreiber nicht ab; fuer den Klickpfad wurde deshalb nur der lokale
UI-Schalter `smejj.session.v1` im Browser gesetzt (kein Serverzugang) und
danach zusammen mit dem Testartefakt `smejj.browser.tabs.v1` wieder entfernt.
Alle geprueften Dateien kamen unveraendert von `https://smejj.com`.

## Merkregel

Ein unsichtbares Vollflaechen-Overlay findet man mit `elementFromPoint()`; ein
"toter" Klick ist sonst nicht vom Backdrop-Wegklicken zu unterscheiden.

Und: Zustand, den ZWEI Stellen setzen (hier `app.js` und `browser-pane.js`),
driftet zwangslaeufig, sobald nur einer der Wege ihn wieder abraeumt.
