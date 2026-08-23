# Memory_Bank.md — Verifiziertes Gedaechtnis von smejj.com
Nur verifizierte, erfolgreiche Loesungen und Architekturentscheidungen. Kein Eintrag ohne bestandene Verification Pipeline. Fehlgeschlagene Builds und Halluzinationen werden niemals aufgenommen.
## Eintragsformat
Jeder Eintrag nennt Datum, Typ, Capsule, Entscheidung, Begruendung und Verifikation.
---
## Architekturentscheidungen

### [2026-08-23] MEMORY_BANK BEWACHT SICH JETZT SELBST (job_memory_bank_waechter_20260823)

Capsule: `task-capsules/2026/08/job_memory_bank_waechter_20260823/capsule.json`.
Neu: `npm run check:memory-bank`, eingehaengt in `check:all` nach check:guidelines.

Diese Datei ist die EINZIGE, die von selbst waechst — die 800-Zeilen-Regel reisst
hier darum immer wieder (868->649 am 03.08., 891->733 am 23.08., dazwischen 20 Tage
ohne Aufsicht). Ein Ratchet waere falsch: sie MUSS wachsen duerfen. Der Waechter
warnt deshalb ab 760 Zeilen MIT den drei laengsten Abschnitten (Exit 0, blockiert
keine Parallelsitzung) und meldet erst ab 800 einen Fehler. Wichtiger als die
Laenge ist seine zweite Zusage: jeder Verweis auf ausgelagerten Volltext muss
existieren — eine Kurzfassung, die ins Leere zeigt, sieht vollstaendig aus und ist
Verlust. TUEV: 8 Proben in `tests/waechter-tuev.test.mjs`, je Zusage kaputt UND
gesund.

MERKREGEL aus dem ersten Lauf: er schlug zweimal FALSCH an — auf ein Archiv im
Projektstamm (Muster kannte nur `docs/`) und auf `admin/index/analytik-tage.json`,
einen IDrive-e2-Schluessel. Ein Backtick-Pfad ist nur dann eine Repo-Datei, wenn
sein erstes Segment als Verzeichnis existiert. Beide Faelle stehen jetzt als
Regressionsprobe im TUEV — ein Waechter, der Arbeit erfindet, wird bald ignoriert.

### [2026-08-23] DER ROTE PRESIGN-TEST WAR EINE VERALTETE ZUSAGE (job_presign_test_20260823)

Capsule: `task-capsules/2026/08/job_presign_test_20260823/capsule.json`.
Bauzweig `cb261438`.

**Befund:** `tests/control-server.test.mjs` erwartete HTTP 200 fuer einen
Presign-Upload OHNE jede Anmeldung. Genau das war die Luecke, die Commit
`d2b30d7e` am 2026-08-14 geschlossen hat — signierte Speicheradressen waren
fuer jeden Angemeldeten zu bekommen. Der Test forderte woertlich das
Verhalten zurueck, das aus Sicherheitsgruenden abgeschafft wurde. Kein
Defekt.

**Warum er neun Tage stand — das ist die Lehre:** Im Arbeitszweig war er am
22.08. nachgezogen (`3b25e41a`). Der BAUZWEIG, aus dem der Control-Server
live gebaut wird, hat den Nachzug nie bekommen. Ein dauerhaft roter Fall
faerbt die ganze Suite und macht den naechsten echten Fehler unsichtbar.
Wer im Arbeitszweig einen Test repariert, hat ihn im Bauzweig nicht
repariert.

**Live geprueft, die Kette ist gesund:** ohne Anmeldung 401; der Nutzerfall
(Replay-Download auf `capsules/maus-engine/`) 200 mit signierter Adresse;
Upload als Betreiber 200; fremder Pfad 403 `object_key_not_allowed` — die
Pfadsperre greift zusaetzlich zur Rollenpruefung. `check:control-server` im
Bauzweig 232/232 (vorher 229/230).

**Nebenbefund:** Arbeitszweig und Bauzweig sind divergiert — 589 Commits,
davon 56 Serverdateien, und NICHT einseitig (der Bauzweig ist an Stellen
neuer). Stichprobe an den auffaelligsten Faellen: `/v1/models`,
`/v1/chat/completions`, `/api/developer/keys` antworten live mit 401, die
Funktionen sind also da — nur ueber andere Commits. Kein Beleg fuer
fehlende Funktionen, aber ein Zusammenfuehren waere eine Betreiber-
Entscheidung, kein Nebenbei.


