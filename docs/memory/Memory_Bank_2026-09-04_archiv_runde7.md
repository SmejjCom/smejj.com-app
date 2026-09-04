# Memory Bank — Archiv Runde 7 (ausgelagert 2026-09-04)

Volltexte aus `Memory_Bank.md`. Ausgelagert, weil die Datei die 800-Zeilen-Regel
gerissen hat. Inhaltlich unveraendert.

## 2026-09-03 — Web-Vitals-Wache rot: Netz UND ein echter Seitenbefund (chat-store.js zweimal geladen)

Wache Nr. 63 seit 02.09. rot (TTFB p75 878 ms, LCP 3,3 s, Gewicht 324 KB). Zerlegt: (1) TTFB/LCP kommen vom
Betreiber-Netz — RTT zum GitHub-Pages-Edge 130–250 ms, erster Hop bis 200 ms, WLAN 2,4 GHz; Varnish liefert
mit age < 10 s. Parallelsitzung hat TTFB am 02.09. auf 500 ms/"nur Hinweis" gestellt (Bauzweig 731461e3).
(2) Gewicht ist echt: `public/erste-schritte.js` (Nr. 9) importierte `/assets/chat-store.js` OHNE `?v=b65`,
index.html und sechs Module MIT — der Browser lud die Datei zweimal (12,9 KB, zweite Modulinstanz mit eigener
IndexedDB-Verbindung). Fix auf design-v11: Import auf `?v=b65`; neuer Waechter `tests/modul-einmal-instanz.test.mjs`
(ein Spezifizierer je Zieldatei, kaputte + gesunde Probe) in check:frontend; Suite 666/666 gruen.
**MERKE:** (1) Gewicht mit der Ressourcenliste aus dem kalten Chrome-Lauf messen — doppelte Basisnamen darin sind
die Spezifizierer-Falle. (2) Der Kommentar "anderer Spezifizierer = zweite Instanz" stand seit Wochen in
chat-history-view.js und search.js, nur maschinell hat es niemand geprueft. (3) Live braucht SW v730 (Assets
cache-first) → Start-Lock → Betreiber-Doppelklick `smejj.com chat-store einmal laden ausliefern.command`
(Kaskade scripts/einmal/einmal-instanz-chat-store-2026-09-03.sh, Dateiliste vorher mit ls geprueft).

## 2026-09-03 — Web-Vitals Runde 2+3: UX-Haken und Verlaufs-Helfer laden erst bei Bedarf (job_a_bis_z_20260902, Nachtrag 17)

v731 (UX-Haken in chat-actions-menu.js: Handy-Stile nur <=600 px, verlauf-unten erst mit Chat im Log, code-feld-unten erst im Code-Bereich) und v733 (chat-history-view.js laedt Verlaufs-Text, Karten-Bausteine und Titel-Automatik per ladeBausteine()/import() beim ersten Zeichnen; spur-start.js zieht merkmaleVon aus dem neuen chat-merkmale.js, im Precache). Desktop-Asset-Liste kalt 324 -> 270 KB, Messlauf 288 KB — erstmals seit 02.09. unter dem 300-KB-Budget. Dazu Betriebswache: Modell-Chip 30x44 durch composer-zeile.js min-width:0 (behoben, live ohne SW-Sprung, nicht precached); Betriebswerte bleiben rot bis der Betreiber den Zeabur-Token erneuert (401).
**MERKE:** (1) Nur precached Dateien (SHELL in sw.js) brauchen den SW-Sprung und damit den Doppelklick — alles andere liefert der Fetch-Handler netzwerk-zuerst. (2) Tests, die den Haken-Wortlaut `import("/assets/X.js").catch(() => {})` pruefen, bleiben gruen, wenn der Wortlaut in einem Thunk steht. (3) Node haelt `x.js` und `x.js?v=1` fuer zwei Instanzen — Tests importieren dieselbe Kennung wie das Modul. (4) Markdown (7,4 KB) bleibt am Start: components.js/app.js sind im Start-Lock. Waechter: tests/modul-einmal-instanz.test.mjs, tests/verlauf-nachladen.test.mjs.
