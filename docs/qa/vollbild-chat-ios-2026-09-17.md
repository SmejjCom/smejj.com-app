# Vollbild-Chat am Handy (iPhone-PWA) — Bau und Messung, 17.09.2026

Betreiber-Auftrag (schriftlich im Chat, mit drei iPhone-Screenshots): den mobilen
Chat-Bereich, besonders die aus Chrome installierte PWA auf dem iPhone, wie bei
ChatGPT als echtes Edge-to-Edge-Vollbild optimieren. Fuenf Punkte: (1) Vollbild und
transparente Statusleiste, (2) Logo und Browser-Icon hoeher, (3) schwebendes
Schreibfeld, (4) Diktier-Mikrofon Start/Stop beliebig oft, (5) Lesbarkeit.
Auflage: nicht nur optisch simulieren, sondern auf der echten iOS-PWA testen.

## Was gebaut wurde (SW v896 → v897)

| Datei | Aenderung |
|---|---|
| `public/design-v14-vollbild-chat.css` (neu) | Letzte Schicht im Buendel `start-styles.css`. Huelle im Start ohne Safe-Area-Polster, Verlauf 100dvh hoch mit der Statusleiste als innerem Polster (scrollt darunter), Feld absolut ueber dem Verlauf (8 px Rand, 14 px Knick), Icons 24 px hoeher, Glasstreifen hinter der Statusleiste nur in der installierten App, Verlauf 19 px / 1,5. |
| `public/vollbild-chat.js` (neu) | Misst das schwebende Feld (ResizeObserver) und legt `--feld-hoehe` an `#start`; der Verlauf traegt unten genau dieses Polster. Zieht den Scroll im naechsten Frame nach. |
| `public/mobil-dock.js` | laedt `vollbild-chat.js` per `import()` nach (nur bis 600 px). |
| `public/composer-dictation.js` | Umbau des Diktats (siehe unten), `tests/composer-dictation.test.mjs` mit 11 Faellen. |
| `public/index.html`, `public/sw.js` | Stil-Marke `v14a-20260917`, Cache `smejj-shell-v897`, Precache-Eintrag. |
| `scripts/build/bundle-start-styles.mjs` | neue Datei am Kaskaden-Ende. |

Bewusst abgeloest: die V12-Regel vom 14.09. „Knoepfe an der Unterkante, Feld buendig" —
der Betreiber will jetzt das schwebende Feld wie bei ChatGPT. Die Eckig-Regel bleibt
(nur der dokumentierte 14-px-Knick aus V11, jetzt an allen vier Ecken).

## Diktat: drei Ursachen, im Test nachgestellt

1. Das `onend` der ALTEN Erkennung feuerte erst nach dem naechsten Start und startete
   die alte Instanz neu (`state.active` war wieder wahr). Zwei Erkennungen liefen, die
   zweite warf `InvalidStateError`, der `catch` rief `stop()` — und beendete damit die
   NEUE Sitzung. Genau das Muster „Start → Stop → Start: schreibt nicht mehr".
