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
Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_training_loop_worker.md](docs/memory/Memory_Bank_2026-07-28_training_loop_worker.md).
Stand seither: der Loop laeuft im Dauerbetrieb seit 2026-07-29 (Eintraege unten).

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

## 2026-08-04 — Die Websuche suchte im falschen Markt (job_websuche_markt_20260804)

Befund: Die Frage nach einem Buero im Silicon Valley beantwortete smejj.com mit
ImmobilienScout24. Live nachgemessen war die Suche nicht bei dieser einen Frage
kaputt, sondern grundsaetzlich — vier von sechs Standardfragen null Treffer,
„office space for sale San Jose" acht Microsoft-Office-Seiten.

- **EIN FESTVERDRAHTETER SPRACHKOPF IST EINE MARKTENTSCHEIDUNG.** `kl=de-de`,
  `setlang=de` und `Accept-Language: de,en` sahen aus wie Darstellungsdetails.
  Sie bestimmen, WELCHE Welt die Suchmaschine zeigt. NEU `src/search/searchRegion.js`:
  Markt aus dem Ortsbezug (17 Maerkte); bei zwei Orten gewinnt der ZULETZT genannte.
- **EIN FEHLENDER PARAMETER IST SCHLIMMER ALS EIN FALSCHER.** `lite.duckduckgo.com`
  hatte gar keine Region und antwortete nach der Server-IP — daher spanische
  Treffer. Bei mehreren Quellen muss JEDE den Parameter bekommen.
- **EIN GANZER SATZ IST KEINE SUCHANFRAGE.** Der rohe Fragesatz ging als Suchbegriff
  hinaus: 0 Treffer — die Suche war nie gestellt. NEU `buildSearchQuery` (nie leer).
- **EIN WORT IST KEIN BELEG — EIN SCHWACHER FILTER VERSTECKT EINEN TOTEN DIENST.**
  Acht microsoft.com-Treffer kamen durch, weil „office" vorkam. Ab drei pruefbaren
  Begriffen muessen jetzt zwei in DEMSELBEN Treffer stehen. Erst dadurch wurde
  sichtbar, dass beide Suchmaschinen laengst nichts Brauchbares liefern.
- **HTTP 200 HEISST NICHT „ANTWORT".** Bing liefert erkannten Automaten
  absichtliche Taeuschtreffer (brasilianische Motorrad-Preistabellen auf
  „Schlagzeilen Berlin", Tom-Hanks-Filmografie auf „Zoo Berlin"). Cookies,
  `Referer`, sauberer Browser-Kennstring: nachgemessen ohne Wirkung.
  DuckDuckGo antwortet aus dem Rechenzentrum mit HTTP 202 + Sperrseite.
- **AUS DER ARBEITSKOPIE BAUEN IST GEFAEHRLICH.** Der Release-Builder nimmt die
  Arbeitskopie; eine Parallel-Sitzung hatte 20 Dateien in Release-Pfaden offen. Weg:
  `git archive <commit> | tar -x`, dann `buildControlReleaseArtifact({ rootDir })`.
- Ergebnis live: `Bitcoin Kurs` jetzt finanzen.net/coinmarketcap.com/**de**/ statt
  `/es/`; `office space for sale San Jose` 0 statt 8 falscher Treffer; Antwort auf
  die Originalfrage nennt den US-Markt, ist vollstaendig und nennt LoopNet/Crexi
  mit Suchbegriffen. Control 133 -> 135, `check:all` gruen (1473 Zusicherungen).
- OFFEN (Rote Liste): Ohne Suchquelle mit Schluessel (BYOK, z. B. Brave Search
  API oder Tavily im Gratiskontingent) kann die Suche keine Objektlinks liefern.
  Mojeek, Marginalia, Brave-HTML, acht oeffentliche SearXNG-Instanzen geprueft und
  ausgeschieden. Neuer Anbieter = getrennte schriftliche Freigabe.
## 2026-08-03 — Breite Eval-Suite: 295 Faelle in 15 Fachgebieten (job_eval_breite_suite_20260803)
- GEBAUT + LIVE BEWIESEN: `evals/suites/smejj-chat-breit-v1.json` ist die neue
  Messlatte fuer Modellwahl und smejj-1.0-Training — 295 Faelle in 15 Paketen
  unter `evals/packs/` (Naming, Architektur, Kosten, Locks, Sicherheit, Coding,
  Struktur, Ehrlichkeit, Deployment, Performance, Training, Router, Sprache,
  Logik, RAG). Kern-Suite (14 Faelle) bleibt unveraendert vergleichbar.
