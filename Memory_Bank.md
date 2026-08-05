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
Volltext: [docs/memory/Memory_Bank_2026-08-04_pages_main.md](docs/memory/Memory_Bank_2026-08-04_pages_main.md).
Kern: Pages baut aus `main`, NICHT aus dem Deploy-Branch — ein Push dorthin
aendert die Website nicht. `git ls-remote --heads origin` haelt, ein ablaufender
CDN-Cache beweist nichts. `smejj.com Deploy.command` kopiert EINZELNE Dateien:
was dort nicht gelistet ist, veraltet live still. 5 Tests fordern `CACHE_NAME`
woertlich ein. Betreiber-Freigabe fuer den Fast-Forward liegt im Wortlaut vor.

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

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_websuche_markt.md](docs/memory/Memory_Bank_2026-08-04_websuche_markt.md).
Kern: Markt stand dreifach fest im Code, der rohe Fragesatz war der Suchbegriff,
ein Wort reichte als Relevanzbeleg — und ein schwacher Filter versteckte einen
toten Dienst.

## 2026-08-04 — Sprachseiten waren unerreichbar (job_livetest_az_websuche_20260804)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_sprachseiten.md](docs/memory/Memory_Bank_2026-08-04_sprachseiten.md).

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

## 2026-08-04 — Versatz-Audit public/ gegen assets/ (job_verlauf_selbstheilung_20260803)
- WARUM: `smejj.com Deploy.command` kopiert EINZELNE Dateien per `cp`. Alles,
  was dort nicht gelistet ist, veraltet live still — so war `chat-store.js`
  wochenlang alt. Deshalb einmal ALLE 163 Dateien verglichen.
- ERGEBNIS: 6 Dateien weichen ab, davon liegen nur DREI im Precache (nur die
  laedt der Browser): `maus-panel.js`, `verlauf.js`, `voice-warmup.js`.
  Die uebrigen (`chat-bridge*.js`, `maus-replay.js`, `voice-landing.js`,
  `agent/agentEvents.js`) sind Bridge-/Servercode und gehoeren NICHT ins
  Frontend — ihr Fehlen ist richtig, kein Befund.
- BEWERTUNG (kein Deploy noetig, bewusst NICHT deployt):
  * `voice-warmup.js` — Unterschied ist EINE Leerzeile. Wirkungslos.
  * `verlauf.js` — live fehlt `wackeligText()` (Anzeige wackeliger Faelle).
    Aber `verlauf-messwerte.json` traegt die Felder `wiederholungen`/`wackelig`
    gar nicht, die Funktion haette also NICHTS zu rendern. Heute unsichtbar.
  * `maus-panel.js` — live fehlt `starteAuftrag()` + Live-Nachziehen der
    Wiedergabe. FALLE: Die lokale Fassung importiert dynamisch
    `maus-auftrag.js`, und DIE ist nicht ausgeliefert. Ein Copy allein erzeugt
    live einen 404. Braucht: beide Dateien + Precache-Eintrag + CACHE_NAME —
    also eine Start-Lock-Aenderung mit eigener Freigabe.
- MERKREGEL: Beim Versatz-Audit zuerst gegen den Precache und `index.html`
  filtern. Ohne diesen Filter sehen 13 Dateien nach Befund aus, uebrig bleiben
  drei — und davon ist genau eine echte Arbeit.
- MERKREGEL 2: Eine Datei mit dynamischem `import()` nie einzeln nachdeployen.
  Erst pruefen, ob das Importziel ueberhaupt live liegt.
- FREIGABE des Betreibers vom 2026-08-04 (Wortlaut aufbewahrt): Fast-Forward
  von `main` im Repo smejj-app-frontend ist dauerhaft erlaubt
  (`git push origin <commit>:main`), Bedingung `git merge-base --is-ancestor`
  vorher pruefen; kein Merge, kein Force-Push, kein History-Rewrite, nur dieses
  Repo. Deckt NICHT Start-Lock-Aenderungen ab.

## 2026-08-04 — Suchquelle mit Schluessel (Tavily, BYOK)

Betreiber-Freigabe: „Ja, mach die Suchquelle mit Schlüssel." Nachweis in
`docs/approvals/2026-08-04-suchquelle-mit-schluessel.md`, Policy-Ausnahme 3.

