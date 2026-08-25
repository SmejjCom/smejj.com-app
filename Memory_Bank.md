# Memory_Bank.md — Verifiziertes Gedaechtnis von smejj.com
Nur verifizierte, erfolgreiche Loesungen und Architekturentscheidungen. Kein Eintrag ohne bestandene Verification Pipeline. Fehlgeschlagene Builds und Halluzinationen werden niemals aufgenommen.
## Eintragsformat
Jeder Eintrag nennt Datum, Typ, Capsule, Entscheidung, Begruendung und Verifikation.
---
## Architekturentscheidungen

### [2026-08-25] VOLLAUDIT: /code WAR AUF ALLEN DOMAINS TOT — BEI 64 GRUENEN AMPELN (job_vollaudit_20260825)

Capsule: `task-capsules/2026/08/job_vollaudit_20260825/capsule.json`.
Frontend f5d8d78..0063863 (sw v694 -> v698), Bauzweig 12d4d50f..3817f2bc,
App-Repo design-v11 465ec912 ff.

**Der Kernbefund:** In `code-flaeche.js` stand eine Import-Zeile MITTEN in
einem mehrzeiligen import-Statement — SyntaxError beim Parsen, /code auf
smejj.com UND api.smejj.com komplett tot. Alle 64 Ampeln gruen, Messlauf
"100.00 %". KEIN Pruefer parst die ausgelieferten Module: precache-imports
und module-queries lesen Textmuster, die Suite prueft Quresultate, der
Probe-Nutzer prueft Token/Bruecke/S3 — niemand die Auslieferung als Browser.

**Drei neue Waechter schliessen die Klasse:**
1. `check:modul-syntax` (beide Zweige): parst alle public-Module als
   ES-Module (node --check gegen .mjs-Kopie), in check:frontend verdrahtet.
2. Nutzerreise-Waechter (`nutzerreiseWaechter.js`, Bauzweig): Probe-Nutzer
   Nr. 29 prueft alle 15 min die GANZE App — Startseite, Buendel-Gleichheit,
   Nachlade-Kette live geparst (data:-Import mit Link-Panzerung: parst, linkt
   nie auf, fuehrt nie aus), API-fail-closed, Auth, Chat, Speicher. P0-P3,
   Verlauf in `watchdog/nutzerreise-laeufe`, Bremse, Boot+3min.
   Sein ERSTER Livelauf fand sofort einen (eigenen) Fehler: chat-stream
   wohnt unter /assets/ai/ — der Anschluss war damit live bewiesen.
3. Vorlesen-Umschalter (chat-actions b43): zweiter Klick stoppt; Utterance
   referenziert (Chrome-GC frisst sonst onend), speaking VOR cancel gelesen.

**Weitere Live-Fixes:** api-konto-surface.js fehlte im sw-Precache (offline
tot); 8 Dauer-rote Tests auf design-v11 zerlegt (alle: Test alt, Code neu);
check:security-Fehlalarme geeicht (Actions-Erlaubnisliste 15.08.-Entscheidung,
Geheimnis-Probe zur Laufzeit zusammengesetzt); check:guidelines-Tor wieder
geschlossen (Vor-Diaet-Ratchets dokumentiert, assets/-Kopien als erzeugt
ausgenommen); Memory_Bank zweite Archiv-Runde (922 -> ~670).

**Gemessen (5 Laeufe, echtes Chrome):** warm alles gruen (LCP p75 156 ms,
TTFB 50 ms); kalt LCP p75 3348 ms > 1500 und 303 KB > 300 — offene
Optimierung, beruehrt die gelockte Startseite (Betreiber-Entscheidung).

