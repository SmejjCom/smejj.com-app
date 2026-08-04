# Memory_Bank.md — Verifiziertes Gedaechtnis von smejj.com
Nur verifizierte, erfolgreiche Loesungen und Architekturentscheidungen. Kein Eintrag ohne bestandene Verification Pipeline. Fehlgeschlagene Builds und Halluzinationen werden niemals aufgenommen.
## Eintragsformat
Jeder Eintrag nennt Datum, Typ, Capsule, Entscheidung, Begruendung und Verifikation.
---
## Architekturentscheidungen

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

### [2026-07-29] TIEFE SPUR: DREI SPERREN, ZWEI BEHOBEN (job_tiefe_spur_routing_20260729)

Volltext + Benchmarks: `task-capsules/2026/07/job_tiefe_spur_routing_20260729/`.
- **ZWEI Dienste, nicht einer:** `smejj-chat-bridge` ist nicht `src/server.js` —
  fest `groq:llama-3.1-8b-instant`, kein `/api/health` (404).
- **Tiefe Spur NICHT angeschlossen:** `glm-5-2` = `fallback-only` — ins Leere.
- **Behoben:** `handleChat` rief `streamLLM` ohne `profile` → alles lief auf
  `default`, Coding-Modelle unerreichbar.
- **Behoben, gefaehrlichster Fund:** Denken zaehlt gegen dasselbe Token-Budget wie
  die Antwort — `max_tokens 600` + Denken an = 600 Token verbraucht, content LEER.
  Ein brauchbares Modell waere als Totalausfall gemessen worden. Jetzt
  `THINKING_MIN_TOKEN_BUDGET`; Suite unangetastet.
- **Kosten beantwortet:** `glm-4.7-flash` ist gratis. **Diese Datei ist am
  800-Zeilen-Limit: neue Eintraege nach `docs/memory/` auslagern.**

### [2026-07-29] EIN MODUL, EINE KENNUNG — plus Waechter (job_module_kennungen_20260729)

Live smejj.com, **sw v193** (Frontend `7136de5`, App-Repo `5531619`). Volltext:
`docs/task-capsules/2026/07/job_module_kennungen_20260729/CAPSULE.md`.
- **Beim Nachmessen des Seitengewichts gefunden:** `voice-speech-queue.js` wurde
  ZWEIMAL geladen (zwei Kennungen) — doppeltes Gewicht und zwei Modulinstanzen mit
  getrenntem Zustand. Daher `check:module-queries`.
- **Zweiter Fund in HTML:** `public/de/index.html` lud `voice-landing.js` unter
  `?v=voice-send-20260721` — sechs Aenderungen alt, waehrend die 14 anderen
  Sprachseiten die aktuelle nutzten. Deutsche Seite lief live auf altem Stand.
- **DRITTER Fall derselben Ursache nach sw v184/v185, deshalb ein Waechter:**
  `scripts/check-module-queries.mjs` (in `check:all`, 7 Tests). Er liest auch
  `<script src>`-Tags (der zweite Fund steckte in HTML) und zaehlt `./x.js`,
  `/assets/x.js`, `../x.js` als EIN Modul — daran scheiterte die Handpruefung.
- **Gewicht geprueft, Lazy-Load begruendet VERWORFEN:** 284/300 KB. Weitere
  ~22 KB liegen in settings-surface/account-privacy/autonomous-coding, die beim
  Start unsichtbar mitladen — aber `bindSettings()`/`bindProfile()` in app.js
  greifen beim Boot auf Elemente zu, die erst deren `init()` rendert (boot
  braeche ab), und autonomous-coding.js registriert beim Init
  `smejj:autonomous-request` und `message` (Magic-Link-Handoff). Erst app.js
  loesen, dann verzoegern.

### [2026-07-29] CODEBLOCK MIT EINEM KLICK KOPIEREN (job_chat_code_copy_20260729)

Live smejj.com, **sw v192** (Frontend `4697269`, App-Repo `5af5738`). Volltext:
[docs/memory/Memory_Bank_2026-07-29_chat_code_copy.md](docs/memory/Memory_Bank_2026-07-29_chat_code_copy.md).
- **REGEL: kein Textknoten in einem Bedienelement INNERHALB einer Nachricht** —
  `chat-store.js` speichert `entry.textContent`, daraus baut
  `chat-history-context.js` den Modellkontext. Beschriftung aus CSS `::after`.
