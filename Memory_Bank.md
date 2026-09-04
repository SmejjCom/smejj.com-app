# Memory_Bank.md — Verifiziertes Gedaechtnis von smejj.com
Nur verifizierte, erfolgreiche Loesungen und Architekturentscheidungen. Kein Eintrag ohne bestandene Verification Pipeline. Fehlgeschlagene Builds und Halluzinationen werden niemals aufgenommen.
## Eintragsformat
Jeder Eintrag nennt Datum, Typ, Capsule, Entscheidung, Begruendung und Verifikation.
---
## Architekturentscheidungen

### [2026-09-04] 100%-SCHUTZ ALS NUMMERN-MANIFEST, NICHT ALS DATEI-HASH; ADMIN-MENUE NUMMERIERT; LOGO IST DER KNOPF (job_admin_nummern_logo_20260904)

Capsule: `task-capsules/2026/09/job_admin_nummern_logo_20260904/capsule.json`.

**Entscheidung.** Der vom Betreiber verlangte 100%-Schutz fuer die
Autopiloten-Nummern und die Nummern im Admin-Menue ist eine SEMANTISCHE
Sperre: `docs/security/autopilot-nummern-lock.json` (81 Nummern) und
`docs/security/adminmenue-nummern-lock.json` (8 Gruppen, 34 Bereiche)
frieren die ZUORDNUNG ein, nicht die Dateien. `scripts/check-autopilot-nummern.mjs`
und `scripts/check-menue-nummern.mjs` weisen fail-closed ab: umnummeriert,
geloescht, doppelt vergeben, zwei Nummern auf einem Ding, Ding ohne Nummer —
beim Menue zusaetzlich "registrierte Seite ohne Nummer" und "Nummer ohne
Seite". Beide laufen in `npm run check:all` hinter `check:admin-lock`.

**Begruendung.** Ein Datei-Hash haette jeden Tippfehler in einer
Beschreibung zum Sicherheitsvorfall gemacht und zugleich den Weiterbau
blockiert: Autopilot Nr. 82 nur noch mit Neu-Einfrieren. Wer staendig neu
einfriert, segnet irgendwann alles mit ab — dieselbe Begruendung steht seit
2026-08-04 in `scripts/lib/datei-sperre.mjs`. Bestand ist unantastbar,
Zuwachs bleibt erlaubt und wird gemeldet.

**Verifikation, die es beweist.** Waehrend der Arbeit kam aus einer
Parallelsitzung Autopilot Nr. 81 (`besucher-puls`) dazu. Der Waechter
meldete "neue Nummer 81 (erlaubt)" und blieb gruen — kein Fehlalarm, keine
Blockade. `tests/nummern-schutz.test.mjs` prueft jede Regel mit gesunder UND
kaputter Probe (14/14).

**Menue-Nummern bestimmen jetzt die Reihenfolge.** Vorher entschied darueber
die Ladereihenfolge der `console-stage*.js` — unsichtbar und damit nicht
schuetzbar. `GRUPPEN_NUMMERN`/`SEITEN_NUMMERN` in `console.js` bilden den
Stand vom 2026-09-04 eins zu eins ab: auf dem Bildschirm hat sich nichts
verschoben, es kamen nur Nummern dazu (1 UEBERBLICK … 8 VERWALTUNG,
1.1 Cockpit … 8.2 Admin-Verwaltung). Das Buchstaben-Kuerzel steht leise am
rechten Zeilenrand; es war mehrfach vergeben (G und Y je zweimal).

**Logo als Knopf, "Ziel zuerst, dann Klappe".** Steht man nicht auf der
Startseite, fuehrt der Klick dorthin; steht man schon dort, klappt er die
Schiene auf 68 px zusammen und wieder auf. NICHT auf Breite 0: dann waere das
Logo weg und es gaebe keinen Weg zurueck. Zustand in `localStorage`, weil
jeder Seitenwechsel auf smejj.com eine echte Navigation ist. Das Zeichen
liegt INLINE im Markup — der Control-Server liefert die Konsole mit fester
Dateiliste aus, ein Bild aus `/icons/` waere dort 404.

**Falle, die fast zugeschnappt waere.** `control-server/admin-ui/views-stage7.js`
und `console.css` waren im Bauzweig AELTER als der Live-Stand (bedienbare
Schluessel-Ausgabe aus `feature/api-budget`, nie in den Bauzweig gemergt).
Der erste `sync_admin_console_pages.mjs`-Lauf haette das live zurueckgebaut.
Regel daraus: **vor jedem Spiegeln den Diff Quelle-gegen-Klon lesen, nicht nur
das Ergebnis.** Was im Klon steht und in der Quelle fehlt, ist meistens
juengere Live-Arbeit eines anderen Zweigs — nicht Muell.

Verifikation live (Chrome, angemeldet, Stufe 8): Nummern sichtbar auf
smejj.com/admin/, Logo klappt zu und auf, Zustand ueberlebt die Navigation,
Logo-Klick auf /admin/autopiloten/ fuehrt nach /admin/. Keine
Konsolenfehler. `check:admin-lock` neu gestempelt (49 Dateien).


### [2026-08-31] ADMIN-NAV: WIRKUNGS-GEWICHTETE REIHENFOLGE (4 STUFEN) + NUMMERN-KUERZEL 1-28; KONSOLEN-DEPLOY-WEG DREI KOPIEN (job_admin_reihenfolge_20260831)

Capsule: `task-capsules/2026/08/job_admin_reihenfolge_20260831/capsule.json`.
App 4ba3fe0a/da0c4a6d, Frontend (main) c9d09ad/ae9b575. Live bewiesen
(Nav-Auslesen, Screenshots, Seitentests) auf smejj.com/admin/.

**Entscheidung (zweifach freigegeben):** Die 28 Konsolen-Bereiche stehen nach
Wirkung x Vernachlaessigungsrisiko x Haeufigkeit in vier Stufen — 1 Autopiloten,
2 Analytik, 3 Nutzerverwaltung … 11 Freigaben, 18 DSGVO, 24-28 Produktsteuerung.
Umgesetzt als PRIORITAET/STUFEN/gruppeVon/kuerzelVon in console.js; Plaketten
zeigen die Nummern, nur die Uebersicht behaelt ihr "A". Lehre des Betreibers:
Priorisierung gewichtet Wirkung und Fristen VOR Klick-Haeufigkeit (Analytik und
Freigaben gehoeren nach oben).

