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

## Merkregel

Ein unsichtbares Vollflaechen-Overlay findet man mit `elementFromPoint()`; ein
"toter" Klick ist sonst nicht vom Backdrop-Wegklicken zu unterscheiden.
