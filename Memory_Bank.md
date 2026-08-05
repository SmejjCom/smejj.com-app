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

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_auth_haertung.md](docs/memory/Memory_Bank_2026-08-04_auth_haertung.md).

## 2026-08-04 — Die Websuche suchte im falschen Markt (job_websuche_markt_20260804)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_websuche_markt.md](docs/memory/Memory_Bank_2026-08-04_websuche_markt.md).
Kern: Markt stand dreifach fest im Code, der rohe Fragesatz war der Suchbegriff,
ein Wort reichte als Relevanzbeleg — und ein schwacher Filter versteckte einen
toten Dienst.

## 2026-08-04 — Sprachseiten waren unerreichbar (job_livetest_az_websuche_20260804)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_sprachseiten.md](docs/memory/Memory_Bank_2026-08-04_sprachseiten.md).
Kern: ein DYNAMISCHER Import von auth-gate.js warf alle Suchbesucher raus —
nur im Netzwerkprotokoll sichtbar; dazu CSP auf allen 24 Seiten.

## 2026-08-04 — Suchquelle mit Schluessel (Tavily, BYOK)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_suchquelle_schluessel.md](docs/memory/Memory_Bank_2026-08-04_suchquelle_schluessel.md).

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

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_security_lock.md](docs/memory/Memory_Bank_2026-08-04_security_lock.md).

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
Volltext: [docs/memory/Memory_Bank_2026-08-04_seitengewicht.md](docs/memory/Memory_Bank_2026-08-04_seitengewicht.md).
Kern: Erstbesuch 311 -> 297 KB (Budget 300). Hebel war VERSCHIEBEN statt entfernen —
Precache-Ladungen zaehlen NICHT ins Seitengewicht. api-keys-surface.js und
provider-settings.js laden erst bei `activate("models")`, bleiben aber im Precache.

## 2026-08-04 — Anmeldepflicht an der Chat-Bruecke LIVE (Bridge v114, sw v217)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_anmeldepflicht_bruecke.md](docs/memory/Memory_Bank_2026-08-04_anmeldepflicht_bruecke.md).

## 2026-08-04 — Fortschritt sichtbar, Lauf im Faden (job_fortschritt_faden_20260804)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_fortschritt_faden.md](docs/memory/Memory_Bank_2026-08-04_fortschritt_faden.md).

## 2026-08-04 — Grundlinie der breiten Suite gemessen (job_eval_breite_suite_20260803)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_grundlinie_breit.md](docs/memory/Memory_Bank_2026-08-04_grundlinie_breit.md).

## 2026-08-04 — Projektwissen: Infrastrukturfragen (job_projektwissen_infrastruktur_20260804)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_projektwissen_infra.md](docs/memory/Memory_Bank_2026-08-04_projektwissen_infra.md).

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

## 2026-08-04 — A/B: Projektwissen im Prompt (job_eval_breite_suite_20260803)

GLM-5.2 ohne Kontext 76,1 % gegen mit Kontext (Schwelle 12) 77,5 %. Mit
KONTROLLGRUPPE gerechnet (78 Faelle bekamen nie Kontext, drifteten -1,4) betraegt
die echte Wirkung **+4,0 Punkte** — ausserhalb des Rauschbands. Kritische
Verstoesse 61 -> 47. Kontext hilft, wo Hauswissen fehlt (router +15,0,
ehrlichkeit +12,7), und schadet weiter bei training (-14,4) und schutz (-9,2).
Ursache gemessen: BM25 trifft Wortdeckung, nicht Zustaendigkeit. Ein Versuch,
das ueber Quellen-Prioritaeten zu heilen, wurde gemessen und ZURUECKGENOMMEN.
**Empfehlung: MIN_TOP_SCORE nicht pauschal senken; die Suchart ist die
Entscheidung, nicht die Zahl.**
Volltext: [docs/memory/Memory_Bank_2026-08-04_rag_ab.md](docs/memory/Memory_Bank_2026-08-04_rag_ab.md).

