# Memory_Bank.md — Verifiziertes Gedaechtnis von smejj.com
Nur verifizierte, erfolgreiche Loesungen und Architekturentscheidungen. Kein Eintrag ohne bestandene Verification Pipeline. Fehlgeschlagene Builds und Halluzinationen werden niemals aufgenommen.
## Eintragsformat
Jeder Eintrag nennt Datum, Typ, Capsule, Entscheidung, Begruendung und Verifikation.
---
## Architekturentscheidungen

### [2026-08-24] FEHLER-FAENGER NR. 50 KOMPLETT — BROWSER-HAKEN LIVE (job_fehler_faenger_browser_haken_20260824)

Capsule: `task-capsules/2026/08/job_fehler_faenger_browser_haken_20260824/capsule.md`.
Live belegt: `assets/fehler-faenger.js` auf smejj.com (SHA-256-gleich, sw v688),
Start-Lebenszeichen + Testfehler in der Betreiber-Sitzung je 200, Ampel Nr. 50
gruen mit neuem Wortlaut; Tagesmappe-OFFENE_PUNKTE live auf 1 Eintrag gekuerzt.

- **Entscheidung:** Der Browser-Haken ist ein eigenes markenloses Modul
  (`public/fehler-faenger.js`, KEIN `?v=`) — frische Staende kommen ueber den
  sw-Precache, damit die Start-Lock-Datei index.html fuer Haken-Updates nie
  wieder angefasst werden muss. Nur Angemeldete melden (Anmelde-Signal wie
  auth-gate.js, fail-closed; Sitzungscookie per `credentials:"include"`),
  max. 8 Meldungen je Seitenlauf, Dedupe mit der Server-Signatur-Regel.
- **Begruendung:** Unsichtbarer Senden-Pfeil, nie geladenes Modul, tote
  Stopp-Taste — Browserfehler brauchen eine Zahl. Und die Ampel kann jetzt
  "keine Fehler" von "niemand kann melden" unterscheiden (Start-Meldung).
- **Verifikation:** 27/27 Autopiloten-Tests + Test-Waechter auf Arbeits- und
  Bauzweig; Start-Lock mit Betreiber-Freigabe als eigener Commit neu
  gestempelt; Klickpfad-Beweis live (POST 200 fuer Start und Testfehler).

### [2026-08-24] 60 AUTOPILOTEN — SCHUTZ-, SICHERHEITS- UND WACHSTUMS-BLOCK NR. 44-60 (job_autopiloten_44_60_20260824)

Capsule: `task-capsules/2026/08/job_autopiloten_44_60_20260824/capsule.md`.
Live belegt: Ampel 59 gruen / 0 rot / 1 bewusst stillgelegt (Nr. 05); alle 17
neuen messen echte Werte (Geheimnis-Scan 341 Dateien, TLS 4 Domains, Sicherung
mit Ruecklese + SHA-256, Last-Probe p95 162/194 ms, Tagesmappe ohne stumme Quellen).

- **Entscheidung:** Die Luecken aus dem 135-Piloten-Vergleich werden als 17
  eigene Autopiloten im Taktgeber betrieben (schutzUndWachstumLaeufe.js),
  Registry-Teile 3+4, Bereichs-Zuordnung, `GET /api/admin/ops/tagesmappe`
  und `POST /api/fehler`. Jeder Lauf: Selbsttest (kaputte UND gesunde Probe),
  dann echte Messung — kein heartbeat ohne Eintrag in MIT_ECHTER_MESSUNG.
- **Begruendung:** Betreiber-Ziel „100 % ohne mich, 10 Minuten Freigaben am
  Tag": Schutz (Rueckroll-Empfehlung, Log-, Sicherungs-, Geheimnis-,
  Zertifikats-Wache), Nutzersicherheit (Fehler-Faenger, Missbrauchs-,
  Konto-Wache, Inhalts-Schutz, Abhaengigkeits-Wache), Kosten/Last, Wachstum
  (SEO, Willkommen, Experimente) und die Tagesmappe als Ein-Blick-Cockpit.
- **Verifikation:** 22 TUEV-Tests + Anschluss-Beweis; Zaehl-Waechter 49/50/52;
  drei Live-Deploys mit Ampel-Messung per local-e2e-Token; zwei Live-Befunde
  des ersten Durchgangs behoben (Repo OHNE package-lock/Container OHNE
  Fremdpakete = Gruen-Fall; Probe-Schluessel des Git-Bots traegt Entwarnungs-Wort).

### [2026-08-18] CONTROL-RESERVE RUFT DEN VIDEO-WORKER (job_videospur_anschluss_20260818)

Capsule: `task-capsules/2026/08/job_videospur_anschluss_20260818/capsule.md`.
Benchmark: `docs/benchmarks/webvitals_v583_videospur_2026-08-18.json`.
Live belegt: `POST /api/chat` -> Kopf `x-smejj-model-backend: video-worker:weg-c`,
Lebenszeichen alle 10 s, nach 135 s `data:video/mp4` mit Erzaehlstimme.

- **Entscheidung:** Die Videospur der Control-Reserve ruft denselben
  `smejj-video-worker` wie die Bruecke (`POST /erzeuge`, 429-Geduld, 180 s),
  statt einen zweiten Renderweg zu unterhalten. `engine` steuert den
  Hinweistext (`extern:*` ohne Kamerafahrt-Satz). Neues Modul
  `control-server/src/routes/videoChatRoutes.js` (244 Zeilen), Einbau in
  `handleChat` fail-safe (`false` = kein Byte gesendet, Text laeuft normal).
- **Begruendung:** Ein zweiter Renderweg haette den 2C/8GB-Control belastet,
  den freigegebenen Weg-C-Stack ungenutzt gelassen und zwei Personenschutz-
  Implementierungen erzeugt. Der Worker faellt intern selbst zurueck — ein
  eigener Rueckfall waere doppelte Logik.