### [2026-08-23] "REQUEST TOO LARGE" IST 413, NICHT 500 (job_http_413_20260823)

Capsule: `task-capsules/2026/08/job_http_413_20260823/capsule.json`.
Arbeitszweig `c2c2ca66`, `f7b72436`, `ce706bd4`. Bauzweig `fd95cde5`, `b32860de`.
Control neu gebaut: `gestartetAm` 05:38:26 -> 05:39:33.

**Entscheidung:** Ein Fehler bringt seinen HTTP-Status selbst mit
(`httpFehler`/`zuGrossFehler` in `control-server/src/http/respond.js`), und der
oberste Handler nimmt ihn (`fehlerAntwort`). An der Quelle behoben, nicht in
der einen Route, die aufgefallen ist — es wirkt fuer jede Route auf einmal.

**Begruendung:** Der Body-Leser warf ein nacktes `new Error("Request too
large")`. Der oberste Handler macht aus jedem Fehler ohne Status ein 500 —
der Client bekam fuer eine Absage, die ER verursacht hat, einen SERVERFEHLER.
Das Frontend behandelte (voellig richtig) nur 4xx als "der Server nimmt das
nicht": sechs zu grosse Chats fielen wochenlang durch jede Pruefung, weder
gerettet noch gemeldet. Ein 500 heisst "unser Fehler, versuch es spaeter", und
genau das hat die App getan.

**Der zweite Befund, und der wichtigere — gefunden erst NACH dem Ausrollen:**
Der 413 kam korrekt zustande, aber er kam nicht an. Ein 1,2-MB-Upload lief 60
Sekunden ins Leere und endete im Zeitablauf. Der Leser lehnt ab, der Client
weiss nichts davon und sendet weiter, und HTTP/1.1 laesst die Antwort erst
durch, wenn der Request zu Ende ist. Das war eine VERSCHLECHTERUNG durch den
eigenen Commit: ein Zeitablauf ist schlimmer als ein falscher Statuscode, denn
dann sieht der Nutzer gar nichts mehr. `fehlerAntwort` schliesst bei 413 jetzt
aktiv (`req.destroy()`) — nur bei 413, andere Fehler abzuschneiden koennte eine
gueltige Antwort verstuemmeln. Das ist zugleich eine Lastfrage: ein Server, der
abgelehnte Uploads trotzdem vollstaendig entgegennimmt, verschenkt genau die
Bandbreite, die er sich sparen wollte.

**Verifikation live nach dem Bau:** 1172 KB -> `413 request_zu_gross` in 2,7 s;
684 KB -> `400 chat_zu_gross` in 2,1 s (unveraendert); echten Chat speichern
200 in 0,4 s; Liste abrufen 200 in 0,5 s; `istZuGross(413)` im Frontend true.
`check:control-server` 230/230 im Arbeitszweig, 229/230 im Bauzweig — die eine
Rote (`storage presign route`) ist dort eine Altlast, per `git stash`
gegengeprueft.

**Nebenbei gelernt (zweimal an einem Tag):** ein Waechter, der eine Datei
festnagelt, schuetzt nach einem Umzug nichts mehr. Derselbe Auth-Body-Leser
steht im Arbeitszweig in `server.js` und im Bauzweig in
`server-session-helpers.js`. Der Waechter SUCHT die Stelle jetzt.


### [2026-08-23] ZEHN CHATS WAREN NICHT GESICHERT — BESTAND GERETTET (job_chats_zu_gross_20260823)

Capsule: `task-capsules/2026/08/job_chats_zu_gross_20260823/capsule.json`, Volltext
wortgleich: `task-capsules/2026/08/job_chats_zu_gross_20260823/capsule.md`
(Nachmittags-Teil zusaetzlich: `task-capsules/2026/08/job_verlauf_vorsorge_20260823/capsule.md`).
App-Repo `8f9a4ef3`, `b151770c`, `ed73fb6e`. Frontend `e2b5ccb`, `4acfd9f`, `722fe06`. sw v652 -> v657.