**Nachtrag Kaltstart (Freigabe "Ja, freigegeben"):** Die kalte Renderkette
lief in SERIE (Dokument -> blockierendes Tor-Skript -> erst dann das
blockierende Stylesheet). Seit sw v699 steht das fruehe Tor INLINE im head
(CSP per sha256-Hash; Test erzwingt Byte-Gleichheit von Inline-Rumpf und
public/auth-gate-frueh.js UND den passenden Hash) und start-styles laedt per
preload sofort — der erste blockierende Request entfaellt. Wasserfall-Beweis
live; p75-Nachweis unter 1,5 s steht aus (Betreiber-Netz stoerte massiv,
bester kalter Lauf 1032 ms), Nr. 63 misst 6:15.

**Nachtrag iPhone-PWA-Runde (Betreiber-Livetest mit Screenshots):** Vier
Deploys v700-v703 — Ohr-Solo (taube SpeechRecognition faellt aufs eigene Ohr),
viewport-fit=cover (safe-area war 0, PWA klebte unter der Notch),
Schnellspur-Abschluss (clearThinkingState fehlte im Geraete-Pfad: Antwort
blieb roh/stumm/ohne Leiste; Echtzeit-Woerter jetzt an den Server) und
Mobil-Composer (Chip-Ellipsis als 15. Buendel-Quelle; cline-model-menu nimmt
das App-Token zuerst, der Cookie-Weg zu api.smejj.com ist in der PWA
Third-Party-blockiert). MERKE: Was der Chat kann, kann das Menue nur mit
DERSELBEN Token-Quelle — und ein data-thinking, das stehen bleibt, macht
eine fertige Antwort fuer ALLES Nachgelagerte unsichtbar.

**Lehre:** Ein Modul, das der Browser nicht PARSEN kann, ist die stillste
Ausfallsorte — eine Ebene unter "Modul laedt nie". Und: Der nachgezogene
Anhang-Import kam per Zeilen-Einfuegung an fester Position in eine Datei,
deren Kopf sich verschoben hatte — Einfuegen nach Zeilennummer ist in
geteilten Staenden verboten, nur nach Anker-Text.

### [2026-08-23] SEITENGEWICHT 335,6 -> 256,6 KB (job_seitengewicht_20260823)

Capsule: `task-capsules/2026/08/job_seitengewicht_20260823/capsule.json`.
App-Repo `f65d0b28`. sw v673 -> v674.

**Messmethode zuerst, sonst optimiert man ins Leere:** Die Browser-Zahlen
taugen fuer das 300-KB-Budget NICHT. `performance.getEntriesByType` meldet bei
uns unkomprimierte Groessen und `transferSize: 0`, weil der Service Worker aus
dem Vorrat liefert — dieselbe Seite "wiegt" dort 1.124 KB. Gezaehlt wird gzip
ueber die Import-Kette.

**Befund:** Browser-Panel und Maus-Panel wiegen samt Kette 63,3 KB in 16
Modulen. Beide gehen erst auf Knopfdruck auf — beim ersten Bildaufbau sieht sie
niemand, und trotzdem zahlte sie jeder Seitenaufruf.

**Warum beide zusammen:** Nur das Browser-Panel auszulagern bringt 1,9 KB.
`maus-panel.js` importiert dieselbe `browser-pane-*`-Kette und zieht sie doch
wieder herein.

**Entscheidung:** `public/browser-nachladen.js` nach dem Muster von
`code-nachladen.js`, aber mit DREI Ausloesern statt einem — Panel geht auf,
Klick auf `#mausButton`, oder ein `smejj:maus-*`-Ereignis aus dem Chat. Der
dritte ist der heikle: das Ereignis ist durch, wenn das Modul ankommt, und wird
nach dem Laden ERNEUT gefeuert. Ohne dieses Nachreichen verpasst ein
Maus-Auftrag aus dem Chat seine Anzeige, und nichts sieht kaputt aus.

**Ein echter Fehler, den der Waechter vor dem Deploy fand:** `beobachter` stand
als `const` NACH der Funktion, die ihn benutzt — beim Pfad "Panel schon offen"
ein ReferenceError, genau bei dem Nutzer, der die Seite mit offenem Panel
aufruft.

