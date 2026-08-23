# Task Capsule — job_antigravity_ui_20260823

**Ziel:** Antigravity (Googles Coding-IDE) als Vorbild: Stopp-Knopf in Logo-Farbe, viereckig; Denk-Zeile, Schrittgruppen, Frage-Karte — Verhalten 1:1, Optik eigen (eckig, #02fdfd).

**Betreiber-Freigaben (23.08.):** Stopp-Knopf in Mint bauen → Live bringen → Senden-Knopf auch viereckig → Geist-Knöpfe und Chips eckig → Denk-Zeile → Schrittgruppen → Frage-Karte. Jeder Schritt live gemessen.

## Ergebnis (alles live auf smejj.com)
| Baustein | App-Commit | Frontend | Beleg |
|---|---|---|---|
| Stopp-Quadrat #02fdfd im Senden-Knopf (chat-stopp v8) | 0033e247 | 75a5d5f, sw v664 | Klick → smejj:chat-stoppen 1, Sprachmodus 0, Radius 0 px |
| Senden-Knopf eckig | e6839ba4 | e5e5734, v665 | Ruhe/getippt/Stopp je 0 px |
| Geist-Knöpfe, Nachdenken-Pille, Chips eckig | 26b044fc | c2101de, v666 | 4 Knöpfe + 8 Chips 0 px |
| Denk-Zeile „Dachte N s ›" (reasoning_content raus aus der Antwort); Schrittliste raus aus dem Verlauf | 28a041ed | 28ce730, v668 | DETAILS, Titel „Dachte 2 s", Verlauf ohne Denk-Text |
| Schrittgruppen mit Live-Zähler | 1f8b4d24 | 53d41ce, v669 | „🔍 Suche … 1 von 2" → „2 Suchen ✓", Endfalte zu |
| Frage-Karte (smejj_frage): Optionen, Empfehlung, Überspringen, beantwortet | 5a6518f3 | bb3451f/cb08ef6, v671 | Klick sendet Option, Verlauf „Rückfrage: … Optionen: …" |
| Server: Werkzeug frage_stellen beendet den Lauf | Bauzweig 712e1b90 | Control gestartetAm 13:57:28Z | tool-loop.test 26/26, chat-schritte 49/49 |

## Abschluss (23.08., 14:35Z) — LIVE BEWIESEN, echter Klickpfad im eingeloggten Chrome
1. `SMEJJ_AGENT_TOOLS_ENABLED` fehlte im Zeabur-Env von smejj-control (51 Variablen, in keinem der 8 Dienste). Mit schriftlicher Betreiber-Freigabe („Freigabe: ich setze sie selbst") additiv per `createEnvironmentVariable` angelegt (52 Variablen, nichts ersetzt), Control neu gebaut (gestartetAm 14:24:57Z).
2. Zweiter Fund: die Bridge-Erlaubnisliste (chat-bridge-strom.js) warf `smejj_frage` fort — `frageDurchreichen` ergänzt, Bündel 20260823-v141-frage-karte (App 6a2fb482, Frontend 45a30d2), Bridge per restartService neu gestartet, /health zeigt v141.
3. Klickpfad: Frage → Karte „In welcher Stadt …?" mit Düsseldorf (Empfehlung)/Leipzig/Hannover/Köln/Überspringen, 44-px-Knöpfe, 0 px Radius → Mausklick „Leipzig" → Nutzernachricht „Leipzig" → Schrittgruppen „🔍 3 Suchen ✓", „📄 3 Seiten gelesen ✓" → Tabelle mit drei Leipziger Angeboten. Karte: `Gewählt: Leipzig`, Knöpfe aus.
4. Grenze: die Bridge-Schnellspur (fastTask = weder Coding noch suchwürdig) erreicht den Control-Server nicht — dort keine Werkzeuge, also keine Karte. Für suchwürdige und Coding-Aufgaben greift sie.
5. Benchmark (Chrome, laufende Sitzung): TTFB 4 ms, LCP 56 ms, domInteractive 18 ms (Service-Worker-Vorrat); CLS 0,224 über die ganze Chat-Sitzung mit Streaming gesammelt — kein sauberer Seitenlade-Wert, beim nächsten Lauf frisch messen.

## Nachtrag 14:50Z — Karte auch auf der Bridge-Schnellspur (Bridge v142, App d06a645b, Frontend 0d1b36a)
Groq-Schnellspur bekommt das eine Werkzeug `frage_stellen` (tools + tool_choice auto); `pipeVisibleStream` sammelt die tool_calls-Bruchstücke und schickt am Ende die Karte. Live-Klickpfad: „Absage schreiben, frag nach dem Ton" → Karte nach 5 s (Sehr förmlich (Empfehlung) / Freundlich, aber professionell / Locker) → Klick → Nutzernachricht → fertige Absage. Tests 52/52.
Nebenbefund im Screenshot: das rechte Vorschau-Panel drückte die Chatmitte auf ~140 px (bekanntes Muster „Panel frisst die Mitte", nicht Teil dieses Auftrags).

## Offen
- Ausgabe je Schritt / Zeilenbereiche (Server liefert sie nicht), „@"-Erwähnung, Stärke-Stufe im Start-Bereich.
- `src/server.js` 808 Zeilen (Parallelsitzung), roter Test precache-dynamische-importe (api-konto-surface, Parallelsitzung).

## Fallen (für die Memory_Bank)
- composer-sendetaste.js schluckt Klicks am Knopf (capture) — Stopp-Abfang muss ans Dokument.
- `/assets/ai/chat-stream.js` wird ohne ?v-Marke importiert: nach Deploy bis 10 min alte Fassung.
- Frontend-Klon: index.html/sw.js nie kopieren (Marken, Precache-Liste weichen ab), nur eigene Zeilen setzen; assets/sw.js hinkte zweimal hinterher.
- Parallelsitzungen vergaben v667, v670, v672 — Cache-Nummer immer max+1 aus `git log -p sw.js`.
- HTMLCollection hat kein .filter — der Test-DOM-Stub (Array) verschleiert das.
- Bauzweig-Worktree im Scratchpad: `cd` dorthin bleibt in der Shell hängen — Frontend-Edits landeten einmal im falschen Baum (zurückgesetzt).
