# smejj.com — Übergabe Mobil-QA von A bis Z (Stand 08.09.2026, 15:10 — Runde 7, SW v818)

Auftrag des Betreibers: 100 % Responsive, Vollbild ohne schwarzen Balken, Chat/Code/Einstellungen wie ChatGPT, Eingabefeld bündig an der Tastatur, alles Deutsch, Touch-Ziele 44 px — in der INSTALLIERTEN App (iOS-Web-App, Android-TWA), nicht im Browser. Regel des Betreibers seit 08.09.: **„pusche selber“** — Commit, Push, Deploy und Stempel-Kaskade aus der Sitzung heraus erledigen, keine Auswahlkarten für Freigaben; kurze Statuszeile, kurze Antworten.

## A. Wo alles liegt

- Repo (Quelle): App-Ordner (Google Drive), Zweig `feature/responsive-qa-2026-09-07`. Bauzweig für Stempel: `feature/auth-redesign-github-magiclink`. **Der Bauzweig ist 50+ Dateien hinter smejj.com** — nie ganze Dateien vom Zweig nach live kopieren, immer Live als Basis (`~/smejj-app-frontend`, Zweig `main` = GitHub Pages = smejj.com).
- Live-Klon: `~/smejj-app-frontend` (Wurzel + `assets/` doppelt pflegen). Deploy = Datei nach Wurzel und `assets/` kopieren, committen, `git push origin HEAD:main`, 1–2 Minuten warten (`curl -s https://smejj.com/assets/<datei>?n=$RANDOM | shasum` gegen den Klon).
- Alle Mobil-Heilungen sind **Laufzeit-Module ohne Marke** (nie im Start-Buendel): `public/mobil-dock.js` (Dock, Menü, Chat-Glas, Vollbild-Rahmen, Tastatur-Bündigkeit), `public/mobil-ansichten.js` (Einstellungen, Konto, Verlauf …), `public/kompakt.js` (Touch-Ziele über 600 px, Mikrofon-Farbe), `public/deutsch-klartext.js` (Wörterbuch Anglizismen → Deutsch), `public/pwa-schnellstart.js` (Tastatur-Heilung). Haken: `chat-actions-menu.js` (`beiHandy`), Precache in `sw.js`.
- Gesperrte Dateien (Start-Lock: index.html, app.js, start-styles.css, sw.js, ai/chatClient.js …) nur über Kaskade + Stempel. Marken (`?v=`) ändern sich nur, wenn eine markierte Datei geändert wird — dann Kaskade mit `sed` in Bauzweig UND Klon (Vorbild `scripts/einmal/mobil-runde4-2026-09-07.sh`).
- **Service-Worker ist cache-first:** wiederkehrende App-Nutzer sehen ein geändertes Modul erst nach `CACHE_NAME`-Sprung. Kaskade dafür: `SMEJJ_APP_ORDNER="$PWD" zsh scripts/einmal/sw-sprung-2026-09-07.sh` (liest live+1, prüft Module per Hash, stempelt Start-Lock, pusht Bauzweig und Klon; `--probe` = Trockenlauf). **Läuft aus der Sitzung, bewiesen v810/v811.** Parallelsitzungen vergeben ebenfalls Versionen — nie hart kodieren.
- Messwerkzeuge: `scripts/diagnose/emulator/` (cdp.mjs, sweep.mjs, diag.mjs, README). Pixel 7 = `adb forward tcp:9222 localabstract:chrome_devtools_remote` (emulator-5554), Tablet 9223 (emulator-5556). Layout ohne Login: `localStorage smejj.auth.accessToken.v1 = "qa"`. iOS: Simulator iPhone 17 Pro `FE85F623-0287-4C9E-950D-D7F184C5038A` (`xcrun simctl openurl/io … screenshot`), Safari dort ist mit dem Betreiber-Konto angemeldet; installierte Web-App im Ordner „Webclips“ der App-Mediathek, nur mit Vollbild-Bildschirmsteuerung (computer-use, `request_full_control`) bedienbar: Window → iPhone-Fenster, I/O → Keyboard → „Connect Hardware Keyboard“ abwählen.
- Doku: Capsule `task-capsules/2026/09/job_mobil_vollbild_dock_20260907/capsule.json`, `Memory_Bank.md` (drei Entscheidungen 07.09.), Gedächtnis `smejj-offene-fehler-liste-20260907.md`.

