# Task Capsule — responsive-qa-plattformen_20260910

Datum: 2026-09-10
Auftrag: Betreiber (Wof Kadavanich) — "PLATTFORMUEBERGREIFENDES RESPONSIVE
DESIGN UND VOLLSTAENDIGE QA", Erweiterung des A-bis-Z-Auftrags.
Status: Sprachwellen-Design und drei Live-Fehler behoben und verifiziert
(smejj.com auf smejj-shell-v834)

## Punkt 6 — Sprachwelle: Design

GEMESSEN VORHER (375x812, Overlay aufgebaut):

| Element | Lage | Befund |
|---|---|---|
| voice-mode-logo | 217..326 | in Ordnung |
| voice-mode-hint | 646..704 | 59 px hoch, danach 28 px Luft |
| voice-mode-bar | 732..780 | danach 32 px bis zur Unterkante |
| X (voiceModeClose) | 303,732 | **in der unteren Leiste**, 48 px Breite weg |
| drei Knoepfe | 36x42 | unter der 44-px-Grenze |

Also 60 px unten verschenkt, und das X sass genau dort, wo geschrieben und
gesprochen wird. `voice-overlay-ui.js` schob es beim Aufbau dorthin
(`bar.appendChild`); im Markup steht es als erstes Kind des Overlays.

VIER AENDERUNGEN:
1. X per CSS oben rechts verankert, ueber `env(safe-area-inset-top)`.
2. Overlay-Polster oben und unten ueber die Safe Areas; die Tastatur gewinnt
   weiterhin (`--tastatur-hoehe`).
3. Hinweis direkt ueber der Leiste, kleiner gesetzt und gekuerzt.
4. Die drei Knoepfe der Eingabezeile auf 44x44.

NACHGEMESSEN ueber sieben Lagen — 320x568, 375x812, 390x844, 412x915,
768x1024, 844x390 (quer), 1440x900:

| Kennzahl | vorher | nachher |
|---|---|---|
| X oben rechts | nein | in allen sieben |
| Luecke unter der Bedienzone | 32 px | 8 px |
| Hinweishoehe | 59 px | 18 px |
| Ziele unter 44 px | 3 | 0 |
| Ueberlappung Logo/Leiste | — | keine |
| waagerechter Ueberlauf | — | keiner |

### Selbst ausgeloest und im Screenshot gefunden

Seit das X oben rechts sitzt, lag der Streifen "Deine Anmeldung ist abgelaufen"
genau darauf — sein "Spaeter"-Knopf besetzte die Mitte des Schliessen-Kreises.
`elementFromPoint` auf die X-Mitte lieferte den fremden BUTTON.

Kein z-index-Wettruesten: der Streifen SOLL oben liegen. Er meldet jetzt seine
Hoehe (`--hinweis-hoehe`), ein ResizeObserver haelt den Wert bei Drehungen
nach, und wer darunter Platz braucht, rechnet sie ein. Live: der Streifen ist
105 px hoch, das X rutscht auf 311,117 und ist erreichbar.

## Drei Werkzeug- und Live-Fehler, gefunden beim Messen

### 1. Die Responsive-Messung lief gar nicht — und sagte nicht, warum

`npm run measure:responsive` brach bei jedem Aufruf mit einer Zeile ab:
"Error: Uncaught". Drei Fehler uebereinander:

* `exceptionDetails.text` traegt bei einer geworfenen Ausnahme nur das Wort
  "Uncaught"; die Ursache steckt in `.exception.description`.
* Damit sichtbar: "SecurityError: Failed to read the 'localStorage' property".
  Nach festen 2,5 s stand der Browser noch auf `about:blank`, wo localStorage
  gesperrt ist.
* Und dann: die Vorgabe zeigt auf `http://127.0.0.1:3000/`, den lokalen
  Entwicklungsserver. Laeuft der nicht, sah die Meldung nach einem App-Fehler
  aus und war eine falsche Adresse.

Ein Messwerkzeug, das nicht sagen kann, woran es scheitert, misst den eigenen
Fehler statt der App.

### 2. chat-store.js wurde LIVE ZWEIMAL geladen

Von 98 Modulen kam eines unter zwei Kennungen:
`?v=b68` (index.html, code-flaeche.js) und `?v=b69` (26 andere Stellen).
35,8 KB doppelt — und, schwerer: zwei INSTANZEN des Chat-Speichers mit eigenem
Zustand. Er haelt die Chatliste; es gab zwei Wahrheiten darueber, welche Chats
es gibt.

`check:module-queries` meldete dabei gruen, voellig zu Recht: die QUELLE ist in
sich stimmig. Auseinander liefen Quelle und AUSLIEFERUNG. Gegen diese Richtung
war kein Schutz da — jetzt gibt es `scripts/diagnose/doppelte-module-live.mjs`.

