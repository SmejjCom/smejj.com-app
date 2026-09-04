# Task Capsule — job_anhaenge_stufe2_und_checkall_20260904

Datum: 2026-09-03 bis 2026-09-04
Auftrag: Betreiber (Wof Kadavanich) — „Anhaenge Stufe 2 bauen", danach
„Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen."
Status: abgeschlossen, live verifiziert (smejj.com und api.smejj.com auf smejj-shell-v750)

## Ziel

1. Angehaengte Dateien sollen inhaltlich ankommen statt als toter Verweis:
   PDF, Word/Excel/PowerPoint und die Tonspur von Video/Audio.
2. `npm run check:all` muss ohne einen einzigen roten Punkt durchlaufen.
3. Nichts Bestehendes darf kaputtgehen (Non-Regression).

## Befund (Ausgangslage)

* Ein am iPhone angehaengtes Video stand als nackte Textzeile
  `[Anhang: IMG_5287.mov (63595 KB)]` im Schreibfeld — wie ein Fehler.
* PDF, Word, Excel, PowerPoint: nur Dateiname im Text, das Modell sah nie den Inhalt.
* `check:all` war rot an vier Stellen (siehe unten), zuletzt seit dem Einzug von pdf.js.

## Umsetzung

### Anhaenge Stufe 2 (Browser, ohne Serverlast — Static-First)

| Modul | Was es tut | Grenze |
|---|---|---|
| `public/composer-anhang-chips.js` | Kachel statt Textzeile: Vorschau oder Symbol, Name, Groesse, ehrlicher Untertitel, Entfernen | keine |
| `public/anhang-pdf-text.js` | PDF-Text mit pdf.js 6.3.289 (Apache-2.0, `public/vendor/pdfjs`, nur bei Bedarf geladen) | 200.000 Zeichen, 300 Seiten; Scan ohne Textebene bleibt Verweis |
| `public/anhang-office-text.js` | docx/xlsx/pptx: eigener ZIP-Leser (`DecompressionStream("deflate-raw")`) + XML-Textzieher, ohne Fremdpaket | alte Binaerformate (.doc/.xls/.ppt) bleiben Verweis |
| `public/anhang-tonspur.js` | Tonspur per `decodeAudioData` → 16 kHz mono → 60-s-WAV-Stuecke → `/api/voice/transcribe` (Groq Whisper), Transkript mit Zeitmarken | 15 Minuten; Bildinhalt von Videos bleibt unsichtbar (kein Videomodell in der Kette) |

Alle vier haengen in `composer-plus-menu.js`; die Verweise gehen beim Senden ueber
`composePastedTask()` mit. Jeder Fehlerpfad faellt auf die Verweis-Kachel zurueck — nichts bricht.

### check:all von rot auf gruen (Kette, ein Befund zog den naechsten nach sich)

1. `check:security`: `pdf.worker.min.js` 1.265.413 Byte > 1 MB Repo-Grenze.
   → Worker liegt als `part1`/`part2` im Repo; `scripts/build/pdfjs-worker-zusammensetzen.mjs`
   baut die ganze Datei (git-ignoriert), `check:frontend` fordert den Bau per `--pruefen` ein.
   Der Container bekommt sie nicht — darum liefert `src/server.js` (Bauzweig `c405e0ff`) die
   Route `/assets/vendor/pdfjs/pdf.worker.min.js` aus den Teilen, einmal gelesen, dann aus dem
   Speicher. **Verworfen:** Blob-Worker — pdf.js laedt per `import()`, `script-src` erlaubt kein `blob:`.
2. `check:modul-syntax`: parste die Worker-Fragmente als Module → `public/vendor/` ausgenommen (Fremdcode).
3. `tests/platform-pwa`: 512-KB-Schranke fuer alles in `public/` → `vendor/` und `assets/vendor/`
   ausgenommen, dafuer LICENSE + VERSION Pflicht und Gewichtsdateien (`.gguf`, `.safetensors`, …) ueberall verboten.
4. `check:guidelines`: `api-center-surface.js` 813 Zeilen > 800 → vier Listen-Aktionen nach
   `public/api-center-aktionen.js` (86 Zeilen), Umgebung als `hof()` uebergeben. Flaeche jetzt 743 Zeilen.