- Nur per Browsertest gefunden: Touch-Ziel 31x23 statt 42 px (`min-height: 0`
  hebelt die Projektregel aus), 17 px Ueberlappung durch hoehere Spezifitaet
  von `.entry.assistant .chat-code`.
- **Deploy auf LIVE-Basis:** live v191, Repo v186 — lokale `sw.js` hochladen
  haette fuenf Fremdversionen zurueckgerollt. Erstbesuch-Gewicht 288/300 KB.

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

### [2026-07-28] KIMI K3 LIVE — reines API-Modell, bewusst OHNE e2-Vault (job_kimi_k3_api_20260728)

Freigabe: "oK, baue Kimi K3 mit API ein" + "Komplett live schalten"
(Wof Kadavanich, 2026-07-28). Commits `1f00d50`, `ac409eb`, `bc1159f`.
Live als smejj-control Version 98, Artefakt
`deployments/control/smejj-control-k3-effort-2026-07-28.tar.gz`
(sha `62bdc2dc…`), Rueckweg `smejj-control-stufe2-2026-07-28.tar.gz`.
Kapsel: `docs/task-capsules/2026/07/job_kimi_k3_api_20260728/CAPSULE.md`.

- GEGEN DEN REFLEX "GEWICHTE IN DEN VAULT". K2.7 und GLM-5.2 liegen als
  Gewichte in IDrive e2. Fuer K3 waere das Geldverbrennen: 2,8 T Parameter,
  ~594 GB bis 1,4 TB, laeuft weder auf einer GPU noch auf einem 8-GPU-Knoten.
  e2 ist Speicher, kein Rechner. Darum `storage: null` und nur API.
- DAS ERBE STATT DES ZWEITEN KEYS. K2.7 und K3 liegen auf demselben
  Moonshot-Konto, und `SMEJJ_LLM_KIMI_API_KEY` war live bereits gesetzt.
  Neu: `runtime.keyFallbackEnvPrefix` — ohne eigenen K3-Key erbt K3 den
  K2.7-Key. Einseitig (ein K3-Key konfiguriert K2.7 nicht), eigener Key hat
  Vorrang. Wirkung: die Aktivierung schrumpfte auf EIN Flag, und niemand
  musste ein Secret ein zweites Mal von Hand eintippen.
- FAIL-CLOSED BLEIBT. Ohne `SMEJJ_KIMI_K3_ENABLED=YES` ist K3 auch mit
  gueltigem geerbtem Key inaktiv; der Router nimmt GLM-5.2. Auto-Modus waehlt
  K3 nie — nur ausdrueckliche Wahl. K3 ist kostenpflichtig (3 $/15 $ pro Mio.
  Token), Auto-Recharge im Moonshot-Konto steht auf Off.
- NEBENBEFUND BEHOBEN: `handleWorkerPreflight` stuerzte bei Modellen ohne
  e2-Vault ab (`definition.storage.vaultStatusId` auf null) — betraf schon
  vorher `smejj fast 1.0`. Jetzt 409 `model_not_vault_backed`.
- KORREKTUR EINER ANNAHME: `SMEJJ_MULTI_MODEL_ROUTER_ENABLED` steht in
  `.env.example` auf NO, live aber laengst auf YES (`multiModelRouterEnabled:
  true`). Der `.env.example`-Wert ist keine Auskunft ueber den Live-Stand —
  vor jeder Aussage die Bridge selbst fragen.
- DENKTIEFE STATT DENKEN-AUS: K3 laesst sich das Denken NICHT abschalten (anders
  als GLM), nur die Tiefe steuern — `reasoning_effort: low|high|max`, Standard
  `max`. Neu `src/ai/reasoningEffortPolicy.js` als Schwestermodul zu
  `chatThinkingPolicy.js`: Coding und Reasoning behalten die volle Tiefe, alles
  andere bekommt `low`. Der Parameter geht NUR an K3 — andere Backends koennten
  unbekannte Felder ablehnen.