Der neue Waechter merkt, wenn er nichts gesehen hat: sein erster Lauf meldete
"4 Module geprueft — alles in Ordnung". Gruen und blind. Er meldet sich jetzt
an, wartet bis die Modulzahl STEHT, und bricht mit Fehler ab, wenn er unter 40
Module sieht.

### 3. Siebzehn Module trugen neuen Inhalt unter alter Marke

`check:markenkette`: der Browser laedt sie aus dem Cache — der Fix ist
ausgeliefert und wirkt trotzdem nicht. **Darunter der Sprachwellen-Fix von
heute** (`auth-gate.js` unter `?v=4`): beim Messen fiel es nicht auf, weil
vorher der Cache geleert war.

Iterativ geheilt, weil es eine Kettenreaktion ist: wer eine ladende Datei
anfasst, aendert sie und braucht selbst eine neue Marke. Drei Runden
(36 + 8 + 19 Stellen), erst danach schwieg der Waechter. Eine einzelne Runde
haette gruen ausgesehen und die naechste Ebene stehen lassen.

## Beinahe-Fehler: fremde Arbeit fast geloescht

Beim Spiegeln der Marken in den Klon wollte ich 44 Dateien kopieren. Der Diff
vor dem Commit zeigte: der Klon ist an mehreren Stellen NEUER als der
Arbeitszweig — er traegt den Chat-Bilder-Fix (`parkeMedien`) und die
Plan-Anzeige vom 08.09. Ein pauschales Spiegeln haette beide geloescht.
Zurueckgenommen; uebertragen wurden nur die Marken-Paare (43 Stellen, 0 Zeilen
ohne `?v=`).

Memory-Lehre bestaetigt: "Diff Quelle-gegen-Klon VOR jedem sync lesen;
entfernte Zeilen = Alarm".

## Schlussmessung (live, smejj-shell-v834)

| Messung | Ergebnis |
|---|---|
| Responsive: 19 Ansichten x 8 Geraeteklassen | **152 Messpunkte, alle in Ordnung** |
| Selbsttest des Messwerkzeugs | 19 von 19 kuenstlichen Fehlern erkannt |
| Touch-Ziele, 21 Ansichten | **alle eingehalten** (2 begruendete Ausnahmen) |
| Doppelt geladene Module | **0 von 88** |
| TTFB p75 | 153 ms (Budget 500) |
| LCP p75 kalt / warm | 1000 / 224 ms (Budget 1500) |
| CLS p75 | 0,016 (Budget 0,1) |
| INP p75 | 16 ms (Budget 200) |
| Startgewicht kalt | **302 KB (Budget 300) — verfehlt** |
| Startgewicht warm | 73 KB |

Das Gewicht lag vor dieser Runde bei 315 KB; die 13 KB des doppelt geladenen
Moduls sind weg. Die letzten 2 KB (Messung schwankt 298–302) steckten nicht
mehr in einem Fehler, sondern im Ladepfad selbst — `chat-history-view.js` mit
11,7 KB laeuft beim Start mit, obwohl der Verlauf erst beim Oeffnen gebraucht
wird. Das ist ein Eingriff in eine Kernfunktion und gehoert in eine eigene,
gemessene Etappe.

## Was NICHT erledigt ist

* **Backend-Cline** (clineClient, providerRoutes, clineProvider und ihre
  Aufrufer in agentRoutes/workerModelRoutes). agentRoutes ist der Kern des
  Chat-Wegs.
* **Punkte 3 bis 5 und 7 des A-bis-Z-Auftrags**: Chat und Code im Einzelnen,
  die Realtime-Sprachtechnik, der Video-Modus.
* **Ende-zu-Ende mit Anmeldung**: Nachricht senden, Modell wechseln, KI
  sprechen und unterbrechen, Kamera. Braucht Zugangsdaten; die gebe ich nicht
  ein.
* **Andere Browser-Engines**: gemessen wurde mit Chromium (echte
  Geraeteemulation). Safari und Firefox brauchen andere Werkzeuge.
* **Startgewicht** 2 KB ueber Budget, Ursache benannt.

## Vorbestand, nicht von dieser Runde (nachgemessen mit zurueckgelegten Aenderungen)

* `check:guidelines` im Bauzweig rot: browser-pane-maus.js 951 Zeilen,
  browser-pane.js 825, index.html 1027.
* `tests/smejj-versionen.test.mjs` und `tests/multi-model-integration.test.mjs`
  rot — laufende Arbeit der Parallelsitzung am Alias- und Registry-Weg.
* `tests/hausmodell-adapter.test.mjs` rot: ihre Quelle
  (`workers/smejj-hausmodell/katalog.js`) kennt `adapterOderNichts` noch nicht.