2. Nach einer Sprechpause wurde DIESELBE Instanz neu gestartet. WebKit liefert dann
   Ergebnisse mit `resultIndex 0` und der ganzen bisherigen Liste; der Zaehl-Ansatz
   (ab `resultIndex` anhaengen) verdoppelte oder verlor Woerter („teilweise").
3. Kein Handler pruefte, ob er noch zur laufenden Instanz gehoert.

Jetzt: jede (Neu-)Erkennung ist eine frische Instanz, jeder Handler prueft die Instanz,
das Feld wird bei jedem Ergebnis aus der VOLLSTAENDIGEN Ergebnisliste neu aufgebaut,
beim Ende einer Instanz werden ihre finalen Stuecke festgeschrieben. `stop()` statt
`abort()`, damit das letzte gesprochene Stueck noch ankommt; startet der Nutzer sofort
wieder, wird ein Nachzuegler hart gekappt (sonst ueberschriebe er das Feld). Stirbt die
Erkennung fuenfmal sofort, endet die Sitzung sauber und das Ohr (Server-Transkript)
liefert den Text.

Grenze: der iPhone-Simulator hat keine Spracherkennung und kein Mikrofon. Die Logik ist
mit einer Erkennungs-Attrappe geprueft (`node --test tests/composer-dictation.test.mjs`,
11/11 gruen), nicht mit echtem Ton auf einem iPhone.

## Messung: iPhone 17 Pro Simulator, iOS 26.5, als installierter Webclip

Test-Kopie wie GitHub Pages (Wurzel ueber `assets/` gelegt, `qa-seed.js` setzt die
Sitzung, `qa-vollbild.js` misst und meldet an `POST /__qa`), Webclip ueber Safari
„Teilen → Zum Home-Bildschirm" (Modus `LegacyBlackTranslucent`). 14 Nachrichten.

| Groesse | Wert | Soll |
|---|---|---|
| Fenster (standalone) | 402 × 874, `--sa-top` 62 px | ganze Flaeche |
| `main.shell` Polster oben/unten | 0 / 0 | 0 |
| `.home-feed`, `#startLog` | 0 … 874 | von Kante zu Kante |
| Verlauf Polster oben | 72 px (62 + 10) | erste Zeile unter der Statusleiste |
| `elementFromPoint` bei y = 10 nach dem Scrollen | `article.entry` | Text laeuft unter der Statusleiste durch |
| Glasstreifen (`.mobil-kopfglas`) | display block, 0 … 72, z 44 | Uhrzeit/Akku lesbar |
| Logo / Globus | y 38 … 82 (Symbol ≈ 48 … 72) | fast auf Statusleisten-Hoehe, ohne Uhrzeit/Akku zu decken |
| Feld leer | 8 … 394 × 780 … 834, `position:absolute`, bottom 40 px (34 + 6), Radius 14 | schwebend |
| Verlauf Polster unten | 108 px (54 + 34 + 20) | letzte Antwort sichtbar |
| letzte Aktionsleiste am Ende | 720 … 764 (Feld ab 780) | frei |
| Feld mit sechs Zeilen | Hoehe 226, Polster 280, letzte Leiste 548 … 592 (Feld ab 608) | frei |
| Feld wieder leer | scrollTop 2023 = Maximum | kein Loch |
| Tastatur offen (Feld angetippt) | innerHeight 471, `html.tastatur-offen`, Feld 411 … 465 = 6 px ueber der Tastatur | buendig |
| Schrift Verlauf | 19 px | gross |
| JS-Fehler auf dem Geraet | 0 | 0 |

Befund waehrend der Messung, behoben: als das Feld von sechs Zeilen auf eine schrumpfte,
liess WebKit `scrollTop` UEBER dem neuen Maximum stehen (2195 > 2023) — 188 px Leere
zwischen letzter Antwort und Feld. `vollbild-chat.js` holt den Scroll jetzt im naechsten
Frame zurueck (nachgemessen: 2023).

Screenshots (Scratchpad der Sitzung): `app-1.png` (Verlauf unter der Statusleiste,
Feld schwebt), `app-tastatur.png` (Feld an der Tastatur), `app-3.png` (Ende des
Verlaufs), `app-leer.png` (Feld mit sechs Zeilen).

## Wichtig fuer den Betreiber-iPhone

Der Statusleisten-Modus steht in der Webclip-Datei des iPhones und stammt vom
Installationszeitpunkt. Ein Webclip aus der Zeit mit Modus „black" (08.–13.09.) zeigt
eine SCHWARZE Statusleiste und beginnt erst darunter — egal was die Seite tut. Die
Betreiber-Screenshots (Linie bei ~56 pt, Layout ab der Statusleiste) sehen genau so aus.
Abhilfe: Symbol vom Home-Bildschirm loeschen, smejj.com in Safari oder Chrome oeffnen
und erneut „Zum Home-Bildschirm" hinzufuegen. Danach beim zweiten Start ist v897 aktiv.

## Wächter

check:frontend 695/695, check:voice gruen, check:markenkette, check:auslieferung-lock,
check:precache-imports, check:modul-syntax, check:guidelines, assets-sync gruen.
check:start-lock ist bis zum Stempel im `.command` erwartbar rot.
Vorbestehend rot war `tests/mobil-dock.test.mjs` „Antworten tragen dieselben Menuepunkte"
(auch im sauberen Medien-Worktree) — am 18.09. behoben, siehe Nachtrag Abschnitt 6.

## Auslieferung

Der Auto-Modus sperrt Stempel und Produktiv-Push. Doppelklick im Finder:
`smejj.com Vollbild-Chat stempeln und ausliefern.command` (Kaskade
`scripts/einmal/vollbild-chat-2026-09-17.sh`: Stempel beider Zweige, Bauzweig-Push
fuer api.smejj.com, Frontend-Klon nach smejj.com, Nachweis per Pruefsumme).

## Live-Test A–Z des Live-Stands v896 (17.09., vor der Auslieferung von v897)

Betreiber-Frage „Kannst du in live von A bis Z testen" — v897 war noch nicht ausgeliefert
(Stempel und Push sind im Auto-Modus gesperrt, siehe oben), darum wurde der LIVE-Stand v896
geprueft. Kein Fehler gefunden.

| Bereich | Ergebnis |
|---|---|
| HTTP-Proben | smejj.com 200 (0,9 s), willkommen.html 200, manifest 200, sw.js 200 (v896), start-styles.css 200, api.smejj.com 200, /api/health 200, /api/status 401 ohne Anmeldung (richtig), Unbekanntes 404 |
| `check:funktionen-live` | alle 8 Funktionen antworten (7 × 401 ohne Anmeldung, Compliance 200), keine abgeschaltet |
| Web (Browser-Pane, 375×812, ohne Anmeldung) | Landeseite EN, Preise, Probefeld; Anmeldeseite mit Google/Fingerabdruck/GitHub/E-Mail; 0 Konsolenfehler |
| iOS (Simulator iPhone 17 Pro, Safari, live) | Landeseite DE und Anmeldeseite sauber gerendert, Safe Area frei |
| Android (Emulator Pixel, Chrome 124, ANGEMELDET als Betreiber-Konto) | SW `smejj-shell-v896` aktiv; klar beschriftete Live-Frage „Was ist 2+2?" → Antwort „Vier" nach 4,8 s; Plus-Menue 14 Knoepfe (144..731 px, im Bild), Modell-Menue 6 Eintraege (410..727), Antwort-Menue 13 Punkte (241..775 von 783), letzte Leiste 720 < Feld 735, Schrift 18 px, keine Dialoge/Fehler |
| PWA | Manifest gueltig, Service Worker registriert, Cache v896 (Android) |

Nicht getestet: Diktat mit echtem Mikrofon (Emulator/Simulator ohne Spracherkennung), Huawei.
Waehrend des Tests haengte sich der Emulator-Chrome einmal nach einer Serie von 8 Aktionen in einem
Skript auf (DevTools-Antworten blieben aus) — nach Neuladen des Tabs lief alles; kein App-Fehler.

Naechster Schritt: Doppelklick auf `smejj.com Vollbild-Chat stempeln und ausliefern.command`,
danach derselbe Test auf v897 (PWA-Wechsel v896 → v897 beim zweiten Start).

---

# Nachtrag 18.09.2026 — ausgeliefert, und die WURZELURSACHE gefunden (SW v898)

## 1. Auslieferung v897

Nach dem Moduswechsel liefen Stempel und Auslieferung aus der Sitzung.
smejj.com ging auf v897, danach api.smejj.com.

**Fehler beim ersten Anlauf, gefunden und behoben:** api.smejj.com blieb stundenlang auf
v896, obwohl der Bauzweig angeblich gepusht war. Die Zeabur-Abfrage
(`deployments(serviceID, environmentID, perPage)`) zeigte: der laufende Bau trug den
richtigen Commit — aber `git show ae6e0cb7:public/sw.js` lieferte v896. Ursache: Beim
Übernehmen in den Bauzweig hatte der dritte Commit (Lock-Stempel) einen Konflikt
ausgelöst, und `git cherry-pick --abort` rollte die beiden bereits sauber übernommenen
CODE-Commits mit zurück. Der Bauzweig trug danach nur den Stempel, nicht den Code —
der Stempel war über die ALTEN Dateien gerechnet und deshalb grün. api.smejj.com lieferte
also völlig korrekt v896.

**Lehre:** `git cherry-pick --abort` setzt die GANZE Reihe zurück, nicht nur den
konfliktbehafteten Commit. Bei einer Reihe mit Lock-Manifest am Ende: Konflikt auflösen
(`git checkout --theirs <manifest>`, `--continue`) oder die Code-Commits einzeln
übernehmen und danach frisch stempeln. Nie abbrechen.

## 2. Die eigentliche Wurzelursache des schwarzen Balkens (v898)

Der Betreiber hatte seit Tagen einen schwarzen Balken über der installierten iPhone-App.
index.html trug längst `black-translucent`. Beim Live-Test fiel auf: ein FRISCH von
smejj.com installierter Webclip bekam trotzdem

    WebClipStatusBarStyle = UIWebClipStatusBarStyleLegacyBlack

**Warum:** Safari brennt beim „Zum Home-Bildschirm" die Angabe der GERADE ANGEZEIGTEN
Seite in die Webclip-Datei. Wer die App hinzufügt, ist fast immer abgemeldet — und das
frühe Tor in index.html schickt jeden ohne Konto sofort auf `willkommen.html`. Dort fehlte
die Angabe vollständig, also nahm iOS seinen Standard. index.html wird in diesem Moment
nie geladen; sein Wert kann gar nicht greifen.

**Fix:** `willkommen.html`, `auth/login/index.html` und `auth/register/index.html` tragen
jetzt dieselben vier App-Metaangaben wie index.html. Beide Seiten polstern
`env(safe-area-inset-*)` bereits (Landeseite Zeile 94/121, auth.css Zeile 62), der
`<html>`-Grund ist dunkel (#141517 bzw. `--auth-bg`) — die Uhrzeit bleibt lesbar.

**Nachgewiesen im iPhone-17-Pro-Simulator:** Webclip vor dem Fix `LegacyBlack`, nach dem
Fix `LegacyBlackTranslucent` **und** `FullScreen = true`. Die gestartete App zeigt die
Statusleiste durchsichtig über der Seite, kein Balken.

## 3. Live-Test A–Z auf v898

| Weg | Ergebnis |
|---|---|
| smejj.com und api.smejj.com | beide `smejj-shell-v898`, alle geprüften Dateien byte-gleich |
| Statusleisten-Angabe live | `black-translucent` auf /, /willkommen.html, /auth/login/, /auth/register/ |
| Vollbild-Dateien | design-v14 200 auf beiden, Diktat-Modul in der neuen Fassung |
| iOS Simulator, Safari | Landeseite und Anmeldeseite sauber |
| iOS Simulator, installierte App | Vollbild ohne schwarzen Balken, Statusleiste transparent |
| Android-Emulator, angemeldet | Chat „Wie viele Beine hat eine Spinne?" → „8" in 4,0 s; Diktat dreimal an/aus; Feld schwebt (`position:absolute`), Schrift 19 px |
| PWA-Update | zweiter Aufruf: nur noch Cache v898, v897 gelöscht |
| Browser-Pane | Bündel trägt V14, Diktat-Modul neu, keine Konsolenfehler |
| Wächter | check:frontend 695/695, start-lock, security-lock, auslieferung-lock, markenkette, guidelines, precache, assets-sync, schutz-echtheit alle grün |

## 4. Schutz

Anker in allen drei Repos: `schutz-100-2026-09-18-v898`, `-bauzweig`, `-frontend`.
Stände: Arbeitszweig 7fe8eda5, Bauzweig 95e91d43, Frontend f30765f.
Codeberg-Sicherung angestoßen.

## 5. Für den Betreiber

Das alte App-Symbol auf dem iPhone trägt den alten Balken weiterhin — der Wert ist beim
Installieren eingebrannt und ändert sich nie. Einmal löschen und smejj.com neu „Zum
Home-Bildschirm" hinzufügen; ab dann ist es Vollbild. Neue Nutzer bekommen es sofort richtig.

## 6. Nachtrag 18.09. — der letzte rote Test

Bei der Abschlussfrage des Betreibers („bist du 100 % sicher fertig?") fiel der letzte rote
Test auf: `tests/mobil-dock.test.mjs` „Antworten tragen dieselben Menuepunkte". Er war seit
dem 16.09. rot und stammt nicht aus dieser Arbeit.

**Ursache:** Der Test las den Quelltext von `chat-actions-menu.js` als Zeichenkette und suchte
`copy`/`speak`/`regen` in der Konstante `MENU_KOPF.assistant`. Am 16.09. wanderten Kopieren und
Vorlesen von dort in die `KACHELN` (die vier Kacheln oben im Menue, fuer beide Rollen). Die
Zusage hielt also die ganze Zeit — `menuItemsFor("assistant")` liefert
`copy, share, speak, pin, reply, quote, forward, translate, select-text, regen, copy-plain,
fork, remove` — nur der Test schaute an der alten Stelle.

**Fix:** Der Test ruft jetzt die echte Schnittstelle `menuItemsFor()` auf, wie es
`tests/chat-message-actions.test.mjs` schon tut. Damit haelt er die Zusage fest, egal wo die
Punkte im Code stehen. 22/22 gruen.

**Lehre:** Tests, die Quelltext als Zeichenkette absuchen, werden bei jeder Umstellung falsch
rot oder — schlimmer — falsch gruen. Wo es eine exportierte Funktion gibt, diese pruefen.

**Endstand 18.09.:** check:frontend 695/0, voice 20/0, platform 7/0, users 32/0, passkey 7/0,
abuse 7/0; alle elf Sperren und Waechter gruen (auch schutz-echtheit gegen die Live-Seite).
Arbeitszweig a66132b5, Bauzweig dffd9168, Frontend f30765f, Codeberg-Lauf 35286763896 gruen.

**Geraete gegen LIVE v898:** iPhone-17-Pro-Simulator, installierte App im Kaltstart — Vollbild
ohne Balken (Webclip `LegacyBlackTranslucent`, `FullScreen = true`). Android-Emulator,
angemeldet — „Hauptstadt von Japan" → „Tokio" in 4,0 s, Diktat viermal an/aus, Menue 13 Punkte
im Bild mit Kopieren und Vorlesen, null Konsolenfehler, nur Cache v898.

**Ehrlich nicht pruefbar:** Diktat mit echter Stimme (Simulator und Emulator haben keine echte
Tonaufnahme mit Spracherkennung; ersatzweise 11 Logiktests und viermal Umschalten) und der
angemeldete Chat INNERHALB der iOS-App auf live (keine Zugangsdaten; ersatzweise das
Chat-Layout mit derselben Fassung ueber die Test-Kopie und der angemeldete Live-Chat auf Android).

**Falle fuer spaeter:** Im temporaeren Bau-Worktree ohne `node_modules` faellt
`tests/branding-presentation.test.mjs` („byte-reproducible") mit
`ERR_MODULE_NOT_FOUND @resvg/resvg-js` — kein Codefehler, nur eine fehlende Abhaengigkeit dort.