**MERKE Konsolen-Deploy-Weg:** (1) DREI console.js-Kopien wortgleich aendern:
Quelle control-server/admin-ui/ (hat stage11-Registratur), Spiegel
public/admin/ (= Live-Stand, ohne stage11), Deploy-Klon ~/smejj-app-frontend
/admin/. (2) sync_admin_console_pages.mjs NIEMALS auf den echten Klon zeigen
lassen — Quelle und Klon weichen in 4 Dateien ab (console.js, console.css,
index.html, views-stage11.js), ein Sync wuerde Live-Arbeit ueberschreiben und
Evolution ungenehmigt in die Navigation bringen. Manifest nur ueber Wegwerf-
Klon (/tmp) auffrischen. (3) admin/ liegt NICHT im SW-Precache — kein
SW-Stempel noetig. (4) Klon-Deploy: Zweig deploy-frueh-gate, Push als HEAD:main.
(5) Sortier-Fallstrick: Uebersicht traegt Nummer 0 — `0 || 999` wirft sie ans
Ende; immer `=== undefined` pruefen. (6) Pruefungen: admin-konsole,
admin-console-sync, anmeldepflicht-Test; stage10-13 bleiben live unregistriert
(Buendel-Abgleich = eigenes Freigabe-Thema; neue Seiten ohne Nummer fallen
hinten an Produktsteuerung).

**Verifikation:** Live-Nav exakt in Freigabe-Reihenfolge; Plaketten 1-28
sauber (auch zweistellig); Autopiloten/Analytik/Freigaben/Sprachen laden an
neuen Positionen; anmeldepflicht 20/20, admin-konsole OK 31, adminUiRoutes
9/9, check:all EXIT 0 (nach beiden Aenderungen), guidelines OK 2027 Dateien;
TTFB ruhig 99/75/110 ms (Budget 200), Abendstau-Messung ehrlich mit fremder
Pages-Kontrolle dokumentiert.

**NACHTRAG 31.08. (Ladewache):** Betreiber sah auf /admin/autopiloten/
"Konsole nicht geladen" — Ursache: Kaltstart-Kette (20 Dateien + Auth-Ruf)
dauerte im Abendstau live 13,5 s gegen die starre 15-s-Wache; api.js
holeEinmal hatte KEIN Zeitlimit (haengender Ruf blockierte den Host-Wechsel).
Fix (ee63afe Frontend / ef3371f1 App): Wache 30 s, holeEinmal mit
AbortController 12 s je Versuch (Abbruch = Status 0 = bestaehiger
Host-Wechsel), preconnect zum Control-Server in allen drei index.html.
Echt-Fall-Beweis: Navigation brach nach 10 s ab, Konsole kam trotzdem durch,
kein Fehlerblock. MERKE: die gate-Wache muss immer groesser sein als die
langsamste beobachtete Kaltstart-Kette; Timeout-Puffer der check:admin-
konsole-Sandbox stellen AbortController bereit.

### [2026-08-31] HANDY-TRENNLINIE = DESKTOP-HAARSTRICH: MOBIL-KORREKTUR GEHOERT IN mobil-composer.css, SW-STEMPELPFLICHT BEI BUENDEL-DATEIEN (job_sidebar_trennlinie_20260831)

Capsule: `task-capsules/2026/08/job_sidebar_trennlinie_20260831/capsule.json`.
Fix 75f70601 (App) / f322ac4 (Frontend, main), SW v717.

**Betreiber-Befund Handy (375 px):** helle Linie ueber der Profilzeile der
geoeffneten Spur. Ursache: `.sidebar .bottom-nav { border-top }` aus
styles.css — am Desktop Teil des V11-Bilds, im Handy-Overlay ein Fremdkoerper.
**Fix:** `@media (max-width: 767px) { .sidebar .bottom-nav { border-top: 0; } }`
in mobil-composer.css — NICHT in design-v11.css (Ratsche 2744) und nicht in
styles.css (1598): mobil-composer.css bleibt der wachstumsfreie Mobil-Ort
vor dem Kaskaden-Ende; gleiche Spezifitaet (0,2,0) spaeter im Buendel gewinnt.
767 px = dieselbe Kante wie die Desktop-Spur (min-width: 768).
**MERKE:** (1) Mobile-Korrekturen an Desktop-Regeln laufen ueber Position im
Buendel + Spezifitaet, nie ueber design-v11.css. (2) Jede Aenderung einer
Precache-Datei (start-styles.css!) erzwingt CACHE_NAME +1 — ignoreSearch-
Lehre v714. (3) Das erzeugte start-styles.css-Buendel ist Teil des
34-Datei-Start-Locks: Neu-Stempel nur mit `--freeze --confirm "<Freigabe>"`.
(4) Kalt-p75-Netzverstoesse bei Pages-Abendmessung ehrlich als Netz-Hinweis
dokumentieren und gegen eine FREMDE Pages-Site kontrollieren (v717: fremd
455 ms vs smejj 189 ms TTFB kalt).
**Verifikation:** Pixelbeweis 27/32/36 -> 8/15/20 an der Linienstelle;
375 px border-top 0 px / 1280 px 1 px (lokal UND live, echte Sitzung);
check:all EXIT 0; Benchmark v717 warm alle Budgets OK, kalt besser als v716.

**Nachtrag (Probe-Nutzer 7/7 gruen, Freigabe "Control-Overlay"):**
api.smejj.com traegt eine EIGENE Shell und baut aus dem App-Repo-Zweig
feature/auth-redesign-github-magiclink (Zeabur PREBUILT_V2; ermittelt per
Zeabur-GraphQL: template + gitTrigger — Environment hat KEINE envVars, sie
haengen an service.variables(environmentID){key value}). Keine Overlay-/
Bootstrap-Pins in der Env: die v715-Shell steckte im Image-Build vom
30.08. 19:09 UTC. Fix e592459 auf den Deploy-Zweig (5 Dateien: 3 aus dem
Fix + Stempelzeile v715 -> v717 in beiden sw.js; Kontrolle-Code/index.html
unberuehrt; bundle-check gruenn — die uebrigen 14 CSS-Quellen waren
byteidentisch): Zeabur baute automatisch (Deployment 6a958610...), curl
bewies v717 auf BEIDEN Domains, Ampel danach "Nutzerreise bestanden: 7/7
Schritte in 3025 ms" gruen. MERKE: Hebt ein Frontend-Deploy die SW-Version
an, braucht die api-Shell den passenden Stempel-Commit auf
feature/auth-redesign-github-magiclink — sonst bleibt die
Bündel-Gleichheits-Wache (Nr. 29) ehrlich rot.

