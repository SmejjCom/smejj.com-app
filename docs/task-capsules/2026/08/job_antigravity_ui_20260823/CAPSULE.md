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

## Nachtrag 14:55Z — „Panel frisst die Mitte", zweite Ursache (App 451f28ad, Frontend 8e4c075, sw v675)
Der Fix vom 22.08. (paneBreiteAus) griff nur beim Öffnen per openPane(). Beim Wiederherstellen der gemerkten Breite (`smejj.ui.rightPanelWidth.v9`, hier 520) und beim Ziehen rechnete panel-layout.js mit centerMin 120 — dem Chat blieben bei 828 px Fenster 140 px. Jetzt `maxPanelBreite(side, {fenster, mitteLinks})`: rechts Fenster − Spur − 380, nie unter 188, nie über 520. Live: Panel 520 → 252 px, Chat 380 px (Screenshot). Test tests/panel-layout-breite.test.mjs (kaputte + gesunde Probe).

## Nachtrag 15:05Z — „@"-Erwähnung live (App ad6c0db1, Frontend ef5ebc9, sw v676)
`erwaehnung.js`: „@" am Wortanfang im Startfeld öffnet die Liste der eigenen Chats (Titel-Filter, max. 8, viereckig, 44-px-Zeilen); Auswahl schreibt „@Titel " und legt einen unsichtbaren Kontextknoten (`data-smejj-erwaehnung`, KEIN .entry → wird nicht gesichert) ins Protokoll, den `collectConversationHistory` als Nutzernachricht mitschickt — wirkt auf Bridge, Schnellspur und Control gleich. Live im eingeloggten Chrome: „Fasse mir @Büro" → 6 Treffer → Klick → Frage → das Modell fasste den erwähnten Chat korrekt zusammen. Tests 4/4.
Stärke-Stufe: gab es schon — Modellwahl zeigt „smejj 1.0 (Schnell/Gründlich)" wie Antigravitys „(High)", plus Nachdenken-Pille; nichts zu bauen.
Vorsicht beim Commit: die Parallelsitzung hatte `"/assets/shared/auth-me-speicher.js"` unversioniert in sw.js eingetragen (Datei nicht committet) — im Frontend-Deploy bewusst weggelassen (addAll wäre live gescheitert); im App-Commit ad6c0db1 steht die Zeile, weil der Arbeitsbaum wegen fremder Merge-Konflikte (codeberg_spiegel_sync.sh, motor.py) keinen Korrektur-Commit zuließ.

## Nachtrag 15:40Z — Betreiber: „kommt nicht" → zwei echte Ursachen, beide behoben
1. **Browser-Modell schluckte die Rückfrage:** In Chrome beantwortet Gemini Nano (Stufe 0, lokal) geeignete Fragen ohne Server — 14 Antworten heute. „Plane mir einen Wochenendtrip" → lokale Fragenliste als Text, nie eine Karte. Fix `istRueckfrage()` in lokalesModell.js: Antworten mit ≥2 Fragezeichen oder „brauche ich … Infos" gehen an den Server (Grund `rueckfrage-an-server` im Protokoll). sw v679, App 566bcc83, Frontend d3e2ca8.
2. **Schnellspur rief das Werkzeug nicht:** Regel „RUECKFRAGEN: … rufe frage_stellen, nie als Fragenliste im Text" in den Systemblock der Bridge (v143, App dc483af0, Frontend 595823e).
3. „@"-Menü ragte über den oberen Rand: max-height min(320px, 100vh−360px).
Live (echte Tastatur, eingeloggtes Chrome): „Plane mir einen Wochenendtrip" → Karte nach 4 s „Wohin möchtest du …?" (Städtetrip Europa (Empfehlung) / Natur & Berge / Strand & Meer / Überrasche mich). „@" per Tastatur → Liste mit 8 Chats.

## Nachtrag 24.08. — Code-Bereich: „Ich frage was und kommt nichts" (App 45414193, Frontend 194341e, sw v685)
Ursache: code-flaeche.js sendet über einen programmatischen Klick auf #startSend, nachdem der Vorlauf beide Vierecke auf „an" gestellt hat; der Stopp-Fang schluckte den Klick (Feld geleert, Quadrat an, nichts geschickt — genau der Betreiber-Screenshot). Fix in chat-stopp.js: Klick mit Text im Feld ist immer Senden, nur der Klick bei leerem Feld stoppt. Chrome-Test danach: Code 3 Fragen (391, Bash, PowerShell), Chat 3 Fragen (Wolga, drei Sätze, Restaurant → Frage-Karte Wien/Berlin/Zürich), keine JS-Fehler. Nebenbefund ENTKRÄFTET (24.08., Codewort-Probe BLAUWAL): der Test hatte auf einen nicht existierenden Knopf geklickt ([data-dock-action=new-chat] gibt es am Start nicht). Der echte Spur-Punkt „Neu"/„Neuer Chat" trennt sauber: Log leer, neuer Chat kennt das Codewort nicht.

## Nachtrag 24.08. (2) — „sende icon sieht man nicht mehr" (App 449317d4, Frontend 9a60ca4, sw v686)
Der Beleuchtungs-Block vom 18.08. färbte den Pfeil bei Text dunkel (für die damals helle Fläche); nach dem Transparent-Umbau war er in Chat und Code unsichtbar. Fix: helles Zeichen, Hover Logo-Cyan. Live bewiesen (computed color + Screenshot + echte Antwort „alles gut" im eingeloggten Chrome). Die „Verbindung unterbrochen"-Meldungen des Betreibers fielen in ein Bridge-Neustart-Fenster (restartService, 30–60 s); Senden läuft wieder. Start-Lock neu gestempelt.

## Nachtrag 24.08. (3) — EIN Modell-Menue, zentral (App 16b220e9, Frontend 6c7d05e, sw v687)
Betreiber-Befund: nach Browser-Aktualisieren zeigte der Start-Knopf das alte statische Menü. Ursache: die Verdrahtung wohnte im NACHGELADENEN code-flaeche.js. Lösung: modell-menue-start.js lädt immer mit der Seite, verdrahtet zentral (Capture, Wachhund data-modell-zentral), altes Menü bleibt zu. Live bewiesen: frisches Laden → „Auto/smejj 1.0/Opus 5/…", zweimal in Folge, Code-Bereich identisch. Tests 3/3; start-lock + modell-menue-lock neu gestempelt.

## Offen
- Ausgabe je Schritt / Zeilenbereiche (Server liefert sie nicht).
- `src/server.js` 808 Zeilen (Parallelsitzung), roter Test precache-dynamische-importe (api-konto-surface, Parallelsitzung).

## Fallen (für die Memory_Bank)
- composer-sendetaste.js schluckt Klicks am Knopf (capture) — Stopp-Abfang muss ans Dokument.
- `/assets/ai/chat-stream.js` wird ohne ?v-Marke importiert: nach Deploy bis 10 min alte Fassung.
- Frontend-Klon: index.html/sw.js nie kopieren (Marken, Precache-Liste weichen ab), nur eigene Zeilen setzen; assets/sw.js hinkte zweimal hinterher.
- Parallelsitzungen vergaben v667, v670, v672 — Cache-Nummer immer max+1 aus `git log -p sw.js`.
- HTMLCollection hat kein .filter — der Test-DOM-Stub (Array) verschleiert das.
- Bauzweig-Worktree im Scratchpad: `cd` dorthin bleibt in der Shell hängen — Frontend-Edits landeten einmal im falschen Baum (zurückgesetzt).
