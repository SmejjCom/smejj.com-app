## 2026-07-28 — Training-Loop-Worker gebaut, Deploy BLOCKIERT (job_smejj_training_loop_20260728)
- Code fertig: workers/smejj-training-loop/ (Eval-Zyklus + Trainings-Warteschlangen-
  Zyklus, mehrstufig fail-closed, Checkpoint+Benchmarks auf IDrive e2, nie eigene
  Eignungs-/Einwilligungsentscheidung). 13/13 Tests gruen, check:guidelines und
  check:architecture gruen. Docker-Daemon lokal aus — Image-COPY-Satz stattdessen
  per Dateikopie simuliert, /health lief korrekt.
- NICHT deployt: FREE_ONLY_MASTER_POLICY.md deckt die Zeabur-Ausnahme NUR fuer den
  bestehenden Maus-Engine-Server ab ("jede Erweiterung... braucht erneut eine
  schriftliche Freigabe mit Dienst und Betrag"). Ausserdem fehlt lokal ein
  ZEABUR_API_TOKEN und eine Service-ID fuer einen neuen Dienst.
- NAECHSTER SCHRITT braucht den Betreiber: schriftliche Freigabe (Dienstname
  "smejj-training-loop", Kosten) + Dienst im Zeabur-Portal anlegen + Token/IDs
  liefern. Details: task-capsules/2026/07/job_smejj_training_loop_20260728/.
- ACHTUNG: Memory_Bank.md ist jetzt wirklich an der 800-Zeilen-Grenze — der
  naechste Eintrag MUSS vorher eine Aufteilung vornehmen (siehe Eintrag darueber).

## 2026-07-28 — Chat-Aktionen: Restpunkte endgueltig geschlossen (job_chat_aktionen_restpunkte_20260728)
- SCHEINBARER RUECKFALL WAR KEINER: lokaler Git-Stand wirkte kurz wie ein
  Rueckfall auf einen alten Commit. `git merge-base --is-ancestor` bestaetigte:
  alle fraglichen Commits sind Vorfahren von HEAD, nichts verloren — HEAD war
  nur durch Folgearbeit (Spurwahl-Fix, Kimi K3, Admin-Stufen, Maus-Panel)
  weitergewandert. LEHRE: bei Zweifel am Stand immer `merge-base --is-ancestor`
  statt `git log` allein, bevor man etwas fuer verloren haelt.
- Spurwahl-/Zeitbudget-Fix (job_spurwahl_zeitbudget_20260728) war zu Beginn
  dieser Capsule bereits live (sw v186) — hier nur nachgemessen: echter
  Klickpfad im Browser fragt "https://example.com", Schnellspur antwortet
  richtig ("Example Domain"), Quellenanzeige zeigt HTTP 200 und Zeitstempel.
  Alle Dateien SHA-256-identisch zum lokalen Stand.
- ZWEI RESTPUNKTE endgueltig als Entscheidung dokumentiert, nicht mehr als
  offen: Daumen-Bewertung bleibt dauerhaft lokal-only
  (docs/architecture/SMEJJ_1_0_TRAINING_DATA_POLICY.md, neuer Anhang);
  physisches Testgeraet durch echte pointer:coarse-Emulation mit Selbsttest
  ersetzt, alte "Open"-Liste in docs/testing/IOS_ANDROID_TEST_REPORT.md
  abgeschlossen. Beide Male: dokumentierte Grenze/Entscheidung statt TODO.
- control-server/src/admin/* war beim Pruefen dirty (opsDeploy/opsJobs/
  opsModelle/opsSpeicher/opsWorker) — aktive Arbeit einer PARALLELEN Session
  an einer Admin-Ops-Konsole, bewusst nicht angefasst.

## 2026-07-28 — Maus-Wiedergabe im Browser-Panel sichtbar (job_maus_sichtbarkeit_20260728)
- Freigabe "Maus-Sichtbarkeit" (Wof Kadavanich) fuer genau index.html +
  browser-pane.js umgesetzt: neuer #mausButton bettet die bestehende
  public/maus-replay.html direkt (nicht ueber den HTML-umschreibenden
  Server-Proxy) als Iframe im rechten Panel ein. Logik in neuer, ungesperrter
  Datei public/maus-panel.js (SRP) — browser-pane.js blieb bei 795/800 Zeilen
  (nur 8x `export` auf bestehende Bausteine, 0 Netto-Zeilen).
- Erste Live-Pruefung im echten Chrome deckte einen Folgefehler auf: neuer
  Knopf lag deckungsgleich auf #browserButton (`.browser-button` setzt
  `position:fixed; right:0` fest, ohne Ruecksicht auf Geschwister). Fix per
  Inline-`style="right: 36px"` in index.html (CSP erlaubt unsafe-inline
  styles) — keine CSS-Datei angefasst, noch innerhalb derselben Freigabe.
  Live per Bounding-Rect (`ueberlappt:false`) und echtem Klick-Test
  (Iframe auf /maus-replay.html bestaetigt geladen) verifiziert.
- Deploy: Live-Frontend chirurgisch auf dem jeweils aktuellen Live-Stand gepatcht
  (nicht blind ueberschrieben, andere Sessions hatten weiterdeployt) — 4519a3b, v183.
- Gelernt: Bildschirmfoto-Pixel und CSS-Pixel stimmen in diesem Chrome-Setup NICHT
  1:1 ueberein — Klicks per `element.click()` in javascript_exec ausloesen, nicht
  per rohen Screenshot-Koordinaten.
- Weiterhin offen, operator-only: IDrive-e2-Zugangsdaten-Abgleich zwischen
  Maus-Engine (Zeabur) und Control-Server (Salad) — ohne den bleibt die
  Wiedergabe fail-closed bei "Artefakt nicht ladbar" (erwartet).

## 2026-07-28 — Training-Loop-Dienst LIVE (job_smejj_training_loop_20260728)
Volltext: [docs/memory/Memory_Bank_2026-07-28_training_loop_dienst.md](docs/memory/Memory_Bank_2026-07-28_training_loop_dienst.md).
Kern: fuenfter Zeabur-Dienst auf dem BESTEHENDEN 6-$-Server (keine neue Kosten),
seit 2026-07-29 scharf im 6-h-Takt. Vier Deploy-Fallen, WURZEL war `.dockerignore`
(schloss `scripts` komplett und `workers/*` per Erlaubnisliste aus). FALLE:
Zeaburs "Restart" laedt die Umgebung NICHT neu — nur ein echter Neubau per
Commit-Webhook zieht neue Variablen.

## 2026-08-02 — "Verbindung unterbrochen": Klient behoben, Wurzel liegt bei GLM-Coding

Volltext: [docs/memory/Memory_Bank_2026-08-02_verbindung.md](docs/memory/Memory_Bank_2026-08-02_verbindung.md).
Kapsel task-capsules/2026/08/job_verbindung_unterbrochen_20260802/. Commits ffd7b4e, ab21d80.
- KLIENT (live sw v198): Zeitbudget haengt am MODELLNAMEN, die Spur an der FRAGE —
  8218 ms gegen 6500 ms. Letzter Versuch geduldig, `urls.length + 1` Versuche.
- WURZEL, verschraenkt gemessen (feste Rotation, sonst sieht ein schlechtes
  Zeitfenster wie ein schlechtes Modell aus): kimi-k2-7 6/6, smejj-fast-1 6/6,
  **glm-5.2 0/6, auto 0/6**; glm-5.2 normal 5/5, coding 1/5. Umstellung des
  Coding-Standards = Kosten = Rote Liste, dem Betreiber vorgelegt.
- MERKREGELN: ein gesundes /api/health widerlegt keinen gemessenen Ausfall; nach
  einem sw-Versionssprung erst NEU LADEN, dann messen.

## 2026-07-29 — Live-Bild der Maus: Kern gebaut, Deploy blockiert (job_maus_livebild_20260729)

Volltext: [docs/memory/Memory_Bank_2026-07-29_maus_livebild.md](docs/memory/Memory_Bank_2026-07-29_maus_livebild.md).
Kern: Chrome filmt sich per CDP selbst; JEDES Einzelbild braucht `Page.screencastFrameAck`,
sonst stellt Chrome den Strom nach wenigen Bildern ein. Uebertragung ueber EIN Objekt
`live/frame.jpg` statt WebSocket. 20 Tests gruen, NICHT live (ghcr.io-Abbild fehlt).
Details: task-capsules/2026/07/job_maus_livebild_20260729/.

## 2026-08-03 — Browser-Panel: Klick ins Schreibfeld schloss den Split-View (job_browser_panel_backdrop_20260803)
- ERLEDIGT, live (sw v207, Frontend ba76029): Im Split-View lag #sidebarBackdrop
  (panel-backdrop.js, inset 0, z 65) ueber dem linken Arbeitsbereich; JEDER Klick
  links traf es und sein Wegklick-Handler schloss das Panel (Beweis: elementFromPoint
  auf dem Schreibfeld = #sidebarBackdrop). FIX: browser-pane-backdrop.js (eigenes
  Modul) unterdrueckt das Backdrop bei body.browser-pane-open.
- NACHARBEIT (Freigabe "Ja", sw v207): (1) Wegklicken bei offenem Split-View UND
  offenem Menue schliesst nur noch das MENUE — reine Funktion backdropCloseTarget()
  in panel-backdrop.js; sonst weiter "alles zu" (Non-Regression 2026-07-18), Escape
  bewusst unveraendert. (2) Schliessen laeuft ueber app.js statt closePane()
  und liess body.browser-pane-open, .is-browser-mode, --right-panel-width stehen —
  der Waechter raeumt das jetzt ab. LIVE 5/5 (Chrome): Menue weggeklickt -> Panel
  blieb offen; Schreibfeld tippbar; Browser-Knopf liess die body-Klassen LEER;
  Escape schloss. TTFB 147 ms kalt, LCP 84 ms, CLS 0, 40 KB, 320/320, 0 Fehler.
- MERKREGEL: Unsichtbares Overlay -> elementFromPoint; und Zustand, den ZWEI Stellen setzen (app.js + browser-pane.js), driftet, sobald nur ein Weg aufraeumt.

## 2026-08-03 — Chat: Kontext, Deutsch, klickbare Links (job_chat_qualitaet_links_20260803)
- ERLEDIGT, live belegt (Bridge v111, Frontend eb101c9, sw v206): Salad primär
  (Zeabur-v104 warf History weg), Schnellspur 8B→llama-3.3-70b (gemessen, Free-Tier),
  chat-markdown rendert http(s)-Links (escape-first, noopener, 2 XSS-Tests).
- Beweise: „Privat konto?" mit Verlauf korrekt; Klick öffnete bankofamerica.com;
  Header x-smejj-model-backend groq:llama-3.3-70b-versatile.
- MERKREGEL: chat-markdown.js trägt absichtlich NUL-Bytes (BLOCK-Spoofing-Schutz)
  — git meldet „Bin", grep braucht -a. Details: task-capsules/2026/08/….

## 2026-08-03 — Verlauf konnte lautlos sterben (job_verlauf_selbstheilung_20260803)
- BEHOBEN + bewiesen, committet `7e1cab4`, aber NOCH NICHT LIVE. `chat-store.js:
  openDb` oeffnete mit fester Version 1: fehlt der Objektspeicher `chats`
  (Abbruch waehrend onupgradeneeded, Speicher-Raeumung, Quota), feuert
  `onupgradeneeded` NIE wieder, jede Transaktion wirft NotFoundError — und da
  alle Aufrufer fail-safe abfangen, speichert der Chat in diesem Browser fuer
  immer nichts mehr, ohne jeden Hinweis. Fix: OHNE feste Version oeffnen (eine
  feste 1 scheitert nach der Heilung dauerhaft mit VersionError!), fehlenden
  Speicher eine Version hoeher anlegen, `dbPromise` nach Fehlern zuruecksetzen.
  `tests/chat-store-selbstheilung.test.mjs` 5/5 gruen, Gegenbeweis 4/5 rot.
- DATENSCHUTZ GEMESSEN: Chat-Verlauf liegt AUSSCHLIESSLICH lokal in `smejj-chats`.
  Training-Capture fail-closed aus, Bridge/agentRoutes schreiben keinen Chatinhalt
  weg — nichts auf IDrive e2; unterwegs nur fluechtig (Groq-Whisper, `history`).
- MERKREGEL (teuer): `git status` LOG hier — sauber gemeldet, nach
  `git update-index --really-refresh` 16 fremde Aenderungen einer laufenden
  Parallel-Sitzung. VOR Commit/Deploy refresh erzwingen, sonst stellt ein Deploy
  fremde Halbfertigware live. Deshalb bewusst KEIN Deploy, KEIN sw-Sprung.

## 2026-08-04 — Gespraechsgedaechtnis war an DREI Stellen kaputt (job_gedaechtnis_dreifach_20260804)

Commit `c518e44`, Frontend `3c18f58`, live als `smejj-shell-v208` und Bridge
`20260804-v112-verlauf-reserve-anschlussfrage`. Freigabe: schriftlicher
Betreiber-Auftrag vom 2026-08-04 (vollstaendig autonome Umsetzung).

- **DER WARTETEXT WAR EINE NACHRICHT.** `app.js` legt vor dem Absenden den
  Antwort-Knoten an; der zeigt "smejj denkt nach...". `collectConversationHistory`
  las ihn als `.entry.assistant` mit — jede Anfrage trug eine erfundene Antwort
  als JUENGSTE Nachricht, plus die aktuelle Frage doppelt (einmal im Verlauf,
  einmal als `task`, das der Server ohnehin anhaengt). MERKREGEL: **ein
  Platzhalter im DOM ist fuer jeden Leser echter Inhalt** — dieselbe Falle wie
  am 2026-08-02 in der Sprachwelle, nur an der anderen Naht.
- **DIE RESERVE HING NICHT AM TOKEN, SONDERN AN DER ROUTE.** Der Reserve-Server
  steht seit 2026-07-29 auf v104 (Deploy braucht `ZEABUR_API_TOKEN`, den nur der
  Betreiber anlegen darf) und kennt `history` in `/api/agent` nicht. Live an
  derselben Konversation gemessen: `/api/agent` + `history` verliert den Kontext
  ("Die Bank of America ist eine der groessten Banken in den USA"), `/api/chat` +
  `messages` haelt ihn ("bietet AUCH ... Optionen fuer die Eroeffnung eines
  Kontos") — 0,41 s bis zum ersten Byte, weiter auf der Schnellspur. MERKREGEL:
  **ein eingefrorener Dienst hat oft eine zweite Tuer** — bevor man auf ein
  fehlendes Geheimnis wartet, prueft man die anderen Routen desselben Servers.
  `fetch-retry.js` nimmt dafuer jetzt `{ url, body }` je Endpunkt.
- **DER SPRACH-MODUS HATTE NIE EIN GEDAECHTNIS.** `buildAgentPayload` baute nur
  `{ task, model, files, preferences }` — kein `history`. Der getippte Chat war
  am 2026-08-02 repariert worden, der gesprochene nicht, weil beide ihre Anfrage
  getrennt bauen. NEU: `public/voice-conversation.js` (pruefbar ohne Browser).
- **PROJEKTWISSEN FINDET JETZT ANSCHLUSSFRAGEN.** "Und wie sichere ich das ab?"
  erreicht allein 7,65 Punkte (Schwelle 20) und bekam nie Kontext, obwohl das
  Thema davor mit 22,51 gedeckt war. Gesucht wird GETRENNT: erst die Frage, nur
  bei leerem Ergebnis das Thema davor. MERKREGEL: **eine zusammengesetzte
  Suchanfrage ist nicht zurechenbar** — gemessen (5 Paare) ist ihre Punktzahl
  genau das Maximum der Einzelanfragen, sobald die Haelften verschiedene
  Dokumente treffen (10,66/4,62 -> 10,66); es entscheidet also die Haelfte mit
  mehr Wortdeckung, nicht das Thema. Ungedeckte Themen bleiben ohne Kontext.
- MERKREGEL (Parallel-Sitzung, bestaetigt): eine zweite Sitzung hatte den
  Pflicht-Check rot hinterlassen (das `file:`-Schema mit Schraegstrichen in
  einer Kapsel — genau diese Zeichenfolge sucht `check:paths` —, ein
  Scratchpad-Pfad in `.claude/launch.json`) und app.js/sw.js halb geaendert.
  **Vor dem Deploy den LIVE-Stand gegen die Arbeitskopie halten** — hier zeigte
  sich, dass ihr sw v207 bereits ausgeliefert war, die Arbeitskopie also nicht
  Halbfertigware, sondern der nachhinkende Stand des App-Repos war.
- OFFEN: `ZEABUR_API_TOKEN` bringt die Reserve auf Gleichstand (dann auch dort
  70B + Projektwissen). Der angemeldete Browser-Durchlauf braucht den Betreiber —
  eine Sitzung darf sich nicht anmelden.