- **ANBIETERWAHL IST EINE MESSUNG, KEINE ERINNERUNG.** Am selben Tag geprueft:
  Brave hat sein Gratiskontingent im **Februar 2026 abgeschafft** (Karte pflicht,
  metered), Google Custom Search ist **fuer Neukunden geschlossen** und wird zum
  2027-01-01 abgeschaltet. Beides waere aus dem Gedaechtnis heraus falsch gewaehlt
  worden. Geblieben: **Tavily, 1000 Credits/Monat, KEINE Karte noetig.**
- **DIE KOSTENGARANTIE IST DIE FEHLENDE KARTE, NICHT DER CODE.** Ohne hinterlegte
  Zahlungsart kann beim Anbieter nichts abgerechnet werden. Der Monatsdeckel im
  Code (`SMEJJ_SEARCH_API_MONTHLY_MAX`, 900 von 1000, greift VOR dem Aufruf) ist
  bewusst die ZWEITE Linie — sein Zaehler liegt im Speicher und faellt beim
  Neustart zurueck. `search_depth: "basic"` kostet 1 Credit statt 2.
- **Tavily erwartet den ausgeschriebenen Landesnamen** (`"united states"`), NICHT
  das Kuerzel — ein Kuerzel wird still ignoriert, der Markt waere wirkungslos.
- Fail-closed: ohne Schluessel kein einziger Netzaufruf dorthin, alter Weg
  unveraendert. Live belegt (Control 136): `suchquelle.konfiguriert: false`,
  Suche laeuft weiter ueber DuckDuckGo.
- **DIE DUCKDUCKGO-SPERRE WAR ZEITWEILIG.** Am selben Tag lieferten dieselben
  Fragen erst 0 Treffer (HTTP 202 Sperrseite), Stunden spaeter wieder 8 gute.
  Merkregel: Eine Sperre EINMAL messen reicht nicht — vor „der Dienst ist tot"
  zeitversetzt nachmessen. Die Schluesselquelle ist damit kein Ersatz, sondern
  eine Absicherung gegen die Laune einer fremden Suchmaschine.
- Ergebnis der Suchkette nach allen Korrekturen, live: `office space for sale
  San Jose` -> loopnet.com, crexi.com, realmo.com. `Schlagzeilen Berlin heute`
  -> rbb24, BZ, Tagesspiegel. `Öffnungszeiten Zoo Berlin` -> zoo-berlin.de.
- Der Schluessel selbst ist Betreibersache: `smejj.com Suchschluessel-setzen.command`
  (zeigt ihn nie an, prueft das Format, schreibt genau einen Wert).

## 2026-08-04 — Sprachseiten: Inhalt oeffentlich, Sprachmodus angemeldet (job_livetest_a_bis_z_20260804)
- ERLEDIGT, live (`e59ef13`, Commit `d452310`). Eine Parallel-Session hatte die
  15 Sprachseiten mit `f8d98c4` (sw v213) oeffentlich geschaltet — richtig, denn
  sie tragen `index,follow`, Canonical und 16 hreflang-Verweise. Die Interaktion
  blieb dabei OFFEN: `voice-landing.js` kannte keine Sitzungspruefung.
- GEMESSEN, nicht vermutet: `POST /api/chat` an die Bridge OHNE jedes Token gab
  HTTP 200 und eine vollstaendige Modellantwort in 1,3 s. Auf 15 indexierten
  Seiten stand damit eine bedienbare, kostenpflichtige Oberflaeche fuer jeden
  Bot. **Eine Seite oeffentlich zu schalten heisst nicht, ihre Bedienung
  oeffentlich zu schalten — beides muss getrennt entschieden werden.**
- FIX: NEU `voice-landing-signin.js`. `darfSprechen()` fail-closed ueber
  `hasSession()`; fuer Abgemeldete NUR ein `<a>` auf `/auth/login/` — kein
  Overlay, keine Verdrahtung, kein Vorwaermen. Live belegt: 20 Anfragen, alle
  statisch, NULL Aufrufe an salad.cloud/zeabur.app/api. Angemeldete unveraendert.
- SITEMAP: dadurch stimmig — 19/19 liefern 200, 18 rendern fuer Abgemeldete
  Inhalt, `x-default` zeigt auf das jetzt oeffentliche `/en/`. Der Eintrag `/`
  bleibt die App-Shell (Entscheidung F-06), bewusst nicht ausgetragen.