Zehn von 113 Chats lagen ueber der 512-KB-Grenze und damit seit Wochen NUR auf
einem Geraet — nie zu viel Text, immer ein Medium, dreifach abgelegt
(text/html/raw). FUENF Befunde nacheinander, jeder erst durch den Live-Test
sichtbar; **die ersten Fixes waren richtig und haetten trotzdem nichts bewirkt:**

1. Ein Fix beim SPEICHERN wirkt nur VORWAERTS — Bestand holt sich nicht selbst
   ab. → `public/chat-medien-rettung.js`.
2. Der Server hat ZWEI Grenzen: 400 `chat_zu_gross` ab 512 KB, `500 Request too
   large` ueber 1 MB (Body-Leser VOR der Chat-Pruefung). Wer nur 4xx behandelt,
   hat einen blinden Fleck (hier sechs von zehn). → `istZuGross(status, grund)`.
3. Die Rettung darf nicht am Sende-Weg haengen: `push()` arbeitet 113 Chats der
   Reihe nach ab. → `raeumeBestandAuf()`, einmal am Tag, Deckel 25 je Lauf.
4. Reaktive Rettung reicht nicht: vier Chats UNTER der Grenze trugen trotzdem
   ein Video im `raw`. → `VORSORGE_BYTES = 128 KB`, nur im Bestandslauf.
5. `updatedAt` traegt ZWEI Bedeutungen (Sortierung und Sync). Unveraendert
   gelassen, ueberspringt `speichereChat` — lokal geheilt, serverseitig weiter
   466,6 KB. → `naechsterZeitstempel()`, eine Millisekunde, kein `new Date()`.

Live: Konto 15.076 -> 2.952,3 KB bei unveraendert 113 Chats, 0 ueber der Grenze;
ausgelagerte Medien wieder abrufbar (mp4 480 KB, png 384 KB). `check:frontend`
611/611. Offen (bewusst): das `500` sollte 413 sein — siehe job_http_413_20260823.
LEHRE: Eine Parallelsitzung loeste dasselbe am selben Tag gruendlicher, weil sie
LOKAL im Browser mass; serverseitig sieht man nur, was durchkam.


### [2026-08-23] MODELL-LISTE 100% GESICHERT — ZWEI SCHLOESSER (job_modellliste_lock_20260823)

Capsule: `task-capsules/2026/08/job_modellliste_lock_20260823/capsule.json`.
App-Repo `1784b2dc` (Schutz) und `6bb53322` (Ampel).
Rollback-Punkt: Tag `stand-2026-08-23-modellmenue-lock`.

**Anordnung des Betreibers im Wortlaut:** "Genau diese Liste ich will haben und
musst du sichern soll nicht geaendert werden nicht kaputt gemacht werden ohne
meine schriftliche Bestaetigung."

**Entscheidung:** Zwei getrennte Schloesser statt eines. Die Dateisperre
`scripts/check-modell-menue-lock.mjs` friert sechs Dateien byte-genau ein
(eigenes Manifest unter `docs/approvals/`, NICHT der Start-Lock — der wird
mehrmals taeglich neu eingefroren und wuerde die Liste sonst stillschweigend
mitabsegnen). Der Struktur-Waechter `tests/modellmenue-lock.test.mjs` prueft
die Substanz: Auto ganz oben, Gruppenfolge Cline Pass/Empfohlen, der
Katalog-Nachbau vorhanden, kein Deckel auf der Laenge, Quelle gleich
ausgelieferte Kopie.

**Begruendung — der Punkt, den ein naiver Schutz verfehlt:** Die lange Liste
steht NICHT im Code. Sie wird bei jedem Oeffnen frisch von
`GET /api/providers/cline/models` geholt. Wer nur die zwei Menue-Dateien
einfriert, laesst sie weiter jederzeit verschwinden: bleibt die Antwort leer,
faengt `code-modell-menue.js` den Fehler ab und zeigt nur noch das Hausmodell —
ohne Fehlermeldung, ohne rote Ampel. Darum stehen `clineClient.js` (der
Katalog-Holer mit seinem Vorrat) und `providerRoutes.js` (der Endpunkt) mit
unter Schutz. Aus demselben Grund braucht es BEIDE Schloesser: Hashes melden
jede Aenderung und sagen nichts ueber Funktion; der Struktur-Waechter meldet
den Ausfall und laesst harmlose Umbauten durch.