## 2026-08-04 — Entscheidungsvorlage Suchart (job_eval_breite_suite_20260803)

Vorlage: [docs/architecture/RAG_SUCHART_ENTSCHEIDUNG_2026-08-04.md](docs/architecture/RAG_SUCHART_ENTSCHEIDUNG_2026-08-04.md).
NICHTS umgesetzt — Entscheidung liegt beim Betreiber, ragRanking.js unveraendert.

- **NACHSORTIERER SCHLAEGT SEMANTISCHE SUCHE** — als Prototyp gemessen (12 Faelle,
  GLM-5.2 waehlt aus einem Becken von 10 BM25-Treffern): 5x BM25 korrigiert
  (Platz 2/4/5/5/7 nach vorn, jedes Mal ein zustaendiges Regeldokument), 5x
  "keine Passage passt" -> fail-closed kein Kontext, 1x BM25 bestaetigt. Er
  repariert BEIDE gemessenen Fehlerarten ohne neue Abhaengigkeit, ohne neuen
  Anbieter, ohne laufende Kosten.
- **ZEITKOSTEN Nachsortierer: Median 1,2 s, p95 2,1 s.** Das reisst das
  1-Sekunden-Budget fuer den ersten Token. Darum: Schnellspur als Nachsortierer
  (0,70 s gemessen), nur fuer die tiefe Spur.
- **KORPUS IST WINZIG: 663 Abschnitte, 95 Dateien, 397 KB.** Einbettungen
  waeren ~1 MB, ein voller Vektorvergleich unter 1 ms. MERKREGEL: **bei dieser
  Groesse braucht es NIE eine Vektordatenbank** — die Frage ist allein, WIE
  eingebettet wird, nicht wo gesucht.
- **GEMESSEN: der Zhipu-Schluessel hat KEINEN Zugang zu Einbettungsmodellen**
  (embedding-3 und embedding-2 beide "Modell existiert nicht"). Eine
  Einbettungs-API waere damit ein NEUER ANBIETER = Rote Liste.
- **DAS PROJEKT HAT NULL LAUFZEIT-ABHAENGIGKEITEN.** Ein lokales
  Einbettungsmodell waere die erste ueberhaupt (onnxruntime ~50-150 MB plus
  ~120 MB Modell). Das ist der eigentliche Preis von Option B, nicht die Rechenzeit.

## 2026-08-04 — Qualitaetsseite log, und der Prueflauf mass die Reserve

Betreiber-Freigabe „Qualitätsseite ehrlich machen" + frischer Prueflauf.
Nachweis: `docs/approvals/2026-08-04-qualitaetsseite-ehrlich.md`.

- **EIN VERSPRECHEN OHNE MECHANIK IST EINE LUEGE MIT VERZOEGERUNG.**
  `verlauf.html` versprach „Alle sechs Stunden laeuft ein Prueflauf". Einen
  Zeitplan gab es nie — die Werte werden von Hand eingespielt. Die Seite meldete
  Besuchern fuenf Tage lang „76,47 % — die Kette liefert GERADE nicht die
  geforderte Qualitaet", mit Daten von VOR mehreren Korrekturen. Jetzt:
  `istVeraltet` ab 24 h (fail-closed), Alter zuerst, Urteil in der Vergangenheit,
  `data-stufe="veraltet"` statt der Bewertung.
- **EIN MESSWEG, DER NICHT DER NUTZERWEG IST, MISST EIN ANDERES PRODUKT.**
  `DEFAULT_CHAT_ENDPOINT` zeigte auf die Zeabur-RESERVE, waehrend `config.js`
  seit dem 2026-08-03 die Salad-Bruecke als primaer fuehrt. Aufgefallen NUR,
  weil die Reserve mit HTTP 401 antwortete und der Lauf 0 % ergab — waere sie
  erreichbar gewesen, haette es niemand gemerkt. Der Trainings-Loop, der die
  Qualitaetsseite speist, nutzt dieselbe Funktion und mass ebenfalls falsch.
  Zwei Tests halten die Adresse jetzt gegen `public/config.js`.