### [2026-08-26] TAUBE WEB-SPEECH FAELLT IMMER AUFS OHR + OX ALPHA NR. 3 (job_vollaudit_20260825, dritte Nachtrunde)

Capsule: `task-capsules/2026/08/job_vollaudit_20260825/capsule.json`
(nachtragTaubwacheDiktatOx). sw v711/v712, Bruecke v146.

**Betreiber-Livebefund Desktop:** Sprachwelle haengt ewig in "Ich höre zu ..."
— Web-Speech STILL taub (weder Ergebnis noch no-speech noch Ende; der alte
Schutz zaehlte nur Sofort-Enden <1,5 s). Diktat: Knopf rot, schreibt nie.
**Fixes:** Taubheits-Wache (`voice-ohr-solo.bewache`): 12-s-Haenger bricht ab,
Ende ohne Ergebnis UND ohne ehrliches "no-speech" zaehlt, zwei taube Runden ->
Ohr-Solo; SCHWEIGEN bleibt gesund. Diktat: Server-Ohr nimmt parallel auf und
schreibt nach Stopp, wenn Web-Speech stumm blieb. Livebeweis mit still-tauber
Erkennungs-Attrappe gegen v711: Diktat schreibt, Sprachwelle schaltet um,
Transkript 200. MERKE: gesundes Schweigen erkennt man an Chromes "no-speech" —
nur dessen FEHLEN beweist Taubheit.

**Ox Alpha (Betreiber schriftlich, Nr. 3 im Menue):** Registry `ox-alpha`
(openrouter, Slug `stealth/ox-alpha`, Preview $0/M), api-only wie Kimi K3,
fail-closed hinter `SMEJJ_OX_ALPHA_ENABLED` + Key (eigener oder
`SMEJJ_LLM_OPENROUTER_API_KEY`); Menue 1. Auto, 2. smejj 1.0, 3. Ox Alpha
(nichts entfernt); Bruecke v146 gibt `\box\b` an den Control-Router ab.
Live: multi-model-router + fallback:true ohne Key — Header machen den
Fallback ehrlich sichtbar. Key traegt der Betreiber selbst ein (Agent fasst
Keys nie an).

**Messwerkzeug:** Sitzungs-Token per curl-Kette (verify -> Cookie ->
session-token) statt Magic-Link-Warterei; Token-Seed macht Live-Messlaeufe in
~60 s moeglich. Code-Leisten-Befund des Betreibers war in 4 Messungen nicht
reproduzierbar (Misch-Cache im Deploy-Fenster, Waechter Nr. 29 meldete
zeitgleich Buendel-Abweichung); Log wird erst beim SENDEN in die Code-Flaeche
adoptiert — blosser View-Wechsel laesst ihn 0x0 in #start.

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

### Ausgelagert 2026-08-26 (Volltexte: `docs/memory/Memory_Bank_2026-08-26_archiv_runde3.md`)

- [2026-08-18] 800-Zeilen-Regel: Modell-Menue herausgeloest (job_modul_modellmenue_20260818) — zentrale Verdrahtung sichtbarer Knoepfe, nie in Nachlade-Module.
- [2026-08-19] Kostenarchitektur: sieben Hebel, keine Deckel (job_kostenarchitektur_20260819).
- [2026-08-15] Eine Wahrheit fuer 'Ist die KI nutzbar?' (job_chat_rueckfall_ampel_20260815) — Chat-Rueckfalltext bei gruener Ampel.
- [2026-08-18] Modell-Menue, Bilder, Video und Auto-Router (job_modelle_medien_20260818).

## Aeltere Eintraege

Die datierten Eintraege vom 2026-07-28 bis 2026-08-05 stehen vollstaendig in
[Memory_Bank_Archiv_bis_2026-08-05.md](Memory_Bank_Archiv_bis_2026-08-05.md)
(ausgelagert am 2026-08-20 wegen der 800-Zeilen-Regel, nichts geloescht).
Die Eintraege vom 2026-07-28 bis 2026-08-11 (zweite Runde) stehen in
[Memory_Bank_Archiv_2026-07-28_bis_2026-08-11.md](Memory_Bank_Archiv_2026-07-28_bis_2026-08-11.md)
(ausgelagert am 2026-08-25, nichts geloescht).

### Ausgelagert 2026-09-02 (Volltexte: `docs/memory/Memory_Bank_2026-09-02_archiv_runde4.md`)

- 2026-08-19 `zeichne is not defined`, 2026-08-20 Verlauf schlank / Startgewicht, 2026-08-23 V11 komplett, Autopiloten-Seite (Grau ist zweierlei), Chat-Grenze 500, Kontokennung-Alias, Sync-Waechter, Nutzerreise USA — je Datum, Capsule und Kernlehre im Archiv.

### Ausgelagert 2026-09-03 (Volltexte: `docs/memory/Memory_Bank_2026-09-03_archiv_runde5.md`)

- [2026-08-31] Zentraler API-Bereich im OpenRouter-Layout (job_api_zentrum_20260831) — hidden verliert gegen Autoren-display; i18n-Regexe auf RAW-UTF8; Klon live oft neuer als App-Repo.
- [2026-09-02] Probe-Nutzer 3 h rot: Bruecke 503 bei 429/429, Schnellspur zeigte auf abgeschaltetes Groq-Modell (job_bruecke_schnellspur_20260902) — Router-Zweitversuch, v147, Zhipu-Basis-URL.

### Ausgelagert 2026-09-03, Runde 6 (Volltexte: `docs/memory/Memory_Bank_2026-09-03_archiv_runde6.md`)