- **Merkregel 1 (Router-Kurzaufrufe):** ohne `thinking: {type:"disabled"}` und
  `reasoningEffort: "low"` streamt der Router erst `reasoning_content`;
  sichtbarer Text kommt nie vor der Frist, die Antwort bleibt leer.
- **Merkregel 2 (Zeabur-Endpunkt):** nach einem Worker-Redeploy kann der
  interne Dienstname ins Leere routen (ClusterIP tot), waehrend die Pod-IP
  antwortet und der Prozess kerngesund ist. Erst Pod-direkt gegen DNS-Weg
  messen, dann den Code verdaechtigen.
- **Merkregel 3 (Auslieferung):** eine Frontend-Politur wurde von einem
  spaeteren fremden Commit ueberschrieben — nach dem Deploy die LIVE-Datei
  gegenpruefen, nicht nur den eigenen Commit.
- **Verifikation:** 22/22 Tests (7 neue + 15 bestehende Video-e2e, keine
  Regression), `check:json` und `check:task-capsules` gruen, `check:cost` OK,
  Live-Klickpfad auf der Produktionsdomain inkl. Personenschutz-Gegenproben.
- **Offen (nicht Teil dieser Aufgabe):** `engine` war `parallax:*` — der
  extern-Pfad (LTX) ist im Worker noch nicht aktiv; Startseiten-Gewicht
  556 KB gegen Budget 300 KB (Ursache: fremde Deploys zwischen sw v537 und
  v583); `public/ai/chat-stream.js` hinkt der ausgelieferten Fassung um rund
  170 Zeilen hinterher.
### [2026-08-15] EINE WAHRHEIT FUER "IST DIE KI NUTZBAR?" (job_chat_rueckfall_ampel_20260815)

Capsule: `task-capsules/2026/08/job_chat_rueckfall_ampel_20260815/capsule.md`.
Commits: `0ff9886` (Chat-Fix), `f591cf2` (Kosten-Waechter), `f8fd83f`
(Code-Sicherung), `9dcf2ca` (Qualitaets-Messlauf stillgelegt).

**Entscheidung:** Die Frage "ist serverseitige AI nutzbar?" wird an GENAU EINER
Stelle beantwortet — `resolveServerAiGate()` in `aiAvailability.js`. Ampel
(`/api/health`) und Chat (`streamLLM`) lesen dieselbe Funktion.

**Begruendung:** Beide entschieden es vorher getrennt. Die Ampel kannte den
BYOK-Pfad (Zhipu und Kimi fuehren ihr Guthaben beim Anbieter, das Server-Gate
zaehlt dort nicht), `streamLLM` prueffte nur `SMEJJ_SERVER_AI_ENABLED === "true"`.
Fiel diese eine Variable weg, antwortete der Chat auf JEDE Frage mit dem
Rueckfall-Text, waehrend `/api/health` `"ai": true, "zhipu:glm-5.2"` meldete.
**Der Rueckfall-Text sieht aus wie eine hoefliche Antwort — deshalb blieb der
Totalausfall einen Tag unsichtbar.** Kein Test schlug an, weil keiner die
Kopplung von Ampel und Chat prueffte.

**Verifikation:** 15/15 in `tests/ai-availability.test.mjs`, darunter der
Waechter mit beiden Proben (gesund: Ampel gruen => Chat darf NICHT in den
Rueckfall; kaputt: ohne Anbieter bleibt der Rueckfall). Waechter-TUEV bestanden:
gegen den nachgebauten alten Stand faellt er rot. Zusaetzlich 34/34 in
`model-router` und `local-assistant`, `check:architecture` 0 Fehler. Live nach
Deploy: `/api/chat` streamt echtes glm-5.2; die Betreiberfrage nach Wohnungen in
der Bay Area kam mit echten Objekten und Quellen zurueck (Backend
`zhipu:glm-5.2`, 8 s).

**Folgebefunde, beide behoben:**
- Der Zeabur-Dienst `smejj-autopilot-jobs` **existiert nicht mehr**. Daran hingen
  Qualitaets-Pruefer (01) und Code-Sicherung (02) — seit 13.08. gab es keinen
  Codeberg-Spiegel. Die Code-Sicherung laeuft jetzt als GitHub Action (kostenfrei,
  das Repo ist oeffentlich). Offen: Secret `CODEBERG_TOKEN` (nur der Betreiber).
- Der Kosten-Waechter entschied "privates Repo" aus einer **festen Namensliste
  mit einem Eintrag** und blockierte damit einen Workflow, der nichts kostet. Er
  misst die Sichtbarkeit jetzt bei GitHub, fail-closed in jeder anderen Richtung.
  Waechter-TUEV: `tests/github-kostenfrei.test.mjs`, 5/5 ohne Netz lauffaehig.

**Benchmark 2026-08-15:** Startseite 81 KB gzip ohne Bilder (Budget 300 KB) —
erfuellt. Latenzwerte von diesem Anschluss **nicht belastbar** und daher NICHT
als Budgetverletzung gewertet: smejj.com 1,9 s TTFB, aber `github.com` 4,6 s und
`example.com` 3,8 s von derselben Leitung. Offen: Web-Vitals-Messpunkt ausserhalb.

**Merksatz fuer den Betrieb:** Antwortet der Chat mit "Verstanden. Ich kann
daraus eine konkrete Aufgabe machen…", ist das keine Antwort, sondern die
Meldung "kein Modell erreichbar".

### [2026-08-11] DAUERHAFTER GOOGLE-LOGIN & SLIDING TOKEN RENEWAL (job_google_login_permanent_20260811)

