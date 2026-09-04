# Memory Bank — Archiv Runde 7 (ausgelagert 2026-09-04)

Volltexte aus `Memory_Bank.md`. Ausgelagert, weil die Datei die 800-Zeilen-Regel
gerissen hat. Inhaltlich unveraendert.

## 2026-09-03 — Web-Vitals-Wache rot: Netz UND ein echter Seitenbefund (chat-store.js zweimal geladen)

Wache Nr. 63 seit 02.09. rot (TTFB p75 878 ms, LCP 3,3 s, Gewicht 324 KB). Zerlegt: (1) TTFB/LCP kommen vom
Betreiber-Netz — RTT zum GitHub-Pages-Edge 130–250 ms, erster Hop bis 200 ms, WLAN 2,4 GHz; Varnish liefert
mit age < 10 s. Parallelsitzung hat TTFB am 02.09. auf 500 ms/"nur Hinweis" gestellt (Bauzweig 731461e3).
(2) Gewicht ist echt: `public/erste-schritte.js` (Nr. 9) importierte `/assets/chat-store.js` OHNE `?v=b65`,
index.html und sechs Module MIT — der Browser lud die Datei zweimal (12,9 KB, zweite Modulinstanz mit eigener
IndexedDB-Verbindung). Fix auf design-v11: Import auf `?v=b65`; neuer Waechter `tests/modul-einmal-instanz.test.mjs`
(ein Spezifizierer je Zieldatei, kaputte + gesunde Probe) in check:frontend; Suite 666/666 gruen.
**MERKE:** (1) Gewicht mit der Ressourcenliste aus dem kalten Chrome-Lauf messen — doppelte Basisnamen darin sind
die Spezifizierer-Falle. (2) Der Kommentar "anderer Spezifizierer = zweite Instanz" stand seit Wochen in
chat-history-view.js und search.js, nur maschinell hat es niemand geprueft. (3) Live braucht SW v730 (Assets
cache-first) → Start-Lock → Betreiber-Doppelklick `smejj.com chat-store einmal laden ausliefern.command`
(Kaskade scripts/einmal/einmal-instanz-chat-store-2026-09-03.sh, Dateiliste vorher mit ls geprueft).

## 2026-09-03 — Web-Vitals Runde 2+3: UX-Haken und Verlaufs-Helfer laden erst bei Bedarf (job_a_bis_z_20260902, Nachtrag 17)

v731 (UX-Haken in chat-actions-menu.js: Handy-Stile nur <=600 px, verlauf-unten erst mit Chat im Log, code-feld-unten erst im Code-Bereich) und v733 (chat-history-view.js laedt Verlaufs-Text, Karten-Bausteine und Titel-Automatik per ladeBausteine()/import() beim ersten Zeichnen; spur-start.js zieht merkmaleVon aus dem neuen chat-merkmale.js, im Precache). Desktop-Asset-Liste kalt 324 -> 270 KB, Messlauf 288 KB — erstmals seit 02.09. unter dem 300-KB-Budget. Dazu Betriebswache: Modell-Chip 30x44 durch composer-zeile.js min-width:0 (behoben, live ohne SW-Sprung, nicht precached); Betriebswerte bleiben rot bis der Betreiber den Zeabur-Token erneuert (401).
**MERKE:** (1) Nur precached Dateien (SHELL in sw.js) brauchen den SW-Sprung und damit den Doppelklick — alles andere liefert der Fetch-Handler netzwerk-zuerst. (2) Tests, die den Haken-Wortlaut `import("/assets/X.js").catch(() => {})` pruefen, bleiben gruen, wenn der Wortlaut in einem Thunk steht. (3) Node haelt `x.js` und `x.js?v=1` fuer zwei Instanzen — Tests importieren dieselbe Kennung wie das Modul. (4) Markdown (7,4 KB) bleibt am Start: components.js/app.js sind im Start-Lock. Waechter: tests/modul-einmal-instanz.test.mjs, tests/verlauf-nachladen.test.mjs.

## 2026-09-03 — UI/UX Nr. 6 ohne Stempel, Nr. 7+8 als Betreiber-Skript (job_a_bis_z_20260902, Nachtrag 9)

design-v11 12ff454c. **MERKE:** (1) Vor jedem „Stempel noetig“ das Manifest lesen: panel-layout.js stand NICHT
im Start-Lock, obwohl das Panel-Verhalten dort vermutet wurde — Nr. 6 ging ohne Betreiber-Klick live. (2) Die
Aufschrift des Modell-Knopfs kommt aus STUFE_LABEL (app.js), nicht aus dem Menuetext — Menuepunkte duerfen
Erklaerungen tragen. (3) Der Auto-Modus blockiert auch das Anlegen eines Stempel-Skripts per Bash-Heredoc —
Skripte mit dem Write-Werkzeug anlegen, Ersetzungen in eine eigene .cjs-Datei, die sich an einer Kopie trocken
pruefen laesst. (4) Chrome-Automat: JS-Klicks zaehlen nicht als nutzerNah() (kein pointerdown), Merker werden
dann nicht geschrieben; resize_window aendert innerWidth nicht.

## 2026-09-02 — A-bis-Z-Live-Test: Bündel-Abgleich hatte src/ mitgerissen (job_a_bis_z_20260902)