- [2026-08-25] Sprachwelle iPhone: iOS ging immer in den Tipp-Fallback (job_vollaudit_20260825, Nachtrag) — `!RecognitionCtor` ist auf iOS IMMER wahr, Ohr-Solo hing an zwei spaeteren Stellen; Ohr-Solo ZUERST, ctx.resume gegen suspended, sw v709; Fake-Audio-Messfalle (--disable-features=AudioServiceOutOfProcess).
- [2026-08-25] Vollaudit: /code war auf allen Domains tot bei 64 gruenen Ampeln (job_vollaudit_20260825) — Import-Zeile MITTEN in einem import-Statement (Einfuegen nach Zeilennummer), kein Pruefer parst die Auslieferung; seitdem check:modul-syntax in check:frontend, Nutzerreise-Waechter Nr. 29 (sw v698); Menue kann nur, was der Chat kann.
- [2026-08-23] Modell-Liste 100 % gesichert, zwei Schloesser (job_modellliste_lock_20260823) — Betreiber-Anordnung im Wortlaut; Dateisperre check-modell-menue-lock (sechs Dateien byte-genau, Tag stand-2026-08-23-modellmenue-lock) + Live-Ampel gegen den Cline-Katalog; die Liste steht NICHT im Code.

### Ausgelagert 2026-09-04, Runde 7 (Volltexte: `docs/memory/Memory_Bank_2026-09-04_archiv_runde7.md`)
- [2026-09-03] 2026-09-03 — Volltext im Archiv.
- [2026-09-02] A-bis-Z-Live-Test: Bündel-Abgleich hatte src/ mitgerissen — Volltext im Archiv.
- [2026-09-02] Z.ai Coding-Paket braucht die Coding-Adresse — Volltext im Archiv.
- [2026-09-02] smejj 1.1 freigegeben; Fragen-Erfassung angeschlossen; zwei Ketten, zwei Noten — Volltext im Archiv.

- [2026-09-03] Web-Vitals-Wache rot: das Netz UND ein echter Seitenbefund — `chat-store.js` wurde zweimal geladen (Import ohne `?v=`); TTFB/LCP-Rot war das Betreiber-Netz.
- [2026-09-03] Web-Vitals Runde 2+3: UX-Haken und Verlaufs-Helfer laden erst bei Bedarf (job_a_bis_z_20260902, Nachtrag 17).

## 2026-09-02 — Fragen-Erfassung END-ZU-END LIVE: Verweise statt Schlüssel, Sonde in /api/health (job_a_bis_z_20260902, Nachtrag 3)

Bauzweig 9a50df07/0c673f9e/97333a98, design-v11 1dd3c052…7f23063a. Beweis 13:40 UTC:
`/api/training/consent/decision` = granted/verified, `POST /api/training/capture` = 201 erfasst:true.

**Was fehlte:** die sechs IDRIVE_E2_TRAINING_*-Werte und SMEJJ_TRAINING_CAPTURE_ENABLED auf
Zeabur (Env-Löschung 14.08.). Schlüssel darf die Sitzung nicht eintippen — darum zeigen die
Trainings-Werte jetzt per `verweis:IDRIVE_E2_ACCESS_KEY` auf die vorhandenen Hauptwerte;
`required()` löst `verweis:NAME` und `${NAME}` auf (Zeabur lässt `${...}` wörtlich stehen).
**Zwei Fallen:** (1) Der Haupt-Eimer ist **smejj-model-files**, nicht smejj-app — mit dem falschen
Eimer antwortet e2 403 (Sonde `trainingsSpeicher` in /api/health zeigt Stufe + Code, nie Werte).
(2) `training/fragen/` fehlte in IDRIVE_E2_TRAINING_ALLOWED_PREFIXES → capture_not_persisted.
**MERKE:** Ein stummes 503 (consent_service_unavailable) kostete zwei Stunden; die Sonde in
/api/health ist der Weg, den Speicher-Zustand ohne Logs und ohne Geheimnisse zu sehen.

## 2026-09-02 — UI/UX-Programm Nr. 1–3 live: Knopf statt Tipp, 44-px-Ziele, Fehler mit Handlung (job_a_bis_z_20260902, Nachtrag 4)

design-v11 7272c769/b76bb143/1bc1d862, Klon 7ae2d68/3ddd772/ac2faa8. Programm-Dokument
`docs/architecture/UI_UX_PROGRAMM_2026-09-02.md` (Messung, Messlatte, zehn Vereinfachungen).
**MERKE:** (1) Der Verlauf wird nach jeder Antwort aus gespeichertem Text neu aufgebaut —
angehängte Knoten verschwinden; Knöpfe brauchen Merker + MutationObserver auf #startLog.
(2) chat-actions.css liegt im Start-Bündel (Start-Lock); Stile für ungesperrte Module kommen
aus dem Modul selbst (`<style id>`), sonst reißt der Bündel-Test. (3) Kurze Fragen beantwortet
Chrome lokal — der Knopf „Gründlicher antworten" ersetzt das Abtippen von »genauer«.

## 2026-09-02 — UI/UX Nr. 5 live; Lehre: die App schickt `task`, die Brücke `messages` (job_a_bis_z_20260902, Nachtrag 5)

design-v11 4435aa53/6ef4902f/2f5e4ff8. **MERKE:** Wer im Frontend „die letzte Nutzerfrage" braucht,
liest `body.task` (app.js) UND `body.messages` (Brücke) — sonst schickt ein Knopf nur „genauer:".
Es gibt keinen Knopf mit data-view="profile"; die Konto-Ansicht erreicht man in der App per
`history.pushState("/profile")` + `PopStateEvent` (restoreViewFromUrl). Einstellungs-Texte gehen
durch t() — neue Schlüssel in alle 14 i18n-Dateien, sonst reißt tests/i18n-ui.test.mjs.

## 2026-09-02 — UI/UX Nr. 4 live: Woerter unter den Symbolen ohne Bruch der Ein-Zeilen-Regel (job_a_bis_z_20260902, Nachtrag 6)

design-v11 69b8ea36/33233fa0. **MERKE:** (1) Ein Modul, das beim Start wirken soll, haengt an einem Start-Modul
(chat-actions-menu.js), nicht an chat-stream.js, das erst beim ersten Senden laedt. (2) Module mit
Versionskennung (?v=4, ?v=b55) bleiben bis 10 min im HTTP-Cache; zum Beweis fetch(cache:'reload'), sonst
prueft man das alte Modul. (3) Neue t()-Schluessel brauchen ihr Modul im Korpus von tests/i18n-ui.test.mjs,
sonst gilt der Schluessel als verwaist.

## 2026-09-02 — UI/UX Nr. 10: Rueckgaengig statt Bestaetigung beim Chat-Loeschen (job_a_bis_z_20260902, Nachtrag 7)