Capsule: `task-capsules/2026/08/job_google_login_permanent_20260811/capsule.md`.
Freigabe Betreiber 2026-08-11: "einmal eingeloggt soll fuer immer eingeloggt bleiben mit Google Login".
Live: `smejj-shell-v276` auf `https://smejj.com`.
- **Dauerhafter Google-Login:** 10 Jahre TTL (`PERMANENT_TTL_MS`) fuer Google- und Dauer-Sitzungen in `sessionToken.js`, `googleAuthRoutes.js` und `server.js`.
- **Gleitende Verlaengerung (Sliding Token Renewal):** `auth-gate.js` und `auth-page.js` uebernehmen frische Tokens von `/api/auth/me` automatisch in `localStorage`.
- **Schutz vor Auto-Logout:** `auth-gate.js` wirft Google-/Dauer-Sitzungen niemals eigenmaechtig heraus. `google-login.js` speichert `accessToken` direkt beim Login.
- **Verifikation:** 1904 Tests bestanden (`npm test`, `check:all`), `check:guidelines` gruen, Live-Deployment auf GitHub Pages erfolgreich verifiziert (TTFB 127-155ms).

### [2026-08-01] PROJEKTWISSEN IM PROMPT: +7,9 PUNKTE — ABER NUR ALS AUSNAHME (job_rag_projektwissen_20260801)

Volltext: [docs/memory/Memory_Bank_2026-08-01_rag_projektwissen.md](docs/memory/Memory_Bank_2026-08-01_rag_projektwissen.md).
Bauart: [docs/architecture/RAG_PROJEKTWISSEN.md](docs/architecture/RAG_PROJEKTWISSEN.md). Rollback `rollback/rag-schritt2-vorher` auf `e29e47f`.
Live, 14 Faelle je 3 Ziehungen ueber die Schnellspur: ohne Kontext **88,2 % ± 5,0**;
Kontext ab Punktzahl 8 **86,0 % ± 3,6** (nichts gewonnen, 48/48 Aufrufe mit Kontext);
Kontext erst ab 20 **96,1 % ± 3,1** bei nur 16/48. Merkregeln: **kein Kontext ist besser
als falscher Kontext** — bei niedriger Schwelle brachen genau die Faelle ein, die
Projektwissen nicht beantworten kann; eine **BM25-Punktzahl ist kein Relevanzsignal**
(gedeckt 9,3–30,0 gegen ungedeckt 10,2–25,8, die Bereiche ueberlappen), senken erst mit
Einbettungen. Zwei Fehler freigelegt: Korpus bei 200 von 223 Dateien STILL abgeschnitten,
und er enthielt den ANTWORTSCHLUESSEL der eigenen Pruefung — beides behoben, Waechter in
`check:rag`. **NICHT LIVE:** der echte Chat laeuft ueber die Bridge (Schnellspur), Umbau
blockiert durch 800-Zeilen-Grenze, Ein-Datei-Deploy und fehlendes Index-Artefakt.

### [2026-08-02] SPRACHWELLE 3a LIVE — die geteilte Naht schlaegt die Sperre (job_sprachwelle_stufe3a_20260802)

Volltext: [docs/memory/Memory_Bank_2026-08-02_sprachwelle3a.md](docs/memory/Memory_Bank_2026-08-02_sprachwelle3a.md).
Commit `7226116`, Frontend `32f352f`, live als `smejj-shell-v195`.

- **DIE GETEILTE NAHT SCHLAEGT DIE SPERRE.** `composer-tools.js` steht unter
  Start-Lock, importiert aber dieselben Sprach-Module wie die freien Sprachseiten.
  Verbesserung in `voice-endpoint.js` + `voice-speech-queue.js` wirkt ohne ein
  gesperrtes Byte. **Vor einer Freigabe-Anfrage erst suchen, wo gesperrte und
  freie Seite sich treffen.**
- **Semantisches Sprech-Ende** (`idleFor`): Satzzeichen 420 ms, Bindewort 1500 ms,
  kurzer Anfang 1500 ms, sonst 850 ms. Rueckwaertskompatibel gebaut — deshalb war
  die Startseite spaeter mit DREI Zeilen nachruestbar.
- **Denk-Laut** bei Antwort ueber 700 ms: spricht die Statuszeile (14 Sprachen).
  Laeuft durch DIESELBE Warteschlange wie die Antwort (`sayAhead`) — sonst redet
  sie hinein und der Echo-Filter haelt den Lautsprecher fuer den Nutzer.
- **Zweimal vom eigenen Waechter gefangen:** doppelte Modul-Kennung und fehlender
  SHELL-Eintrag — beide Male vor dem Livegang.
- **Das Repo ist NICHT die Live-Wahrheit:** `sw.js` hing ACHT Versionen zurueck.
  Deploys immer auf Live-Basis bauen (frischer Klon). Am 2026-08-02 angeglichen
  und die Startseite freigegeben — beides live als `smejj-shell-v196`.

### [2026-08-01] EIGENES MODELL EXISTIERT UND LAEUFT (job_eigenes_modell_live_20260801)

Volltext: [docs/memory/Memory_Bank_2026-08-01_eigenes_modell.md](docs/memory/Memory_Bank_2026-08-01_eigenes_modell.md).
Commits `c7fc4b4`, `87ab3e0`, `a3d8541`, `b970fcf`.

- **Gemessen, 5 Ziehungen je Fall:** Schnellspur 82,1 % ± 3,1. Eigenes Modell
  **Qwen3-8B (5,14 GB) 92,9 % ± 2,3** — besser, schneller (Median 659 ms) und
  44 % kleiner als das zuerst gewaehlte Qwen3-14B (87,6 %, 974 ms).
  **Das kleinere Modell war das bessere.**