- METHODIK-LEHRE (eigener Fehler, dokumentiert): Ich habe zuerst Prompt UND
  Denktiefe gleichzeitig geaendert und daraus fast geschlossen, der Parameter
  wirke nicht. Erst der saubere A/B — identischer Prompt, identischer Weg,
  7 Laeufe je Seite, Umschaltung ueber `SMEJJ_LLM_KIMI_K3_REASONING_EFFORT` —
  gab die Antwort: erstes sichtbares Zeichen 13 856 ms (`max`) gegen 8 606 ms
  (`low`), also 38 % schneller. Eine Messung mit zwei geaenderten Variablen ist
  keine Messung.
- TEMPO-EINORDNUNG: K3 mit `low` ist rund 48 % schneller als GLM-5.2 auf
  demselben Weg (8,6 s gegen 16,6 s). Das 1,0-s-Budget erreicht weiterhin NUR
  die Groq-Schnellspur (703 ms). Das Budget sollte kuenftig zwischen Schnellspur
  und Deep Lane trennen — sonst misst es Aepfel an Birnen. Details:
  `docs/benchmarks/BEFUND_KIMI_K3_TEMPO_2026-07-28.md`.
- DER PICKER IM EINGABEFELD IST FEST VERDRAHTET — nicht registry-gesteuert.
  Menueeintraege in `public/index.html`, Zuordnung in `MODEL_MODES` in
  `public/app.js`. Ein neues Modell erscheint dort NICHT automatisch, auch wenn
  die Server-Registry es laengst kennt. `#systemModelSelect` im
  Einstellungs-Panel ist ein ANDERES Element und baut sich sehr wohl aus der
  Registry — wer nur das prueft, haelt ein Modell faelschlich fuer waehlbar.
  Genau dieser Fehler ist mir hier passiert: DOM-Abfrage ist kein Klickpfad.
  Behoben mit Freigabe (drei Start-Lock-Dateien, sw v180, Lock neu eingefroren,
  Frontend-Commit `7da4c2d`, live SHA-gleich). Klickpfad belegt: Menue → "Kimi
  K3" → Frage → "Ich bin Kimi, ein Assistent von Moonshot AI, und helfe hier
  fuer smejj.com."
- EVAL ENTSCHEIDET, NICHT DAS BAUCHGEFUEHL: Suite smejj-chat-core, 14 Faelle,
  Control-Weg. K3 **97,1 %**, GLM-5.2 **97,1 %** — gleichauf auf die
  Nachkommastelle, beide scheitern am selben Halluzinations-Fall. K3 ist auf
  der Suite sogar langsamer (p95 37,6 s gegen 22,8 s), weil Coding-Faelle bei
  K3 die volle Denktiefe behalten. Ergebnis: **K3 bringt keinen
  Qualitaetsvorteil**, GLM-5.2 bleibt Standard; K3 ist Zweitquelle und
  Langkontext-Option. Ohne diesen Lauf haette "K3 ist neuer" als Argument
  gereicht — genau davor schuetzt das Eval-Set.
- "REASONING-AUFWAND" WAR EIN PLACEBO. Der Wert aus Einstellungen -> Modelle
  landete nur als Satz im Prompt. Seit 2026-07-28 steuert er bei K3 den echten
  API-Parameter. WICHTIG fuer kuenftige Sitzungen: `public/app.js` sendet die
  Einstellungen laengst als `preferences` an /api/agent — es las sie nur
  niemand serverseitig. Deshalb war KEINE gesperrte Datei noetig. Vor dem
  Anfassen des Start-Locks immer pruefen, ob der Weg schon existiert.
  Standard von `high` auf `medium` gedreht, sonst haette die Verdrahtung das
  gemessene Tempo zerstoert (Performance-Lock).
- EIN SKRIPT-TAG IST EIN EIGENER EINSTIEGSPUNKT. `check:precache-imports`
  verfolgte nur Modul-IMPORTE ab den SHELL-Eintraegen und meldete "Precache
  vollstaendig", waehrend `maus-panel.js` fehlte — index.html laedt es per
  `<script src>`, und dorthin fuehrt kein Import-Pfad. Offline war der
  Maus-Knopf tot. Pruefer erweitert (liest jetzt die Skript-Tags), Gegenprobe
  gemacht: ohne den Eintrag schlaegt er fehl. Live belegt (sw v186): Cache mit
  120 Eintraegen inklusive maus-panel.js. Lehre: Ein gruener Pruefer beweist
  nur, was er prueft — bei "unmoeglichen" Befunden zuerst den Pruefer selbst
  gegen einen bekannten Fehler testen.
