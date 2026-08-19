# Memory_Bank.md — Verifiziertes Gedaechtnis von smejj.com
Nur verifizierte, erfolgreiche Loesungen und Architekturentscheidungen. Kein Eintrag ohne bestandene Verification Pipeline. Fehlgeschlagene Builds und Halluzinationen werden niemals aufgenommen.
## Eintragsformat
Jeder Eintrag nennt Datum, Typ, Capsule, Entscheidung, Begruendung und Verifikation.
---
## Architekturentscheidungen

### [2026-08-18] 800-ZEILEN-REGEL: MODELL-MENUE HERAUSGELOEST (job_modul_modellmenue_20260818)

Capsule: `task-capsules/2026/08/job_modul_modellmenue_20260818/capsule.json`
(Object Brain: `s3://smejj-model-files/capsules/app/job_modul_modellmenue_20260818/`).
Frontend live: `29d897f`, App-Repo `bb675cd` / `6e2a8cd` / `17fca3c`.

**Entscheidung:** `public/code-flaeche.js` war ueber mehrere Ausbaustufen auf
1183 Zeilen gewachsen (Limit 800) — ein Verstoss der eigenen Sitzung, nicht
geerbt. Herausgeloest wurde `public/code-modell-menue.js` (421 Zeilen):
Modellwahl-Speicher, Kurznamen, Katalog-Gedaechtnis, Modell-Menue.
`code-flaeche.js` steht jetzt bei 800.

**Begruendung:** Geschnitten wurde am Block, der fuer sich steht. Der
Rueckschnitt darf keinen Ringschluss erzeugen — das Modul importiert
`code-flaeche.js` NICHT zurueck: die Stufenanzeige kommt als Parameter herein
(`modellAnzeige(hausText)`), das Neu-Zeichnen als Rueckruf (`kontext.beiWahl`).
Kennung ohne `?v` wie `config.js`, sonst entstuende eine zweite Modulinstanz mit
eigenem Zustand (`check:module-queries`).

**Verifikation:** `check:guidelines` fuehrt `code-flaeche.js` nicht mehr;
`check:architecture` 7/0; `check:frontend` 497 gruen (vorher 492) — die 5 roten
bestehen VOR und NACH der Arbeit identisch (per `git stash` gegengeprueft) und
stammen aus `public/app.js` einer fremden Sitzung. Live byte-verifiziert:
sha256 von `code-flaeche.js` und `code-modell-menue.js` live == lokal,
`index.html` traegt `?v=41`, `sw.js` `CACHE_NAME v581`.

**MERKREGELN aus diesem Lauf**

1. **CACHE_NAME live messen, nicht aus dem Repo schliessen.** `v579` war beim
   Deploy schon vergeben, `v580` beim zweiten Anlauf ebenfalls — beide von einer
   Parallelsitzung. Zwei gleichnamige Shells heissen: Bestandsnutzer behalten je
   nach Zufall die alte Dateiliste. `curl https://smejj.com/sw.js` vor jedem Bump.
2. **`git checkout -B` auf einen dirty Baum verschleppt frueheres sed.** Der
   Precache-Eintrag stand danach DOPPELT im ausgelieferten Service Worker. Wer
   punktuell deployt, setzt die Zieldateien erst hart auf `origin/main`
   (`git checkout origin/main -- <datei>`) und wendet die Aenderung dann neu an.
3. **`public/assets/` ist keine Kopie, sondern eine eigene Zeitachse.** Sie hinkte
   einer fremden Sitzung hinterher (`app.js b58`, `maus-absicht.js` fehlte). Ein
   Vollkopieren `public/ -> public/assets/` haette deren Arbeit ueberschrieben —
   punktuell nachziehen, nie `cp` ueber die ganze Datei.