- BAUART MANIFEST + PAKETE: `src/evaluation/evalPacks.js` expandiert
  Kurzschreibweisen (`muss`/`sollte` = kritisch/weich) zu den bestehenden
  Erwartungstypen; der Inhalts-Hash deckt die ZUSAMMENGEFUEHRTE Suite ab. Nach
  jeder Paket-Aenderung: `node scripts/evaluation/rehash_eval_suite.mjs <suite>`.
  Fail-closed bewiesen: Tippfehler-Felder werfen (`eval_pack_case_unknown_field`),
  jeder Fall braucht eine kritische Erwartung.
- LIVE-BEWEIS 2026-08-03: Stichprobe 12 Faelle gegen die Produktionskette —
  12/12 bestanden, Urteil passed, p95 775 ms (Bericht
  docs/benchmarks/modeleval-smejj-chat-breit-stichprobe-2026-08-03.json).
  Erste Messung fand echte 2 Verstoesse (Knopf/Commit ohne Markennamen); Ursache
  war der unterspezifizierte Prompt, nicht die Wortliste — Prompts geschaerft,
  Erwartung NICHT aufgeweicht (Regel aus evals/README.md).
- MERKREGEL: voller Lauf = 885 Aufrufe (3 Ziehungen) hinter 12/min ≈ Nachtlauf.
  Stichproben mit `--limit`, Berichte nur je gleicher Messart vergleichen.
  minScore 0.75 ist Startwert; anheben nach zwei Basislaeufen.
- Waechter: `tests/eval-packs.test.mjs` (8 Tests, u. a. Antwortschluessel-Regel
  fuer den RAG-Korpus) in `check:evaluation` verdrahtet.

## 2026-08-04 — Kontoansicht vollstaendig uebersetzt, Sprachseiten sind kostenpflichtig (job_livetest_a_bis_z_20260804)
- ERLEDIGT, live (`0cbeb48`): 63 Texte x 14 Sprachen ergaenzt, Schluesselsatz je
  Sprache 314 und identisch. Der Code rief `t()` schon ueberall auf — es fehlten
  NUR die Sprachdatei-Eintraege, deshalb keine Code-Aenderung. Rein additiv.
  Belegt gegen die ausgelieferten Dateien: 217 uebersetzbare Texte aus
  account-privacy.js + settings-surface.js, 0 Luecken (vorher 48).
- MERKREGEL: Die Sprachdateien liegen NICHT im Precache (nur `i18n/ui.js`) —
  Uebersetzungen brauchen KEINEN sw-Sprung, sie greifen nach dem
  600-s-HTTP-Cache. Vor jedem sw-Bump pruefen, ob die Datei ueberhaupt im SHELL
  steht; unnoetige Cache-Spruenge kosten alle Nutzer einen Neuladezyklus.
- WICHTIG (Kostenfalle): Die 15 Sprachseiten sind KEINE Marketingseiten.
  `voice-landing.js` ruft `api.agent`, `api.chatFallback`, `api.voiceTranscribe`
  und `api.voiceTts`. Sie per `PUBLIC_PATHS` zu oeffnen wuerde die
  kostenpflichtigen Routen fuer jeden Anonymen und jeden Bot freigeben — Rote
  Liste. Die Sitemap bewirbt 16 von 19 Adressen, die Abgemeldete zur Anmeldung
  schicken; richtige Loesung ist eine oeffentliche Marketing-Huelle mit
  gesperrter Eingabe, nicht ein Eintrag in PUBLIC_PATHS.
- EINSCHRAENKUNG: de/en verantwortet der Agent; die 13 weiteren Sprachen sind
  maschinell erstellt und nicht muttersprachlich gegengelesen.

## 2026-08-04 — Konto-Sicherheit ohne Browser-Dialoge (job_konto_formulare_20260804)

Commit `14f1a3d` + `20011ef`, Frontend `dd626c7`, live als `smejj-shell-v212`.
Freigabe des Betreibers vom 2026-08-04. `check:all` gruen (1718 + 1764 in zwei
Laeufen), Start-Lock neu eingefroren.