- **TESTS AUF TAGESWERTE REISSEN BEI JEDER MESSUNG.** Vier Tests hingen an
  „76,47 %" bzw. an der Anzahl der Messungen. Sie pruefen jetzt die ZUSAGE
  (neueste steht oben, nichts geht beim Zusammenfuehren verloren) statt des
  Tagesstands.
- Ratengrenze beim Messen beachten: die Bruecke laesst 12 Anfragen/Minute je
  Client. 42 Aufrufe brauchen `--delay-ms 5500`, sonst http_429.
- Ergebnis live: **98,04 %, 0 kritische Verstoesse, Urteil passed** (vorher
  76,47 % / 3 / blocked). 13 von 14 voll bestanden, 1 wackelig
  (`halluzination-unbekannte-zahl`, 1/3). sw v220, check:all 1591 gruen.

## 2026-08-04 — Qualitaetsmessung laeuft jetzt von allein

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_qualitaetsmessung.md](docs/memory/Memory_Bank_2026-08-04_qualitaetsmessung.md).

## 2026-08-05 — Stufe 1 gemessen: Nachsortierer bringt nichts (job_eval_breite_suite_20260803)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-05_stufe1_nachsortierer.md](docs/memory/Memory_Bank_2026-08-05_stufe1_nachsortierer.md).

## 2026-08-05 — Stufe 2 verworfen: Begriffserweiterung wirkt nicht (job_eval_breite_suite_20260803)

Semantische Suche OHNE Einbettungsmodell versucht: Nachbarschaftstabelle aus dem
Korpus (PMI), Frage vor der Suche um ihr Themenvokabular ergaenzt. 1.480 Begriffe,
96 KB Artefakt, 188 ms Bauzeit, keine Abhaengigkeit.
**Verworfen VOR dem ersten Modellaufruf, kostenlos gemessen.**
- Von drei diagnostizierten Faellen: einer besser, einer unveraendert schlecht,
  einer KAPUTT (AGENTS.md :: Change-Lock fiel aus den Top 3).
- Ausschlaggebend: Faelle mit Becken 217 -> **292 von 295**. Die Erweiterung hebt
  praktisch JEDE Frage ueber die Schwelle, auch "Was ist 12 mal 8?" (ergaenzt um
  `rollback test`). Genau dieser Zustand war am 2026-08-01 und am 2026-08-04
  schon zweimal schaedlich.
- MERKREGEL: **eine gute Begriffstabelle ist noch keine gute Suche.** Die Nachbarn
  stimmen (trainingsdaten -> rechtepruefung, sanitization, rechtefreigabe); sie an
  die Frage zu haengen, verschiebt die Trefferliste trotzdem ins Beliebige.
- Ursache: PMI ueber 663 kurze Abschnitte trennt Thema und Zufall nicht scharf
  genug; haeufige Allerweltswoerter rutschen unter die Haeufigkeitsgrenze.
- Der Modulentwurf wurde NICHT eingecheckt (keine unnoetige Infrastruktur), der
  Befund schon: docs/architecture/RAG_STUFE2_BEFUND_2026-08-05.md.
- OFFEN vor jedem weiteren Retrieval-Umbau: die Deckenfrage. Wie viele der 295
  Faelle sind ueberhaupt durch ein vorhandenes Dokument beantwortbar? Ohne diese
  Zahl ist unbekannt, wie viel Luft bleibt.

## 2026-08-05 — Decke gemessen, Live-Schaden gefunden (job_eval_breite_suite_20260803)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-05_decke_liveschaden.md](docs/memory/Memory_Bank_2026-08-05_decke_liveschaden.md).

## 2026-08-05 — Die zwoelf Faelle: das Ranking war nie das Problem