## B. Was fertig ist (live, gestempelt bis SW v813)

1. Auto-Modellwahl ohne Sackgasse (frischer Ausweis, 409 → Server-Weg). 2. Tastatur-Heilung (Reflow nach focusout). 3. Schlankes Dock, Safe-Area nur einmal, Code-Leiste eine Zeile. 4. Touch-Ziele 44 px auf Handy, Handy quer, Tablet (pointer:coarse). 5. Mikrofon leuchtet in Logofarbe (#02fdfd) während des Diktats — vom Betreiber bestätigt. 6. Modell-Menü über die Glasbreite (nicht fixed: backdrop-filter macht das Glas zum Bezugsrahmen). 7. „Vorlesen“ im Drei-Punkte-Menü der eigenen Frage. 8. Einstellungen/Konto/Verlauf/Dateien als App-Ansicht (Reiter eine wischbare Zeile, Felder 44 px, Knöpfe untereinander). 9. Feld bündig an der Tastatur (`html.tastatur-offen`). 10. Anglizismen (Reasoning, Sync, Coding, Key, Free-safe, BYOK, Session, Diff, Limit) per Wörterbuch zur Laufzeit deutsch.

## C. Stand nach Runde 5 (08.09., SW v815) — was erledigt ist und was bleibt

**C1. Schwarzer Balken unten in der iOS-App — AN DER WURZEL BEHOBEN, im Simulator bewiesen.** Vier Layout-Anläufe blieben wirkungslos, weil sie am falschen Ende arbeiteten. Der Screenshot vom 11:07 zeigte es: dem Streifen fehlte **auch seitlich** der Lichtsaum — dort endete nicht der Rahmen, sondern die Fläche.

Selbst gemessen in der **installierten App im iPhone-Simulator**. Der Webclip-Host heißt `com.apple.webapp` und lässt sich mit `xcrun simctl launch <UDID> com.apple.webapp` starten — ohne Bildschirmsteuerung. Die Webclip-Datei (`data/Library/WebClips/<UUID>.webclip/Info.plist`) nimmt mit `plutil` jede URL und jeden Status-Bar-Modus an; damit ist die installierte App fern messbar.

| Modus in der Webclip-Datei | fixed inset:0 | 100dvh | safe-area unten | Ergebnis |
|---|---|---|---|---|
| LegacyBlackTranslucent (Meta `black-translucent`) | 812 | 812 | 34 | **62 pt Balken** |
| Default (Meta `default`) | 874 | 874 | 0 | kein Balken, helle Statusleiste |
| Black (Meta `black`) | 874 | 874 | 34 | kein Balken, dunkle Statusleiste |

Ursache: `black-translucent` lässt iOS den **Legacy**-Modus in die Webclip-Datei schreiben. Dort liegt die Fläche oben an, ist aber um die Statusleistenhöhe kürzer als der Bildschirm — die fehlenden 62 pt liegen **außerhalb des WebViews**, dorthin kann kein CSS malen.

Behoben: `content="black"` in index.html; `html{background:#141517}` auf der Landeseite (iOS färbt den Statusleistenbereich nach dem Hintergrund des **Wurzelelements**, nicht des body); in mobil-dock.js die Rahmen-Sonderregel und der gesamte Messcode entfernt, stattdessen ein Mindestabstand zum Home-Balken (`max(env(safe-area-inset-bottom,0px),18px)`, nie kleiner als der echte Wert).

**Der Betreiber muss die App EINMAL neu installieren** — iOS friert den Modus beim Installieren ein (im Simulator bewiesen: mit alter Webclip-Datei blieb der Balken, obwohl die Seite schon den neuen Wert lieferte). App-Symbol gedrückt halten → „App entfernen" → in Safari smejj.com öffnen → Teilen → „Zum Home-Bildschirm".

**C2. Einstellungen seitlich verschiebbar — ERLEDIGT.** Wurzel war nicht der sichtbar breite Inhalt: `.settings-content` ist ein Raster, dessen einzige Spalte auf `grid-template-columns: 403px` stand (bei 388 px Platz), weil ein Rasterfeld `min-width: auto` hat und bis zur min-content-Breite wächst; Treiber war ein `span.ac-sub` mit `white-space: nowrap`. Jetzt `minmax(0,1fr)` + `min-width: 0`, nowrap-Untertitel dürfen umbrechen, `#settings{overflow-x:hidden}`. Dazu: Cline-Knopfraster einspaltig und 44 px, Suchfeld der Reiterzeile war 26 px breit (jetzt 160–220 px). **Gemessen:** alle 12 Reiter `clientWidth = scrollWidth = 412`, kleine Ziele 0.

**C3. Chat-Tabellen zerhackt — ERLEDIGT.** Zellen: `overflow-wrap:normal; word-break:normal; white-space:nowrap; min-width:72px`; Tabelle `width:max-content; max-width:100%` und scrollt in sich. Lange Links außerhalb von Tabellen brechen weiter um. **Gemessen** (fünf Spalten): Zeilenhöhe 28 px statt zerhackter Mehrzeiler, Tabelle 318 sichtbar / 422 Inhalt, Seite 412 = 412.

**C4. Code-Bereich — ERLEDIGT.** (a) Gruß und Verlaufshalter bekommen das Polster unter dem Kopfglas (`safe-area-top + 60` bzw. `+ 56`); gemessen beginnt der Gruß bei 64 px, das Glas ist 52 px hoch. (b) Der Stufe-Chip kürzt jetzt mit Ellipse: `text-overflow` verpufft auf einem `inline-flex`-Kasten, darum `inline-block` mit `line-height:44px`; „Automatisch" steht vollständig (90×44), kein Chip abgeschnitten, Leiste 338 von 372 px.

**C5. Weiter ohne Rückmeldung des Betreibers:** Feld bündig an der Tastatur (Punkt 9) und Deutsch in den Ansichten (Punkt 10) sind seit dem 08.09. früh live — bitte am Gerät ansehen und Bescheid geben.

**C6. A-bis-Z-Rundgang — ERLEDIGT, dreimal 14 Routen sauber.** Pixel hochkant (412), Pixel quer (863) und Tablet (800): `ueberlauf=false`, `kleineZiele=0`. Dabei neu behoben (nur `pointer:coarse` über 600 px, die Maus bleibt unberührt): Kopfknöpfe der Ansichten 32×32 → 44×44 (brauchten `width`/`height` mit `!important`, `min-height` genügte dort **nicht**), `.toolbar` 40, `.account-nav` 40, Konto-Knöpfe 40, Plus-Menü 38, Formularfelder 40–43,5. Außerdem Kippschalter (46×26) und Rechtslinks (16 px hoch) in den Einstellungen auf 44 px. **Einziger Rest:** `#startMessage` misst 43,5 px — das Startfeld steht unter dem **Design-Lock**, eine Änderung braucht die schriftliche Freigabe des Betreibers.

**C7. Nebenbefunde, nicht angefasst:** `check:start-lock` rot durch die bekannte Divergenz zwischen QA-Zweig und Bauzweig (index.html, app.js, config.js, ai/chatClient.js, sw.js); Manifest-Syntaxfehler in der TWA nach SW-Reset auf tiefen Routen. — `check:guidelines` ist wieder **grün**: `Memory_Bank.md` war auf 857 Zeilen gewachsen, die Volltexte vom 02.–04.09. liegen jetzt verlustfrei in `docs/memory/Memory_Bank_2026-09-08_archiv_runde8.md` (644 Zeilen).

**Messwerkzeug geschärft** (`scripts/diagnose/emulator/sweep.mjs`): meldet Selektoren statt Beschriftungen, überspringt barrierefrei verborgene Elemente (`clip`/`clip-path`/`opacity:0`), und die Wartezeit ist über `SWEEP_WARTEN` einstellbar. **Wichtig:** mit 6 s meldete der Rundgang im Querformat 16–18 Scheinbefunde je Route (die Laufzeit-Module hingen noch nicht), mit 14 s waren es null. Immer `SWEEP_WARTEN=14000` setzen.

## D. Arbeitsweise je Fehler (Ship-Loop)

1. Regel in das passende Laufzeit-Modul (unmarkiert) schreiben, Test in `tests/*.test.mjs` ergänzen (`node --test tests/mobil-dock.test.mjs tests/mobil-ansichten.test.mjs tests/touch-ziele.test.mjs tests/deutsch-klartext.test.mjs`).
2. `npm run -s build:assets`, `node scripts/check-precache-imports.mjs`, `npm run -s check:module-queries`; Markenkette: nur eigene Module dürfen nicht gemeldet werden.
3. Commit + Push QA-Zweig; Datei in den Klon (Wurzel + assets/) kopieren, Commit, Push main; auf Pages warten (Hash-Vergleich).
4. Im Emulator per SW-Reset nachmessen (Werte, nicht Bilder), bei Bedarf Simulator-Screenshot.
5. `zsh scripts/einmal/sw-sprung-2026-09-07.sh` (Stempel + SW live+1). Live prüfen: `curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'`.
6. Capsule-Nachtrag, Gedächtnis-Fehlerliste, kurze Meldung mit Zahlen.

## E. Regeln, die heute gebissen haben

- Nur exakte, spezifische Selektoren (body + Mehrfachklasse); `!important` nur gegen Inline-Stile (Modell-Menü).
- `position:fixed` unter einem Vorfahren mit `backdrop-filter`/`transform` ist relativ zu diesem.
- `screen.height - innerHeight` ist in der Android-TWA die Systemleiste (76 px) — nur Apple messen.
- Design bleibt VIERECKIG (eckig.css), große Schrift, keine Ziele unter 44 px, keine neuen Anbieter, keine Kosten.
- Zwei Sitzungen deployen parallel in denselben Klon: vor jedem Push `git pull --rebase origin main`.

## F. Runde 7 (Betreiber-Screenshots 08.09. 14:24/14:29)

1. **Startseite kompakt und unten.** `.home-feed` stand auf `justify-content:center`, der Block endete bei 686 von 839 — 153 px blieben unten leer. Jetzt `flex-end`: Block endet bei 815, 24 px frei.
2. **Vollbild oben ODER kein Balken unten — nicht beides.** Im Simulator mit knallrotem Wurzelelement geprüft: der Bereich außerhalb der Fläche bleibt schwarz, er lässt sich nicht einfärben. Es bleibt bei `black` (volle Fläche, normale Statusleiste).
3. **Modell-Menü war nicht bedienbar.** `.prompt-glass` trägt `backdrop-filter` und ist damit ein eigener Stapel-Kontext — das Menü mit `z-index:60` steckt darin fest, `.start-chips` kommt im DOM später und gewinnt bei gleichem Stapelwert. Der Fingerdruck traf die Kachel. Jetzt Glas `z-index:70`, Menü opak und `z-index:80`, klappt immer nach oben. Alle fünf Zeilen 44 px und treffsicher.
4. **Antworten wie eigene Fragen.** Die Leiste war da, aber auf 52 % Deckkraft (heller nur beim Zeigen — am Handy gibt es kein Zeigen); jetzt 82 %. Das Drei-Punkte-Menü der Antwort trägt nun Kopieren und Vorlesen wie bei eigenen Fragen.

## G. Runde 8 (Betreiber 08.09. 16:13)

**Vollbild oben — wieder da.** Im Simulator gibt es genau zwei Zustände, keinen dritten:

| Meta-Wert | Fläche | oben | unten |
|---|---|---|---|
| `black-translucent` | top 0, hoch 812 | **Vollbild** | 62 pt Schwarz |
| `black` / `default` | hoch 874 | Statusleistenbalken | nichts |

Gewählt: `black-translucent`. Der Streifen unten wird **unsichtbar gemacht statt bekämpft** — der Grund läuft auf reines Schwarz aus (die Farbe dahinter), der Rahmen bekommt unten weder Strich noch Schein, das Dock schließt bündig ab. Sichtbar war die Kante nur durch den Cyan-Saum.

**Die drei Punkte unter Antworten sind antippbar.** Wurzel: `#startLog .msg-actions` trägt `pointer-events:none`, am Handy dazu `overflow-x:auto` — die Leiste war **0 px hoch**, ihre 44-px-Knöpfe ragten heraus und wurden vom Scroll-Container abgeschnitten. Ein Treffertest fand statt des Knopfes das Log. Dazu lag genau die letzte Leiste hinter dem Dock. Jetzt: alle fünf Knöpfe treffen.

**Kaskade blockiert:** `admin-lock` ist rot durch `control-server/src/admin/opsAutopilotenBereiche.js` — geändert von einer **Parallelsitzung** (Commit 639f8128 „Autopilot Nr. 85"). Fremde Arbeit wird nicht mit einem neuen Stempel abgesegnet; der Service-Worker wurde stattdessen direkt im Klon auf v819 gezogen.