**Zweiter Befund, gleich mitbehoben:** Der Funktions-Waechter klopfte an
`/api/providers/cline/status`. Die Liste haengt aber an `/models`. Faellt sie
aus, bleibt `/status` gruen — genau so konnte der gemeldete Ausfall unbemerkt
bleiben. `/models` hat jetzt eine eigene Ampel (8 statt 7 Funktionen).

**Verifikation:** Waechter-TUEV auf beiden Schloessern — Dateisperre meldet bei
einer angehaengten Zeile "VERLETZT (1)" mit Exit 1 und wird nach dem
Zuruecksetzen wieder gruen; der Struktur-Waechter erkennt 5 kaputte Proben
(Auto nach unten, Gruppe entfernt, Katalog-Nachbau geloescht, `slice(0,10)`,
Abruf gekappt) und laesst 5 gesunde durch. `check:frontend` 591/591 gruen,
`check:json` gruen, `check:guidelines` unveraendert bei 18 Altlast-Meldungen.
Live byte-verifiziert: `/assets/cline-model-menu.js` und
`/assets/code-modell-menue.js` sind identisch zur Quelle (sha256
368a4de8eb1ac038 / c357d67f795dc475). Echter Klickpfad auf der
Produktionsdomain im angemeldeten Chrome, beide Menues vollstaendig, keine
Konsolenfehler.

**Grenze des Schutzes:** Er sichert unseren Code, nicht den fremden Katalog.
Wirft Cline selbst ein Modell raus, verschwindet es aus der Liste, ohne dass
hier eine Datei anders wird. Dagegen misst nur `check:funktionen-live`.


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

## Aeltere Eintraege

Die datierten Eintraege vom 2026-07-28 bis 2026-08-05 stehen vollstaendig in
[Memory_Bank_Archiv_bis_2026-08-05.md](Memory_Bank_Archiv_bis_2026-08-05.md)
(ausgelagert am 2026-08-20 wegen der 800-Zeilen-Regel, nichts geloescht).

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

## 2026-08-20 — Verlauf schlank, und ein toter Geraete-Sync kam ans Licht (job_verlauf_schlank_20260820)

Capsule: `task-capsules/2026/08/job_verlauf_schlank_20260820/capsule.json`, Volltext
wortgleich: `task-capsules/2026/08/job_verlauf_schlank_20260820/capsule.md`
(Object Brain: `s3://smejj-model-files/capsules/app/job_verlauf_schlank_20260820/`).
Tag `stand-2026-08-20-verlauf-schlank` auf `bb7c8e1`, Frontend live `44f35a5`.

Kern: `/api/chats?nurAbgleich=1` liefert nur id/updatedAt/ownerId; ein Chat wird
per `?id=` einzeln nachgeholt, und nur wenn er wirklich neuer ist. Der alte
Vertrag (GET ohne Parameter) bleibt fuer aeltere Clients. Gemessen: Seitengewicht
4.054 -> 1.174 KB, Chat-Verkehr 2.500 -> 15 KB, Einzelabrufe 14-24 -> 0,
Listen-Abruf 12.100 -> 2.330 ms; 100 Chats unversehrt, 31/31 Tests gruen.

DER EIGENTLICHE FUND, nicht behoben und entscheidungspflichtig: Server und Client
rechnen die Kontokennung verschieden (Server SHA-256 seit 15.08.,
`user_158c1e60…`; Client nach der alten Adressregel, `user_smejjcom_gmail_com`).
`gehoertNutzer` haelt die eigenen Chats fuer fremd, `importChat` gibt `false` —
der Geraete-Sync importiert nichts. Angleichen ist Rote Liste: `MAX_CHATS = 100`
wuerde `pruneOld()` ausloesen. LEHRE: Der Fehler war vorher genauso da, nur
unsichtbar; erst die schlanke Liste machte jeden Leerabruf einzeln sichtbar.


## 2026-08-20 — Startgewicht: die Code-Flaeche laedt erst beim Oeffnen (job_startgewicht_20260820)