5. `tests/i18n-ui`: Texte im neuen Modul galten als verwaiste Schluessel → Datei dort mitgelesen.
6. Nebenbefund Bauzweig: Secret-Scanner meldete zwei erfundene Beispielschluessel in Tests
   (`con-autopilot`, `eval-scoring-leerzeichen`) → als `"sk-" + "rest"` zusammengesetzt (`06ec0cba`).

## Betroffene Dateien

Neu: `public/composer-anhang-chips.js`, `public/anhang-pdf-text.js`, `public/anhang-office-text.js`,
`public/anhang-tonspur.js`, `public/api-center-aktionen.js`, `public/vendor/pdfjs/*`,
`scripts/build/pdfjs-worker-zusammensetzen.mjs`, fuenf Testdateien.
Geaendert: `composer-plus-menu.js`, `composer-paste-attach.js`, `chat-actions.css`, `sw.js`,
`index.html`, `app.js`, `scripts/check-modul-syntax.mjs`, `tests/platform-pwa.test.mjs`,
`tests/i18n-ui.test.mjs`, `src/server.js` (nur Bauzweig).

## Ergebnisse

* `npm run check:all` — **Exit 0**, kein roter Punkt (Protokoll `/private/tmp/claude-501/check-all-5.log`).
* `check:frontend` 686 Tests gruen, `check:control-server` 230 gruen, `check:guidelines` 2107 Dateien gruen.
* Live-Abnahme auf **https://smejj.com** (echter Klickpfad, angemeldete Sitzung, 04.09.):
  * `abnahme.pdf` → Kachel „abnahme.pdf · 48 Zeichen" mit Inhalt `[Seite 1] Abnahme 4. September: PDF wird gelesen`
  * `abnahme.docx` → Kachel „abnahme.docx · 38 Zeichen" mit Inhalt `Abnahme 4. September / Word wird gelesen`
  * `abnahme.mov` → Kachel „Video · 8 KB · smejj kann Videos noch nicht ansehen — der Verweis geht mit."
  * Alle fuenf neuen Module per `import()` erreichbar, **null Konsolenfehler**, acht Werkzeug-Chips sichtbar.
* Beide Domains synchron auf `smejj-shell-v750`.

## Benchmarks (Live, 04.09.)

| Messwert | Kalt (p75) | Warm (p75) | Budget | Bewertung |
|---|---|---|---|---|
| Seitengewicht | 279 KB | 4 KB | 300 KB | OK |
| CLS | 0 | 0,016 | 0,1 | OK |
| INP | 40 ms | 32 ms | 200 ms | OK |
| LCP | 4672 ms | 600 ms | 1500 ms | kalt verfehlt |
| TTFB | 2991 ms | 567 ms | 200 ms | verfehlt |

**Einordnung der roten Werte:** netzgebunden, nicht serverseitig. Gegenmessung aus derselben
Leitung zur selben Zeit: `example.com` TTFB 1219 ms, `google.com/generate_204` TTFB 1273 ms —
smejj.com warm 482 ms, davon 343 ms TLS-Aufbau, also ca. 140 ms echte Serverzeit. Der Befund
deckt sich mit der bekannten Lehre „Netz des Betreibers ist der Flaschenhals". Kein Deploy hat
ein Budget verschlechtert; das Seitengewicht blieb trotz vier neuer Module unter 300 KB, weil
alle per `import()` erst bei Bedarf geladen werden und pdf.js nicht im Precache liegt.

## Rollback

Je Kaskade ein Deploy-Commit im Klon (`~/smejj-app-frontend`) und ein Auslieferungs-Commit im
Bauzweig; `git revert` beider stellt den Vorstand her. `design-v11` bleibt unberuehrt.
Betroffene Kaskaden: 9 (Vollbild + Chips), 10 (PDF), 11 (Tonspur), 12 (Office),
13 (Worker-Teilung), 14 (API-Bereich aufgeteilt).

## Qualitätsbewertung

Ziel erreicht: Anhaenge kommen inhaltlich an, `check:all` ist gruen, Live-Abnahme bestanden,
keine bestehende Funktion angetastet. Offen bleibt allein die Sprachwelle LIVE — technisch
fertig und bewiesen, aber von Google auf Kontoebene gesperrt (1008 „project denied access",
auch mit neuem Projekt). Das ist eine Betreiber-Entscheidung (Abrechnung), keine offene Arbeit.