Analyse ohne einen einzigen Modellaufruf.
Volltext: [docs/architecture/RAG_ZWOELF_FAELLE_BEFUND_2026-08-05.md](docs/architecture/RAG_ZWOELF_FAELLE_BEFUND_2026-08-05.md).
- **MASTER_PROMPT.md zerfaellt in 10 Abschnitte a 2.460 Zeichen mit IDENTISCHER
  Ueberschrift** und traegt Gewicht 1,5. Folge: **48 % aller Kontext-Lieferungen
  haben einen dieser Abschnitte auf Platz 1.** Es aus dem Korpus zu nehmen ist
  gemessen SCHLECHTER (27 % -> 22 %) — es ist oft genuin zustaendig.
- **KEINE Ranking-Stellschraube bewegt mehr als 1-3 Punkte** (Gewichte, limit,
  minRelativeScore, Tor-ohne-MASTER_PROMPT — alle gegen die Wahrheitsgrundlage
  der Deckenmessung geprueft). Damit ist rueckwirkend erklaert, warum die drei
  frueheren Versuche scheiterten: **alle drei drehten am Ranking.**
- MECHANISMUS des Schadens: 3 der 4 schlimmsten Faelle sind UNGEDECKT. Ohne
  Kontext antwortet das Modell richtig aus seiner Anweisung; mit einem
  autoritaetsstark aussehenden, aber unzustaendigen Auszug folgt es dem Auszug.
- TOR-QUALITAET beziffert: Schwelle 20 = 41/157 richtig, 30/138 falsch geoeffnet.
  Schwelle 12 = 93/157 richtig, 96/138 falsch. Von 20 auf 12 kommen 52 richtige
  und 66 FALSCHE Oeffnungen hinzu.
- **KERNBEFUND DER GANZEN UNTERSUCHUNG: die BM25-Punktzahl ist ein schlechter
  Vorhersager dafuer, ob der Korpus die Frage ueberhaupt beantworten kann.** Sie
  misst Wortdeckung, gefragt ist Deckung. Kein Schwellenwert loest das auf.
- FOLGE fuer Stufe 2: ein Einbettungsmodell wird NICHT zum besseren Sortieren
  gebraucht (Ranking ist nicht der Engpass), sondern als besserer
  DECKUNGSANZEIGER — der Nutzen liegt im TOR. Vorher billig pruefbar mit
  demselben Aufbau (Trefferquote + Falsch-Oeffnungsrate gegen dieselbe
  Wahrheitsgrundlage).

## 2026-08-05 — Einbettungsmodell geprueft und ABGELEHNT (job_eval_breite_suite_20260803)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-05_einbettung_geprueft.md](docs/memory/Memory_Bank_2026-08-05_einbettung_geprueft.md).

## 2026-08-05 — Weg B: Regelfragen-Anreicherung statt Schwellensenkung

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-05_wegb_regelfragen.md](docs/memory/Memory_Bank_2026-08-05_wegb_regelfragen.md).

## 2026-08-05 — Regelfragen-Anreicherung LIVE (Bruecke v122)

Freigabe des Betreibers ("Ja, fahr den Deploy mit vollem Ship-Loop").
Buendel v122 nach smejj.com/assets/chat-bridge.js (Frontend-Repo `9c7ba4e`),
Salad-Container neu gestartet, LIVE nach 80 s.
- BELEG: das live ausgelieferte Buendel ist BYTE-IDENTISCH zum lokal gebauten
  (gleiche sha256, 491.909 Bytes). Funktionsprobe am heruntergeladenen
  Live-Artefakt: 5/5 — drei Regelklassen erkannt, Halluzinationsfrage und
  Befehlsform bekommen weiterhin KEINEN Kontext.
- Live-Health: `20260805-v122-regelfragen`, Projektwissen 663 Abschnitte.
- **CHAT-KLICKPFAD NICHT TESTBAR:** /api/chat gibt 401 (Anmeldepflicht seit
  v114), eine Sitzung kann sich nicht anmelden und ein gepraegtes Token gilt
  nicht. Ersatzweg ist die Artefakt-Verifikation oben — sie belegt, dass der
  gemessene Code live laeuft, aber nicht die Antwortguete im Browser.
