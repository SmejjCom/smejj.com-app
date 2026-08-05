# Task Capsule — Das erste Lebenszeichen (job_arbeitssignal_20260805)

## Auftrag
Betreiber, 2026-08-05: „ja mach das Arbeitssignal." Vorlauf aus dem
Zeitbudget-Auftrag: Der Werkzeug-Pfad braucht rund 24 s bis zur fertigen
Antwort; das Budget fängt den Abbruch ab, macht die Wartezeit aber nicht
sichtbar.

## Zuerst geprüft: was existiert schon?
Vor dem Bauen nachgesehen — und es gab bereits eine vollständige Kette:
`toolLoop.js` (Control Server) sendet `smejj_schritt`, `chat-bridge-strom.js`
reicht sie durch, `chat-stream.js` rendert sie als wachsende Liste neben der
Antwort. **Neu bauen wäre doppelte Arbeit gewesen.**

## Die Messung, die die eigentliche Lücke zeigte
Echte Werkzeug-Frage im angemeldeten Browser („Was sind heute die wichtigsten
Schlagzeilen aus Berlin?"), Zeitpunkte ab dem Absenden:

| ms | Ereignis |
|---|---|
| 0 – 5750 | **nichts** — nur „smejj denkt nach …" |
| 5750 | Kopfzeilen + Schritt „Suche läuft: Berlin Schlagzeilen heute" |
| 6575 | „Suche fertig · 1 Treffer" |
| 8549 / 9388 | „Seite läuft / fertig: handelsblatt.com" |
| 12791 / 15033 | zweite Suche |
| 19061 | erster Antworttext |
| 28022 | fertig |

**Die Schritte arbeiten gut — sie beginnen nur spät.** Die Lücke sind die
ersten **5,75 Sekunden**, also genau der gemeldete blinde Fleck („man denkt,
es hat aufgehört, aber im Hintergrund arbeitet es weiter").

## Warum die Lösung im Klienten sitzt — und nicht im Server
Naheliegend wäre, den Server früher sprechen zu lassen. Beim Lesen fand sich
der Grund, es **nicht** zu tun:

- `chat-bridge.js:streamViaControl` schreibt `res.writeHead(200, …)` erst
  **nach** `await fetch(CONTROL_ORIGIN…)` — und füllt dabei
  `x-smejj-model-backend`, `x-smejj-model-id`, `x-smejj-model-fallback` aus
  genau dieser Antwort.
- `src/server.js` macht dasselbe eine Ebene tiefer: `res.writeHead` erst nach
  `await executeWithFallback(...)`, mit denselben Diagnosewerten.

Früher senden hieße, diese Kopfzeilen zu verlieren. Sie sind aber das Mittel,
mit dem sich hinterher belegen lässt, **welches Modell** geantwortet hat — im
Projekt mehrfach als Beweis genutzt. Der Klient dagegen weiß ab dem Absenden
Bescheid, kostet nichts und lässt die Streaming-Kette unberührt.

Zusatz: Die 5,75 s sind **echte Arbeit** (das Modell entscheidet, dass es
suchen muss), keine vermeidbare Verzögerung. Sie lässt sich sichtbar machen,
nicht wegoptimieren.

## Umsetzung (`public/ai/chat-stream.js`, frei von beiden Sperren)
`starteWartesignal(output, deps)` gibt eine Stopp-Funktion zurück:
- **erst nach 1200 ms Stille** — die Schnellspur antwortet in rund 850 ms, ein
  sofortiges Symbol würde bei jeder kurzen Frage aufblitzen
- zeigt „⏳ Anfrage laeuft" in derselben Schrittliste wie die Server-Schritte
- zählt die Sekunden mit, **`aria-hidden`**: Die Liste trägt `aria-live="polite"`
  — ein tickender Zähler würde sonst jede Sekunde vorgelesen und die Anzeige
  für Screenreader unbenutzbar machen
- alle Zeitgeber sind einspeisbar, damit Tests sie treiben statt zu warten

Vier Stopp-Stellen in `streamChatAnswer`: beide Fehlerpfade, das erste echte
Ereignis (Server übernimmt), das Stromende (falls gar kein Ereignis kommt).

## Tests (`tests/chat-schritte.test.mjs`, 19 → 25)
1. nach kurzer Stille erscheint das Lebenszeichen in der Schrittliste
2. der Sekundenzähler läuft — bleibt aber für Screenreader stumm
3. das Signal verschwindet restlos, sobald der Server sich meldet (inkl. Takt)
4. **eine schnelle Antwort sieht das Signal nie**
5. zweimal stoppen ist harmlos
6. ohne Antwort-Knoten passiert nichts

Der DOM-Nachbau des Projekts brauchte `remove()` und `getAttribute()` — ergänzt.
**Gegenbeweis: 6 rot** gegen `HEAD` davor.

## Auslieferung
1. `3790c16` — `assets/ai/chat-stream.js`. Erreichte nur **neue** Besucher.
2. `19ddfb9` — `sw.js` `CACHE_NAME` v224 → **v225**, damit Bestandsnutzer es
   bekommen. Start-Lock-Änderung, Freigabe im Wortlaut:
   > „sw.js von v224 auf v225 heben."

`sw.js` stand bei **exakt 800 Zeilen**. Statt eine fünfte Zeile anzuhängen, ist
die v224-Notiz mit der neuen zusammengefasst — beide betreffen denselben
langsamen Werkzeug-Pfad. Datei bleibt bei 800.

## Prüfungen
`tests/chat-schritte.test.mjs` 25/25 · `check:frontend` **390/390** ·
`check:precache-imports` OK (99 Module) · `guidelines` · `json` · `paths` ·
`security` · `security-lock` grün. **Start-Lock neu eingefroren**, 31 Dateien,
Backup `backups/start-design-lock/2026-08-05T19-21-09-069Z/`.

## Rollback
Frontend `3790c16` (vor dem sw-Sprung), App-Repo `a36dcc8`.

## Was bewusst offen bleibt
Das Signal macht die Wartezeit **sichtbar**, nicht kürzer. Die 5,75 s bis zur
ersten Werkzeugentscheidung und die rund 24 s Gesamtdauer bleiben. Wer sie
verkürzen will, muss am Modell oder an der Werkzeugstrategie ansetzen — das ist
eine andere Aufgabe.