- **DERSELBE BEFUND WIE AUF DER ANMELDESEITE, NUR HINTER DER ANMELDUNG.**
  `account-sessions.js` fragte Passwoerter mit `window.prompt()` ab (unmaskiert,
  Klartext auf dem Schirm, keine Passwortverwaltung) und stapelte fuer die
  Loeschung `confirm` + zwei `prompt`. Chrome bietet nach dem zweiten Dialog an,
  weitere zu unterdruecken — wer das anklickte, kam nie ans Passwortfeld und
  stand vor einer Aktion, die scheinbar nichts tat. Jetzt Seitenformulare mit
  maskierten Feldern, Wiederholfeld und Abbrechen-Weg.
- **ALLE PRUEFUNGEN VOR DEM SERVERAUFRUF.** Live im Browser gegen den
  ausgelieferten Code bewiesen: falsches Loeschwort -> 0 Netzaufrufe, fehlendes
  Passwort -> 0 Netzaufrufe, ungleiche neue Passwoerter -> 0 Netzaufrufe. Vorher
  ging jede Eingabe ans Netz, auch eine leere.
- **MERKREGEL: ein Label als Flex-Spalte macht aus jedem eigenen Element eine
  eigene Zeile.** Ein `<code>`-Element in der Beschriftung brach
  "Zur Bestätigung KONTO LÖSCHEN eingeben" in DREI Zeilen — im Browser gesehen,
  nicht im Test. Beschriftungen in solchen Labels bleiben EIN Textstueck.
- **MERKREGEL: `?v=` allein erreicht Bestandsnutzer NICHT.** Precache-Dateien
  liegen cache-first mit `ignoreSearch`; nur ein CACHE_NAME-Sprung wirkt. Darum
  zwei Sprünge (v211 fuer die Formulare, v212 fuer die Nachbesserung).
- **MERKREGEL: eine Testbuehne ohne die echte Ansichtsklasse misst falsch.** Die
  Konto-Variablen haengen an `#profile.premium-view`; ohne die Klasse loesen
  `var(--konto-line)` und Co. zu leer auf und Raender verschwinden — das sah wie
  ein CSS-Fehler aus, war aber die Buehne.
- OFFEN (fremd): `tests/lora-trainer-vertrag.test.mjs` startet einen lokalen
  Dienst und wartet 15 s auf `/health`. Unter der Last eines vollen `check:all`
  reicht das manchmal nicht — dreimal an einem Tag rot, isoliert immer gruen.
  Ein Pflicht-Gate darf nicht vom Zufall abhaengen; Startfenster erhoehen.

## 2026-08-04 — Sprachseiten waren unerreichbar (job_livetest_az_websuche_20260804)

A-bis-Z-Livetest nach dem Websuche-Release. Zwei Befunde, beide freigegeben und live.

- **EIN DYNAMISCHER IMPORT VERSTECKT SICH VOR JEDER TEXTSUCHE.** `/ja/` sprang auf
  `/auth/login/`, obwohl der Quelltext kein `auth-gate` enthielt und die Umleitung
  auch OHNE Service Worker auftrat. Erst das Netzwerkprotokoll zeigte
  `GET /assets/auth-gate.js?v=1`: `voice-landing.js:9` holt es per
  `import "./auth-gate.js"` — ohne `from`, also unsichtbar fuer jeden Grep.
  MERKREGEL: Tut eine Seite etwas, das ihr Quelltext nicht erklaert, ist das
  Netzwerkprotokoll das Werkzeug, nicht die naechste Textsuche.
- **EIN TEST KANN EINEN FEHLER ALS ABSICHT FESTSCHREIBEN.** `tests/auth-gate.test.mjs`
  fuehrte `/en/` und `/fr/` als App-Seiten, die umleiten SOLLEN. Ein gruener Test
  beweist, dass ein Verhalten gewollt war — nicht, dass es richtig ist. Fix deshalb
  erst zurueckgenommen und den Betreiber gefragt (zwei gegensaetzliche Reparaturen
  moeglich: oeffentlich machen ODER aus dem Index nehmen).