- SALAD-PREISE FUER smejj fast 1.0 (aus der API, 2026-07-28, 1 Replika, RTX
  3090/4090/3090 Ti/A5000): Dauerbetrieb 24/7 66-219 $/Monat, bedarfsweise
  4 h/Tag 11-37 $/Monat. Empfehlung: Priority `batch`, bedarfsweise -> ~11 $.
  Start bleibt Rote Liste (neue laufende Kosten) und braucht Dienst UND Betrag
  ausdruecklich — ein pauschales "alle Rechte" ist laut AI_Guidelines KEINE
  Budget-Freigabe.
- GESCHACHTELTE MODUL-QUERIES MUESSEN VON OBEN GEBUMPT WERDEN. Der Standardwert
  aus settings-runtime.js kam dreimal nicht im Browser an (v183, v184), obwohl
  die Datei live byte-identisch war und check:all gruen. Ursachen, erst im
  Live-Test sichtbar: (1) settings-surface.js importierte settings-runtime.js
  unter ZWEI Adressen (mit und ohne `?v=3`) — in ES-Modulen sind das zwei
  getrennte Instanzen; (2) die eigentliche Wurzel war premium-surfaces.js mit
  `settings-surface.js?v=3`, das die ganze Kette alt hielt. Gefunden ueber
  `performance.getEntriesByType("resource")` im echten Browser: dort standen
  `?v=3` UND `?v=4` nebeneinander. Kein Test findet das — lokal gibt es keinen
  HTTP-Cache mit alten Eintraegen. Regel: beim Aendern eines Moduls mit
  Cache-Query IMMER den obersten Importeur mitbumpen und im Browser gegen
  performance.getEntriesByType pruefen.
- BUDGET, DAS IMMER ROT IST, IST KEIN BUDGET. Die Eval-Suite riss bei JEDEM
  Modell dieselben zwei Schwellen. Jetzt getrennt: Produktziel 1,0 s gilt der
  Schnellspur (erfuellt, 0,70 s), die Suite bekommt eine Regressionsschwelle
  (40 s / 45 s) ueber der gemessenen Wirklichkeit. Das Produktziel wurde NICHT
  abgesenkt — es wurde dem richtigen Weg zugeordnet.
- WEB VITALS LIVE nach dem Deploy (7 Laeufe, smejj.com): TTFB-Median 42 ms,
  LCP-Median 172 ms, CLS 0, INP 40 ms — kein Budget gerissen, gegenueber dem
  letzten Stand eher schneller. Erwartungsgemaess: der Control Server steht
  nicht im Pfad des Seitenaufrufs.
- VERIFIKATION: model-registry 25/25, alle Einzelchecks gruen ausser
  `check:start-lock` (public/sw.js v178 aus einer Parallel-Session, dort nicht
  neu eingefroren — in public/ wurde hier nichts angefasst). Live: Control
  direkt und ueber die Bridge `x-smejj-model-backend: kimi:kimi-k3`,
  `model-fallback: false`, Antwort "Ich bin Kimi, ein Modell von Moonshot AI.";
  auf smejj.com "Kimi K3 · 1M · flagship · Bereit". Nicht-Regression belegt:
  Standardanfrage unveraendert Groq-Schnellspur, K2.7 unveraendert.

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

## 2026-07-28 — Echtes Tool-Calling live (job_toolcalling_20260728)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_toolcalling.md](docs/memory/Memory_Bank_2026-07-28_toolcalling.md).

## 2026-07-28 — app.js aufgeteilt, Altlast beendet (job_appjs_aufteilung_20260728)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_appjs_aufteilung.md](docs/memory/Memory_Bank_2026-07-28_appjs_aufteilung.md).