- OFFEN (eigener Auftrag): Die Bridge nimmt weiterhin Anfragen ohne Token an.
  Die UI-Sperre nimmt die Bedienbarkeit, macht den Endpunkt aber nicht dicht.
  Token-Pflicht + Rate-Limit wuerde ohne Umbau ALLE angemeldeten Nutzer
  aussperren (das Frontend schickt heute kein Token an die Bridge).

## 2026-08-04 — Zweite Sperre: sicherheitskritische Dateien (job_security_lock_20260804)

Commit `1e4ebdd`. Freigabe des Betreibers vom 2026-08-04 (Wortlaut im Manifest
`docs/security/security-lock-manifest.json`). `check:all` gruen (1808).
Keine Live-Datei beruehrt — reine Repo-Absicherung.

Neun Dateien byte-genau eingefroren: beide Anmeldeseiten samt `auth-page.js`,
`auth.css`, `passkey.js`; `account-sessions.js`; `chat-history-context.js`;
`chat-bridge.js`; `ai/fetch-retry.js`. Aufruf wie beim Start-Lock:
`node scripts/check-security-lock.mjs --freeze --confirm "<Wortlaut>"`.

- **ZWEI MANIFESTE, NICHT EINE LISTE.** Der Start-Lock wird bei JEDEM
  sw.js-Sprung neu eingefroren (am 2026-08-03/04 mehrfach). Laegen die
  Sicherheitsdateien darin, wuerde jedes dieser Einfrieren eine Aenderung an
  einem Passwortfeld still mit absegnen. MERKREGEL: **eine Sperre, die oft
  aufgesperrt wird, darf nichts Seltenes mitschuetzen.**
- **check-start-lock.mjs IST DIGEST-GEPINNT** — eine von 19 Dateien in
  `idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json`
  (`immutable: true`, `overwriteAllowed: false`). Der Versuch, beide Sperren auf
  eine gemeinsame Mechanik umzustellen, brach den Digest. MERKREGEL: **den Pin
  nachzuziehen, um das eigene Refactoring durchzubekommen, ist genau die
  Manipulation, gegen die er gebaut ist.** Zurueckgenommen, Doppelung
  dokumentiert, Test haelt sie fest.
- **EIN SCHUTZ, DER NIE ANSCHLAEGT, IST SCHLIMMER ALS KEINER.** Zwei eigene
  Fehler beim Bau, beide nur gefunden, weil die Tests den PROZESS aufrufen statt
  Quelltext zu lesen:
  (1) `import.meta.url` gegen ein selbstgebautes `file:`-Schema plus
  `process.argv[1]` zu vergleichen trifft unter einem Pfad
  MIT Leerzeichen nie zu — die Sperre lief gar nicht, Exitcode 0.
  (2) Danach scheiterte sie an macOS-Symlinks (`/var` gegen `/private/var`);
  jetzt `realpathSync`.
  MERKREGEL: **eine Sperre immer gegen eine absichtlich veraenderte Datei
  testen** — sonst prueft man nur, dass sie nicht abstuerzt.

## 2026-08-04 — Zweite Abnahme auf sw v214: sauber, ein bewusst offener Punkt (job_livetest_a_bis_z_20260804)
- GEPRUEFT UND GRUEN: 20 Adressen, 19/19 Sitemap-Adressen, 4 Backends,
  17 App-Ansichten, Chat (402 ms bis zur Antwort), Verlauf, Split-View-Fix,
  Sprachseiten-Sperre, Uebersetzungen, CSP auf allen oeffentlichen Seiten,
  0 Konsolenfehler, 355/355 Tests. Warm: LCP 88 ms, CLS 0, TTFB 3 ms.
- SEITENGEWICHT gemessen (gzip, 107 Shell-Dateien + HTML): **278 KB gegen
  Budget 300 KB — eingehalten, aber nur 22 KB Luft.** Vor jedem neuen
  Shell-Modul nachrechnen; `curl -H "Accept-Encoding: gzip"` ueber die
  SHELL-Liste aus sw.js ist der ehrliche Messweg.
- BEFUND, BEWUSST NICHT BEHOBEN: Beim ERSTEN Aufruf ohne i18n-Cache rendert
  `#profile` in der Quellsprache (de), waehrend `#settings` nach dem asynchronen
  Laden auf en umrendert — eine Seitenladung lang zwei Sprachen. Ab dem zweiten
  Laden korrekt. **Ein Neu-Rendern von #profile wuerde `#saveProfile`,
  `#registerLocal` und `#loginLocal` totlegen**, weil app.js (Start-Lock) beim
  Boot Handler an genau dieses Markup haengt. Merkregel: **wenn ein fremdes,
  gesperrtes Modul Handler an dein Markup haengt, ist innerHTML kein Werkzeug
  mehr** — dann Textknoten tauschen oder die Sprache vor dem Rendern kennen.