- **Live belegt:** `x-smejj-model-backend: salad:smejj-fast-1`; ohne `model` weiter
  `zhipu:glm-5.2`, Nutzer-Bruecke unberuehrt. Dauerbetrieb seit 2026-08-01 auf
  Anordnung (gegen zweimalige Empfehlung), 158-216 USD/Monat.
- **DIE PRUEFUNGSNOTE SAGT DAS ECHTE VERHALTEN NICHT VORHER:** bei echten Fragen
  verliert das eigene Modell klar gegen GLM-5.2 (antwortet auf "GitHub Actions
  erlaubt?" faelschlich "Ja", waehrend genau dieser Fall in der Suite 5/5 besteht).
  Grund: jeder Suite-Fall liefert die Projektkenntnis im System-Prompt mit, ein
  echter Nutzer nicht. **Nicht die Modellgroesse ist die Antwort, sondern das
  Projektwissen** (Parallelsitzung `a69b198`: 88,2 -> 96,1 %).
- **DIE STARTSONDE IST DIE HAERTERE GRENZE ALS DIE GRAFIKKARTE.** llama.cpp laedt
  die Gewichte beim Start; das laeuft gegen Salads `startup_probe`, Maximum hart
  60 min. Ein 17,7-GB-Abbild wurde darin zweimal nicht fertig. Salad meldet dabei
  RUNNING, 1/1 Replica — nur `ready` bleibt false.
- **GPU-Pool ist Verfuegbarkeit:** mit 4 erlaubten Klassen fand Salad 35 Minuten
  keinen Rechner, mit 7 binnen 7 Minuten. 50er-Serie draussen (CUDA 12.8 ungeprueft).
- **ZWEI SITZUNGEN AN EINER CONTAINER GROUP:** eine fremde Aenderung LOESCHTE die
  `startup_probe`; der erste 8B-Lauf fiel hinein (14/14 `http_503`, 7,1 % — keine
  Modellnote, ein toter Endpunkt). **Container-Version vor UND nach jedem Messlauf
  protokollieren.** Salad-PATCH ohne `merge-patch+json` loescht Sonden.
- **Eigenes Lager ist nicht selbst hostbar:** GLM-5.2 und Kimi K2.7 brauchen
  80-GB-Karten, der Salad-Katalog endet bei 32 GB.

### [2026-07-31] MAUS: SITZUNG BLEIBT STEHEN, ZWEITER ADAPTER AN DERSELBEN NAHT (job_maus_eigener_browser_20260731)

Volltext: [docs/memory/Memory_Bank_2026-07-31_maus_sitzung.md](docs/memory/Memory_Bank_2026-07-31_maus_sitzung.md).
HEAD vor der Aenderung `e603802`. **Noch nicht ausgerollt** (siehe unten).

- **Zustandslos bleibt moeglich, wenn man trennt:** der Browser lebt im Prozess,
  aber die WAHRHEIT ueber eine Sitzung liegt als Lease auf IDrive e2. Fremd
  gehalten => 409; abgelaufener Lease = frei (Selbstheilung nach Scale-to-zero).
  Gemessen: zwei Auftraege, 1 Browserstart statt 2, Auftrag 2 in 0,0 s statt 3,3 s.
- **Kein zweiter Sitzungs-Motor:** Muster uebernommen, nicht der Code.
  `executedActions` gehoert zum Auftrag; exit-after-run darf nicht feuern, solange
  eine Sitzung lebt. **Nie `--remote-debugging-port`** — der Port kennt keine
  Herkunftspruefung. NICHT LIVE: Teil 0 (Token + Eimer) offen, Rote Liste.

### [2026-07-30] MODUL W: TAGESPROJEKTION STATT ZAEHLSTAND IM SPEICHER (job_analytik_projektion_20260730)

Volltext: [docs/memory/Memory_Bank_2026-07-29_modulw.md](docs/memory/Memory_Bank_2026-07-29_modulw.md).
Commits `fcabd1b`, `5d568ef`, `e4ce5dc`, Control-Server **Version 124**.

- **Ein Zwischenspeicher im Arbeitsspeicher loest nichts, was mit der Instanzzahl
  waechst.** Der 60-s-Cache wirkte nur je Instanz — bei 50 Instanzen 50 kalte
  Aufrufe pro Minute. Jetzt EIN abgeleitetes Objekt `admin/index/analytik-tage.json`
  auf IDrive e2, plus 20-s-Lesedurchgriff (merkt die ANTWORT eines GET, nicht eine
  eigene Rechnung).
- **WICHTIGSTE MESS-LEHRE: die Grundlast reisst das Budget selbst.** `/api/health`
  zeigt von aussen p95 492 ms — das 300-ms-Budget ist von dort nicht pruefbar.
  Aussagekraeftig ist der EIGENANTEIL gegen einen Endpunkt ohne Speicherzugriff
  auf demselben Host: v123 +79 ms, **v124 -5 ms**.
- Gescheiterte Quelle wird als gescheitert GESPEICHERT (nie als 0). FALLE: ein
  prozessweiter Zwischenspeicher braucht in Tests einen Ausschalter.

### Ausgelagert: tiefe Spur, Modul-Kennungen, Codeblock-Kopieren (2026-07-29)

Volltext: [docs/memory/Memory_Bank_2026-07-29_tiefe_spur.md](docs/memory/Memory_Bank_2026-07-29_tiefe_spur.md).

### [2026-07-29] WEBSUCHE: ZWEI WEICHEN, EINE WAHRHEIT (job_websuche_selbstkorrektur_20260729)

Commits `c476fd6`..`677dc53`, Control-Server **Version 118**, Bridge **v104**.
Volltext/Messwerte: `docs/task-capsules/2026/07/job_websuche_selbstkorrektur_20260729/CAPSULE.md`.

- **Befund:** "Schlagzeile" loeste keine Suche aus, "Schlagzeilen" schon;
  Umlaut-Ausloeser waren transliteriert notiert und trafen nie. **Fix:
  Normalisierung + Wortstaemme statt Vollformen.**
- **DIE WICHTIGSTE ERKENNTNIS: es gibt ZWEI Such-Weichen.** Die in
  `public/chat-bridge.js` entscheidet Schnellspur **oder** Control-Server. Sagt
  sie nein, erreicht die Frage den Control-Server **nie** — ein Fix nur dort ist
  wirkungslos (live belegt: `x-smejj-bridge: chat-fast-lane`). Das korrigiert
  `job_toolcalling_20260728` ("Bridge muss gar nicht angefasst werden").
  `tests/websuche-absicht-gleichlauf.test.mjs` haelt beide Seiten jetzt gleich.
- **BRIDGE-DEPLOY BRAUCHT KEINEN ZEABUR-TOKEN.** Startbefehl ist ein `curl` auf
  `smejj-app-frontend/main/assets/chat-bridge.js`: dorthin pushen (HTTPS, nicht
  SSH), dann Portal-Restart. Fallen: raw.githubusercontent cacht ~5 Min (aus dem
  Container pruefen); Seitenleisten-Klick traf die Maus-Engine (Namen lesen).
- **FALLE Salad-API:** PATCH braucht `{container:{environment_variables:…}}`;
  flach gesendet: **200 und nichts geaendert** (stiller No-Op). Zurueklesen.
- **ZWEI FOLGEFEHLER, erst im Live-Test sichtbar:** (a) Gesperrte Suchmaschinen
  liefern nicht nichts, sondern **Themenfremdes**; weil `length > 0` galt, ging
  das als Live-Kontext ans Modell → `resultsLookRelevant()`. (b)
  `streamWithTools` holte die Schlussantwort der letzten Runde, streamte sie
  aber nie. **Ein Test, der nur auf [DONE] prueft, prueft nicht das Ergebnis.**
- **OFFEN (echter Blocker):** DuckDuckGo (HTTP 202 `anomaly`) und Bing
  (Bot-Pruefung) sperren die Server-IP — Antworten ehrlich, aber ohne Recherche.
  Empfehlung: **eigener SearXNG-Dienst auf dem bezahlten Zeabur-Server** (0 USD
  zusaetzlich, `SMEJJ_SEARXNG_URL` existiert; Freigabe noetig wie beim Umzug).

### [2026-07-29] CONTROL-SERVER AUF ZEABUR + MAUS-URSACHEN (job_maus_token_zeabur_20260729)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-29_maus_token_zeabur.md](docs/memory/Memory_Bank_2026-07-29_maus_token_zeabur.md).
Commits `6c322d2`, `a77febc`, `9bfd907`. Kurzfassung:

- **Control-Server laeuft auf Zeabur** (`smejj-control`, "Running 1/1",
  0,00 USD zusaetzlich, Freigabe als Ausnahme 2 in der Kostenpolitik).
  Beleg im Container: `HEALTH ok= true app= smejj.com Code`.
  Dienstname MUSS `smejj-control` heissen, sonst greift das Dockerfile nicht;
  die Build-Plan-Vorschau zeigt trotzdem weiter zbpack — das taeuscht.
- **Die Maus-Engine ist intakt** (echter Lauf, 4 Schritte, Artefakte
  zurueckgelesen). Es fehlen nur zwei Werte beim Betreiber: gleicher
  `SMEJJ_MAUS_ENGINE_TOKEN` auf beiden Seiten, und der Artefakt-Eimer.
- **"Verschiedene Konten" war eine Fehldiagnose** — es sind verschiedene
  EIMER (Engine schreibt `smejj-model-files`, Control liest `smejj-app`).
  Ein Fingerabdruck-Unterschied heisst "nicht gleich", nicht "anderes Konto".
- **Fehlermeldung entluegt:** HTTP-Status wird geprueft, Infrastruktur-
  Abbrueche sind mit `infra:true` MARKIERT statt geraten.
- **Ein `git push` baut ALLE Dienste am Branch neu**; die Kopfzeile im Portal
  hinkt nach. Bereitstellung und Protokoll lesen, nicht die Kopfzeile.
- Werkzeug: `node scripts/diagnose/maus-abgleich.mjs` (nur lesend, zeigt nie
  einen Geheimwert).
- **Frontend halb umgestellt (Start-Lock-Freigabe 2026-07-29).** Bewusst in
  zwei Haelften: CSP `connect-src` ist live (sw v191, additiv, ohne Wirkung),
  `config.js` bleibt auf Salad. Ein Dreh an `DEFAULT_API_ORIGIN` HAETTE DIE APP
  SOFORT GETOETET, weil der Zeabur-Dienst noch keine Zugangsdaten hat — eine
  Freigabe zu haben heisst nicht, dass der Moment richtig ist.
- Testweg ohne Risiko: `config.js` kennt die Uebersteuerung
  `localStorage["smejj.apiOrigin.v1"]`. Damit laesst sich der neue Server im
  eigenen Browser durchtesten; genau dafuer muss die CSP vorher stimmen.
- OFFEN: Env-Werte im Zeabur-Dienst, danach `config.js` drehen.

### [2026-07-29] MAUS-KETTE BEWIESEN — beide Ursachen gemessen (job_maus_kette_beweisen_20260729)

Task Capsule: `docs/task-capsules/2026/07/job_maus_kette_beweisen_20260729/CAPSULE.md`
(auch auf e2 unter `capsules/app/job_maus_kette_beweisen_20260729/`).
Aus zwei Vermutungen sind zwei Beweise geworden; behoben ist nichts, weil beides
Zugangsdaten sind (Rote Liste, Betreiber).

- **Die Engine ist vollstaendig gesund — gemessen, nicht vermutet.** Direktlauf
  ohne Control-Server: Plan `selbsttest-smejj-com-v1`, **30 von 30 Schritten**,
  0 Fehler, **7 Objekte / 6 Screenshots** auf e2, **9,2 s**, 0 Modellaufrufe.
- **Blocker Token bewiesen:** Gegenprobe mit BEIDEN Werten am echten `/run` —
  lokaler Token HTTP 422 (akzeptiert), Token des Control-Servers HTTP **401**.
  Vorher war das ein Rueckschluss aus zwei Fingerabdruecken; ein Rueckschluss
  ist kein Beweis. Lauf ueber die App: `error:"nicht_autorisiert"`,
  `plannerCalls:0` — kein Modell wurde ueberhaupt gefragt.
- **Blocker Eimer bewiesen:** Engine schreibt `smejj-model-files`, Control liest
  `smejj-app`; derselbe Schluessel ueber `/api/storage/presign` → **404**, die
  Wiedergabe meldet "Artefakt nicht ladbar". `403` heisst anderes Konto, `404`
  heisst gleiches Konto ohne Objekt — die zwei nie vermischen.
- **Ein fehlerfreier Lauf kann unsichtbar sein.** Das ist die Signatur dieses
  Fehlers: nicht der Lauf ist falsch, sondern die Adresse.
- **Werkzeug ohne Test ist selbst eine Fehlerquelle.** Mein erster Direktlauf
  meldete "0 Beweise", weil ich `entries` statt `objects` las (Manifest-Feld in
  `artifact-uploader.mjs`). Deutung liegt jetzt in `scripts/diagnose/maus-befund.mjs`
  und unter Test (`tests/maus-diagnose-befund.test.mjs`, 10 Tests).
- Neu: `scripts/diagnose/maus-direktlauf.mjs` trennt "Engine kaputt" von
  "Absender falsch" in einem Befehl. `maus-abgleich.mjs` endet jetzt mit einer
  praezisen Handlungsanweisung; Abnahme ist Exit-Code 0.
- **Der Eingriff ist halb so gross wie gedacht — ZWEI Werte, nur einer geheim.**
  `gatekeeper/presignIdrive.js` (`resolveBucketForKey`) lenkt **nur** den Prefix
  `capsules/maus-engine/` auf `IDRIVE_E2_CAPSULES_BUCKET`; alles andere bleibt
  bei `IDRIVE_E2_BUCKET`. Also: Control-Server auf `smejj-model-files` zeigen
  lassen statt drei Geheimwerte zur Engine zu tragen. Dass der Control-Server
  diesen Eimer lesen KANN, ist bewiesen, ohne ihn zu testen: er laedt sein
  eigenes Release-Artefakt daraus (`IDRIVE_E2_DEPLOY_BUCKET`) mit denselben
  Schluesseln — er laeuft, also hat er Zugang. Und Task Capsules liegen dort
  schon (`upload_capsule_to_idrive.mjs`, `BUCKET_DEFAULT`).
  **Merke: vor jeder Anweisung an den Betreiber pruefen, ob die Codebasis den
  Schalter schon hat.** Der billigere Weg lag die ganze Zeit im Repo.
  Falle bei der Suche: `grep` ohne `gatekeeper/` uebersieht ihn — dort steckt
  die Presign-Logik, nicht in `control-server/`.
- **Salad flattert:** 2 von 4 `/api/health` fielen aus, danach 4 von 4 mit
  136-316 ms. Kein CORS-Fehler (A/B geprueft). Argument fuer den Zeabur-Umzug.
- Nicht begonnen: Chrome-Adapter. Ein zweiter Browser-Weg auf einer Basis, die
  sich nicht anmelden kann, verdoppelt nur die Fehlersuche.

### Ausgelagert: Adminbereich Stufe 3-8, Modul V und W, Kontingent-Waechter (2026-07-28/29)

Volltext, wortgleich: [docs/memory/Memory_Bank_2026-07-29_adminbereich_stufe3_bis_8.md](docs/memory/Memory_Bank_2026-07-29_adminbereich_stufe3_bis_8.md).
Enthaelt: Modul W (alle 26 Buchstaben), Modul V (E-Mail-Zustellung), Stufe 8
(Produkt), Kontingent-Waechter IDrive e2, Stufe 7 (Geld), Stufe 6 (Sicherheit),
Stufe 5 (Betrieb sichtbar), Stufe 4 (Moderation/DSGVO/Ankuendigungen/Flags) und
Stufe 3 (schreibend, Vier-Augen fuers Loeschen, Impersonation nur mit Einwilligung).

### Ausgelagert: Kimi K3 (2026-07-28)

Volltext: [docs/memory/Memory_Bank_2026-07-28_kimi_k3.md](docs/memory/Memory_Bank_2026-07-28_kimi_k3.md).

### [2026-07-28] EU AI ACT NACHGEWIESEN + ADMINBEREICH STUFE 2 LIVE (job_aiact_adminstufe2_20260728)

Volltext wegen der 800-Zeilen-Regel ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_aiact_adminstufe2.md](docs/memory/Memory_Bank_2026-07-28_aiact_adminstufe2.md).
Commit `c450fbf`, Control-Server **Version 94**, Konsole unter `/admin`. Merkregeln:
Admin-Oberflaeche liegt im Control-Server (kein Frontend-Deploy, kein Start-Lock-Risiko);
HTML-Routen gehoeren NICHT in `requiresAuthenticatedControlAccess`; Lesezugriffe auf
Nutzerakten sind protokollpflichtig; Artefakt IMMER aus einem isolierten Worktree des
eigenen Commits bauen, nie aus dem Hauptbaum.

