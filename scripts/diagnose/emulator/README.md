# Emulator-Messwerkzeuge (Chrome DevTools ueber adb), Stand 08.09.2026

Voraussetzung: Android-Emulator laeuft (`~/Library/Android/sdk/emulator/emulator -avd smejj_pixel`),
die smejj.com-App (TWA) ist offen, Bruecke: `adb -s emulator-5554 forward tcp:9222 localabstract:chrome_devtools_remote`
(Tablet `smejj_tablet` = emulator-5556 auf 9223).

- `node cdp.mjs 9222 eval "<js>"` — JavaScript in der App auswerten (Rechtecke, Klassen, Storage)
- `node cdp.mjs 9222 nav <url> [ms]` — Seite laden; `shot <png>` — Screenshot; `mclick x y` — Maus-Klick; `tap x y` — Touch
- `node sweep.mjs 9222 <praefix> / /settings /profile …` — je Route: Ueberlauf, Ziele unter 44 px, Konsolenfehler, Screenshot
- `node diag.mjs 9222 /settings <ganzseite.png>` — Elemente breiter als der Schirm, innere Scroller, Raster, Ganzseiten-Bild

Layout ohne Anmeldung messen: `localStorage.setItem('smejj.auth.accessToken.v1','qa')` +
`smejj.session.v1 = {"authenticated":true}` — das fruehe Tor prueft nur das Vorhandensein.
Deutsche Oberflaeche erzwingen: `smejj.settings.v1.language = "de"`, `smejj.i18n.cache.v1` loeschen.
Service-Worker frisch: `getRegistrations()→unregister`, `caches.keys()→delete`, dann neu laden.