## 2026-08-04 — Seitengewicht unter Budget (sw v215, job_seitengewicht_20260804)
- ERLEDIGT + LIVE BEWIESEN: Erstbesuch **311 -> 297 KB** (Budget 300).
  Messwerkzeug meldet "Alle Performance-Budgets eingehalten". Warm unveraendert
  40 KB. Beleg: docs/benchmarks/webvitals_seitengewicht_v215_2026-08-04.json
- WEG: Aufschluesselung ueber ALLE 119 Ressourcen (echtes Chrome, transferSize)
  statt Raten. Gefunden: api-keys-surface.js (6,9 KB), provider-settings.js
  (3,7 KB) + ihr selbst nachgeladenes CSS (3,2 KB) lagen im Ladepfad JEDES
  Seitenaufrufs, obwohl beide NUR in das Einstellungs-Panel "models" rendern
  und der Startreiter "general" ist. settings-surface.js (NICHT gesperrt)
  importiert sie jetzt dynamisch, ausgeloest von `activate("models")`.
- SCHLUESSELERKENNTNIS: **Precache-Ladungen zaehlen NICHT ins Seitengewicht.**
  Belegt daran, dass voice-conversation.js, status.js und verlauf.js im
  Precache liegen, in den 119 Ressourcen aber fehlen. Verschobene Module
  bleiben deshalb im Precache — beim Reiterwechsel kommen sie aus dem Cache,
  ohne Netz. Das ist der ganze Trick: verschieben, nicht entfernen.
- PRUEFUNG VOR DEM UMBAU (damit nichts wegfaellt): app.js (Start-Lock) bindet
  KEINE der erzeugten Kennungen (ak*, apiKeysSurface, cline*), applyValues()
  greift nur auf die eigenen FIELDS zu, beide init-Funktionen sind idempotent.
  Live gegengeprueft: 0 Module auf der Startseite, nach Klick auf "Models"
  laden genau die vier Dateien und BEIDE Oberflaechen rendern vollstaendig.
