# Memory_Bank-Archiv Runde 6 (ausgelagert 2026-09-03)

Volltexte dreier Eintraege aus der Memory_Bank.md, unveraendert uebernommen (800-Zeilen-Regel, Memory_Bank stand bei 800/800 Zeilen).

## 2026-08-25 — SPRACHWELLE iPHONE: iOS GING IMMER IN DEN TIPP-FALLBACK (job_vollaudit_20260825, Nachtrag)

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

## 2026-08-25 — VOLLAUDIT: /code WAR AUF ALLEN DOMAINS TOT — BEI 64 GRUENEN AMPELN (job_vollaudit_20260825)

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

## 2026-08-23 — MODELL-LISTE 100% GESICHERT — ZWEI SCHLOESSER (job_modellliste_lock_20260823)

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