4. **Ein Waechter kann gruen sein aus falschem Grund.** Die erste Fassung des
   Tests registrierte den Chip auch im Fall "ohne Chip" — sie mass nichts.
   Erst der TUEV (Rueckruf-Draht kappen -> ROT, heilen -> GRUEN) beweist, dass
   ein Test etwas prueft. Und: das Modul wird AUSGELOEST (Klick auf die
   Auto-Zeile), nicht nur importiert — ein Import-Test findet den stillen
   Bruch beim Auslagern nicht.

### [2026-08-19] KOSTENARCHITEKTUR: SIEBEN HEBEL, KEINE DECKEL (job_kostenarchitektur_20260819)

Capsule: `task-capsules/2026/08/job_kostenarchitektur_20260819/capsule.json`
(Object Brain: `s3://smejj-model-files/capsules/app/job_kostenarchitektur_20260819/`).
Tags: `stand-2026-08-18-kosten-cache-scharf`, `stand-2026-08-18-gratis-stufe0`,
`stand-2026-08-19-cache-kreativ`; Frontend `stand-2026-08-18-gratis-stufe0` (9c68294).

**Entscheidung:** Kosten werden durch ARCHITEKTUR gesenkt, nicht durch Limits.
Ein Tagesdeckel wurde vorgeschlagen und vom Betreiber abgelehnt ("unbeschraenkt,
kostenlos"). Stattdessen wandert die Rechenarbeit auf das Geraet des Nutzers.

**Begruendung:** Vorher wusste der Server nicht, was eine Anfrage kostet — der
`usage`-Block wurde verworfen. Die erste Messung widerlegte die eigene
Rangfolge: groesster Posten waren **Denk-Tokens mit 56 % der Rechnung**, in der
Planung Platz fuenf. Sieben Hebel, jeder live belegt (Details in der Capsule):
Token-Messung; Prompt-Caching (`ein 8.884 / cache 8.832` = 99 %); Denk-Bremse
(1.378 -> 46 Tokens, Tagesanteil 76 % -> 30 %); Zeitbudget (21.000 Zeichen
laufen durch); Kontext-Diaet mit Symbol-Index (240.000 -> 15.000 Tokens, also
1,20 -> 0,075 USD je Anfrage); semantischer Cache (85 ms statt 2.950 ms, erst
im Schatten, dann scharf); Gratis-Stufe 0 (Chromes eingebautes Modell, 200 ms
bis zum ersten Zeichen, 49 % von 111 echten Chats). Laufende Zusatzkosten: 0 EUR.

**Verifikation:** 324/325 Tests gruen (der rote gehoert einer Parallelsitzung);
`check:architecture` 7/7; `check:guidelines` fuer src/server.js eingehalten
(906 -> 797 Zeilen, in vier Module zerlegt). Live nach dem Bau 03:36:30Z: zwei
echte Anfragen ueber den Agenten-Weg, `spur='agent'`, `DENK 0`.

**Lehre:** Fuenf Fehler dieser Sitzung fand erst der Live-Lauf, keiner die Tests.
Eine reine Funktion beweist die REGEL, nicht ihre VERDRAHTUNG.

**Offen:** Die Performance-Budgets werden derzeit NICHT erreicht (TTFB p50
1.387 ms gegen 200 ms; Control-API p95 3.607 ms gegen 300 ms; erste Messung
ueberhaupt, daher kein Vergleichswert). LCP/INP/CLS fehlen — sie brauchen einen
Browser. Memory_Bank.md steht bei 855 Zeilen ueber dem 800-Limit; das Archivieren
alter Eintraege beruehrt fremde Aufzeichnungen und braucht eine Freigabe.


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

### [2026-08-18] MODELL-MENUE, BILDER, VIDEO UND AUTO-ROUTER (job_modelle_medien_20260818)

Capsule: `task-capsules/2026/08/job_modelle_medien_20260818/capsule.json`
(Object Brain: `s3://smejj-model-files/capsules/app/job_modelle_medien_20260818/`).
Rollback `stand-2026-08-17-v545` -> abgenommen `stand-2026-08-18-v546`.
Live: `smejj-shell-v578`, `code-flaeche.js?v=40`, Control-Bau 2026-08-18T00:42Z.

Sechs Fehler, jeder live an der Produktionsdomain nachgewiesen:

- **Eine Rate-Bremse fuer teure UND billige Wege.** `/status`, `/models` und
  `/chat` teilten einen Eimer (capacity 12, refill 0,2/s); `/chat` kostet 2
  Marken. Nach sechs Nachrichten bekam das Modell-MENUE 429 — und der Code las
  das als "kein Key". Fix: getrennte `leseGate` (60 / 1 pro s) fuer die
  GET-Wege, Menue merkt sich Status und Katalog, 429 wird ehrlich gemeldet und
  selbst nachgeladen. Nachweis: 30x `/models` = 0x 429; mit leergefahrener
  Chat-Bremse (200x6, dann 429,429) zeigte das Menue trotzdem alle 16 Modelle.
  **Merkregel: eine Bremse nie ueber teure und billige Wege legen — der Nutzer
  erlebt den Ausfall dort, wo niemand die Ursache vermutet.**
- **600-Zeichen-Falle bei Bildauftraegen.** `istMedienAuftrag()` warf jeden
  Auftrag ueber 600 Zeichen auf den Textweg; die Weiche sitzt vor der
  Modellwahl, also traf es ALLE Modelle. Fix: ein Auftrag, der MIT dem
  Malauftrag beginnt, zaehlt in jeder Laenge. **Merkregel: eine Laengengrenze
  als Heuristik-Schutz darf den EINDEUTIGEN Fall nie mitfangen.**
- **Der Auto-Router war eine Annahme.** 14 nutzbare Modelle x 19 AUSGEFUEHRTE
  Testfaelle (Code im Blob-Worker wirklich laufen lassen, nicht gelesen):
  minimax-m3 19/19 in 8 s, claude-opus-5 19/19 in 12 s, gpt-5.6-sol 19/19 15 s,
  mimo-v2.5-pro 16 s, glm-5.3 29 s, deepseek-v4-flash 30 s, deepseek-v4-pro
  38 s, kimi-k2.7-code 40 s, glm-5.2 78 s, kimi-k3 79 s, qwen3.7-plus 86 s,
  qwen3.8-max 122 s, kimi-k2.6 184 s. Einziger Ausreisser: mimo-v2.5 14/19.
  Folge: Denk-Woerter kosten kein Guthaben mehr, Opus 5 nur noch bei Dateien
  oder ueber 4000 Zeichen. Blindgaenger (HTTP 200, 0 Zeichen, 90-123 s):
  qwen3.7-max und x-ai/grok-4.5.
- **Bilder erschienen als Base64-Salat.** SIEBEN Kettenglieder waren gesund;
  schuld war EINE fehlende Umgebungszeile (`SMEJJ_CHAT_SYNC_ENABLED`, verloren
  am 14.08.): die Medien-Ablage gab 503, das Bild blieb als 512-KB-data:-URL im
  Chat und wurde bei exakt 524288 Zeichen mittendrin abgeschnitten. Fix per
  EINZEL-Mutation + Control-Neubau. Nachweis: 512x512-Bild im Chat.
- **Video hing 15 Minuten stumm.** Beide Dienste meldeten RUNNING, `/health`
  gab 200 — verraeterisch war ein NICHT-Ereignis: der Fortschritt stand still,
  obwohl die Bruecke alle 10 s taktet. Ein haengender Auftrag belegte den
  einzigen Video-Platz. Fix: Neustart Bruecke + Worker. Nachweis: 640x640-MP4
  in 103 s. **Merkregel: bei "haengt" nicht den Dienst-Status lesen (RUNNING
  sagt nur, dass ein Prozess laeuft), sondern den FORTSCHRITT.**
- **Stille-Wache.** `streamChatAnswer` bricht nach 90 s ohne ein einziges Byte
  ab und sagt es ehrlich; Teilantwort bleibt stehen. 90 s liegt bewusst ueber
  dem 10-s-Takt der Bruecke.

Dazu auf Betreiber-Auftrag: **Auto steht jetzt an erster Stelle** im
Modell-Menue, `smejj 1.0` darunter (live geprueft an
`smejj.com/assets/code-flaeche.js?v=40`).

**Verifikation:** 42 Tests gruen; `check:start-lock` gruen und frisch
gestempelt; `check:guidelines` unveraendert bei 17 Altlast-Meldungen (gegen den
Vorgaenger-Commit gemessen, keine gehoert dieser Arbeit);
`npm run check:funktionen-live` — alle 7 Kernwege antworten.

**Benchmark mit Vorbehalt:** `docs/benchmarks/webvitals_2026-08-19_messnetz-verfaelscht.json`.
Die Budgets sind formal verfehlt (TTFB p75 1765 ms, LCP p75 4096 ms), aber die
MESSUNG ist unbrauchbar: im selben Lauf mass `example.com` 4,66 s TTFB und
`github.com` 10,1 s; der TLS-Handshake kostete auf ALLEN Domains 1,7-3,1 s.
Der Engpass ist das Messnetz dieses Rechners — smejj.com war die schnellste der
vier Domains. Kein Ship-Loop, keine Regression. **Merkregel: bevor eine
Performance-Zahl eine Optimierung ausloest, eine bekannt schnelle Fremddomain
im selben Lauf gegenmessen.** Letzter gueltiger Benchmark bleibt
`webvitals_v214_abnahme_2026-08-04.json`.

**Kosten:** unter 0,03 USD Guthaben fuer den gesamten Abend; 26 Abo-Anfragen
aenderten das Guthaben nicht. Keine neue laufende Kostenposition.

**Neuer Waechter:** `npm run check:funktionen-live` meldet Funktionen, die sich
live als abgeschaltet ausgeben — ohne Token, weil die Abschalt-Pruefung vor der
Anmeldung laeuft (503 = aus, 401 = an). Gebaut, weil die Medien-Ablage
wochenlang aus war und es niemand sah.


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

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-05_websuche_komposita.md](docs/memory/Memory_Bank_2026-08-05_websuche_komposita.md).

