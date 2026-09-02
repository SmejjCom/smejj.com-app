# Memory_Bank.md — Verifiziertes Gedaechtnis von smejj.com
Nur verifizierte, erfolgreiche Loesungen und Architekturentscheidungen. Kein Eintrag ohne bestandene Verification Pipeline. Fehlgeschlagene Builds und Halluzinationen werden niemals aufgenommen.
## Eintragsformat
Jeder Eintrag nennt Datum, Typ, Capsule, Entscheidung, Begruendung und Verifikation.
---
## Architekturentscheidungen

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

### [2026-08-25] SPRACHWELLE iPHONE: iOS GING IMMER IN DEN TIPP-FALLBACK (job_vollaudit_20260825, Nachtrag)

Capsule: `task-capsules/2026/08/job_vollaudit_20260825/capsule.json`
(nachtragSprachwelleIphone). Frontend e1210cb+187b9d5 (sw v708 -> v709),
design-v11 c0215c6a, Bauzweig 37583343 + Control-Neubau (17:44:09Z).

**Wurzel:** `openVoiceMode()` prueft am Ende `!RecognitionCtor` — auf
iOS/Safari IMMER wahr — und ging sofort in `enterVoiceFallback`. Der am
Vormittag gebaute Ohr-Solo-Modus hing nur an zwei SPAETEREN Stellen
(voiceFailStreak>=3, start-catch), die iOS nie erreicht. Darum: Desktop
gruen, iPhone stumm.

**Fixes:** (1) iOS-Zweig versucht ZUERST `ohrSolo.aktivieren()` — netto 0
Zeilen, composer-tools bleibt exakt 800. (2) `await ctx.resume()` nach dem
AudioContext-Erzeugen — iOS startet "suspended", der Analyser lieferte sonst
Pegel 0 bis ins 45-s-Zeitlimit; bleibt er suspended, weckt ein einmaliger
touchend/click-Listener nach. Tests je kaputt UND gesund (gegen HEAD~).

**Beweis ohne Web-Speech:** headless Chrome, Fake-Mikrofon aus WAV (`say`),
RecognitionCtor geloescht, 390x844: alter Stand -> Tipp-Fallback; neuer
Stand -> Ohr-Solo hoert, erkennt das Sprech-Ende, POST an
/api/voice/transcribe. LIVE gegen smejj.com v709: POST -> 401 = Kette steht
bis zur Auth. MESSFALLE: Fake-Audio liefert dem Analyser nur mit
`--disable-features=AudioServiceOutOfProcess,AudioServiceSandbox` Pegel
(sonst exakt 0 bei "running"-Kontext und lebendiger Spur); und die
PWA-Selbst-Aktualisierung (v707) laedt beim SW-Erstinstall mitten in der
Probe neu — danach erneut klicken.

**Altbestand des Bauzweigs, dabei geheilt:** `chat-bridge-strom.js` hinkte
hinter `chat-bridge.js` v144 (FRAGE_WERKZEUG fehlte) — die GEBUENDELTE
Schnellspur warf und fiel auf streamModel 503 (Projektwissen-Test dauerrot;
die Live-Bridge war nicht betroffen, ihr Bundle kam von design-v11).
bilder/websuche/evolution/voice-tts bewusst NICHT angeglichen — die Zweige
sind dort echt divergiert (Bauzweig hat Foto-Geduld, design-v11 die
Motiv-Fixes); pauschales Kopieren waere Rueckbau. check:admin-konsole
geeicht (wertlose Attribute `<span data-x>` zaehlen als gezeichnet, Regeln-
Seite per Erlaubnisliste, Sandbox kennt Stage 10-13 + Cockpit; Selbstproben
erweitert). favicon-/abo-/einwilligung-lock trugen noch die vergessenen
v701-Stempel (Diff je nur die viewport-fit-Zeile) — nachgeholt.

**Offen:** echter iPhone-Sprechtest durch den Betreiber; bewusste
Zusammenfuehrung der divergierten Bridge-Module.