design-v11 694c48e5. Weiches Loeschen (Papierkorb 30 Tage) braucht keine Rueckfrage — eine Leiste mit
„Rueckgaengig“ (8 s, restoreChat) ersetzt den Dialog. **MERKE:** Der Verlauf ist SECTION#chatHistory, geoeffnet
per [data-view="chatHistory"]; der Seitenleisten-Knopf „Alle N Gespraeche“ oeffnet ihn im Automaten NICHT.
Karten sind weder li noch article — Beweise ueber den Text von #chatHistory und den Zaehler „Alle N“ fuehren.

## 2026-09-02 — UI/UX Nr. 9: Erste-Schritte-Karten nur fuer Nutzer ohne Gespraeche (job_a_bis_z_20260902, Nachtrag 8)

design-v11 3da01c75. **MERKE:** (1) Ein Leerzustand, den der Betreiber nie sieht (180 Chats), braucht einen
Pruefschalter (?erste-schritte=1) — sonst gibt es keinen Live-Beweis. (2) Werkzeug-Chips werden ueber
aria-label (deutsche Quelle) gefunden, nicht ueber .chip-label (uebersetzt). (3) build:assets kopiert neue
Wurzel-Module NICHT nach public/assets/ — chat-actions-woerter.js und erste-schritte.js existieren dort nicht;
der Klon bekommt beide Kopien per cp. (4) tests/i18n-ui: ui.js passt auf /^[a-z]{2}\.js$/ — beim Zaehlen ausschliessen.

## 2026-09-03 — Code-Feld 126 px ueber dem Rand: geratene Hoehe statt Flex (job_a_bis_z_20260902, Nachtrag 10)

design-v11 b9fab9d2. **MERKE:** (1) `calc(100dvh - 96px)` war ein Rest der ausgeblendeten Kopfzeile — feste
Abzuege vom Fenster veralten still, wenn das Element verschwindet; in einer Flex-Spalte nimmt `flex:1 1 auto;
min-height:0` immer den Rest, egal welche Leisten oben stehen. (2) Betreiber-Skripte laufen oft NICHT, obwohl
die Karte „gelaufen“ gewaehlt wird — vor jedem Nachtrag Terminal lesen (read_terminal) UND live messen; wenn
der Klick dreimal ausbleibt, die Wirkung zur Laufzeit liefern (deutsch-klartext.js) und das Markup-Skript
liegen lassen. (3) mobil-composer.css ist KEINE eigene Datei mehr im Browser — sie steckt in start-styles.css
(Start-Buendel); neue Regeln kommen aus einem Modul mit `<style id>` und drei Klassen fuer die Spezifitaet.

## 2026-09-03 — Kompakt-Programm Stufe 1: Abstaende halbiert, Buendel-id schlaegt Klassenregel (job_a_bis_z_20260902, Nachtrag 11)

design-v11 a0748acd/2f248ca6. **MERKE:** (1) Erst messen (Kinder je Ansicht mit top/margin/padding), dann
Regeln — die 60 px unter jeder Kopfzeile waren vier kleine Abstaende (12+10+20+18), keiner allein auffaellig.
(2) `body .view.is-active.is-active` (0,3,1) verliert gegen `#settings.view.is-active` (1,2,0): fuer Ansichten
mit id-Regeln im Buendel braucht die Modul-Regel die id. (3) Kompakt heisst Abstaende, nie Ziele oder Schrift —
der Test verbietet font-size/height/width im Regelwerk. (4) GitHub Pages kann einen Bau still
verwerfen: Deployment 71a4cb4 stand auf „failure“ (Statuses-API, ohne gh lesbar unter
api.github.com/repos/<repo>/deployments), die Seite lieferte 14 min den Vorgaenger. Heilung: leerer Commit
(`git commit --allow-empty`) — Bau in 30 s gruen. Vor jedem „live“ den Header last-modified oder die Statuses lesen.

## 2026-09-03 — Nr. 6 Wurzel: nicht der Merker, die Arbeitsflaeche (job_a_bis_z_20260902, Nachtrag 12)

design-v11 5d2a8215. **MERKE:** (1) „Panel oeffnet mit altem Inhalt“ hatte zwei Ursachen; der Sitzungs-Merker
war nur die zweite. Ein Beobachter auf #startLog (arbeitsflaeche.js) sah die wiederhergestellte lange Antwort
als neu und klickte den Browser-Knopf — bei jedem Laden, auch am Handy. (2) Wer klickt, findet man mit einer
Klassen-Falle: DOMTokenList.prototype.toggle/add abfangen und new Error().stack loggen — MutationObserver
liefert keinen Verursacher. (3) Alles, was „Neues“ automatisch aufklappt, muss zwischen Strom und
Wiederherstellung unterscheiden (smejj:chat-strom), sonst wird es beim Start zur Falle.

## 2026-09-03 — Kompakt Stufe 2 und Verlauf ganz unten (job_a_bis_z_20260902, Nachtrag 13)

design-v11 3a370366/ae06f8ba. **MERKE:** (1) 20-px-Luft zwischen Kopfzeile, Feld und Chips war der
`gap` der Flex-Spalte (.home-feed), nicht ein Rand — Rand-Regeln an den Kindern addieren sich nur dazu
(gemessen: 20 -> 32). Erst Raster, dann Raender. (2) Kein Modul scrollte den wiederhergestellten Verlauf
ans Ende; ein Beobachter auf #startLog mit Nutzer-Fenster (Rad/Touch 1,5 s) und Strom-Sperre reicht.

## 2026-09-03 — Wartetext im Verlauf gespeichert (job_a_bis_z_20260902, Nachtrag 14)

design-v11 66f80b65. **MERKE:** readEntries() nahm jeden .entry-Knoten mit — auch den Platzhalter
„smejj denkt nach…“ (data-thinking), wenn der Nutzer die Seite vor der Antwort verliess. Zwei Betreiber-Chats
zeigten das dauerhaft. Regel: Speichern filtert Platzhalter, Wiederherstellen ueberspringt Altbestand ohne
Rohtext. chat-store.js steht bei 800 Zeilen — ab jetzt nur noch auslagern.

## 2026-09-03 — iPhone: Welle in Zeile drei, Statusleiste als Balken (job_a_bis_z_20260902, Nachtrag 15)