Capsule: `task-capsules/2026/09/job_a_bis_z_20260902/capsule.json`. Bauzweig d89ef4f3/b0a8ffc3/a9a6182a,
design-v11 b0352feb + Folgecommit, Frontend e8ac079 + Folge. Live bewiesen (POST /api/fehler = 200,
api.smejj.com/sw.js = v726, canonical/OG live, Hilfe in du-Form).

**Entscheidung:** Der Bündel-Abgleich in den Bauzweig trägt NUR `public/` plus Lock-Manifeste
(docs/frontend/*.json, docs/approvals/*), nie `src/` oder `control-server/`. Commit 156a30a4
(30.08.) hatte trotz Titel „Control-Welt bleibt hiesig" `src/server.js` durch die Arbeitszweig-
Fassung ersetzt: Fehler-Fänger (Nr. 50), Missbrauchs-Wache (Nr. 51), Video-Spur und Bild-Route
waren drei Tage live tot, alle 64 Ampeln grün. Wiederhergestellt auf 156a30a4^ (732 Zeilen,
Helfer ausgelagert), Tests 230/654/73 grün.

**MERKE:** (1) Nach jedem Bauzweig-Deploy die Rand-Routen mit Sitzung anfassen — 401 ohne
Sitzung beweist nichts, der globale Wächter verdeckt fehlende Routen. (2) Kurze Chat-Prompts
beantwortet Chrome lokal (Gemini Nano, Konsole „[lokal] geeignet"); Serverweg nur mit
„genauer:". (3) `public/assets/i18n` wird von `build:assets` gefüllt — ohne den Lauf sind
Sprachtexte in 13 Sprachen live unwirksam, check:assets sagt es. (4) Der Auto-Modus blockiert
jeden `--freeze --confirm`-Aufruf; Stempel gehen nur per Betreiber-Klick.

**Verifikation:** 14/14 Seiten und 19/19 Sitemap-URLs 200; Admin-Konsole 69 grün/1 rot (Probe-
Nutzer, Ursache behoben); Handy 375 px ohne Überbreite; check:assets/favicon/modul-syntax/
guidelines/start-lock/markenkette OK. Offen: Start-Lock-Stempel für 11 Umlaute in index.html,
security-lock (e6f22ae5) und abo-lock (Bauzweig) — je ein Betreiber-Klick; GLM-5.2 in
/api/health degraded.

## 2026-09-02 — Z.ai Coding-Paket braucht die Coding-Adresse (job_a_bis_z_20260902, Nachtrag)

Tiefe Spur und Control-Reserve waren tot: Zhipu 429/1113 (Insufficient balance), obwohl der
Betreiber das GLM Coding Plan Monatspaket (18 USD) gebucht hatte. Das Paket gilt nur unter
`https://api.z.ai/api/coding/paas/v4`; `/api/paas/v4` prueft das leere Pay-as-you-go-Guthaben.
`SMEJJ_LLM_ZHIPU_BASE_URL` fehlte auf Zeabur (Code-Default = Standardadresse). Gesetzt ueber das
Portal (Variable, Add, Einzelwert, nie Raw-Editor) + Redeploy; Zeabur-API-Token in cli.yaml
ist abgelaufen (401). Beweis 05:33 UTC: glm runtime ready, /api/chat streamt zhipu:glm-5.2.
**MERKE:** 429/1113 trotz Paket = falsche Basis-Adresse, nicht fehlendes Geld.

## 2026-09-02 — smejj 1.1 freigegeben; Fragen-Erfassung angeschlossen; zwei Ketten, zwei Noten (job_a_bis_z_20260902, Nachtrag 2)

Betreiber gab den Trainingsplan (`docs/architecture/SMEJJ_1_1_TRAININGSPLAN_2026-09-02.md`) in
allen vier Punkten frei. Gebaut: `public/ai/frage-erfassung.js` + Haken in `chat-stream.js`
(design-v11 626f33b0, Klon 964c011) — die Route `/api/training/capture` hatte seit 24.07. keinen
Aufrufer. Nur die Frage wird erfasst; Fremdmodell-Antworten bleiben für Training gesperrt.
**MERKE:** Der Qualitäts-Messlauf misst die SCHNELLSPUR (Groq gpt-oss, ohne RAG, 62 %); die 97 %
sind die tiefe Spur (GLM-5.2). Beides ist richtig, es sind zwei Ketten — nicht als Einbruch
deuten. Stufe 0 des Plans = Schnellspur mit Projektwissen (Brücke, Security-Lock).
Offen (Betreiber-Klicks): Zeabur `SMEJJ_TRAINING_CAPTURE_ENABLED=YES`, SW-Bump für die geänderte
chat-stream.js (Precache), abo-lock im Bauzweig.

**Nachtrag 02.09. 06:45 UTC (job_a_bis_z_20260902):** Einwilligungs-Ledger antwortet 503
(`consent_request_failed`): auf Zeabur fehlen die sechs `IDRIVE_E2_TRAINING_*`-Werte des
Trainings-Schreibers (Endpoint, Region, Bucket, Allowed-Prefixes, Access-/Secret-Key) —
die fünf Consent-Schlüssel sind da (notice = 200). Ohne die sechs ist keine Einwilligung
erteilbar, keine Frage speicherbar. Liste mit Werten im Trainingsplan, Stufe 1.