**Ergebnis:** 256,6 KB, 21 Module weniger, 43 KB Luft zum Budget. Live
funktionsgeprueft: Panel mit Tableiste, Adresszeile, verbundenem Live-Browser;
beide Knoepfe da. `check:frontend` 653/653, module-queries 191, precache 158.

**Fremde Luecke mitgeschlossen:** `/assets/auth-gate-frueh.js` fehlte im
Precache, obwohl es das ERSTE Skript im head ist (`fffa1170` einer
Parallelsitzung, live ebenfalls nicht im Vorrat). Offline waere die App tot
gewesen.


### [2026-08-23] ANTWORTZEIT 46 s -> 1 s — ES LAG NIE AM MODELL (job_antwortzeit_20260823)

Capsule: `task-capsules/2026/08/job_antwortzeit_20260823/capsule.json`.
App-Repo `aef8291c`, `01d1d54d`. sw v669 -> v672.

**Die Zerlegung zuerst, sonst raet man:** Grundlast `/api/health` 152 ms;
Cline-Status ohne Modell 211 ms; Cline-Chat mit Modell 1202 ms; die ECHTE
App-Anfrage, mitgeschnitten, Ende zu Ende **1299 ms**. Sichtbar fuer den
Nutzer: **46 Sekunden**. Weder Modell noch Anbieter noch Netz — die Zeit ging
im Browser verloren.

**Befund 1 — hundert Uploads pro Frage:** Eine EINZIGE Chat-Frage loeste ueber
100 PUTs an `/api/chats` aus, jeder der 113 Chats, einzelne mit 188 KB. Und
der Server verwirft die meisten sofort wieder (`server_ist_neuer` bei gleichem
oder aelterem Zeitstempel). Wir luden 188 KB hoch, damit er sagt "kenn ich
schon". → `public/chat-sync-auswahl.js`: erst abgleichen
(`?nurAbgleich=1`, eine Anfrage fuer alle), dann nur senden, was er annehmen
wuerde. Von 114 bleiben 2.

**Befund 2 — die Sicherung nahm der Antwort die Leitung weg:** Danach ging die
Modell-Anfrage IMMER NOCH erst nach 10,5 s raus (5644 ms und 6911 ms lagen
zwei Verlauf-Anfragen davor). Der Browser oeffnet pro Gegenstelle nur wenige
Verbindungen. → `erzeugeVorfahrt()`: solange ein Antwortstrom laeuft, wartet
die Sicherung; sie haengt an `smejj:chat-strom`, dem Signal, das BEIDE
Stromfamilien senden. Was liegen bleibt, wird nachgeholt — sonst waere aus
einer Verzoegerung ein Datenverlust geworden.

**Befund 3 — die Startphase (Nachtrag, Betreiber: "Start-Sync auch fixen"):**
`?nurAbgleich=1` lief ZWEIMAL, bei 2317 ms (pull) und 7324 ms (push, allein
1504 ms). Bis 8,8 s war die Leitung belegt. Beide teilen sich jetzt einen
Abgleich (Frist 5 s, nach jedem Schreiben verworfen), und die Push-Schleife
bricht ab, sobald eine Antwort anfaengt — beim Start laeuft der Sync schon,
wenn die erste Frage kommt.

**Ergebnis live:** 1 s / 1,5 s / 1 s bei je EINER Anfrage; die erste Frage nach
dem Neuladen 11 s -> **2 s**. Das Budget "erster Token unter 1,0 s" ist im
Alltag erreicht.

**Offen, als Befund gemeldet:** `/api/auth/me` wird beim Start zweimal geholt
(sechs Dateien rufen es), dazu `/api/billing/status` und zwei
Modell-Status-Abfragen.

**Verhaltensgleich und gegengeprueft:** `konfliktSieger()` im Frontend ist
wortgleich mit der Serverfassung, ein Waechter vergleicht beide an zehn echten
Wertepaaren. Faellt der Abgleich aus, wird alles gesendet wie bisher.

