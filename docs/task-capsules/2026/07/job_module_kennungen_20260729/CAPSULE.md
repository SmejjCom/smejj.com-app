# Task Capsule — job_module_kennungen_20260729

Datum: 2026-07-29
Auftrag: "Weiter" (Wof Kadavanich) — Fortsetzung des angekündigten nächsten
Schritts aus `job_chat_code_copy_20260729`: Seitengewicht der Startseite prüfen.
Status: abgeschlossen, live verifiziert (smejj.com, sw v193)

## Auftrag war Gewicht — gefunden wurden zwei Ladefehler

Der Anlass war das Seitengewicht (288 von 300 KB, Puffer nur noch 12 KB). Beim
Aufschlüsseln der Ressourcen des Erstbesuchs fiel etwas anderes auf: eine Datei
wurde **zweimal** geladen.

```
/assets/voice-speech-queue.js?v=1                 4,3 KB
/assets/voice-speech-queue.js?v=blitz-20260726    4,3 KB
```

`chat-actions.js` importierte `?v=1`, `composer-tools.js` und
`voice-landing.js` `?v=blitz-20260726`. In ES-Modulen ist das nicht nur doppelte
Übertragung, sondern **zwei getrennte Modulinstanzen mit eigenem Zustand**.

**Kaputt war nichts** — und das ist der interessante Teil. `chat-actions.js`
benutzt aus dem Modul nur `sanitizeForSpeech`, eine reine Funktion ohne Zustand.
Hätte dort jemand `createSpeechQueue` aus derselben Datei geholt, gäbe es zwei
Vorlese-Warteschlangen nebeneinander. Der Fehler lag also scharf, ohne zu
zünden.

## Der zweite Fund, derselbe Fehler an anderer Stelle

Der projektweite Scan fand einen weiteren Fall — und zwar in HTML, nicht in
einem Modul:

| Seite | Kennung für `voice-landing.js` |
| --- | --- |
| `public/de/index.html` | `?v=voice-send-20260721` |
| die 14 anderen Sprachseiten | `?v=blitz-20260726` |

`voice-landing.js` hat sich seit dem 21.07. **sechsmal** geändert. Ausgerechnet
die deutsche Sprachseite — die wichtigste — lief damit auf einem Stand von
davor, weil der Browser unter der alten Kennung seine alte Kopie behält.

Live nachgewiesen vor dem Fix:

```
curl -s https://smejj.com/de/ → voice-landing.js?v=voice-send-20260721
curl -s https://smejj.com/en/ → voice-landing.js?v=blitz-20260726
```

## Dritter Fall derselben Ursache — deshalb ein Wächter

Die `sw.js`-Historie führt zwei frühere Fälle:

- **v184:** `settings-surface.js` importierte `settings-runtime.js` unter zwei
  Adressen (mit und ohne `?v=3`).
- **v185:** dieselbe Ursache eine Ebene höher — `premium-surfaces.js` zog über
  `settings-surface.js?v=3` die ganze alte Kette mit.

Beide wurden erst im Live-Test gefunden, jeweils nachdem ein Fix "im Browser
nicht ankam". Ein dritter Fall rechtfertigt einen Prüfer statt einer weiteren
Handkontrolle.

`scripts/check-module-queries.mjs` prüft projektweit: **ein Modul, eine
Kennung.** Zwei Eigenschaften sind nicht optional, sondern aus den drei Fällen
abgeleitet:

1. **Er liest auch `<script src>`-Tags in HTML.** Der zweite Fund steckte in
   einer HTML-Datei; ein reiner Import-Prüfer hätte ihn verfehlt. Genau diese
   Lücke hatte `check:precache-imports` (siehe sw v186).
2. **Verschiedene Schreibweisen zählen als dasselbe Modul.** `./x.js`,
   `/assets/x.js` und `../x.js` sehen verschieden aus und meinen dieselbe
   Datei — daran ist die Handprüfung zuvor gescheitert.

Laufzeit-Ausdrücke (`./${next}.js?v=3` in `i18n/ui.js`) sind statisch nicht
auflösbar und bleiben bewusst außen vor.

Stand nach dem Fix: **82 Module, jedes unter genau einer Kennung.**

## Der eigentliche Auftrag: Gewicht — was NICHT geht und warum

Der größte theoretische Hebel wären die drei Ansichts-Module, die beim Start
geladen werden, obwohl keine der Ansichten sichtbar ist:

| Modul | Größe | Verzögerbar? |
| --- | --- | --- |
| `account-privacy.js` | 9,3 KB | **Nein** |
| `autonomous-coding.js` | 7,3 KB | **Nein** |
| `settings-surface.js` | 5,6 KB | **Nein** |