design-v11 1b2afe29. **MERKE:** (1) Unter 560 px ist .prompt-actions `display:contents` — die Knoepfe leben im
wrappenden .prompt-glass; wer dort Breiten aendert, muss die Summe bei 375 px rechnen (Flaeche 327 px), sonst
wandert der letzte Knopf in die naechste Zeile. (2) Vollbild-PWA auf iOS = `apple-mobile-web-app-status-bar-style
black-translucent` + dunkle `theme-color` + safe-area-Innenabstand; `display: fullscreen` im Manifest kann iOS
nicht. (3) Die installierte PWA laedt Start-Module aus dem Precache — Laufzeit-Module, die an einem precached
Startmodul haengen, erreichen das iPhone erst mit dem SW-Sprung. Beweise am Desktop-Chrome sagen darueber nichts.

## 2026-09-03 — Kaskade Nr. 7+8+15 lief per Doppelklick, brach an einer Dateiliste (job_a_bis_z_20260902, Nachtrag 16)

design-v11 4bcb15b6, SW v729. **MERKE:** (1) Der Betreiber startet Skripte per Finder-Doppelklick auf eine
.command-Datei — nicht per Run-Knopf; `open -R` zeigt sie ihm. (2) `set -e` + `git add` mit einer Datei, die es
nicht gibt (public/assets/manifest.webmanifest), killt die Kaskade NACH dem Stempel — Dateilisten vorher mit
`ls` pruefen. (3) Die Reste (Commit, Klon, Bauzweig) darf die Sitzung selbst erledigen; nur der Stempel braucht
den Klick. (4) Aus dem Terminal der App liest man Doppelklick-Laeufe nicht — Spuren: ps, sw.js-Version,
start-lock-manifest.json, git status.

## 2026-09-03 — Betriebswache und CVE-Runde: Touch-Chip behoben, protobuf zu, transformers zweimal live gescheitert (job_a_bis_z_20260902, Nachtrag 18)

Betriebswache (cron 05:30) war aus zwei Gruenden rot. (1) Touch: `#modelPickerButton` 30x44 px bei 375 px —
composer-zeile.js (03.09.) setzte dem Modell-Chip `min-width:0`, obwohl die Zeile 327 px fuer 244 px Inhalt hat;
Fix `min-width:44px` (design-v11 f9f8f37f, Klon a2b1523, Bauzweig 35c96d3c), live 44x44, Touch-Messung gegen
smejj.com gruen. Kein SW-Sprung noetig: composer-zeile.js ist nicht precached, der Fetch-Handler liefert
netzwerk-zuerst. (2) Betriebswerte: `control-umgebung-luecken.mjs` bekommt von der Zeabur-API 401 — Token in
cli.yaml abgelaufen; bleibt rot, bis der Betreiber ihn erneuert (Rote Liste, Zugang).
CVE-Waechter (Backlog Stufe 2): protobuf 5.29.5 -> 5.29.6 (GHSA-7gcm-g887-7qv7/PYSEC-2026-1805, Bauzweig
062cefab); pipecat-ai bleibt 0.0.67 (nicht gebaut, sauber erst 1.4.0+ mit API-Umbau, neueste 1.8.1);
transformers 5.5.0 -> 5.10.4 im Bild-Maler ZWEIMAL live gescheitert: 597c7cf0 (nur Pin) und 922d964d (Pin +
torch 2.7.1/torchvision 0.22.1 im Dockerfile) — Dienst jeweils bereit:false, diffusers 0.38 "PreTrainedModel"
nicht importierbar; beide per Revert zurueck (0eaafe5f, 06260151), Rollback-Zweig sicherung/maler-vor-cve-2026-09-03,
Maler seit 07:55 UTC wieder bereit. design-v11 001562f7 / Bauzweig df208c13 spiegeln den gebauten Stand.
**MERKE:** (1) Wurzel von Anlauf 1 lokal exakt reproduziert (uv, Python 3.11, torch 2.5.1): transformers 5.10
nutzt `torch.float8_e8m0fnu`, das torch 2.5.1 nicht hat. (2) Anlauf 2 importiert in der abbild-getreuen
Nachstellung (gfpgan vor den Requirements, torch 2.7.1) sauber — der Unterschied zum Zeabur-Bau steht nur im
Baulog, ohne Token unerreichbar: STOPP nach 2 von 5 Runden. (3) Requirements muessen den GEBAUTEN Stand zeigen,
sonst ist der CVE-Waechter falsch gruen; die Luecke (save_pretrained-Pfad) ruft server.py nie. (4) Vor jedem
Maler-Push zuerst `sicherung/maler-vor-cve-<datum>` auf die Spitze setzen; Zeabur-Bau ohne Token nur ueber
/health beobachten (ladezeitSek springt beim Neustart auf klein, `fehler` traegt den Importfehler).

## 2026-09-03 — A-bis-Z-Pruefung: 12 Katalogpunkte gemessen, 7 Befunde behoben, check:all EXIT 0, live v735 (job_a_bis_z_20260903, Nachtrag 19)

Capsule `task-capsules/2026/09/job_a_bis_z_20260903/capsule.json` (Belege, Screenshots, URLs). Gruen: Responsive 152
Messpunkte 320-1920 px, Touch 375 px, Barrierefreiheit (0 ohne Namen, 0 ohne Fokusrahmen), Fehlerzustaende (API blockiert
-> Meldung, offline -> Vorrat), Service Worker (Precache vollstaendig, live == Repo), Static-First (GitHub Pages/Varnish,
kein Control im Render-Pfad), Backend (jeder Pfad ohne Anmeldung 401, CORS fremd 403), IDrive-Health ok, Security-Header,
CVE 24/24, Schreibregel, Chat E2E (3 echte Aufrufe, Ende Median 1,5 s), Doku (Deployment-Plan Stand 2026-09-03).
Behoben: toter IDrive-Datenschutzlink; Secret-Scanner-Fehlalarm (verweis:/${VAR}); Foundation-Suite 2026-09-03.1
(Digests + contentSha256); Markenkette (23 Marken bis index.html, Kaskade 4, v735, Betreiber-Stempel 09:21 UTC);
Einwilligungs-Lock neu gestempelt (datenschutz.html liegt darin). Gelb, nicht Seite: TTFB/LCP kalt und TTFT 1,2 s vom
Betreiber-Netz (RTT 130-250 ms, TCP-Connect API 231 ms). Offen: Zeabur-Token (Betriebswerte 401, Maler-Baulog) und
transformers im Maler (Nachtrag 18). Browser-Matrix: Chrome voll, Firefox rendert (willkommen.html), Safari nur mit
Remote-Automation-Einstellung.
**MERKE:** (1) Eine neue ?v=-Marke aendert die ladende Datei — deren Marke steigt mit, bis index.html; iterativ im
Probe-Worktree mit check-markenkette berechnen (3 Runden -> 23 Regeln). (2) Die Foundation-Suite pinnt Prueferskripte
UND sich selbst: nach jeder check-*.mjs-Aenderung Asset-Digests, Version und contentSha256 nachziehen. (3) datenschutz.html
und die Einwilligungskette sind gelockt — jeder Link-Fix braucht den Stempel (dieser Lock laesst --freeze in der Sitzung zu).
(4) Firefox-Screenshot von "/" ist weiss, weil das fruehe Tor sofort nach /willkommen.html springt — Zielseite direkt
schiessen. (5) Kaskaden koennen nach dem Stempel abbrechen; Spuren: Manifest-Zeitstempel, sw.js, git status — Reste darf
die Sitzung selbst erledigen.