**Methodische Lehre:** Der Verdacht lag beim Modell — gemessen war es der
eigene Verlauf-Sync. Ohne die Zerlegung in Grundlast, Server-ohne-Modell,
Server-mit-Modell und Ende-zu-Ende haette ich am falschen Ende optimiert.


### [2026-08-23] CHAT HING — NUR EINE STROMFAMILIE WAR BEWACHT (job_chat_stille_20260823)

Capsule: `task-capsules/2026/08/job_chat_stille_20260823/capsule.json`.
App-Repo `8da2df72`, `9f40fb69`. Frontend `53ab01d3`. sw v666 -> v667.

**Befund:** Eine von fuenf Anfragen stand nach 55 s noch auf "smejj denkt
nach …" — keine Meldung, kein Abbruch, kein Wiederholen. Die Frage blieb als
Torso im Verlauf (zwei user-Nachrichten hintereinander).

**Ursache — ein altbekanntes Muster:** `chat-stream.js` hat seit dem 17.08.
eine Stille-Wache. `chatClient.js` (Cline/BYOK) hatte sie NICHT, und der Chat
stand auf "Cline · Auto". Dasselbe wie beim Stopp-Knopf, der auch nur bei
einer der beiden Familien griff.

**Warum die vorhandene Zeitgrenze nicht reicht:** `fetch-retry.js` bewacht den
Weg BIS ZUM ANTWORTKOPF und laesst das Streaming danach ausdruecklich ohne
Grenze laufen, damit lange Antworten nie abgeschnitten werden. Der Fall
"Server hat geantwortet und verstummt dann" faellt dadurch.

**Entscheidung:** `public/ai/strom-stillstand.js` — die Wache an EINER Stelle,
exportiert und pruefbar. Gemessen wird die STILLE, nicht die Gesamtdauer: eine
lange Antwort troepfelt, eine tote schweigt. 90 s bleiben — im Live-Test
brauchte eine echte Antwort 60 s, eine kuerzere Grenze haette sie abgewuergt.

**Beinahe-Fehler, den das Deploy-Sicherheitsnetz gefangen hat:** 39 Zeilen
standen LIVE, aber nicht im lokalen Stand — darunter
`entferneAbgerisseneMedien()`, die abgerissene Bildstroeme aufraeumt (sonst
100+ KB base64 in der Blase). Meine Fassung haette sie geloescht. Die
Live-Fassung wurde zur Basis, die Aenderung liegt darauf, die Quelle ist
nachgezogen. **Vor jedem Frontend-Deploy Marken ausklammern und pruefen, was
nur live steht.**

**Nebenbei behoben:** `chat-store.js` lief live unter ZWEI Marken (b61 und b59
via `chat-actions.js`) — zwei Modulinstanzen mit getrenntem Zustand. Jetzt
laden alle 10 Stellen dieselbe.

**Verifikation:** Serie von fuenf live 3,6 / 8 / 8 / 60 s, kein Haenger, keine
Doppelmarke mehr. `check:frontend` 619/619, `check:llm-router` 334/334,
module-queries 187, markenkette 98, precache 155.

**Offen:** Die Antwortzeiten schwanken 3,6 s bis 60 s fuer dieselbe triviale
Frage. Budget fuer den ersten Token ist 1 s.


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


## Aeltere Eintraege

Die datierten Eintraege vom 2026-07-28 bis 2026-08-05 stehen vollstaendig in
[Memory_Bank_Archiv_bis_2026-08-05.md](Memory_Bank_Archiv_bis_2026-08-05.md)
(ausgelagert am 2026-08-20 wegen der 800-Zeilen-Regel, nichts geloescht).
Die Eintraege vom 2026-07-28 bis 2026-08-11 (zweite Runde) stehen in
[Memory_Bank_Archiv_2026-07-28_bis_2026-08-11.md](Memory_Bank_Archiv_2026-07-28_bis_2026-08-11.md)
(ausgelagert am 2026-08-25, nichts geloescht).

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

