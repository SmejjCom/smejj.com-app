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