- BEWUSST NICHT ANGEFASST (Freigabe sagt "bei Zweifel nicht anfassen"):
  account-privacy.js MUSS synchron rendern (app.js bindet #saveProfile,
  #registerLocal, #loginLocal an sein Markup); die 25 KB Sprach-Module haengen
  auf Modulebene an composer-tools.js (800/800 Zeilen) und haetten die
  Warm-up-Logik ausgehebelt. Beides waere Funktionsrisiko fuer wenige KB.
- FALLE, wieder bestaetigt: Nach dem sw-Sprung brauchte es VIER Reloads plus
  ein `registration.update()`, bis der alte Cache v214 abgeloest war. Vorher
  misst man die alte Datei und haelt den Fix fuer wirkungslos.

## 2026-08-04 — Anmeldepflicht an der Chat-Bruecke LIVE (Bridge v114, sw v217)

Freigabe des Betreibers (Wortlaut in beiden Sperr-Manifesten). `check:all` gruen
(1845). Live gemessen: ohne Token 401, fremde Herkunft 403.

- **DER ORIGIN-KOPF IST KEIN SCHUTZ.** Gemessen: ohne Kopf 403, fremde Herkunft
  403 — aber ein `curl` mit `Origin: https://smejj.com` bekam die VOLLE Antwort.
  Der Kopf wirkt nur im Browser; ausserhalb setzt ihn jeder selbst. Die Bruecke
  war damit frei mitbenutzbar, auf Kosten des geteilten Groq-Kontingents.
  MERKREGEL: **CORS schuetzt Nutzer vor fremden Seiten, nicht den Server vor
  fremden Klienten.**
- **PRUEFUNG UEBER DEN CONTROL SERVER, nicht mit eigenem Geheimnis.** Lokal
  pruefen braeuchte `SMEJJ_SESSION_SECRET` in der Bruecken-Umgebung; ein
  Env-PATCH bei Salad ersetzt die GANZE Umgebung samt Code-Buendel. Die Bruecke
  fragt darum `/api/auth/me` und merkt sich das Ergebnis 10 min (positiv) /
  30 s (negativ). Fail-closed bei Ausfall.
- **EIN GEPRAEGTES TEST-TOKEN GILT NICHT.** Der Schluessel aus der Salad-Gruppe
  `smejj-control` erzeugt ein Token, das die LAUFENDE Instanz ablehnt — sie
  haelt einen aelteren Env-Stand. MERKREGEL: **derselbe Prozess signiert und
  prueft, also sind ECHTE Nutzer-Token immer konsistent** — ein Fehlschlag beim
  Praegen widerlegt die Auslieferung nicht, belegt sie aber auch nicht.
  [[smejj-admin-livetest-weg]] ist an dieser Stelle ueberholt.
- **VOR DEM DEPLOY DEN PRECACHE GEGEN LIVE HALTEN.** Ein frueherer Anlauf wurde
  bewusst abgebrochen: die Arbeitskopie trug ein `sw.js` einer Parallelsitzung,
  das `/assets/autonomous-thread-run.js` im Precache fuehrte — live 404. Ein
  Deploy haette `cache.addAll` scheitern lassen und den Cache ALLER Besucher
  zerlegt. MERKREGEL: **jeden Precache-Eintrag vor dem Deploy aufloesen.**
- OFFEN: der angemeldete Durchlauf. Eine Sitzung kann sich nicht anmelden.
  Rueckweg liegt bereit (Buendel v112 ohne Wache + restart_chat_bridge_salad.mjs,
  Ruecknahme in etwa einer Minute).

## 2026-08-04 — Fortschritt sichtbar, Lauf im Faden (job_fortschritt_faden_20260804)

Die letzten drei Punkte der Betreiber-Liste. Volltext in der Kapsel.

- **EIN EREIGNIS, DAS DER SERVER SENDET, IST NOCH LANGE NICHT EINES, DAS DER
  NUTZER SIEHT.** Der Control Server sendete die Arbeitsschritte nachweislich
  (6 im Rohstrom), beim Nutzer kam keiner an: `pipeVisibleStream` in der Bruecke
  baut JEDEN Event neu und behaelt nur `choices[0].delta.content`. Zwischen
  Server und Auge liegt jeder Filter auf dem Weg — jeden einzeln pruefen.
- **RUECKWAERTSKOMPATIBEL PER BAUART:** Der Schritt steht in einem eigenen Feld
  (`smejj_schritt`), nicht in `choices[].delta`. Ein alter Client liest
  `delta.content`, bekommt `undefined` und haengt nichts an — unsichtbar, aber
  nie stoerend.
- **DIE SCHRITTLISTE IST GESCHWISTER DER ANTWORT, NICHT IHR KIND.** Der
  Markdown-Renderer ersetzt am Ende das `innerHTML` des Antwort-Knotens und
  liest dessen `textContent`. Ein Kind waere weg — und wuerde vorher die Antwort
  faelschen.
- **Punkt 6:** Der autonome Lauf brauchte die Formularfelder der Automatik-
  Ansicht; der Job-Endpunkt braucht sie gar nicht. NEU
  `public/autonomous-thread-run.js` startet im Faden. Fail-safe: bei jedem
  Fehler `false` -> der alte Weg uebernimmt. Ein Test nagelt fest, dass der
  Ansichtswechsel HINTER dem Rueckfall-Abbruch steht.
- **DER ZEABUR-BUENDLER LEHNT RE-EXPORT-LISTEN AB** (`bundle_export_list_unsupported`):
  sie verstecken die Namensherkunft und entziehen der Kollisionspruefung den
  Boden. Beim Auslagern aus `chat-bridge.js` (824 Zeilen) deshalb direkte
  Importe in den Tests, kein `export { … } from`.
- Der Import von `chat-bridge.js` startet einen echten HTTP-Server —
  `SMEJJ_CHAT_BRIDGE_NO_START = "1"` VOR dem Import setzen, sonst haengt der Test.
- Live belegt: Control sendet, Bruecke v114 reicht durch, ausgeliefertes
  `chat-stream.js` rendert („🔍 Suche: … · Markt us ✓ 8 Treffer"), CSS im
  Buendel. NICHT abgenommen: der angemeldete Durchlauf am Stueck — ein gemintetes
  Token wird abgewiesen und eine Sitzung darf sich nicht anmelden.
## 2026-08-04 — Grundlinie der breiten Suite gemessen (job_eval_breite_suite_20260803)
- ZWEI VOLLE LIVELAEUFE (je 885 Aufrufe) gegen die Standardkette; zusammengefuehrt
  decken sie alle 295 Faelle sauber: **Grundlinie 66,2 %**, 105 kritische
  Verstoesse. Je Fachgebiet: strukt 95 / lock 87 / naming 84 stark;
  **rag 31 / ehrl 36 / code 47** sind die Trainingsziele fuer smejj 1.0.
  Berichte: modeleval-smejj-chat-breit-live-default{,-wdh}-2026-08-04.json.
- ZWEI MESSFALLEN fuer lange Laeufe: (1) ein ~7-min-Netzausfall macht ganze
  Kategorien zu 0 %-Fehlern (`fetch failed`) — Kategorien mit lauter errors sind
  KEINE Modellaussage; (2) die letzten 25 Faelle von Lauf 2 kippten auf
  `http_401` — lange Laeufe halbieren oder Laeufe zusammenfuehren (Fall fuer
  Fall: fehlerfreie Messung gewinnt). --retries hilft nur bei
  Sekunden-Aussetzern, nicht bei Minuten.
- KORREKTUR der ersten Diagnose (2026-08-04, nachgemessen): die 401 waren NICHT
  ein "auslaufender Zugang". Die Anmeldepflicht der Chat-Bruecke (Bridge v114)
  ging WAEHREND des Laufs live — die Fehler stehen alle am ENDE der Suite, nicht
  verstreut. Seither gibt `/api/chat` auf BEIDEN Spuren (Zeabur und Salad) 401,
  auch mit `Origin`-Kopf; `/health` bleibt 200. MERKREGEL: **ein Deploy waehrend
  eines Messlaufs sieht aus wie ein Infrastrukturfehler** — Fehler am Stueck am
  Ende deuten auf eine Umstellung, verstreute Fehler auf eine Stoerung.
- FOLGE fuer den Harness: der `control`-Transport ist bis auf Weiteres NICHT
  nutzbar (eine Sitzung kann sich nicht anmelden, ein geminteltes Token wird
  abgewiesen). Modellvergleiche laufen darum ueber `--transport provider` mit
  dem BYOK-Schluessel aus der bestehenden lokalen Konfiguration. Belegt:
  glm-5-2 antwortet dort als `zhipu`/`glm-5-2`.
- FALLE, live belegt: `--model kimi-k3` ueber `provider` faellt STILL auf
  `zhipu`/`glm-5-2` zurueck, weil der Moonshot-Schluessel lokal fehlt. Ohne den
  Blick auf `run.backendsSeen` haette der Bericht GLM-Zahlen als Kimi-Zahlen
  ausgewiesen. MERKREGEL: **bei jedem Modellvergleich zuerst backendsSeen und
  resolvedModelIds lesen, nicht den angeforderten Namen.**

## 2026-08-04 — Projektwissen: Infrastrukturfragen (job_projektwissen_infrastruktur_20260804)
- BEHOBEN + LIVE (Bridge v115, Salad, 663 Abschnitte). Vorher: "smejj.com
  laeuft auf eigenen Servern mit modernen Cloud-Technologien." Nachher, live
  gemessen: "laeuft auf **GitHub Pages** (Frontend/Static Hosting). Als
  weiterer Speicher-/Backend-Vault ist **IDrive e2** vorgesehen."
- WURZEL 1 — DIE PUNKTZAHL HAENGT AN DER FRAGELAENGE. BM25 summiert ueber die
  Fragewoerter. Dieselbe Frage, dasselbe Wissen: "Server?" 4,9 | "Auf welchen
  Servern laeuft smejj.com?" 8,5 | ausformuliert 23,2. MIN_TOP_SCORE = 20 wurde
  an der Eval-Suite kalibriert, deren Prompts ausformulierte Saetze sind.
  **Nutzer tippen kurz — die Schwelle traf die Suite und nie den Alltag.**
- WURZEL 2 — FALSCHER ABSCHNITT. MASTER_PROMPT.md gliedert mit ====-Trennern
  statt Markdown-Ueberschriften; der Zerleger macht 10 Abschnitte daraus, ALLE
  mit derselben Ueberschrift, je ~2460 Zeichen. BM25 normiert auf Laenge, also
  gewann eine kurze Zufallspassage aus GITHUB_KOSTENFREI.md.
- VERWORFEN (nachgemessen, nicht vermutet): Schwelle senken oder auf Fragelaenge
  normieren. Gedeckte und ungedeckte Fragen ueberlappen auch pro Term
  (1,03..3,69 gegen 1,21..3,03); "Wie viele Nutzer hat smejj.com?" liegt bei
  3,03 ueber den meisten gedeckten. Das haette genau die Halluzinationsfaelle
  mit Kontext versorgt, die am 2026-08-01 dadurch einbrachen (100 % -> 67 %).
- LOESUNG OHNE SCHWELLENAENDERUNG: Erkannte Infrastrukturfragen werden fuer die
  SUCHE um das Vokabular der Dienste-Uebersicht ergaenzt. MIN_TOP_SCORE bleibt
  UNVERAENDERT — die angereicherte Frage erreicht sie selbst: 8,5 -> 35,4 |
  11,0 -> 33,5 | 6,9 -> 29,1 | 11,0 -> 36,9. Beste Quelle jetzt
  MASTER_PROMPT.md bzw. FREE_ARCHITECTURE.md "Current Deployment".
- SICHERHEIT: Erkennung verlangt keine Befehlsform UND einen Infrastruktur-
  Begriff UND eine Fragestellung. Damit fallen schutz-daten-loeschen (traegt
  "Objektspeicher"!), halluzination-unbekannte-zahl und "Wie viele Nutzer hat
  smejj.com?" heraus. Nur die SUCHANFRAGE wird ergaenzt, nie der Nutzer-Prompt.
- MERKREGEL: Eine absolute Relevanzschwelle auf einer SUMMEN-Punktzahl ist eine
  verkappte Laengenschwelle. Wer sie an ausformulierten Testprompts kalibriert,
  kalibriert am Alltag vorbei. Vor dem Nachjustieren pruefen, ob das Kriterium
  ueberhaupt trennt — hier tat es das nicht, und die richtige Antwort war eine
  bessere SUCHE statt einer weicheren Schwelle.

## 2026-08-04 — Dreiervergleich der breiten Suite (job_eval_breite_suite_20260803)

Auf den 180 Faellen, die nachweislich echtes K3 beantwortet hat (fairer Massstab):
**GLM-5.2 78,0 % > Kimi K3 72,2 % > Schnellspur 66,4 %.** Ueber alle 295 Faelle:
GLM 76,1 % ± 0,6 (0 Fehler, Backend verifiziert), Schnellspur 66,2 %.
Berichte: modeleval-smejj-chat-breit-{glm-5-2,kimi-k3}-2026-08-04.json.

- **GLM-5.2 bleibt das Fundament.** Es gewinnt 7 von 9 Kategorien, ist dreimal
  schneller (p95 9,3 s gegen 29,1 s) und schlaegt Kimi besonders bei Sicherheit
  (76,9 gegen 66,2) und Kosten-Policy (62,0 gegen 42,3).
- **WO EIN BESSERES FUNDAMENT NICHTS BRINGT:** ship (−2,1), router (+0,2),
  kosten (+1,1) gegenueber der Schnellspur. Das ist reines Hauswissen — kein
  Fremdmodell kennt es. MERKREGEL: **Modellwahl hebt Faehigkeiten, nicht
  Projektwissen. Dafuer sind RAG und Nachtraining zustaendig.** Genau diese drei
  Kategorien sind der Auftrag fuer smejj 1.0.
- **DER WAECHTER HAT SICH SOFORT BEZAHLT GEMACHT.** Der Kimi-Lauf lieferte
  180 Faelle als kimi-k3 und 115 als kimi-k2-7 — ein stiller Wechsel MITTEN im
  Lauf (Router-Gesundheit stuft ein ausgefallenes Modell zurueck). Seit c73d115
  meldet modellAbweichung() das als `model_mismatch`; nachtraeglich angewandt
  greift es korrekt. Der Lauf selbst startete Minuten vor dem Einbau und trug
  ihn noch nicht.
- **FALLE fuer kuenftige Vergleiche:** Modelle NIE ueber die Gesamtnote
  vergleichen, wenn resolvedModelIds mehr als einen Eintrag hat. Richtig ist der
  Vergleich auf der Fallmenge, die das gewuenschte Modell wirklich beantwortet hat.
- Kimi K3 ist seit dem Lauf nicht mehr erreichbar: jede Anfrage kommt als
  `x-smejj-model-fallback: true` mit kimi-k2-7 zurueck. K2.7 erreichte auf seinen
  115 Faellen 72,5 % — praktisch gleichauf mit K3.

## 2026-08-04 — Der halbe Anmeldezustand (job_abgelaufene_anmeldung_20260804)

Commits `2b0e9e4` + Nachbesserung, Frontend `aef96fd`, live als `smejj-shell-v219`.
`check:all` gruen (1880). Beide Sperren neu eingefroren.

- **EIN TOKEN UEBERLEBT LAENGER ALS DIE SITZUNG DAHINTER.** `auth-gate.js`
  prueft nur, OB ein Token im Speicher liegt, nie ob es gilt. Im Browser des
  Betreibers lag ein Token, das der Server ablehnte (`/api/auth/me` ->
  authenticated=false): die App liess ihn herein, der Server kannte ihn nicht.
  Unsichtbar, solange nichts danach fragt — und toedlich, sobald etwas fragt.
  Genau daran ist am selben Tag die Anmeldepflicht der Bruecke gescheitert.
- **DIE WICHTIGSTE REGEL EINER SITZUNGSPRUEFUNG: nur eine EINDEUTIGE Absage
  zaehlt.** Netzfehler, Zeitueberschreitung, 5xx, kaputtes JSON aendern nichts.
  Waere das anders, sperrte ein Aussetzer alle Nutzer aus — schlimmer als der
  Fehler, den die Pruefung behebt. Vier Faelle im Test, drei davon live im
  Browser des Betreibers gegen den ausgelieferten Code nachgestellt.
- **MERKREGEL zur Reihenfolge:** `t()` faellt auf den deutschen Quelltext
  zurueck, solange das Woerterbuch nicht geladen ist. Der Hinweis stand deutsch
  unter einer englischen Seite. Erst `loadUiLanguage()`, dann melden.
- **MERKREGEL zum Vorgehen (teuer bezahlt):** Die Anmeldepflicht wurde scharf
  geschaltet, OHNE den positiven Weg gemessen zu haben — mit dem Argument, er sei
  "durch Konstruktion sicher". Er war es nicht. **Eine Aenderung, die im
  Fehlerfall ALLE aussperrt, wird im angemeldeten Browser geprueft, bevor sie
  live geht, nicht danach.** Diesmal so gemacht: vor dem Deploy gemessen, dass
  der neue Code den Betreiber nicht stoert.
- OFFEN: Die Anmeldepflicht der Bruecke ist ausgebaut (`chat-bridge-auth.js`
  bleibt fertig und geprueft liegen). Mit der Sitzungspruefung ist der Weg dafuer
  jetzt frei — aber erst messen, wie viele echte Anfragen ein gueltiges Token
  tragen, dann scharf schalten.

## 2026-08-05 — Anmeldung MESSEN statt erzwingen (Bridge v116)

Commit `d52de88`, Frontend `9950793`. `check:all` gruen (1885), Sperre neu
eingefroren. Freigabe: "erst messen, wie viele echte Anfragen ein gueltiges
Token tragen, dann mit mir abstimmen."

`/health` traegt jetzt `anmeldung: { gesamt, mitGueltigemToken, ohneToken,
mitUngueltigemToken, anteilGueltig }`.

- **MERKREGEL, teuer bezahlt: eine Aenderung, die im Fehlerfall ALLE aussperrt,
  wird vorher gemessen — nicht begruendet.** Die Wache lief am 2026-08-04 mit
  dem Argument live, sie sei "durch Konstruktion sicher". War sie nicht. Diese
  Zaehler beantworten vorher, was damals angenommen wurde.
- **Eine Messung darf den gemessenen Dienst nicht veraendern.** Drei
  Eigenschaften, alle noetig: sie aendert nichts am Ablauf, sie wartet nicht
  (`void`, kein await — sonst haenge die Antwortzeit des Chats am Rundlauf und
  man maesse die Messung mit), und sie speichert nur vier Zahlen.
- **Live beidseitig belegt:** anonyme curl-Anfrage -> `ohneToken`, echte Anfrage
  aus dem angemeldeten Browser -> `mitGueltigemToken`, Chat antwortet normal.
- Die Zaehler sind im Speicher und starten bei jedem Container-Neustart bei
  null; `startedAt` im selben `/health` sagt, ueber welchen Zeitraum sie gelten.
- NAECHSTER SCHRITT: Zahlen sammeln lassen, dann mit dem Betreiber entscheiden.
  Die Wache liegt fertig in `chat-bridge-auth.js`, ein Test haelt fest, dass sie
  bewusst nicht verdrahtet ist.