## 2026-08-23 — Chat-Grenze 100 -> 500 + Index-Vollstaendigkeit (job_chat_grenze_500_20260823)

- LIVE: Server liefert 126/126 Chats (vorher 100), Frontend chat-store b60 / sw v659, Control 10:40:08Z.
- Index-Falle: nach Zeit "frisch", nach Inhalt unvollstaendig (121 von 126) — jetzt zaehlt auch die Menge.
- OFFEN (Rote Liste): 26 Chats mit ALTER Kontokennung bleiben abgewiesen; das pruneOld-Loeschrisiko
  dagegen ist mit 500 weg. Capsule: task-capsules/2026/08/job_chat_grenze_500_20260823/capsule.json

## 2026-08-23 — Kontokennung: Server-Alias, Geraete-Sync lebt wieder (job_kontokennung_alias_20260823)

- WURZEL seit 15.08.: Server stempelt SHA-Kennung, Client verglich Sitzungs-ID -> JEDER Server-Import fremd.
- LIVE: `konto` in GET /api/chats, Alias je Sitzung in chat-owner.js v3; Seitenleiste "Alle 126 Gespraeche".
- Messfalle: index.html 10 min aus HTTP-Cache -> alte Marken-Kette trotz neuem sw. Erst cache:'reload'.

## 2026-08-23 — Sync-Waechter (job_sync_waechter_20260823)

- LOKAL: `npm run check:sync-alias` (Stufe A Quellen, Stufe B live mit Probe-Token), in check:all.
- LIVE: Autopilot Nr. 43 "Sync-Waechter" (Bauzweig f992c61d), alle 30 min, prueft eigene API + AUSGELIEFERTE
  Client-Dateien; erste Ampel gruen 11:19:47Z. Ehrlichkeits-Waechter (Zaehler 35, MIT_ECHTER_MESSUNG) nachgezogen.

## 2026-08-23 — Nutzerreise als US-Neuling: 5 Stellen live verbessert (job_nutzerreise_usa_20260823)

- Registrieren/Anmelden ist kinderleicht (2 Felder, 5 Wege, Google 2 Klicks/6 s); verwirrend waren Sprache, Handy-Kopf, Magic-Link-Fehler.
- LIVE: en.js +155 Texte (Spur, Konto, Abo, API), Landingpage-Leiste 440->375 px, Magic-Link-Fehler 303 -> Anmeldeseite statt JSON.
- Messfalle: i18n-Cache — erster Lauf nach neuem en.js zeigt noch Deutsch, erst der ZWEITE Lauf ist uebersetzt.
- Freigabe per Karte: Wartetext bleibt im Cline-Pfad (chatClient v5, sw v662), live 12 ms bis 3,7 s gemessen.
- Rote Liste offen: Consent-Domain smejj-control.zeabur.app, Modell-Picker ohne Haekchen, Stopp-Viereck 11 px, Icon-Knoepfe ohne Text.
- Freigabe per Karte: eigene API-Domain api.smejj.com LIVE (CNAME bestand schon) — Google sagt jetzt "Weiter zu smejj.com";
  CSP additiv, Zeabur-Adresse bleibt Zweitzugang; OFFEN: GitHub-Rueckruf-URI traegt der Betreiber ein.
- Runde 2: Landeseite spricht die Sprache des Besuchers (willkommen-sprache.js, 82 Texte, fail-safe deutsch) — live en-US bewiesen.
- GEMESSEN: Auth-Gate (profile-dock.js, Skript 24/34) leitet Anonyme erst nach 3,7 s Desktop / 15 s iPhone um — Fruehstart-Gate in index.html braucht Start-Lock-Freigabe.
- Freigabe per Karte: fruehes Tor (auth-gate-frueh.js, erstes Skript im head) — Umleitung Anonymer 15 s -> 1,7 s iPhone, 3,7 s -> 0,13 s Desktop; Start-Lock neu eingefroren.