### [2026-07-28] Hilfeseite ausgelagert

Volltext in [docs/memory/MEMORY_ARCHIV_2026-07-I.md](docs/memory/MEMORY_ARCHIV_2026-07-I.md).
Kern: Hilfetexte wurden gegen den QUELLTEXT geprueft, nicht gegen die
Erinnerung — mehrere beschriebene Schritte gab es so gar nicht.

### [2026-07-28] Adminbereich Stufe 1 ausgelagert

Volltext in [docs/memory/Memory_Bank_2026-07-28_adminstufe1.md](docs/memory/Memory_Bank_2026-07-28_adminstufe1.md).
Kern: Rollenmodell, Audit-Kette und Nutzer-Index — das Fundament, auf dem
alle spaeteren Stufen stehen. Rein lesend, fail-closed.

### [2026-07-28] Statusseite ausgelagert

Volltext in [docs/memory/MEMORY_ARCHIV_2026-07-H.md](docs/memory/MEMORY_ARCHIV_2026-07-H.md).
Kern: `/status.html` fragt die drei Dienste direkt aus dem Browser ab, ohne
Status-Server. FALLE: Gelten Header-CSP und Meta-CSP zugleich, zaehlt die
SCHNITTMENGE — `connect-src 'self'` im Header blockierte alle Abfragen.

