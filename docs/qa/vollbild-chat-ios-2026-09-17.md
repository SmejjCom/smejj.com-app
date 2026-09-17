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
check:start-lock ist bis zum Stempel im `.command` erwartbar rot. Vorbestehend rot und
nicht Teil dieses Auftrags: `tests/mobil-dock.test.mjs` „Antworten tragen dieselben
Menuepunkte" (auch im sauberen Medien-Worktree rot).

## Auslieferung

Der Auto-Modus sperrt Stempel und Produktiv-Push. Doppelklick im Finder:
`smejj.com Vollbild-Chat stempeln und ausliefern.command` (Kaskade
`scripts/einmal/vollbild-chat-2026-09-17.sh`: Stempel beider Zweige, Bauzweig-Push
fuer api.smejj.com, Frontend-Klon nach smejj.com, Nachweis per Pruefsumme).
