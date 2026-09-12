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

## Zwei Fallen beim Tippen und Tappen (12.09.2026, beide selbst hineingetappt)

**Koordinaten nach dem Tippen NEU messen.** Sobald Text im Feld steht, springt der
Composer: der Sendeknopf lag vorher bei y=789, danach bei **y=517**. Ein `tap` auf die
alte Stelle trifft ins Leere und sieht aus, als reagiere der Knopf nicht. Ablauf also
immer: Feld messen → `tap` → `type` → **Knopf erneut messen** → `tap`.

**Am Dokument lauschen, nicht am Element.** Der Sendeknopf wird beim Umschalten von
Mikrofon auf Senden neu gezeichnet — ein `addEventListener` am alten Knoten meldet dann
„kein Ereignis", obwohl der Tap ankam. Mit einem Lauscher am `document` (capture) kamen
alle vier Ereignisse: pointerdown, touchstart, touchend, click auf `#startSend`.

**Und vorher: den Service Worker auf den Live-Stand bringen.** Ein Emulator, der seit
Tagen nicht offen war, liefert die App von vorgestern (hier: v851 bzw. v823 vom 08.09.
gegen live v854). `registration.update()`, kurz warten, `waiting.postMessage({type:"SKIP_WAITING"})`,
neu laden — erst dann misst man die aktuelle App.