- **"INDEXIERE MICH" UND "MELDE DICH AN" SCHLIESSEN SICH AUS.** Die 15 Sprachseiten
  trugen `robots: index,follow` und standen mit hreflang in der Sitemap — und warfen
  jeden Suchbesucher zur Anmeldung. Jetzt in PUBLIC_PATHS, Muster bewusst eng
  (`^/(code)/(index.html)?$`), damit kein kuenftiger Unterpfad mitoeffnet.
- **CSP fehlte auf 18 Seiten** (14 Sprachseiten + Hilfe/Impressum/Datenschutz/
  Maus-Replay), waehrend Startseite und Auth-Seiten sie trugen. Jetzt im
  Sprachseiten-GENERATOR, sonst waere sie beim naechsten Lauf wieder weg.
- **DER FAVICON-LOCK HASHT DEN SPRACHSEITEN-GENERATOR** — jede Aenderung daran
  verletzt ihn, auch ohne Favicon-Bezug. Nachziehen: nur diesen einen Hash, und
  nachweisen, dass Assets, HTML-Kopfbezuege und Web-Manifest unveraendert sind.
- **VERSIONSPINS SIND TEIL DES CACHE-SPRUNGS:** fuenf Testdateien pinnen CACHE_NAME.
  Parallel-Sitzungen vergaben waehrenddessen v210 -> v211 -> v212; vor der eigenen
  Vergabe die LIVE-Datei pruefen, nicht nur `git log`.
- Ergebnis live: 15/15 Sprachen offen, `/`, `/profile`, `/en/konto`, `/ja/chat`
  weiterhin anmeldepflichtig; 16/16 Seiten mit CSP; sw v213; `check:all` gruen
  (1494 Zusicherungen); Start-Lock und Favicon-Lock neu eingefroren.
- OFFEN: `tests/lora-trainer-vertrag.test.mjs` flackert unter Volllast (15 s
  Startbudget fuer python3; standalone 1,2 s). Kein Produktfehler, aber ein
  unzuverlaessiges Release-Tor. Fremder Arbeitsbereich, nicht angefasst.

## 2026-08-04 — Heller Modus der Konto-Formulare (Nacharbeit, sw v214)

Commit `f0caadb` + `031f6a5`, Frontend `00a67e1`. Zwei EIGENE Fehler, gefunden
beim Nachpruefen des zweiten Farbschemas — beide haetten nur Nutzer mit hellem
Systemschema getroffen und keinen Test ausgeloest:

- **EIN RUECKFALLWERT VERSTECKT EINE ERFUNDENE VARIABLE.**
  `var(--konto-panel, rgba(255,255,255,0.03))` — `--konto-panel` ist nirgends
  definiert, der weisse Rueckfallwert galt also IMMER. Im dunklen Schema faellt
  das nicht auf. MERKREGEL: **ein `var()` mit Rueckfallwert ist unfehlbar und
  darum gefaehrlich** — der Waechter prueft jetzt, dass jede benutzte
  `--konto-*`-Variable auch definiert ist.
- **DIE KANTENFARBE TAUGT NICHT ALS FOKUSRING.** `--konto-edge` ist im hellen
  Schema `rgba(255,255,255,0.9)`: ein weisser Ring auf hellem Grund ist kein
  Ring. Jetzt `#2dd4bf` wie beim Bildwaehler. Dritter Waechter: beide Schemata
  muessen JEDE Variable definieren, sonst faellt sie still auf den Erbwert.

**MERKREGEL zur Messung selbst (zweimal in Folge hereingefallen):** eine
Testbuehne, die nur EIN Stilblatt laedt, misst falsch. `--konto-*` haengt an
`#profile.premium-view` (account-privacy.css), `--premium-text` aber an
`app-surfaces.css`. Ohne beide sah heller Text auf weissem Grund wie ein Fehler
aus und war nur die Buehne. Immer alle beteiligten Stilblaetter laden und die
echte Ansichtsklasse setzen.

**MERKREGEL, zum zweiten Mal:** Pruefmuster muessen Kommentare ausblenden — der
erste Lauf des neuen Waechters schlug auf den eigenen Kommentar an, der den
alten Fehler beschreibt.

Belegt: dunkel Text `rgb(249,246,241)` auf `rgba(0,0,0,0.25)`, hell
`rgb(23,25,29)` auf `#ffffff`, Fokusring in beiden `rgb(45,212,191)`.
`check:all` gruen (1726), Start-Lock neu eingefroren.