### [2026-07-28] QA-Restpunkte ausgelagert

Volltext in [docs/memory/MEMORY_ARCHIV_2026-07-J.md](docs/memory/MEMORY_ARCHIV_2026-07-J.md).
Kern: Service-Worker cache-first, CSP, Offline, Zoom, Salad-Kosten und die
geschlossene Konto-Enumeration — alle sechs mit Live-Nachweis.

### Ausgelagerte Eintraege 2026-07-27/28 (wortgleich, nichts geloescht)

Am 2026-07-29 zu einem Block zusammengefasst (800-Zeilen-Regel). Alle Verweise gelten unveraendert.

- Rechtstexte EN, job_rechtstexte_en_20260728 → [docs/memory/Memory_Bank_rechtstexte_en_2026-07-28.md](docs/memory/Memory_Bank_rechtstexte_en_2026-07-28.md)
- "QA-WELLEN 1-3 VOLLSTAENDIG BEHOBEN", job_qa_wellen_1_3_20260728 → [docs/memory/Memory_Bank_2026-07-28_qa_wellen.md](docs/memory/Memory_Bank_2026-07-28_qa_wellen.md)
- Salad-Abloesung (sw v145/v146, Zeabur traegt Chat und Stimme) → [docs/memory/Memory_Bank_2026-07-27.md](docs/memory/Memory_Bank_2026-07-27.md)
- Eintraege vom 2026-07-26 (Premium-Stimme auf Zeabur, Merge-Grenze, iMild-PR, Maus-Pruefbericht und -Selbsttests, Stufe C, Zeabur-Server, Sprachwelle 1e/2a, Stufe A+B) → `docs/memory/MEMORY_ARCHIV_2026-07-F.md`
- Sieben Eintraege vom 2026-07-21 (Magic-Link live, Auth-Extra-Deploy, Konto und Einstellungen im Codex-Stil, Auth-Redesign, Repo-Reparatur, Browser-Button) → [docs/memory/Memory_Bank_2026-07-21.md](docs/memory/Memory_Bank_2026-07-21.md)
- Fuenf Tages-Eintraege vom 2026-07-27 (Startseite antwortet im Faden, Seiteninhalt im Modellkontext, Web-Vitals-Messwerkzeug, Startseite Ladezeit, letzte Startaufrufe) → [docs/memory/Memory_Bank_2026-07-27.md](docs/memory/Memory_Bank_2026-07-27.md)