## 2026-09-04 — Anhaenge Stufe 2 (PDF, Office, Tonspur) und check:all wieder EXIT 0, live v750 (job_anhaenge_stufe2_und_checkall_20260904)

Angehaengte Dateien kommen jetzt INHALTLICH an statt als toter Verweis. Vier neue Browser-Module,
alle per `import()` erst bei Bedarf geladen (Seitengewicht blieb bei 279 KB unter dem 300-KB-Budget):
`composer-anhang-chips.js` (Kachel mit Vorschau/Symbol, Name, Groesse, ehrlichem Untertitel statt
Textzeile `[Anhang: IMG_5287.mov (63595 KB)]`), `anhang-pdf-text.js` (pdf.js 6.3.289, Apache-2.0),
`anhang-office-text.js` (eigener ZIP-Leser ueber `DecompressionStream("deflate-raw")`, kein Fremdpaket),
`anhang-tonspur.js` (`decodeAudioData` → 16 kHz mono → 60-s-WAV-Stuecke → `/api/voice/transcribe`).
Jeder Fehlerpfad faellt auf die Verweis-Kachel zurueck. Live auf smejj.com abgenommen: PDF „48 Zeichen"
mit `[Seite 1] …`, Word „38 Zeichen" mit Inhalt, Video als Kachel mit Hinweis, null Konsolenfehler.

DIE LEHRE DES TAGES — eine grosse Fremddatei zieht fuenf Pruefungen hinter sich her.
`pdf.worker.min.js` wiegt 1,27 MB und riss nacheinander: (1) `check:security` (keine Repo-Datei ueber
1 MB) → Worker als `part1`/`part2` im Repo, ganze Datei per `npm run build:pdfjs-worker` und
git-ignoriert, im Container aus den Teilen per Server-Route geliefert (`src/server.js`, Bauzweig).
VERWORFEN: Blob-Worker — pdf.js laedt per `import()`, `script-src` erlaubt kein `blob:`-Modul.
(2) `check:modul-syntax` parste die Fragmente als Module → `public/vendor/` als Fremdcode ausgenommen.
(3) `tests/platform-pwa` (512 KB je Datei in `public/`) → `vendor/` und `assets/vendor/` ausgenommen,
dafuer LICENSE + VERSION Pflicht und Gewichtsdateien ueberall verboten. (4) `check:guidelines` fand
`api-center-surface.js` bei 813 Zeilen → vier Listen-Aktionen nach `api-center-aktionen.js` (86 Zeilen),
Umgebung als `hof()` uebergeben. (5) `tests/i18n-ui` hielt die Texte des neuen Moduls fuer verwaist →
Datei dort mitlesen. Merksatz: Wer Fremdcode einzieht, prueft VORHER alle Groessen- und Modulregeln.

BENCHMARK (live, 04.09.): Seitengewicht 279 KB (Budget 300, OK), CLS 0/0,016 (OK), INP 40/32 ms (OK),
LCP kalt 4672 ms / warm 600 ms, TTFB kalt 2991 ms / warm 567 ms. Die beiden roten Werte sind
NETZGEBUNDEN, nicht serverseitig: Gegenmessung aus derselben Leitung zur selben Zeit ergab
`example.com` 1219 ms und `google.com/generate_204` 1273 ms TTFB — smejj.com warm 482 ms, davon
343 ms TLS, also ca. 140 ms echte Serverzeit. Bei jeder Vitals-Messung gehoert diese Gegenprobe dazu,
sonst jagt man einen Serverfehler, den es nicht gibt.

check:all EXIT 0 (kein roter Punkt), check:frontend 686 Tests, check:control-server 230 Tests,
check:guidelines 2107 Dateien. smejj.com und api.smejj.com synchron auf smejj-shell-v750.
Task Capsule: docs/task-capsules/2026/09/job_anhaenge_stufe2_und_checkall_20260904/CAPSULE.md

## 2026-09-04 · Adminbereich: Nummern, Logo-Knopf, Zieh-Griff — und warum er langsam war (job_admin_nummern_logo_20260904)

**Nummern mit 100%-Schutz.** Das Admin-Menue traegt jetzt 1..8 fuer die Gruppen
und 1.1..8.2 fuer die Bereiche; die Tabelle in `console.js` bestimmt zugleich die
Reihenfolge (vorher entschied darueber die Ladereihenfolge der `console-stage*.js`
— unsichtbar und damit nicht schuetzbar). Geschuetzt wird die ZUORDNUNG, nicht die
Datei: `scripts/check-menue-nummern.mjs` und `scripts/check-autopilot-nummern.mjs`
vergleichen bei jedem `check:all` gegen ihre Manifeste. Eine vergebene Nummer darf
nicht wandern, nicht doppelt vorkommen, nicht verschwinden — eine NEUE Nummer fuer
etwas Neues bleibt erlaubt. Ein Datei-Hash haette den Weiterbau blockiert und den
Schutz durch staendiges Neu-Einfrieren entwertet.

**Der Adminbereich war langsam — gemessen, nicht geraten.** Im Chrome des
Betreibers: `navigator.connection` meldet 3G, 1,5 Mbit/s, **500 ms Umlaufzeit**.
Die 26 Konsolen-Skripte luden STRENG NACHEINANDER, jede Datei startete auf die
Millisekunde genau dann, wenn die vorige fertig war: letztes Skript nach
**21 Sekunden**, `console.js` nach 26. Der Anmelde-Ruf startete erst DANACH.
Daher die Meldung "Konsole nicht geladen" — die 15-Sekunden-Wache in `gate.js`
schlug zu, obwohl nichts kaputt war.