Capsule: `task-capsules/2026/08/job_startgewicht_20260820/capsule.json`, Volltext
wortgleich: `task-capsules/2026/08/job_startgewicht_20260820/capsule.md`
(Object Brain: `s3://smejj-model-files/capsules/app/job_startgewicht_20260820/`).
Tag `stand-2026-08-20-startgewicht`, ausgeliefert mit `smejj-shell-v636`.

Kern: `code-nachladen.js` (1,79 KB) holt die Code-Flaeche erst, wenn `#code`
aufgeht — MutationObserver auf `#code.is-active`, NICHT IntersectionObserver.
Gewandert sind `code-flaeche.js` und `code-modell-menue.js`, netto 17,9 KB gzip
(sofort geladen 383 -> 365 KB). `app.js` blieb byte-identisch, weil die Funktion
sich selbst einhaengt. Noch offen: rund 128 KB gzip (Browser-Panel 59,9, Verlauf
38,2, Maus 10,8, Konto 7,6, Kamera 7,1, Sprache 4,3) — jede Verschiebung braucht
eine eigene Freigabe.

MESSFALLE ZUERST GEKLAERT: Der Service Worker liefert aus dem Vorrat, dann meldet
`performance.getEntriesByType` die ROHE Groesse und `transferSize: 0`
(chat-store.js: 40.711 B gemeldet, 13.048 B uebertragen). Gegen das 300-KB-Budget
zaehlen uebertragene Bytes, per gzip von aussen gemessen.

---

## 2026-08-23 — V11 komplett, Medien-Fix, und vier Pruefer, die nichts prueften

Volltext, wortgleich: [docs/memory/Memory_Bank_2026-08-23_v11_pruefer_medien.md](docs/memory/Memory_Bank_2026-08-23_v11_pruefer_medien.md).
Medien-Fix im Detail: `task-capsules/2026/08/job_chats_zu_gross_20260823/capsule.json`.
Benchmark: `docs/benchmarks/webvitals_2026-08-23_medien-fix-v651.json`.

Kern: 20 von 20 Bereichen im neuen Design, live (sw v645 -> v652). Der Bruch
zwischen Startseite und Rest war eine ueberfluessige SCHICHT
(design-cyan-views.css), keine schlechte Regel — geheilt durch Abraeumen.
Teuerster Befund: VIER Pruefer behaupteten etwas, ohne es zu messen
(assets/-Kopie pflegte kein Skript, alle sieben Sperren bewachten die QUELLEN
statt der Auslieferung, der Fokusring war nur gepinnt statt gerechnet — 1.86
gegen 3.0 gefordert, der Digest-Test prueft nur DASS ein Pin existiert). Daraus
`check:assets`, `check:auslieferung-lock` und `tests/fokusring-kontrast.test.mjs`.
Medien-Fix: zehn von 113 Gespraechen wurden NIE gesichert — readEntries()
speichert dasselbe Medium DREIFACH, und die Auslagerung sah nur den DOM;
Markdown-Bilder (`![Bild](data:…)`) sind kein Element. 141 von 141 Ressourcen
kamen aus dem Vorrat, 0 ueber Netz (Static-First-Beweis). Am Tagesende 8 von 8
Sperren gruen, 591 Tests. MERKREGEL: `check:favicon-lock` gehoert in JEDEN
Ship-Loop mit Frontend-Anteil — er fand einen Fehler, der acht Tage lang auf der
Landeseite stand.

## 2026-08-23 — Autopiloten-Seite: Grau ist zweierlei (job_autopiloten_seite_20260823)

- Umgesetzt auf dem BAU-BRANCH feature/auth-redesign-github-magiclink (dort liegt der Live-Code),
  nicht hier. LIVE: "3 melden sich nicht" im Register "Braucht dich"; Betriebswache = Nr. 42;
  Akten 01/02/05 ohne smejj-autopilot-jobs; Vorfälle mit aktuellem Namen.
- WURZEL: SMEJJ_AUTOPILOT_KEYS fehlt im Control-Server (503 autopilot_keys_missing) —
  nachziehen mit scripts/deploy/autopilot_schluessel_setzen.mjs (Bau-Branch) + control-neu-bauen.
- Capsule: docs/task-capsules/2026/08/job_autopiloten_seite_20260823/capsule.md (Bau-Branch).