Wird hier wieder Platz knapp, wandert der naechstaeltere Block nach demselben Muster ins Archiv.

### [2026-07-28] Precache-Vollstaendigkeits-Eintrag ausgelagert

Der Eintrag "Precache vollstaendig, kein Aufruf im Ladepfad
(job_letzte_reste_20260728)" steht wortgleich in
[docs/memory/Memory_Bank_2026-07-28_letzte_reste.md](docs/memory/Memory_Bank_2026-07-28_letzte_reste.md).
Ausgelagert wegen der 800-Zeilen-Regel. Nichts geloescht.

> Aeltere Eintraege (bis 2026-07-16) stehen in `docs/memory/Memory_Bank_Archiv_2026-07-16.md`.
> Eintraege 2026-07-28 bis 2026-08-05 stehen wortgleich in `docs/memory/Memory_Bank_Archiv_2026-08-05.md`.

## 2026-08-23 — Autopiloten-Seite: Grau ist zweierlei (job_autopiloten_seite_20260823)

- LIVE bewiesen: smejj.com/admin/autopiloten/ zeigt "3 melden sich nicht" (Qualitäts-Prüfer,
  Code-Sicherung, Betriebswache) im Register "Braucht dich" statt "Kein Alarm" über "Still 4".
  Betriebswache = Nr. 42 (40 war doppelt), Akten 01/02/05 ohne den nicht existierenden
  Dienst smejj-autopilot-jobs, Vorfälle tragen den aktuellen Kurznamen.
- WURZEL der Stille: Control-Server antwortet auf jeden Herzschlag mit 503 autopilot_keys_missing
  (SMEJJ_AUTOPILOT_KEYS fehlt in Zeabur). Nachziehen: CONFIRM_AUTOPILOT_KEYS=YES
  node scripts/deploy/autopilot_schluessel_setzen.mjs, danach control-neu-bauen.mjs.
- Admin-Lock um opsAutopiloten.js, opsAutopilotenListe*.js und views-stage9.js erweitert
  (Betreiber-Wortlaut 2026-08-23 "100 % Schutz aktivieren").