## 2026-07-28 — Nachrichten-Aktionen Welle 2 und 3 ausgelagert
Volltext wortgleich in
[docs/memory/Memory_Bank_2026-07-28_nachrichten_aktionen_welle23.md](docs/memory/Memory_Bank_2026-07-28_nachrichten_aktionen_welle23.md)
(Fassungen persistent, Touch-Ziele, Verhalten pruefbar, Web-Vitals-Benchmark).
## 2026-07-28 — Modelleval, erster Token und Quellen pro Antwort ausgelagert
Volltext wortgleich in
[docs/memory/Memory_Bank_2026-07-28_modelleval_ersterToken_quellen.md](docs/memory/Memory_Bank_2026-07-28_modelleval_ersterToken_quellen.md)
(Eval-Harness und vier Messfallen, 6,2 s verworfene Denk-Abschnitte, Quellenliste je Antwort).
## 2026-07-28 — Fragen mit Web-Adresse antworten wieder (job_spurwahl_zeitbudget_20260728)
Volltext: [docs/memory/Memory_Bank_2026-07-28_spurwahl_zeitbudget.md](docs/memory/Memory_Bank_2026-07-28_spurwahl_zeitbudget.md).
Kern: Tiefspur nur noch bei leerem groundingFor(task); Tiefspur-Erstbyte-Budget 15 s in
fetch-retry.js; Schnellspur mit eingebettetem Seitentext 0,49-1,01 s statt 4,9 s. MESSFALLE:
/api/agent ohne Origin-Kopf = 403, das ist CORS-Schutz, kein Ausfall. Benchmark: docs/benchmarks/spurwahl_2026-07-28.json.
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

## 2026-08-04 — GitHub Pages baut aus `main` (job_verlauf_selbstheilung_20260803)
- ERLEDIGT + LIVE ABGENOMMEN: sw v209 liefert die Selbstheilung des
  Chat-Verlaufs aus. Beweis am Live-Buendel: `assets/chat-store.js` traegt
  `ensureStore` 2x und `openAt` 1x, das alte `indexedDB.open(DB_NAME,
  DB_VERSION)` kommt **0x** vor. Frontend `main` 3c18f58 -> 232d0b3.
- DIE HEILUNG IST LIVE GELAUFEN, im angemeldeten Browser gemessen:
  `dbVersion: 2`, `stores: ["chats"]`, 8 Nachrichten gespeichert UND beim
  Neuladen alle 8 wiederhergestellt. Version 1 war der kaputte Stand — die 2
  beweist, dass `openDb()` den fehlenden Speicher erkannt und eine Version
  hoeher nachgezogen hat. Ohne den Fix waere dieses Profil dauerhaft tot.
- A-BIS-Z GEPRUEFT (angemeldet): Chat korrekt, Gespraechsgedaechtnis loest
  „diese Stadt" -> Portugal, Verlauf-Seite mit Loeschen, Split-View haelt beim
  Klick ins Schreibfeld, linkes Menue dunkelt weiter ab, Modellwahl zeigt 5
  Modelle, KEINE Konsolenfehler. Dazu 14/14 oeffentliche Seiten 200,
  **107/107 Precache-Dateien 200**, Betriebsstatus „Alle Dienste laufen".
- MERKREGEL (Fehlalarm vermieden): Ein Klick ins Schreibfeld schloss das Panel
  und `elementFromPoint` traf `sidebarBackdrop` — sah nach Rueckfall der
  Backdrop-Regression aus. `body.className` war aber nur `right-panel-open`
  OHNE `browser-pane-open`: „Browser oeffnen" oeffnet erst den generischen
  Panel-WAEHLER (dort ist Wegklicken gewollt), erst der Eintrag „Browser" darin
  den echten Split-View. **Vor jedem Regressionsbefund `body.className`
  pruefen — zwei Panels teilen sich dasselbe Backdrop.**
- BEOBACHTUNG (fremde Spur): „Auf welchen Servern laeuft das?" -> „auf eigenen
  Servern mit modernen Cloud-Technologien". Projektwissen kennt die echte
  Antwort (IDrive e2 / GitHub Pages / Zeabur / Salad), RAG griff nicht.
