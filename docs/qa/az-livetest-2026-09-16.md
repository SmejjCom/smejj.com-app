# A-bis-Z-Livetest 16.09.2026 — Web, PWA, Android, Admin, Chat

**Auftrag des Betreibers (schriftlich, 16.09.):** „Ich gebe dir alle Rechte von A bis Z 100 % … öffne smejj.com im Browser und teste die gesamte App, Web, PWA, iOS mit Simulator, Android mit Emulator, von A bis Z. Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live weiter … Danach alles 100 % schützen."

## Ergebnis

| Bereich | Werkzeug | Ergebnis |
|---|---|---|
| Web, Schreibtisch | `rundgang.mjs --runden 2` | 19/19 Ansichten sauber |
| 8 Bildschirmbreiten 320–1920 px | `messe_responsive.mjs --url https://smejj.com/` | 152 Messpunkte, kein Überlauf |
| Tippziele | `measure_touch_targets_app.mjs` | alle ≥ 44 px (2 begründete Ausnahmen, bekannt) |
| **PWA offline** | `pwa-offline.mjs` | **FEHLER gefunden, behoben, live nachgemessen** (s. u.) |
| Android, installierte App (TWA, standalone 412×839) | `rundgang.mjs --fern` + `emulator/sweep.mjs` | 19/19 Ansichten, 2 Runden; 20 App-Routen ohne Überlauf, ohne kleine Ziele, ohne Konsolenfehler |
| Android-Update alt → neu | Emulator hatte SW **v883** vom 15.09. | Update auf v889 lief paketweise voll (108 → 150 → 204 → 237 Dateien in ~40 s) |
| Echter Chat | `POST /api/agent` live | „17 mal 23" → **391** (7 s), „Hauptstadt Kanada" → **Ottawa** (2 s) |
| Adminbereich | alle 26 Admin-Schnittstellen live | 26/26 HTTP 200, `/admin/` 200 |
| Funktionen | `funktionen-live.mjs` | 8/8 antworten |
| Auslieferung | `check-buendel-gegen-live`, `check-schutz-echtheit` | 1272/1272 Regeln, 48 Dateien identisch mit live |
| Automatiken | Live-Ampel | **85/85 grün** (09:35 UTC) |
| Sperren | 13 Sperr- und Nummern-Prüfer | alle grün |
| **iOS-Simulator** | — | **nicht testbar**, s. „Offen" |

## Fehler 1: Offline-Speicher der App blieb leer (behoben, SW v889)

`pwa-offline.mjs` zweimal reproduziert: `smejj-shell-v888` hatte **0 von 237** Dateien, die installierte App zeigte offline die Werbeseite statt des Chats.

**Ursache:** Freigabe 1g (15.09.) gab jeder Precache-Anfrage `AbortSignal.timeout(30 s)` mit. `addAll` bekam alle 237 Anfragen auf einmal — die Uhr startet beim **Erzeugen**, nicht beim Abschicken. Der Browser holt etwa sechs gleichzeitig; der Rest lief in der Warteschlange ab. Gemessen: alle 237 Dateien (2,2 MB) mit sechs parallelen Abrufen **41 s**, eine Datei hing allein 25 s. Alle 237 Adressen liefern 200, keine doppelt.

**Heilung:** `fuelleSpeicher()` füllt in Paketen zu sechs; Anfragen und Uhren entstehen erst unmittelbar vor ihrem Paket. Alles-oder-nichts bleibt (scheitert ein Paket, wird der halbe Speicher gelöscht, der alte Worker bleibt).

**Live nachgemessen:** `smejj-shell-v889` **237/237**, offline öffnet die App (Eingabefeld da, 17 Spur-Knöpfe).

Commits: Arbeitszweig `0ea45f6e`, Frontend `553a5fe8`, Bauzweig (Rückfallweg) s. Fehler 2.

## Fehler 2: Zwei Auslieferungswege mit verschiedenem Stand (behoben)

Probe-Nutzer Nr. 29 wurde nach dem Frontend-Deploy rot: `smejj.com` trug v889, `api.smejj.com` (Rückfallweg des Control-Servers) noch v888. Service Worker auch in den Bauzweig gebracht — vorher geprüft, dass `sw.js` und beide Tests dort byte-gleich mit v888 waren. Nach dem Neubau: beide Wege v889, Nr. 29 grün, Ampel 85/85.

## Messfallen dieses Laufs

- `sweep.mjs` mit geratenen Pfaden `/models` und `/trash` meldete 404 — die echten Routen heißen `/ai` und `/papierkorb` (Liste: `APP_ROUTEN` in `sw.js`). Kein App-Fehler.
- `messe_responsive.mjs` misst ohne `--url` gegen `127.0.0.1:3000` und bricht ab, wenn dort nichts läuft.
- Der Emulator braucht die Startwerte aus `scripts/diagnose/emulator/README.md` (`-memory 3072 -gpu swiftshader_indirect -no-metrics`), sonst stirbt er im Rundgang.

## Offen — nur der Betreiber kann es lösen

**iOS-Simulator:** Auf dem Mac ist die Xcode-Lizenz nicht bestätigt (`xcrun simctl` bricht ab), und in `/Applications/Xcode.app/Contents/Developer/Applications/` liegt kein `Simulator.app`. Beides braucht das Betreiber-Passwort:

```
sudo xcodebuild -license accept
```

danach in Xcode → Settings → Components die iOS-Plattform laden. Dann kann derselbe Rundgang auf dem iPhone-Simulator laufen.
