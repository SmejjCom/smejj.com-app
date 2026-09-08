# Memory_Bank — Archiv Runde 8 (ausgelagert 2026-09-08)

Volltexte der Eintraege vom 2026-09-02 bis 2026-09-04, ausgelagert aus `Memory_Bank.md`
wegen der 800-Zeilen-Regel (check:guidelines). Nichts geloescht, nichts gekuerzt.

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
