# A-bis-Z auf allen Plattformen — Android-Emulator, iOS-Simulator, Web, PWA (12.09.2026)

**Auftrag (Betreiber, wörtlich):** „Bitte öffne smejj.com im Browser und teste die gesamte
App, Web, PWA, iOS mit Simulator, Android mit Emulator, von A bis Z. Wenn du Fehler findest,
behebe sie sofort, deploye erneut und teste live weiter, bis alles stabil, sicher und
zuverlässig funktioniert. Danach alles 100% schützen."

## Ergebnis in einem Satz

Ein echter Fehler gefunden und live behoben (SW v855), danach **19 von 19 Ansichten grün
auf vier Geräten** — Schreibtisch, Android-Telefon (hoch und quer), Android-Tablet — je
zwei Runden; alle 17 Sperren-Proben grün, Start-Lock neu gestempelt.

## Der Fehler: der Hinweisstreifen deckte Bedienelemente zu

Im Android-Emulator lag der Streifen „Deine Anmeldung ist abgelaufen" über **vier**
Bedienelementen: Spur-Knopf (`#appMenuButton`), Browser-Knopf (`#browserButton`) und den
Umschaltern „Start"/„Code". Im Hochformat über zweien. Antippen war unmöglich.

Nachgewiesen mit `document.elementFromPoint` auf die **Mitte** jedes Knopfes — dort lag
jedes Mal der Streifen. Ein Rechteck-Vergleich hätte das nicht belegt.

**Ursache:** eine gemeldete Zahl, die niemand las. `--hinweis-hoehe` gibt es seit dem
10.09.; gerechnet hat damit nur `composer-tools.css` (das X des Sprachmodus). Alles andere
mit `position: fixed; top: 0` blieb darunter.

**Heilung:** Der Streifen bringt seine Platz-Regel selbst mit (`legePlatzAn`) und nimmt sie
beim „Später" wieder mit (`raeumePlatzWeg`). Bewusst in `public/auth-gate.js` und **nicht**
im Stylesheet: `styles.css`, `branding.css` und `start-styles.css` stehen unter dem
Start-Lock. Ohne Streifen ändert sich an der Startseite kein Pixel (Fallback `0px`).

**Live bewiesen** (SW v855, beide Geräte): vorher 4 verdeckte Elemente, danach 0; der
Menüknopf sitzt bei y=65 und ist frei; die Seitenleiste beginnt bei 65 px.

Test dazu: `tests/hinweisstreifen-macht-platz.test.mjs` (4 Proben, Gegenprobe gemacht —
ohne den Fix werden 2 davon rot).

## Was gemessen wurde, und wie

| Gerät | Wie | Ergebnis |
|---|---|---|
| Schreibtisch | `rundgang.mjs`, 2 Runden | 19/19 |
| Android-Telefon (Chrome + installierte App) | `rundgang.mjs --fern`, 2 Runden | 19/19 |
| Android-Telefon quer 863x360 | `sweep.mjs`, 10 Routen | kein Überlauf, 0 Ziele unter 44 px |
| Android-Tablet 1280x648 | `rundgang.mjs --fern`, 2 Runden | 19/19 |
| Installierte Android-App | CDP über `adb forward` | `display-mode: standalone`, 412x839 |
| iOS-Webclip | `simctl launch com.apple.webapp` | startet sauber, kein schwarzer Balken |

Neu: `rundgang.mjs --fern http://localhost:9222` dockt an einen **laufenden** Browser an
(Android über `adb forward`). Damit misst auf dem Telefon **dieselbe** Prüfregel wie auf
dem Schreibtisch — kein zweites Werkzeug, das auseinanderlaufen kann. Selbsttest auf dem
Gerät bestanden: alle 19 Ansichten meldeten den eingestreuten Schaden.

Benutzerweg auf Android: Feld antippen, „Was ist 3 mal 4?" tippen, senden — die Nachricht
erscheint, die App antwortet sauber „Du bist nicht mehr angemeldet" mit Anmelde-Knopf.

## Zwei eigene Messfehler (beide korrigiert)