## 2026-08-05 — Abschlussmessung 15-Formen-Korpus: verworfen, aber verunreinigt gemessen

Volltext: [docs/memory/Memory_Bank_2026-08-05_abschlussmessung_15formen.md](docs/memory/Memory_Bank_2026-08-05_abschlussmessung_15formen.md).
Alle drei Korpus-Blocker umgesetzt (Zerleger ====/Kopier-Zaun, Regeldokumente
als Quellen, 15 Schablonen freigegeben); Korpus 10.845 Zeilen auf IDrive
(`1d415f97a6f1`). Zyklus 3 (lr5e-5, r8): **62,75 %, kritisch 8 — verworfen**
(Grundlinie 95,88 %). ABER: der gemessene Korpus enthielt noch 12 %
SW_VERSIONSVERLAUF-Rauschen (Ausschluss kam erst mit `eefb216`). Die
eigentliche Frage ist damit ungemessen — naechster Schritt: sauberer Neubau +
EIN Messzyklus (~6 Cent). Nebenbei behoben: EIN Statusabfrage-Timeout
verwarf einen bezahlten Lauf (jetzt 3er-Toleranz, `deae025`); Salad-batch
verdraengte den Trainer real (0 USD, korrektes Fail-closed). Verbrauch
0,13/50 USD.