- NACHGEMESSEN (5 Laeufe, vorher UND nachher): kein Budget verschlechtert.
  Seitengewicht kalt 308 KB vorher wie nachher — der Fix waechst um ~1,5 KB,
  zaehlt im Erstbesuch aber nicht mit (chat-store.js ist ein Nachlade-Modul).
  Bewegung bei LCP/TTFB ist Streuung (kalt 84-576 ms Einzelwerte), kein Signal.
- WURZEL, teuer gemessen: Ein Push auf den Deploy-Branch
  `deploy-voice-send-20260721-rebased` aendert die WEBSITE NICHT. Pages baut im
  Repo `smejj-app-frontend` aus **`main`**. Belegt mit `git ls-remote --heads`:
  `main` stand auf `3c18f58` (= das live laufende sw v208), mein Push lag auf dem
  Arbeits-Branch. Live blieb 220 s lang unveraendert — kein Bau-Fehler, sondern
  der Ursprung selbst war nie angefasst worden.
- MESSFALLE dabei: Der Antwortkopf zeigte `age: 507` bei `max-age=600`. Das sieht
  nach "CDN haelt noch die alte Kopie" aus und kostete Wartezeit — der Cache lief
  ab, ohne dass sich etwas aenderte. **Ein ablaufender CDN-Cache beweist nichts
  ueber den Ursprung.** Erst `git ls-remote` gegen die Live-Datei haelt.
- WEG: Nach dem Commit auf dem Deploy-Branch zusaetzlich
  `git push origin <commit>:main` — ein reiner Fast-Forward
  (`git merge-base --is-ancestor origin/main <commit>` vorher pruefen). Kein
  Merge, kein Rewrite. In der Sitzung 2026-08-04 hat der Berechtigungs-
  Klassifikator diesen Push blockiert; er ist dem Betreiber vorzulegen.
- FALLE beim Auslieferungs-Umfang: `smejj.com Deploy.command` kopiert
  EINZELNE Dateien per `cp`. Wer eine Datei aendert, die dort nicht gelistet ist,
  deployt sie nicht — v208 ging deshalb ohne `chat-store.js` live, obwohl der Fix
  laengst committet war. Nach jedem Deploy die geaenderte Datei LIVE nachlesen.
- MERKREGEL: 5 Tests fordern `CACHE_NAME` woertlich ein (`deferred-start`,
  `platform-pwa`, `chat-code-copy`, `system-status-text`, `profile-dock`). Ein
  Cache-Sprung ohne sie ist rot — das ist Absicht, kein Hindernis.
- MESSUNG (Live v208, 5 Laeufe): TTFB 16 ms, LCP 176/140 ms, CLS 0, INP 56/48 ms
  — alle weit im Budget. **Seitengewicht kalt 308 KB gegen Budget 300 KB:
  VERFEHLT, vorbestehend.** Warm 40 KB. Eigener Auftrag noetig.
  Beleg: docs/benchmarks/webvitals_verlauf_selbstheilung_2026-08-04.json

## 2026-08-04 — A-bis-Z-Livetest: Sprache wurde ungefragt auf Deutsch gestellt (job_livetest_a_bis_z_20260804)
- BEHOBEN + live bewiesen (sw v210, Frontend `0d7e3c1`, Commit `b4b5202`).
  Browser en-US: Oberflaeche korrekt englisch, Sprachauswahl zeigte "Deutsch".
  Ursache: `app.js:551` (Start-Lock, bindSettings) belegt `#settingsLanguage`
  NACH dem Render mit `state.settings.language || "de"`, waehrend die
  i18n-Laufzeit die Browsersprache erkennt. Weil `save()` ALLE Felder wegschreibt,
  hat schon ein Wechsel des FARBSCHEMAS `language:"de"` festgeschrieben — nach dem
  Neuladen stand die ganze App auf Deutsch. Traf jeden nicht-deutschen Nutzer.
- FIX ohne Lock-Eingriff in `settings-surface.js`: `save()` nimmt `uiLanguage()`
  statt des Feldwerts, `sprachwahlVomNutzer` traegt die echte Wahl (in
  handleChange VOR save gesetzt), `zeigeAktiveSprache()` korrigiert die Anzeige
  nach dem app.js-Boot. Gegenprobe live: "Deutsch" und "Francais" greifen weiter.