Alle drei wurden geprüft und **bewusst nicht umgebaut**:

- **`settings-surface.js`:** `bindSettings()` in app.js setzt beim Boot
  `$("#settingsLanguage").value`. Dieses Element rendert erst
  `initSettingsSurface()`. Verzögert man das Modul, wirft `bindSettings()` auf
  `null` und **boot() bricht mitten drin ab**. Genau davor warnt der Kommentar
  in `app.js` bereits seit dem 2026-07-28.
- **`account-privacy.js`:** dieselbe Abhängigkeit über `bindProfile()` —
  `#registerLocal`, `#loginLocal`, `#logoutLocal`, `#saveProfile`,
  `#profileOutput`.
- **`autonomous-coding.js`:** hat als einziges *keine* Boot-Abhängigkeit zu
  app.js (0 Treffer), registriert aber beim Init drei globale
  Fenster-Ereignisse: `smejj:autonomous-request` (die Chat→Coding-Weiterleitung
  aus `autonomous-intent.js`), `smejj:job-selected` und `message`
  (Session-Handoff, derselbe Weg wie beim Magic-Link). Ein Lazy-Load würde diese
  Ereignisse verpassen, solange das Modul noch lädt — bei einer Funktion, die
  schon einmal kaputt war.

Ein Umbau wäre machbar (Ereignisse puffern und nachspielen), erzeugt aber genau
die Sorte stiller Fehler, die man erst live bemerkt — für ~22 KB an einem
Budget, das mit 288/300 KB eingehalten ist. Entscheidung: nicht jetzt. Wenn das
Budget wirklich kippt, ist der saubere Weg zuerst `app.js` von den beiden
Boot-Zugriffen zu befreien, nicht das Lazy-Loading darüberzustülpen.

## Betroffene Dateien

| Datei | Änderung |
| --- | --- |
| `public/chat-actions.js` | Import-Kennung auf `?v=blitz-20260726` |
| `public/de/index.html` | Skript-Kennung auf `?v=blitz-20260726` |
| `public/sw.js` | v187 → v188 (chat-actions.js liegt cache-first im Precache) |
| `scripts/check-module-queries.mjs` | NEU — der Wächter |
| `tests/module-queries.test.mjs` | NEU — 7 Tests |
| `package.json` | `check:module-queries` in `check:all` und `check:frontend` |

## Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check:all` | grün (nach Freigabe auch `check:start-lock`) |
| `npm run check:module-queries` | OK — 82 Module, jedes eine Kennung |
| `npm run check:frontend` | 277 Tests, 0 Fehler |
| Browsertest lokal | `voice-speech-queue.js` genau **einmal** geladen, keine Konsolenfehler |
| Funktionsprobe | Aktionsleiste vollständig, Menü mit "Vorlesen", `sanitizeForSpeech("Test **fett** und \`code\`")` → `"Test fett und code"` |

Die Funktionsprobe ist der eigentliche Beleg: hätte der geänderte Import nicht
aufgelöst, wäre `chat-actions.js` komplett abgebrochen und es gäbe gar keine
Aktionsleiste.

## Deploy

Live stand auf v192 (dem eigenen Deploy davor, niemand hatte dazwischen
gepusht). `chat-actions.js` und `de/index.html` waren live byte-identisch zum
lokalen Stand vor der Änderung und konnten direkt übernommen werden; `sw.js`
wurde erneut chirurgisch auf der Live-Fassung geändert (v192 → v193).

Rollback-Punkt Frontend-Repo: `4697269`. Deploy-Commit: `7136de5`.
Rollback-Punkt App-Repo: `5af5738`. Commit: `5531619`.

Start-Lock mit dem Wortlaut der Freigabe vom 2026-07-29 ("Live stellen") neu
eingefroren, Backup `backups/start-design-lock/2026-07-29T22-10-29-604Z/`.

## Nächster Schritt

Das Seitengewicht bleibt der offene Punkt (288/300 KB). Der nächste sinnvolle
Schritt ist nicht Lazy-Loading, sondern `app.js` von den beiden Boot-Zugriffen
(`bindSettings`, `bindProfile`) auf fremd gerenderte Elemente zu lösen. Danach
wären `settings-surface.js` und `account-privacy.js` (~15 KB) gefahrlos
verzögerbar. app.js liegt allerdings bei 797 von 800 Zeilen und unter dem
Start-Lock — das ist ein eigener Auftrag, kein Nebenbei.