## 2026-08-05 — Datenschutzerklaerung um Fragen-Erfassung ergaenzt (NICHT ausgeliefert)

Abschnitt 10 nennt jetzt ausdruecklich die an den Assistenten gerichteten Fragen
— **ohne die Antworten**, weil die von Fremdmodellen stammen — und beschreibt,
dass Eingaben mit Zugangsdaten VOLLSTAENDIG verworfen statt bereinigt werden.
Stand auf 5. August 2026 gesetzt.

    alter Hash  d0172df62819934b0f8a0610985b5026185b86d527635bc596f54785019aeeb2
    neuer Hash  89cccf58e723113c0b9a4e17290e3136885f082bf9094238f69f6236258d4c8b

- **REIHENFOLGE IST HIER SICHERHEITSRELEVANT.** `SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256`
  im Control Server MUSS auf den neuen Hash gesetzt werden. Geht das Dokument
  vorher live, veroeffentlicht `/api/training/consent/notice` weiter den ALTEN
  Hash — Nutzer lesen dann den neuen Text und willigen unter dem alten ein.
  Umgekehrt genauso falsch. **Beides gehoert in denselben Wartungsschritt.**
- Darum ist die Aenderung committet, aber BEWUSST NICHT ins Frontend-Repo
  ausgeliefert. Das ist kein vergessener Schritt.