**Nachtrag Simulator-A-Z (26.08. nachts, "alle Rechte, vollautomatisch"):**
Kein Xcode auf dem Mac -> zwei emulierte iOS-Geraete (iPhone 390x844, iPad
820x1180; RecognitionCtor geloescht, Fake-Mikrofon) liefen die ECHTE Reise
gegen live: Willkommen-Weiche -> Login -> Magic-Link aus der Betreiber-Gmail
-> Chat -> Sprachwelle -> Transkript -> gesprochene Antwort. BEIDE 13/13
BESTANDEN. Dabei der eigentliche Endgegner: voice-ear.js schickte den
Transcribe-Upload OHNE Authorization-Header — die Bruecke verlangt ihn (kein
Token = 401). Im Web-Speech-Duett war das JAHRELANG unsichtbar (Browser-Text
gewann still), im Ohr-Solo fatal: 5x401 trotz frischer Sitzung. Fix:
authHeaders wie voice-premium-tts, sw v710 (Frontend 41eedd0, design-v11
08950e95, Bauzweig 06afa5b9, Control neu 22:33Z, 7 Dateien beider Domains
sha256-identisch); Waechter 6a-6d kaputt+gesund. Simulator-Messfallen:
Erste-Fuehrung frisst den Sende-Klick; SW-Erstinstall-Reload mitten im Test;
Gmail verzoegert/spam-t wiederholte Magic-Link-Mails (in:anywhere!); Link
ohne Handoff strandet auf api.smejj.com. P3: Schnellspur halluziniert bei
"Was ist smejj.com?" (RAG zielt nur auf Infrastrukturfragen).

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

**Politur-Runde (v704-v706, Freigabe "alle Rechte"):** TTS ohne Emoji-Namen,
Manifest mit ECHTEN Shortcuts (pwa-schnellstart.js — keine Attrappen-Regel!),
Install-Screenshots, Such-Diaet (search.js bei Bedarf; Budgetriss 302 KB
geheilt, Ende 297 KB), kanonisches Buendel (mobil-composer als Quelle, nie als
Hand-Anhang). design-v11 komplett auf die Live-Welt gezogen (7 fehlende
Module, 12 Test-Eichungen) — check:all EXIT 0, Suite 3048/3048, Ampel 64/64.
Anmelde-Sturm: keine Sperre noetig, Login-Drosseln (8/min) fingen ihn.

**Schlussrunde (v707/708 + Bruecke v144, "alle Rechte"):** PWA aktualisiert
sich selbst (controllerchange-Reload mit Eingabe-Schutz); Sprachmodus-Regel
sitzt jetzt an BEIDEN Antwortquellen (Bruecke UND Geraete-Schnellspur) — die
Bruecke hatte preferences.voiceMode nie gelesen. Bruecken-Deploy-Falle:
buildChatBridgeArtifact() als Funktion SCHREIBT kein Bundle (nur der
CLI-Aufruf), und restartService zieht raw.github erst nach CDN-Verfuegbarkeit
— Version IMMER per /health nachmessen (v143->v144 erst im dritten Anlauf).

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

## 2026-08-31 — Zentraler API-Bereich im OpenRouter-Layout (job_api_zentrum_20260831)

- Betreiber-Freigabe: „Ich finde deinen Vorschlag gut … alle Rechte von A bis z" + Nachtrag „mach 1 zu 1 genau wie openrouter.ai/workspaces/default/keys, gleiche Design".
- EINE Fläche api-center-surface.js/.css ersetzt api-keys-surface + api-konto-surface + entwickler.css (gelöscht); Reiter heißt „API", /entwickler.html rendert dasselbe Modul. LIVE: sw v718/v719, Klon a2834c1 + Nachfolger.
- Look 1:1 OpenRouter: große Überschrift + ein Hauptknopf, große immer sichtbare Suche, Spalten Schlüssel·Typ·Läuft ab·Zuletzt genutzt·Verbrauch·Limit·⋮, Fusszeile „N Schlüssel", Menü mit Icons, Verbindung/Preise eingeklappt.
- Gelernt: (1) hidden verliert gegen Autoren-display — jede Fläche braucht [hidden]-Regeln; (2) i18n-Pflege-Regexe müssen RAW-UTF8 matchen, json.dumps escapet und lässt Duplikate stehen; (3) assets/ai/ liegt nur im Klon — lokale Tests brauchen die Kopie; (4) html.p-recht h2 (2em) schlägt Flächen-CSS gleicher Spezifität; (5) Klon live neuer als App-Repo — abgleich-Meldungen je Datei klassifizieren, chirurgisch kopieren.
- Offen: check:admin-console-sync rot durch Parallelsitzung (deren admin/console.js live neuer); IDrive-Artefakt-Upload an Netzstau gescheitert; „Zuletzt genutzt"/per-Key-Verbrauch liefert das Backend nicht (Spalten zeigen Nie/—) — Backend-Erweiterung als Werkstatt-Kandidat.

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