- NUR DIE BRUECKE ist ausgeliefert. Der Control Server laeuft weiter mit dem
  alten `ragContextBlock` — der Nutzerpfad geht ueber die Bruecke
  (config.js -> /api/agent), der Control Server ist davon nicht betroffen.
  Ein Control-Release ist offen, aber fuer die Nutzerwirkung nicht noetig.
- FALLE, wieder bestaetigt: unmittelbar nach dem Neustart liefert das
  Salad-Gateway HTML statt JSON. Das ist Flattern, kein Fehlschlag — einmal
  nachfassen genuegte.
- **check:guidelines ist ROT, aber NICHT durch diese Aenderung:** `public/sw.js`
  hat mit 8ad258f (Parallelsitzung, sw v223) 810 Zeilen erreicht (vorher 795).
  sw.js ist nicht Teil des Bruecken-Buendels. Als eigene Aufgabe gemeldet.

## 2026-08-05 — Zeitbudget: die ROUTE entscheidet (job_zeitbudget_route_20260805)
Volltext: [docs/memory/Memory_Bank_2026-08-05_zeitbudget.md](docs/memory/Memory_Bank_2026-08-05_zeitbudget.md).
- LIVE (sw v224). Bis Kopfzeilen 852 ms einfach gegen **4704 ms** auf `/api/agent`
  bei 6500 ms Budget. Das Budget hing am MODELLNAMEN — jetzt an der ROUTE.
- MERKREGELN: `grep … | head -1` traf einen KOMMENTAR statt der Konstante. Ein
  Beweistest mit nur EINEM Ziel besteht auch gegen den alten Code.

## 2026-08-05 — Trainings-Loop entblockt: Gebrauch gegen Erwaehnung

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-05_loop_entblockt.md](docs/memory/Memory_Bank_2026-08-05_loop_entblockt.md).

## 2026-08-05 — Das erste Lebenszeichen (job_arbeitssignal_20260805)
Volltext: [task-capsules/2026/08/job_arbeitssignal_20260805/capsule.md](task-capsules/2026/08/job_arbeitssignal_20260805/capsule.md).
- LIVE bewiesen (sw v225): bei 2 s "⏳ Anfrage laeuft …", bei 3 s weg. Der erste
  Server-Schritt kam gemessen erst nach **5750 ms** — davor volle Stille.
- KLIENTSEITIG, weil Bruecke und Control Server ihre Kopfzeilen erst nach der
  naechsten Stufe schreiben und daraus x-smejj-model-backend fuellen; frueher
  senden haette die Diagnose gekostet. Zaehler aria-hidden, Start ab 1200 ms.

## 2026-08-05 — Punkt 3 gemessen: das Tor war NICHT die Ursache

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-05_punkt3_tor.md](docs/memory/Memory_Bank_2026-08-05_punkt3_tor.md).

## 2026-08-05 — Projektkorpus vermessen: 699 Fakten, drei Fragenformen

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-05_korpus_vermessung.md](docs/memory/Memory_Bank_2026-08-05_korpus_vermessung.md).

## 2026-08-05 — Punkt 2 gemessen und zurueckgenommen (Banner-Zerleger)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-05_punkt2_banner.md](docs/memory/Memory_Bank_2026-08-05_punkt2_banner.md).

## 2026-08-05 — Die Suchmaschine luegt, nicht der Filter (job_websuche_komposita_20260805)
Volltext: [task-capsules/2026/08/job_websuche_komposita_20260805/capsule.md](task-capsules/2026/08/job_websuche_komposita_20260805/capsule.md).
- **Bing liefert dem Rechenzentrum Attrappen: 7 von 12 Fragen.** Die SERP ist
  echt (Titel, Suchfeld, 10x `b_algo`), nur der Inhalt ist Fremdmuell — auf
  "Einwohnerzahl Wien 2024" kamen Justin-Bieber-Songtexte auf Chinesisch, bei
  jeder Wiederholung anderer Muell. **"current news Germany" scheitert genauso
  — es liegt an der IP, nicht an der Sprache.** `&format=rss` hilft nicht.
