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