Drei Ursachen, alle behoben — nachher starten alle 28 Skripte gleichzeitig und
sind nach **678 ms** da:
1. Kein `defer`. Jetzt alle 26 mit `defer` (parallel geholt, in Reihenfolge
   ausgefuehrt). `gate.js` bleibt ohne `defer` im Kopf.
2. Der Anmelde-Ruf lag hinter dem Download. `api.js` startet ihn jetzt beim
   Laden; `adminApi.ich()` holt genau diese Antwort ab. Bewusst `holeDirekt`,
   nicht `hole` — der Vorab-Ruf darf keinen Step-up-Dialog in eine Seite oeffnen,
   die es noch nicht gibt.
3. Kein `preconnect` auf `api.smejj.com` (0,6-2,1 s TLS-Handshake mitten im
   Wartebalken). Jetzt gesetzt, mit `crossorigin` — ohne das waermt es die
   falsche Verbindung.

**Falle, die zweimal Zeit gekostet hat: `transition` auf einer Eigenschaft, deren
Wert aus einer Custom Property kommt.** `.shell{transition:grid-template-columns}`
liess die Schiene einen Schritt HINTERHERHINKEN: `--rail` rechnete korrekt 68px,
`grid-template-columns` stand 500 ms spaeter immer noch auf dem alten Wert. Der
Uebergang startet auf dem BEREITS geaenderten Ausgangswert und laeuft von 68 nach
68. Unabhaengig davon rechnet eine Animation auf Grid-Spuren in jedem Bild das
ganze Layout neu. Entfernt, Probe haelt es fest.

**Zieh-Griff auf der Trennlinie** (`schiene.js`, eigene Datei wegen der
800-Zeilen-Regel): Pointer Events mit `setPointerCapture` — ein Weg fuer Maus,
Finger und Stift. Im Zug wird nichts gemessen und nichts gespeichert, nur eine
CSS-Variable, hoechstens einmal je Bild. Unter 150 px rastet es ein; eingeklappt
bleiben 68 px Icon-Spur stehen, damit das Logo klickbar bleibt.

**Vor dem Spiegeln IMMER den Diff Quelle-gegen-Klon lesen.** `console.css` trug
live eine Regel (`.panel>.pb.flush:has(>table)`), die in der Quelle fehlte — der
Spiegel-Lauf haette sie geloescht. In die Quelle zurueckgeholt.

Live und geschuetzt: Admin-Lock 50 Dateien (neu dabei `schiene.js`), 81
Autopiloten-Nummern, 8 Gruppen und 34 Bereiche. Quellzweig
`feature/admin-schiene-nummern-logo` bei origin — der Bauzweig war durchgehend
von einer Parallelsitzung mit ungespeicherter Arbeit belegt.

## 2026-09-04 · Tempo und Gewicht: preconnect live, Startgewichts-Waechter gebaut (job_admin_nummern_logo_20260904, Nachtrag 2)

**preconnect ist live.** `<link rel="preconnect" href="https://api.smejj.com" crossorigin>`
in `public/index.html`, genau 5 Zeilen. Der erste API-Ruf startet jetzt bei
**436 ms statt 2130 ms**; der kalte TLS-Handshake (0,6-2,1 s gemessen) ist aus
jedem Ruf raus. `crossorigin` ist Pflicht — ohne waermt es eine ANDERE
Verbindung als `fetch()` benutzt. Heikel war das Inline-Skript des fruehen
Tors: es haengt an einem CSP-Hash, ein Byte darin haette es stillgelegt. Zeilen
davor gesetzt, Hash danach nachgerechnet, lokal und live.

**Waechter fuer das Startgewicht gebaut** (`check:startgewicht`). Der Auftrag
"unter 300 KB" stand seit dem 19./24.08. — gemessen hat ihn NIE jemand, kein
Test im ganzen Repo. Gemessen wird gzip ueber die Seite selbst plus den
statischen Importbaum; dynamische `import()` zaehlen nicht (sie sind das
Mittel zum Abspecken). Ratsche statt Mauer: rot beim Schwererwerden, Messlatte
sinkt beim Leichterwerden.

**Die Messfalle, die fast eine Falschmeldung wurde:** `performance` liefert bei
Antworten aus dem Cache `encodedBodySize === decodedBodySize` — die **ROHE**
Groesse. Ich sah 777 KB und haette "2,6-fach ueber Budget" gemeldet. Gegen die
Leitung nachgemessen: das echte Eigengewicht ist **228 KB gzip** — unter der
Vorgabe. Alle 13 Seiten gemessen, keine drueber (34 entwickler, 12 verlauf,
3 programmieren).

**Zwei Fallen, in die der Waechter selbst tappte** — beide jetzt als Probe
festgehalten: `/assets/` ist eine AUSLIEFERUNGS-Adresse fuer `public/`, kein
Ordner (erster Entwurf fand 53 statt 81 Dateien und meldete gruen); und die
Seite selbst zaehlte nicht mit (`programmieren.html` kam mit "0 KB" heraus,
obwohl sie ihren Stil in einem `<style>`-Block traegt). Beim ersten Lauf nach
der Korrektur fing er sofort den eigenen preconnect-Commit: `index.html` wich
von `assets/index.html` ab — die Parallelsitzung hatte denselben Befund
unabhaengig ueber `tests/rechtslinks.test.mjs`.

**"51 % ungenutztes CSS" war eine Luege.** Im Browser trafen 51 % der 1157
Regeln kein Element (71 KB). Danach zu loeschen haette die Seite zerlegt —
`#code.view.is-active` trifft nichts, solange man nicht in der Code-Ansicht
steht. Zustandslos gemessen (`scripts/diagnose/tote-css-regeln.mjs`: kommt die
Klasse irgendwo im Markup oder in einem Modul vor?): **23 von 1159 Regeln
wirklich tot, unter 1 KB gzip.** Das Buendel ist zu 96 % lebendig.

**Kein Eingriff ins Gewicht.** 228 gegen 300 KB, und die Bytes sind verdient:
die 69 KB Chat-Module braucht, wer `index.html` laedt (Anonyme schickt das
fruehe Tor vorher zur Landeseite). Ein Schnitt haette den Design-Lock gekostet
— fuer unter 1 KB. Betreiber-Entscheidung 04.09.: der `preload` fuer
`start-styles.css` bleibt VOR dem Tor ("So lassen").
