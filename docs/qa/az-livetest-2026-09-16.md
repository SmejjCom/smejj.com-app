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
| **iOS: iPhone 17 Pro (402×714)** | Test-Kopie des Live-Stands + Messskript im WebKit | 80/80 Module laden, **18/18 Ansichten** ohne Überlauf, ohne Skriptfehler |
| **iOS: iPad Pro 11" (834×1078)** | dasselbe | 80/80 Module, **18/18 Ansichten** sauber |

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

## iOS (nachgeholt, nachdem der Betreiber die Xcode-Lizenz bestätigt hatte)

Safari auf iOS lässt sich von außen nicht fernsteuern (kein DevTools-Protokoll, safaridriver startet nicht). Gemessen wurde deshalb **im WebKit des Simulators selbst**:

1. **Test-Kopie aus dem Live-Stand** (`~/smejj-app-frontend`, nicht aus `public/` — dort fehlen gebündelte Module wie `assets/shared/http-json.js`; das erste Ergebnis „16 von 63 Modulen scheitern" war genau dieser Fehler der Test-Kopie, kein App-Fehler).
2. **Server wie GitHub Pages:** Ordner ohne Schrägstrich → 301, Fehlendes → 404 **mit** dem Inhalt von `404.html`. Damit läuft auch der echte Rückfallweg der App-Adressen mit (`/storage` und `/ai` sind auf Pages Ordner → 301 → 404.html → Rückkehr zur Ansicht).
3. Drei Skripte nur in der Test-Kopie: vorgetäuschte Sitzung (wie measure_web_vitals.mjs), Messung nach 7 s (Überlauf, Elemente über den Rand, Tippziele < 44 px, Skriptfehler), Modulprobe (jeden Import einzeln). Ergebnisse gehen per POST an den Test-Server.

| Gerät | Module | Ansichten | Befunde |
|---|---|---|---|
| iPhone 17 Pro, iOS 26.5 | 80/80 | 18/18 | keine (einzige Meldung `#profilePictureInput` = bekannte Ausnahme: verborgenes Datei-Feld, bedient wird der Knopf daneben) |
| iPad Pro 11", iOS 26.5 | 80/80 | 18/18 | keine (dieselbe Ausnahme) |

Die zugeklappte Seitenleiste (`aside.sidebar` −218…−18) und das geschlossene Browser-Fenster (`#browserPanel` rechts außen) liegen absichtlich außerhalb — `ueberlauf=false` bestätigt, dass die Seite nicht seitlich scrollt.

**Nebenbefund:** Seit der Lizenzbestätigung braucht `git` auf dem Mac keinen `DEVELOPER_DIR`-Umweg mehr.