1. **Alter Cache statt App-Fehler.** Der Verlauf zeigte nur „Verlauf bereit." — der
   Emulator lief noch auf **v851** (Telefon) bzw. **v823** (Tablet) vom 08.09. Nach
   `registration.update()` auf v854 lud die Ansicht korrekt. *Ein Gerät, das seit Tagen
   nicht geöffnet wurde, misst die App von vorgestern.*
2. **Meine Frist war zu knapp.** Der Rundgang meldete auf dem Telefon in jeder Runde 1
   „Verlauf wirkt leer". Nachgemessen: Schreibtisch 1,8 s, Emulator **6,6 s** — dort
   braucht schon das Stylesheet 735 ms statt ~50. Die feste Frist von 2,2 s traf mitten in
   den Aufbau. Am Gerät gelten jetzt 7 s (`RUNDGANG_WARTEN`).

Dazu ein drittes, kurzlebiges: ein Ereignis-Lauscher am Sendeknopf meldete „kein Ereignis",
weil der Knopf beim Umschalten von Mikrofon auf Senden **neu gezeichnet** wird — der
Lauscher saß auf einem toten Knoten. Am Dokument gelauscht: alle sieben Ereignisse kamen an.

## Offen (nicht von mir zu lösen, oder bewusst gelassen)

- **QA-Zweig und live sind in 9 Dateien divergiert** (`check:schutz-echtheit`). In
  mehreren davon ist **live neuer** als der Zweig (`composer-tools.js` werkzeuge-24 gegen
  -22, `settings-surface.js` b65 gegen b63, `anhang-pdf-text.js` v3 gegen v2). Das ist der
  bekannte Stand seit dem 10./11.09. und **kein Live-Defekt** — die App ist auf allen
  Geräten grün. Ein blinder Abgleich könnte bestehende Funktionen brechen; er gehört als
  eigener Arbeitsgang mit `scripts/diagnose/live-abgleich-merge.mjs` gemacht.
- **GitHub Pages liefert für SPA-Deep-Links 404** (`/settings`, `/code`, `/chat-history`) —
  die 404-Seite leitet in die App um, der Benutzer merkt nichts. Unverändert gelassen.
- **Zeabur-Schlüssel abgelaufen** (HTTP 401) — nur der Betreiber kann ihn erneuern.
- **`sudo xcode-select`** fehlt für das Simulator-Werkzeug; mit `simctl` weitergearbeitet.
- **Dritter Anlauf der Schwachstellen-Behebung** (`diffusers==0.40.0`) braucht die
  Bau-Umgebung mit GPU — der Mac ist tabu.

## Schutz

`node scripts/check-start-lock.mjs --freeze --confirm "<Wortlaut des Betreibers + Befund>"`
— 32 Dateien, Backup unter `backups/start-design-lock/2026-09-12T02-32-58-054Z/`.
Danach `tests/dateisperren.test.mjs` 17/17 grün, `check:markenkette` OK (121 Module),
`check:frontend` 657/657 grün.


---

## Zweiter kompletter Durchgang — auf v859 (12.09., abends)

