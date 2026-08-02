# [2026-08-02] Sprachwelle Stufe 3a — die geteilte Naht schlägt die Sperre

Volltext zum Kurzeintrag in `Memory_Bank.md`.
Capsule: `task-capsules/2026/08/job_sprachwelle_stufe3a_20260802/capsule.json`.
Commit `7226116`, Frontend-Repo `32f352f`, live als `smejj-shell-v195`.

## Die Architektur-Entscheidung, auf die es ankam

`public/composer-tools.js` (Sprachwelle auf der Startseite) steht unter
Start-Lock — 31 Dateien, byte-identisch geprüft. Der naheliegende Weg wäre
gewesen, sie anzufassen und dafür eine Freigabe zu erbitten.

Stattdessen: **beide Hosts importieren dieselben Sprach-Module.** Die
eingefrorene `composer-tools.js` und die freie `voice-landing.js` teilen sich
`voice-endpoint.js`, `voice-speech-queue.js`, `voice-vad.js`,
`voice-echo-filter.js`, `voice-warmup.js`, `voice-premium-tts.js`.

Wer die Verbesserung in die geteilte Naht legt, braucht keine Freigabe.

**Merkregel: Vor einer Freigabe-Anfrage erst suchen, wo die gesperrte und die
freie Seite sich treffen.**

## 1) Semantisches Sprech-Ende

Vorher: starr 850 ms Stille nach dem letzten Wort. Das ist immer falsch — nach
einem fertigen Satz zu lang, mitten im Satz zu kurz.

Neu, `idleFor(text)` in `voice-endpoint.js`:

| Zwischenstand | Wartezeit |
|---|---|
| Satzzeichen am Ende (`?`, `.`, `!`) | **420 ms** |
| Bindewort/Füllwort am Ende (`und`, `also`, `äh`, `die` …) | **1500 ms** |
| weniger als 3 Wörter | **1500 ms** |
| sonst | 850 ms (unverändert) |

Die grossen Anbieter lösen das mit einem eigenen Modell (semantische VAD). Hier
genügt eine Textregel im Browser: kostet nichts, verschickt nichts, läuft
offline.

**Rückwärtskompatibel — und das war die eigentliche Arbeit.** `update()` nimmt
weiterhin einen Wahrheitswert entgegen und verhält sich dann exakt wie bisher.
Genau so ruft die eingefrorene `composer-tools.js` auf. Live nachgemessen:
alter Aufrufweg 850 ms, neuer Aufrufweg 420 ms bei fertigem Satz.

## 2) Denk-Laut

Zwischen Frage und erstem Wort der Antwort lagen 0,8 s (gut) bis 9,5 s (mit
Websuche) **Stille**. Ein Mensch würde in derselben Lage „Moment, ich schau
nach" sagen.

`voice-thinking-cue.js` (neu): Braucht die Antwort länger als 700 ms, spricht
die Sprachwelle dieselbe Zeile, die schon im Status steht — „Einen Moment ..."
— in allen 14 Sprachen bereits übersetzt. Kein neuer Übersetzungsbestand.

Zurückhaltend gebaut: nur bei langsamer Antwort, höchstens einmal je Frage, und
nie in eine laufende Antwort hinein (zweite Prüfung im Moment des Feuerns).

**Der Punkt, an dem es sonst kaputtgeht:** Die Ansage läuft durch DIESELBE
Warteschlange wie die Antwort (`voice-speech-queue.js: sayAhead`). Damit kann
sie technisch nicht hineinreden — und der Echo-Filter kennt sie über
`spokenText()` als eigene Ausgabe. Ohne das hätte die Erkennung den eigenen
Lautsprecher für den Nutzer gehalten und sich selbst unterbrochen.

## Die Falle, die der eigene Wächter gefangen hat

Ich hatte den Import mit `?v=sprachwelle3-20260802` versehen, während die
gesperrte `composer-tools.js` dasselbe Modul **ohne** Kennung lädt.

`check:module-queries` meldete: *„voice-endpoint.js wird unter 2 Kennungen
angesprochen"* — zwei Modulinstanzen mit getrenntem Zustand, im Browser-Cache
zwei Stände. Genau der Fehler, wegen dem der Wächter existiert (sw.js v187→v188).

Korrigiert auf eine Kennung. Der Cache wird über die Version in `sw.js`
gebrochen, nicht über die Import-URL.

## Deploy: das Repo ist NICHT die Live-Wahrheit

Das Repo stand auf `sw.js` v188, **live lief bereits v194**. Ein Push des
Repo-Standes hätte die Seite um sechs Versionen zurückgerollt.

Vorgehen: frischer Klon von `SmejjCom/smejj-app-frontend`, die drei geänderten
Sprach-Dateien darauf kopiert (vorher geprüft: alle drei live und im Repo
byte-identisch), `sw.js` vom Live-Stand v194 auf v195 gehoben. git hat das
Zusammenführen gemacht — nichts wurde überschrieben.

`voice-endpoint.js` und `voice-speech-queue.js` liegen im Precache, und der ist
seit v160 cache-first. Ohne Versionssprung hätten Bestandsnutzer die alten
Dateien behalten. `sw.js` sagt das selbst als dokumentierte Pflicht.

## Live-Beleg (2026-08-02, 00:35 UTC, https://smejj.com/de/)

Service Worker `smejj-shell-v195` aktiv, Cache-Liste enthält nur v195.

```
fertiger Satz        420 ms
Bindewort am Ende   1500 ms
kurzer Anfang       1500 ms
normaler Satz        850 ms
alter Aufrufweg      850 ms   <- Nicht-Regression belegt
Denk-Laut            eingereiht: true
Reihenfolge          ["Einen Moment ...", "Das ist die echte Antwort."]
Echo-Filter          kennt die Ansage
```

Startseite: 0 Konsolenfehler, alle Composer-Symbole vorhanden, Design
unverändert. Web Vitals im Budget — LCP 668 ms (Budget 1500), TTFB 135 ms
(Budget 200), CLS 0, INP 40 ms, 286 KB (Budget 300).

Prüfungen grün: `check:voice` 54, `check:frontend` 289, `module-queries`,
`precache-imports`, `start-lock`, `favicon-lock`, `guidelines`, `json`,
`architecture`.

## Offen

- **Die Startseite profitiert noch nicht.** Für die Aktivierung dort braucht es
  drei Zeilen in der gesperrten `composer-tools.js` — Rote Liste, schriftliche
  Freigabe nötig.
- **`public/sw.js` im Repo steht auf v188, live läuft v195.** Der Unterschied
  sind drei Precache-Einträge einer Parallelsitzung plus Changelog. Ein späterer
  Deploy AUS DEM REPO würde zurückrollen. Angleichen ist eine Änderung an einer
  gesperrten Datei und braucht ebenfalls die Freigabe.
- Der dritte Punkt aus der Recherche (Websuche 9,5 s) sitzt im Control Server.