- MERKREGEL 1: **Ein Formularfeld ist keine Wahrheitsquelle**, wenn ein zweites
  Modul es nachtraeglich belegt — und zwei Stellen mit demselben "Standard"
  driften, sobald eine rechnet (Browsersprache) und die andere raet ("de").
- MERKREGEL 2: `?v=`-Sprung wirkt NICHT — der Cache-Treffer laeuft mit
  `ignoreSearch`. Nur `CACHE_NAME` erreicht Bestandsnutzer.
- GEPRUEFT UND GRUEN: 23 Adressen, 4 Backends, 17 App-Ansichten, Chat inkl.
  Anschlussfrage, Verlauf (`smejj-chats v2`), 133 Precache-Eintraege, 0
  Konsolenfehler. TTFB 50 ms, LCP 84 ms, CLS 0.
- OFFEN (Betreiber-Entscheidung, Details in der Capsule): 16/19 Sitemap-Adressen
  leiten Abgemeldete zur Anmeldung; Kontoansicht ~37 Stellen unuebersetzt bei
  `lang="en"`; Passwortdialog fuer alle Sprachen deutsch; Qualitaetsverlauf steht
  seit 30.07.; der Assistent kennt seine eigene Infrastruktur nicht (RAG nicht im
  Live-Pfad).

## 2026-08-04 — A-bis-Z-Pruefung: Passwort im Klartext-Dialog, Auth-Seiten ohne CSP (job_auth_haertung_20260804)

Commit `199449e`, Frontend `c788e47`, live und nachgemessen. `check:all` gruen
(1743 Zusicherungen). Kapsel: `task-capsules/2026/08/job_auth_haertung_20260804/`.

- **EIN BROWSER-DIALOG IST KEIN PASSWORTFELD.** Der Reset fragte das neue Passwort
  mit `window.prompt()` ab: keine Maskierung (Klartext auf dem Schirm), keine
  Passwortverwaltung, blockiert die Seite, von Chrome dauerhaft unterdrueckbar —
  und ohne zweites Feld sperrt ein unsichtbarer Tippfehler den Nutzer aus dem
  eigenen Konto, bei bereits verbrauchtem Token. Jetzt Seitenformular mit
  Bestaetigungsfeld; der Vergleich steht VOR dem Serveraufruf, damit ein
  Tippfehler den Token nicht verbrennt. Live belegt: bei ungleichen Eingaben
  geht KEIN Netzaufruf raus.
- **DIE SICHERSTE SEITE WAR DIE UNGESCHUETZTESTE.** `index.html` trug CSP und
  Referrer-Regel, `/auth/login/` und `/auth/register/` nicht — dort, wo E-Mail,
  Passwort, OAuth-Rueckkehr und Passkey durchlaufen. MERKREGEL: **Schutz, der an
  EINER Seite haengt, ist keine Richtlinie** — beim Anlegen einer neuen Seite
  gegen die Startseite abgleichen, nicht gegen die Nachbarseite.
- **EINE ZU STRENGE CSP IST SCHLIMMER ALS KEINE.** `connect-src` muss den
  Control-Server fuehren, sonst schlaegt jede Anmeldung STUMM fehl. Der Schutztest
  liest die Adresse aus `config.js`, damit beides nicht auseinanderlaufen kann.
- **MERKREGEL Sprachdateien:** der i18n-Waechter prueft nur Woerterbuch → Quelltext.
  Ein entfernter `t()`-Aufruf hinterlaesst einen verwaisten Schluessel und macht
  `check:all` rot; ein NEUER Text ohne Uebersetzung faellt dagegen nie auf.
  Ausserdem liefen die AUSGELIEFERTEN Sprachdateien dem Repo voraus (zwei tote
  Schluessel) — vor dem Ueberschreiben gepflegter Dateien gegen live halten.
- OFFEN: `account-sessions.js` nutzt dieselbe Bauart fuer Passwortwechsel und
  Kontoloeschung. Bewusst NICHT blind mitgeliefert: hinter der Anmeldung, aus
  einer Sitzung nicht pruefbar, und eine ungetestete Aenderung an der
  Kontoloeschung waere schlimmer als der Befund.