- FOLGE fuer bestehende Einwilligungen: sie sind an den alten Hash gebunden und
  werden mit der Umstellung ungueltig. Das ist das gewollte Verhalten — eine
  Einwilligung gilt fuer den Text, den der Nutzer gelesen hat.

**Uebergabe an die Parallelsitzungen (Stand dieses Nachzugs):**
- ROT in der Suite: `Katalog-Anbieter aktivieren sich nur per Key…`
  (`control-server/src/llm/modelRouter.test.js`) — gehoert zur laufenden
  Auto-Router-Arbeit, bewusst nicht angefasst.
- Start-Lock offen: `public/start-styles.css`, `public/browser-pane.css`
  sind VERAENDERT. Beide gehoeren zu laufender fremder Arbeit. **Bewusst NICHT
  gestempelt** — ein Stempel haette unfertige fremde Aenderungen als
  abgenommen eingefroren (Regel: Sperre pruefen, nicht stempeln).

## 2026-08-19 — LIVE-BEFUND: `zeichne is not defined` in code-flaeche.js

**Gemessen im Chrome des Betreibers gegen den ausgelieferten Stand
(`code-flaeche.js?v=41`, sw v582):** Beim Oeffnen der Code-Seite wirft
`initCodeFlaeche` dreimal `ReferenceError: zeichne is not defined`
(Zeilen 788/792/793 und 761).

**Ursache — dasselbe Muster wie die vier stillen Abstuerze vom 17.08.:**
Beim Auslagern des Modell-Menues nach `public/code-modell-menue.js`
(Commit bb675cd) wanderte `zeichne()` mit; die AUFRUFE blieben in
`code-flaeche.js` zurueck. Dort ist die Funktion weder definiert noch
importiert, und das Modul exportiert sie nicht.

**Konkrete Folge (live nachgemessen, nicht vermutet):**
- Die Kernfunktion LAEUFT: Senden, Log-Adoption und Antwort sind bewiesen
  ("Bereit" kam zurueck). Die Bindungen davor stehen.
- Kaputt ist der SCHWANZ von `initCodeFlaeche` nach dem ersten Wurf:
  der Gruss zieht den Profilnamen nicht mehr nach, und die Chips
  (Modell, Stufe, Projekt) aktualisieren sich nicht mehr bei Klicks.

**Warum hier NICHT behoben:** `code-flaeche.js` ist die aktive Baustelle
einer Parallelsitzung (Commit von eben). Ein Eingriff waere eine Kollision
mit laufender fremder Arbeit. Der Fix selbst ist klein: `zeichne` wieder
definieren oder aus dem Modul exportieren und importieren.

**Merkregel (jetzt viermal bestaetigt):** Nach JEDER Auslagerung eines
Moduls einmal `grep -n "<symbol>" alte-datei.js` gegen Definition UND
Import halten — und die Seite im Browser oeffnen. Kein Test faellt darauf,
weil die Tests den Quelltext lesen statt den Pfad auszufuehren.