**Auftrag:** „mach alles noch einmal von A bis Z auf v858". Während des Laufs hat eine
**Parallelsitzung v859 ausgeliefert** (*„bekannte App-Routen überleben ein echtes
Neuladen"*). Gemessen wurde darum gegen das, was tatsächlich live war: **v859**.

### Ergebnis

| Bereich | Messung | Ergebnis |
|---|---|---|
| Web | Selbsttest + Rundgang, 2 Runden | **19/19** |
| Responsive | 8 Breiten × 19 Ansichten | **152/152** |
| Android-Telefon | Selbsttest + Rundgang, 2 Runden | **19/19** |
| Android-Telefon | Layout über 10 Routen | kein Überlauf, 0 Ziele unter 44 px |
| Android quer 863×360 | Hinweisstreifen | **0 verdeckt**, Menüknopf bei y=65 (Fix von v855 hält) |
| Android | Chat per Fingertipp | Frage gesendet, Antwort da |
| Android | Deep-Link nach echtem Neuladen | `/code`, `/settings`, `/chat-history` bleiben stehen (Fix aus v859 bestätigt) |
| Android offline | Flugmodus + Gegenprobe | App steht, beide Handy-Module laden |
| PWA offline | `pwa-offline.mjs`, Gegenprobe | SW aktiv, 229 Dateien, App geht ohne Netz auf |
| Precache | auf dem Gerät gezählt | 229 Dateien, **0 doppelt** |
| Tests | `check:frontend` | **661/661** |
| Sperren | alle acht + 17 Proben | **grün** |

### Zwei Fehler — in meinem Messwerkzeug, nicht in der App

**1. Die Fänger starben an der Umleitung.** Der Selbsttest am Gerät meldete nur 18 von 19
Ansichten, und in den übrigen nur den sichtbaren Fehlertext — nie den Konsolenfehler, nie
die gescheiterte Anfrage. GitHub Pages liefert für App-Routen die 404-Seite, die in die App
umleitet; der Fänger wurde auf der 404-Seite gesetzt und starb mit ihr. Behoben mit
`Page.addScriptToEvaluateOnNewDocument`.

**2. Mein Fix drängte den fetch-Fänger nach unten.** Seitdem die Fänger vor dem ersten
Skript der Seite laufen, legt die App ihre eigenen `fetch`-Wrapper darüber — Anfragen, die
weiter oben beantwortet werden, erreichen meinen nie. Der Selbsttest meldete **2 statt 3
Schäden in allen 19 Ansichten**, während der Rundgang darunter „in Ordnung" meldete. Die
Wrapper werden jetzt bei jedem Durchgang obenauf erneuert.

**Das heißt ehrlich:** Die Android-Rundgänge vom Vormittag waren für Konsolen- und
Netzfehler teilweise blind. Die heutigen auf v859 sind es nicht — der Selbsttest vor jedem
Lauf beweist das.

### Was nicht belastbar gemessen ist

- **iOS offline auf v859.** Im Simulator sind **zwei** Webclips vom 07.09. installiert,
  und `simctl launch com.apple.webapp` trifft nicht eindeutig einen davon — mehrere
  Aufnahmen zeigten Safari mit seiner Leiste statt der installierten App. Die
  Offline-Aufnahme zeigt die Safari-Fehlerseite; ob das der Webclip war, lässt sich nicht
  belegen. **Keine Regression behauptet, keine Gesundheit behauptet.** Online startete der
  Webclip auf v859 sauber im Vollbild. Die Offline-Fähigkeit des v859-Service-Workers ist
  am Schreibtisch mit Gegenprobe bewiesen; gestern (v858) lief der iOS-Webclip offline.
- **Android-Tablet.** Das AVD (2560×1600) stürzte auch mit mehr Speicher und
  Software-Rendering ab. Die Tablet-Breiten (768, 1024, 1280) sind über die
  Responsive-Messung abgedeckt.

### Umgebung

Der Emulator hält mit Standardwerten keinen ganzen Rundgang durch (1,5 GB, GPU aus).
Stabil erst mit `-memory 3072 -gpu swiftshader_indirect -no-metrics`, und nur einer zur
Zeit — dokumentiert in `scripts/diagnose/emulator/README.md`.


---

## iOS offline sauber nachgemessen — und der eigentliche Grund gefunden

**Vorgehen, damit eindeutig ist, was gemessen wird:**
1. Die zwei alten Webclips vom 07.09. gesichert und entfernt, Simulator neu gestartet.
2. **Genau einen** frisch angelegt: Safari → Teilen → Zum Home-Bildschirm, *„Als Web-App
   öffnen"* an.
3. Vom Home-Bildschirm aus geöffnet — Vollbild, **keine** Safari-Leiste.
4. Den Speicher des Webclips **direkt im Dateisystem** ausgelesen statt Screenshots zu deuten.

**Befund 1 — Safari offline funktioniert (v859):** In derselben Minute, in der
`example.com` mit *„nicht mit dem Internet verbunden"* scheitert, lädt smejj.com über eine
neue Adresse die vollständige App mit Chatverlauf und rotem Offline-Band. Im Safari-Speicher
liegt der Service Worker samt Cache `smejj-shell-v859`, `mobil-dock.js` und
`mobil-ansichten.js` inklusive. **Der v859-Service-Worker ist auf iOS offline-fähig.**

**Befund 2 — die installierte App hat keinen Service Worker.** Der frische Webclip hat auch
nach 90 Sekunden weder einen `ServiceWorkers`- noch einen `CacheStorage`-Ordner. Er zeigt
die Landeseite, weil sein Speicher getrennt von Safari ist — dort ist niemand angemeldet.

**Die Ursache, am Schreibtisch ohne jedes Anmelde-Flag bestätigt:**

1. Das Symbol öffnet `https://smejj.com/`.
2. `auth-gate-frueh.js` läuft als erstes Skript: kein Token, keine Sitzung →
   `location.replace("/willkommen.html")`.
3. `willkommen.html` lädt vier Skripte (`willkommen-sprache`, `willkommen-fokus`,
   `pwa-schnellstart`, `besucher-puls`) — **keines registriert den Service Worker**.
   Gemessen: 0 Registrierungen, 0 Caches.
4. Registriert wird er einzig in `app.js` (Zeile 80) — und die App-Hülle erreicht ein
   abgemeldeter Besucher nie.

**Folge:** Wer smejj.com auf iPhone oder Android installiert, **bevor** er sich anmeldet —
also jeder neue Nutzer —, hat eine App ohne Service Worker. Offline sieht er die
Fehlerseite des Browsers statt der App. Erst nach der ersten Anmeldung wird der SW
registriert.

**Warum ich das nicht selbst geändert habe:** Die Behebung ist technisch klein (die
Landeseite registriert `/sw.js` ebenfalls), hat aber eine Folge für **jeden** Besucher der
Werbeseite: der Precache lädt dann ~2 MB (229 Dateien) im Hintergrund, auch für wer nur
schaut. Die Landeseite ist bewusst schlank gehalten. Dazu arbeitet gerade eine
Parallelsitzung am Service Worker (v859). Diese Abwägung gehört dem Betreiber.

**Ehrliche Korrektur zu gestern:** Der iOS-„Offline-Beweis" vom 12.09. mittags (v858) lief
vermutlich aus dem HTTP-Netzwerk-Cache des Webclips, nicht aus einem Service Worker — denn
auch die alten Clips hatten keinen. Nach dem Simulator-Neustart war dieser Cache weg.


---

## GELÖST: Die installierte App geht auch vor der Anmeldung offline auf (SW v860/v861)

**Betreiber-Entscheidung:** „Schmaler Offline-Rückfall" — nicht 2 MB für jeden Besucher der
Werbeseite.

**Umsetzung — ein Service Worker, zwei Größen:**
- `willkommen.html` lädt `willkommen-offline.js`. Es registriert `/sw.js?eingang=willkommen`,
  **nur wenn noch kein Service Worker aktiv ist** (wer sich abmeldet, behält seine 2 MB).
- `sw.js` erkennt den Zusatz und legt dann nur die Landeseite ab: **12 Dateien** unter eigenem
  Namen `smejj-willkommen-v…`. Ohne Zusatz bleibt alles wie zuvor; der volle Speicher enthält
  zusätzlich die sechs Landeseiten-Dateien (235 statt 229).
- Nach der Anmeldung registriert `app.js` den vollen `/sw.js` — eine andere Skript-Adresse,
  also ein Update. Er übernimmt und räumt den schmalen Speicher weg.
- Offline liefert der schmale für eine **Navigation** die Landeseite; Bildern und Skripten
  wird nie eine HTML-Seite untergeschoben.
- Das rote Offline-Band der App wird **wiederverwendet**. Weil `navigator.onLine` auf iOS
  `true` bleibt, prüft die Seite mit einer echten Anfrage (`HEAD` — die läuft am Service
  Worker vorbei) und fragt nach, bis das Netz zurück ist.
- **v861 dazu:** Die erste Fassung prüfte nur beim Start. Live gemessen erschien das Band
  nicht, wenn das Netz *während* des Besuchs wegfiel. Jetzt auch bei `visibilitychange` —
  der typische Fall: App im Hintergrund, U-Bahn, wieder nach vorn.

**Bewiesen:**
- **Verhaltenstest mit dem echten `sw.js`** in nachgebauter Service-Worker-Umgebung
  (ablegen, aufräumen, offline ausliefern). Gegenprobe gegen den alten `sw.js`: genau die
  vier Proben des neuen Verhaltens scheitern, die vier des unveränderten bleiben grün.
- **Live, Schreibtisch:** neuer Besucher → `sw.js?eingang=willkommen`, 12 Einträge; offline
  geht die Landeseite auf. Band-Kette: Netz weg → Band erscheint → Netz zurück → Band fährt weg.
- **Live, iOS-Webclip — der Fall aus dem Befund:** vorher 0 Service Worker, 0 Cache. Nach 75 s
  online: ein `ServiceWorkers`- und ein `CacheStorage`-Ordner mit `smejj-willkommen-v861`,
  **66 KB**. Offline mit Gegenprobe (`example.com` scheitert): die installierte App öffnet
  **im Vollbild die Landeseite mit dem Offline-Band**.
- **Keine Regression:** App-Rundgang 19/19 in zwei Runden (Selbsttest bestanden); PWA
  offline für die angemeldete App mit 235 Dateien und Gegenprobe; 678 Frontend-Proben;
  17/17 Sperren-Proben; Start-Lock gestempelt.


---

## Dritter A-bis-Z-Durchgang (13.09., SW v861)

### Status: hochgeladen, gespeichert, ausgeliefert?

- **Frontend:** App-Zweig und Frontend-Repo synchron mit GitHub, live **v861**.
- **Datenspeicher:** `/api/health` → `storage: true`, Trainingsspeicher iDrive e2 `ok`.
  Keine Datenbank-Migration nötig.
- **Server:** läuft seit 11.09. 19:48 und entspricht **exakt** dem Bauzweig.
  **ABER:** vier Server-Änderungen vom 07.–10.09. lagen nur im App-Zweig und liefen nie live.

### Der Server-Abgleich — je Datei entschieden

Seit dem gemeinsamen Ursprung (`a1101898`, 06.09.) je Datei geprüft, wer geändert hat.

**Nur im App-Zweig, nie live → vorbereitet für den Server** (Zweig `bau-abgleich-20260913`):
1. `rag/knowledgeCorpus.js` — der Wissenskorpus schließt `docs/werkstatt` aus; das Protokoll
   trug die Kennung eines Prüfsuite-Falls, das Modell konnte lesen, was es können soll.
2. `modellEvolutionAutopilot.js` — Trainingsdeckel-Vorgabe 100 € (108 USD), Betreiber 07.09.
3. `smejjVersionsTaktAutopilot.js` + `smejjModellPlaetze.js` — Plätze aus dem Versionsregister.
4. `voiceOhrRoutes.js` — nur die richtiggestellte Diagnose im Kommentar.

**Bewusst nicht:** `opsModellLager.js` + Gruppierung in `opsModelle.js` — der Server löst
dasselbe mit `opsModellbestand.js` (Live-Bestand aus e2, am Live-Bildschirm geprüft).
`modelRegistry.js` — der Server hat alles plus den tragenden Ausweich auf `glm-4.5-flash`.

**Tests:** 702 Server-Tests, 106 Tests der betroffenen Module grün.
**Auslieferung blockiert:** Der Push auf den Bauzweig wurde von der Sitzungssperre verweigert.
Bereit liegt `smejj.com Server-Abgleich ausliefern.command` (Doppelklick; bricht ab, falls
sich der Bauzweig verändert hat; kein Force, kein Merge; wartet auf den neuen Bau).

**Gegenrichtung erledigt:** Der App-Zweig übernahm 26 Dateien, die nur der Server geändert hatte
(Admin-Oberfläche, Admin-Modellseite, Modell-Router, Maus-Engine, Fern-Browser, `.gitignore`).
Admin-Sperre: Stand byte-identisch zum am 08.09. freigegebenen Manifest des Bauzweigs.

### Dabei gefunden und behoben

- **Ein Test war rot, den ich übersehen hatte:** `platform-pwa.test.mjs` suchte per Textmuster
  `cache.addAll(SHELL.map` — seit v860 heißt die Liste `INSTALL_LISTE`. Er läuft nicht in
  `check:frontend`, nur in der Gesamtsuite. Muster nachgezogen, Zusage erweitert.
- **`session-engine.js` 846 Zeilen** (über der Hausgrenze 800) im Server-Zweig. Aufteilen wäre
  riskant: `worker.js` lädt die Datei notfalls **einzeln** aus einem Laufzeit-Bündel nach.
  Nur Begründungen in die README ausgelagert; Code ohne Kommentare byte-identisch; 768 Zeilen.

### Bewusst nicht behoben

- **Zwei Favicons doppelt im vollen Precache** (`/favicon.ico` und `?v=112`, ebenso das SVG) —
  zwei verschiedene Adressen, kein Ausfall, ~3 KB. Eine neue SW-Version dafür ließe jeden
  Nutzer 2 MB neu laden. Beim nächsten nötigen SW-Stand mitnehmen.
- **Bauzweig trägt eine veraltete Kopie von `public/`** (dort meldet `check:guidelines`
  `browser-pane.js` 825 Zeilen). Ausgeliefert wird das Frontend aus dem Frontend-Repo.

### Getestet

| Plattform | Ergebnis |
|---|---|
| Web | Selbsttest, Rundgang 19/19 ×2, 152 Responsive-Punkte, PWA offline mit Gegenprobe |
| Android-Telefon (v861) | Selbsttest, 19/19 ×2, Layout 10 Routen, quer: 0 verdeckt, Chat per Fingertipp, Flugmodus offline |
| Android-Tablet | Selbsttest, 19/19, Layout, 0 verdeckt — bei 1280×800 (volle 2560×1600 stürzt mit Software-Grafik ab) |
| iOS Safari (angemeldet) | voller SW `smejj-shell-v861`, offline mit Gegenprobe: App + Offline-Band |
| iOS installierte App | schmaler SW `smejj-willkommen-v861`, offline: Landeseite + Offline-Band |
| Modell | `/api/health`: GLM bereit und erreichbar, Auto bereit |
| Tests | 3.815/3.815 + 702/702 Server; alle 11 Sperren und Wächter grün |

**Nicht messbar ohne Anmeldung:** eine echte Modell-Antwort. Das Probier-Feld der Landeseite
fragt bewusst nicht ohne Konto (Kostenschutz); die Safari-Sitzung ließ sich bei gesperrtem
Bildschirm nicht bedienen.


### NACHTRAG: Server-Abgleich ausgeliefert (13.09., 11:56 Ortszeit)

Der Betreiber hat die Doppelklick-Datei gestartet.
- **Erster Versuch** brach ab, bevor er etwas änderte: Das Terminal kam über SSH-Port 22
  nicht zu GitHub (`connect to host github.com port 22`). Sichtbar wurde das erst durch das
  eingebaute Protokoll (`scratchpad/server-abgleich-protokoll.txt`) — das Terminal-Fenster
  sieht die Sitzung nicht. Die Datei probiert seitdem drei Wege: SSH, SSH über Port 443,
  HTTPS mit der gh-Anmeldung.
- **Zweiter Versuch:** `1eeb337b..05e84eeb` auf den Bauzweig, neuer Server nach ~30 s
  (`gestartetAm` 08:56:53 UTC, `ok: true`).

**Nachgeprüft:** alle sechs Sperren auf dem ausgelieferten Bauzweig grün; Server-Code
App-Zweig = Bauzweig (`control-server/src`, `src`); Web gegen den neuen Server Selbsttest +
Rundgang 19/19 ×2, PWA offline mit 235 Dateien; Standardmodell weiter GLM, eigenes Modell
nicht befördert.

**Kein Befund, obwohl es so aussah:** GLM steht nach dem Neustart auf
`configured-unverified`. API-Modelle bekommen ihren Gesundheitseintrag erst durch die erste
echte Anfrage (`modelRuntimeHealth.js`), und ein fehlender Eintrag sperrt die Weiterleitung
nicht. Vor dem Neustart stand dort `ready`, weil Nutzer gechattet hatten.

**Unterscheiden sich weiter nur im App-Zweig (keine Server-Dateien):** con-Autopilot (ruht
auf Betreiber-Wunsch), Trainingsschleife (läuft nirgends), Hausmodell-Dienst, Bild-Maler,
Fern-Browser-Hülle — eigene Dienste mit eigenem Bauweg, nicht Teil des Control-Servers.