- **MEINE DIAGNOSE WAR FALSCH und ich habe sie ausgeliefert, bevor ich sie an
  echten Daten geprueft habe.** Ich schloss vom Filter (`kept 0`) auf ein
  Kompositum-Problem, statt die 10 verworfenen Treffer einmal auszudrucken.
  A/B an identischen Rohtreffern: **0 Unterschiede von 8** — die Aenderung
  wirkt nicht, schadet aber auch nicht; stehen gelassen statt Neustart Nr. 2.
- **Die Antwort stand schon im Projekt**: Kopf von `searchKeyProvider.js` seit
  2026-08-04 — "HTTP 200 mit ABSICHTLICHEN Taeuschtreffern". Vor dem Raten die
  Nachbardatei lesen.
- **MERKREGEL: erst Rohdaten ausdrucken, dann erklaeren.** `kept 0` heisst nicht
  "Filter zu streng", es heisst "hier ist etwas verworfen worden — sieh nach was".
- **BLOCKER beim Betreiber:** von 85 Container-Variablen ist **keine**
  suchbezogen; `SMEJJ_SEARCH_TAVILY_API_KEY` fehlt. Anbieter seit 2026-08-04
  freigegeben (0,00 USD, keine Karte), alles gebaut inkl.
  `smejj.com Suchschluessel-eingeben.command`. Schluessel gibt nur er ein.

## 2026-08-05 — Geruest fuer Fragevarianten gebaut (Schritt 2, Empfehlung 1)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-05_fragevarianten_geruest.md](docs/memory/Memory_Bank_2026-08-05_fragevarianten_geruest.md).

## 2026-08-05 — Nutzerfragen-Erfassung: der Schalter ist WIRKUNGSLOS

Auftrag war, `SMEJJ_TRAINING_CAPTURE_ENABLED` einzuschalten. NICHT getan — er
haette nichts bewirkt, und ein gesetzter Schalter ohne Wirkung ist gefaehrlicher
als ein ausgeschalteter: er sieht aus wie eine laufende Erfassung.
- **GEMESSEN:** `isCaptureEnabled` wird ausschliesslich von
  `src/training/pipeline.js` gelesen. Die Pipeline-Funktionen
  (`prepareTrainingCandidate`, `buildTrainingCandidateWritePlan`) werden NUR aus
  Tests aufgerufen. **Kein einziger Aufruf im Live-Chatpfad** (control-server,
  public/, src/server.js). Es gibt keinen Weg, auf dem ein echtes Gespraech in
  die Pipeline gelangt.
- VORHANDEN: die Bibliothek (Sanitization, Verschluesselung, Schreibplan), das
  strenge Tor `evaluateTrainingEligibility` ("denied unless every condition is
  explicitly proven") und die Einwilligungs-Endpunkte am Control Server
  (`/api/training/consent`, `/revoke`, `/decision`; live, 401 ohne Anmeldung).
- **DIE OBERFLAECHE TAEUSCHT NICHT, ABER SIE ZAEHLT AUCH NICHT:** der Schalter
  "Modelltraining erlauben" in account-privacy.js sagt selbst, er sei lokal und
  "ersetzt keine serverseitige, signierte Einwilligung". Er schreibt nichts an
  den Consent-Endpunkt.
- ES FEHLT FUER EINE ECHTE ERFASSUNG: (1) ein Erfassungspunkt im Live-Chat,
  (2) die Verdrahtung des Schalters an den Consent-Endpunkt, (3) eine aktuelle
  Datenschutzerklaerung mit Hash (der Endpunkt erwartet `privacyNoticeSha256`),
  (4) das signierte Consent-Ledger auf IDrive e2.
- MERKREGEL: **bevor ein Feature-Schalter umgelegt wird, pruefen, ob ihn
  ueberhaupt jemand liest.** Ein wirkungsloser Schalter erzeugt die Illusion
  einer Funktion — hier bei personenbezogenen Daten besonders folgenreich.