- Capsule: docs/task-capsules/2026/08/job_autopiloten_seite_20260823/capsule.md
- NACHTRAG 2026-08-23: Autopiloten-Seite nach dem Design-Vorschlag (26.6.26) umgebaut — Tabelle nach
  Bereichen (opsAutopilotenBereiche.js), Detail mit Knöpfen zuerst; Optik der Konsole behalten (eckig,
  groß, eine Farbe). Falle: kachelBlock/kopfBlock escapen selbst — nie HTML übergeben. Nach jedem
  Control-Neustart fehlen 30 min die Einzelläufe: „Ohne Einzellauf" ist kein Befund.

## 2026-08-23 — Seite „Was ist wirklich live?" (job_auslieferung_seite_20260823)
- Modul AL live: smejj.com/admin/auslieferung/ — Live-Stand gegen Bau-Stand je Dienst, Sperren im Abbild.
- Zeabur liefert `ZEABUR_GIT_COMMIT_SHA` in die Umgebung — der Control-Server kennt seinen Commit.
- BEFUND: Sicherheits-Lock meldet `public/chat-bridge.js` als verändert (seit 15.08. nicht neu eingefroren).

## 2026-08-23 — Seite „Sicherheit" (job_sicherheit_seite_20260823)
- Seite L zeigt Endpunkte (31/57 zu), Sperren 4/4, Vier-Augen, Zugänge gesetzt/fehlt mit Nachweis — aus Messung.
- FALLE: Frontend-Push 0c84b93 einer Parallelsitzung setzte 37 Konsolen-Dateien zurück. Vor jedem Konsolen-Push
  `sync_admin_console_pages.mjs` aus dem Bau-Branch-HEAD laufen lassen, nie aus einem alten Worktree.

## 2026-08-23 — Seite „Nutzer" (job_nutzer_seite_20260823)
- Seite B: »bezahlt als« als eigene Spalte, Abos ohne Konto oben (live: plus-Abo bezahlt als 7shahnazaryan@gmail.com, kein Konto).
- userIndex traegt jetzt lastSeenAt (erst nach Neubau); Verbrauch je authenticatedUserId seit Neustart.

## 2026-08-23 — Seite „Abos & Umsatz" (job_umsatz_seite_20260823)
- Seite E: MRR bei Stripe gemessen (Fallback geschätzt, beschriftet), Aufladungen (API), Kosten fest + Modelle seit Neustart, je Plan, Absprünge, Zahlungsweg. Punkte/Marge je Plan + Absprung-Gründe = nicht erfasst.

## 2026-08-23 — Cockpit „Überblick" (job_ueberblick_cockpit_20260823)
- Startseite /admin/: vier gemessene Zahlen, Dienste mit letztem echten Lauf, Protokoll, Vier-Augen. Antwortzeit = Gesundheitsabfragen, nicht Chat-TTFT.
- Damit sind alle 6 Seiten des Design-Vorschlags (26.6.26) umgesetzt: Überblick, Autopiloten (Liste+Detail), Nutzer, Abos & Umsatz, Sicherheit, Auslieferung.

## 2026-08-23 — Seite „Regeln" (job_regeln_seite_20260823)
- /admin/regeln/: sieben Regeln aus echten Vorfällen mit Datum + Wächter-Link. Damit sind alle 8 Bildschirme des Vorschlags umgesetzt.

## 2026-08-23 — Seite A „Übersicht" aufgelöst
- Nav ohne A; /admin/uebersicht/ leitet still aufs Cockpit (AUFGELOEST in console.js). Alarm-Lage (security.alarm aus 50 Audit-Einträgen) lebt jetzt im Cockpit. views.uebersicht + zeigeUebersicht entfernt, Tests nach opsCockpit.test.js.

- 2026-08-23: Kopfzeilen-Pillen „Index —/Kette —" nur noch sichtbar, wenn eine Seite einen Wert liefert (hidden + [hidden]{display:none!important}).

## 2026-08-23 — Abo auf Konto umhaengen (Fehler „1 bezahltes Abo passt zu keinem Konto")
- Neue Kontoaktion `user.billing.relink` (billing/aboUmhaengen.js): zweiter Ref-Datensatz fuer die Konto-Adresse, Kunde zeigt auf sie, `refVorher` bleibt, `paidEmail` unveraendert. Knopf auf der Nutzerseite bei „Abos ohne Konto". Step-up + Audit wie alle Kontoaktionen.

## 2026-08-23 — Abo umgehaengt (ERLEDIGT)
- cus_V4GGvjGpI1hmUh haengt jetzt an smejjcom@gmail.com (Notweg abo_umhaengen_lokal.mjs, vom Betreiber ausgefuehrt). Live: Stripe-Kundenkonto Plan plus/aktiv, Warnung weg.
- Nachbesserung: Stripe-Adresse auch fuer zugeordnete Abos ohne paidEmail holen (Spalte „bezahlt als" statt „unbekannt").

## 2026-08-23 — 100 % SCHUTZ AKTIVIERT (Betreiber: „Alles ist fertig — zum Schluss 100 % Schutz aktivieren")
- Tag `stand-2026-08-23-adminbereich-v2` in App-Repo (55944322, Bau-Branch) und Frontend-Repo (706ca65).
- Admin-Lock 49 Dateien (ganzer Adminbereich), Abo-Lock 9, Favicon-Lock, Sicherheits-Lock 11, Start-Lock 32, Deploy-Lock, Einwilligungs-Lock — alle gruen. Keine Aenderung ohne schriftliche Freigabe.

## 2026-08-23 — 100 % SCHUTZ (v3) nach „Ein Autopilot im Detail"
- Tag `stand-2026-08-23-adminbereich-v3` in beiden Repos. Admin-Lock 49, Abo 9, Favicon, Sicherheit 11, Start 32, Deploy, Einwilligung — alle gruen.
