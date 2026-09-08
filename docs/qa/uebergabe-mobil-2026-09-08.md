# smejj.com — Übergabe Mobil-QA von A bis Z (Stand 08.09.2026, 09:10)

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

## C. Was NOCH offen ist — die Fehler der Screenshots vom 08.09. 08:48–08:55

**C1. Schwarzer Balken unten (~52 pt) in der iOS-App — der harte Fall.** Ursache: iOS legt die Layout-Fläche oben an und rechnet sie um die Statusleiste zu kurz; alles mit `position:fixed; bottom:0` (Rahmen `body::after`) endet darüber. Drei Anläufe: innerHeight-Messung (kam nach der Tastatur zurück), visualViewport (meldet zeitweise auch 800 statt 852), jetzt **Bildschirmhöhe** (`screen.height`, hochkant lange Seite, quer kurze Seite) als feste Rahmenhöhe `--vv-unten` — live in mobil-dock.js, SW v813 (08.09. 09:15). **Nicht bewiesen** (nur am Betreiber-iPhone möglich). Wenn der Balken bleibt: Rahmen und Grund bedingungslos 120 px über die Unterkante hinaus (`body::after{bottom:-120px}`, wie `body::before` seit 05.09.), den unteren Rahmenstrich opfern. dvh-Flächen (Dock) NIE mit dem Fehlbetrag verlängern — dann rutscht das Dock unter den Schirm (22:32 passiert).

**C2. Einstellungen lassen sich seitlich verschieben (Screenshot 08:48, API-Reiter).** Gemessen: `#settings` hat `overflow: auto` (beide Achsen), `.settings-content` ist 403 px breit bei 388 px Platz (Cline-Auswahl „cline-pass/qwen3.8-max — Qwen's …“, Knopfraster zwei Spalten). Fix in `mobil-ansichten.js`: `body #settings.view, body #profile.view {overflow-x:hidden}`; `#settings select, input {max-width:100%; min-width:0}`; das Knopfraster im Cline-Panel (provider-settings.js) einspaltig; `.settings-content, .settings-panel {min-width:0; max-width:100%}`. Danach `diag.mjs 9222 /settings` (mit API-Reiter) muss `breit: []` und `#settings clientWidth ≥ scrollWidth` zeigen.

**C3. Chat-Tabellen zerhackt (Screenshot 08:54).** Fünf Spalten werden auf Schirmbreite gequetscht, `overflow-wrap:anywhere` aus der Eintragsregel bricht Wörter buchstabenweise („Ze/it“, „M/or/ge/n“). Fix in `mobil-dock.js`: `body #startLog .entry table td, th {overflow-wrap:normal; word-break:normal; white-space:nowrap; min-width:72px}` und `table {display:block; width:max-content; max-width:100%; overflow-x:auto}` — Tabelle scrollt in sich, Wörter bleiben ganz. Lange URLs weiterhin `overflow-wrap:anywhere` (nur außerhalb von Tabellen).

**C4. Code-Bereich (Screenshot 08:55).** (a) Der Gruß „Was steht als Nächstes an, Alan?“ liegt unter dem Kopfglas (`.mobil-kopfglas`, im Code-Zustand aktiv): `#code .codegruss {padding-top: calc(env(safe-area-inset-top) + 56px)}` oder Kopfglas im Code-Bereich nur, wenn `#codeLogHalter` Kinder hat. (b) Stufe-Chip „Automatisch“ ist beidseitig abgeschnitten („\utomatiscl“): `.codeleiste .repochip` ist `display:flex` → Ellipse greift nicht; Fix `display:inline-block; line-height:44px; text-align:center; max-width:110px; text-overflow:ellipsis`.

**C5. Noch ohne Rückmeldung des Betreibers:** Feld bündig an der Tastatur (Punkt 9), Deutsch in den Ansichten (Punkt 10).

**C6. A-bis-Z-Rundgang wiederholen** nach jedem Deploy: `node scripts/diagnose/emulator/sweep.mjs 9222 <praefix> / /chat-history /files /projects /settings /profile /search /storage /systemzustand /cost /memory /browser /automation /code` (Pixel hoch), dazu quer (`adb shell settings put system user_rotation 1`) und Tablet (9223). Erwartung: `ueberlauf=false`, `kleineZiele=0` (außer 44-px-Rundung), keine Konsolenfehler außer 401 (nicht angemeldet). Zusätzlich Simulator-Safari (angemeldet) für echte Ansichten, iPad Pro `0D264D46-DF6C-4526-A268-39D88A8C65A0`.

**C7. Nebenbefunde, nicht angefasst:** `check:guidelines` rot durch `docs/benchmarks/modeleval-smejj-chat-core-smejj-1-4-…-messung.json` (Naming) einer Parallelsitzung; Bauzweig trägt 8 fremde Markenketten-Verstöße (Vorbestand); `security-lock` rot durch `public/chat-bridge.js` (fremd); Manifest-Syntaxfehler in der TWA nach SW-Reset auf tiefen Routen.

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
