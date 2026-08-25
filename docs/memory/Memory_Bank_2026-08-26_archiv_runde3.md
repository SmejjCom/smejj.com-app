# Memory_Bank-Archiv — dritte Runde (ausgelagert 2026-08-26)

Volltexte unveraendert aus Memory_Bank.md uebernommen; Kurzverweise stehen dort.

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

Capsule: `task-capsules/2026/08/job_modelle_medien_20260818/capsule.json`, Volltext
wortgleich: `task-capsules/2026/08/job_modelle_medien_20260818/capsule.md`
(Object Brain: `s3://smejj-model-files/capsules/app/job_modelle_medien_20260818/`).
Rollback `stand-2026-08-17-v545` -> abgenommen `stand-2026-08-18-v546`.
Live: `smejj-shell-v578`, `code-flaeche.js?v=40`, Control-Bau 2026-08-18T00:42Z.

Sechs Fehler, jeder live an der Produktionsdomain nachgewiesen — die Merkregeln:

- **Eine Bremse nie ueber teure UND billige Wege legen.** `/status`, `/models`
  und `/chat` teilten einen Rate-Eimer; das Modell-MENUE bekam 429, und der
  Code las das als "kein Key". Fix: getrennte `leseGate` fuer die GET-Wege.
- **Eine Laengengrenze als Heuristik-Schutz darf den EINDEUTIGEN Fall nie
  mitfangen.** `istMedienAuftrag()` warf Bildauftraege ueber 600 Zeichen auf den
  Textweg — die Weiche sitzt vor der Modellwahl, also traf es ALLE Modelle.
- **Der Auto-Router war eine Annahme.** 14 Modelle x 19 AUSGEFUEHRTE Testfaelle
  (Code wirklich laufen lassen) ordneten ihn neu; minimax-m3 19/19 in 8 s.
- **Bilder als Base64-Salat:** sieben Kettenglieder waren gesund, schuld war EINE
  fehlende Umgebungszeile (`SMEJJ_CHAT_SYNC_ENABLED`, verloren am 14.08.).
- **Bei "haengt" nicht den Dienst-Status lesen** (RUNNING sagt nur, dass ein
  Prozess laeuft), sondern den FORTSCHRITT. Dazu: `streamChatAnswer` bricht nach
  90 s ohne ein einziges Byte ehrlich ab.
- **Bevor eine Performance-Zahl eine Optimierung ausloest, eine bekannt schnelle
  Fremddomain im selben Lauf gegenmessen** — der Engpass war das Messnetz
  (`webvitals_2026-08-19_messnetz-verfaelscht.json`, gueltig bleibt
  `webvitals_v214_abnahme_2026-08-04.json`).

Neuer Waechter daraus: `npm run check:funktionen-live` meldet live abgeschaltete
Funktionen ohne Token (503 = aus, 401 = an). 42 Tests gruen, unter 0,03 USD.


