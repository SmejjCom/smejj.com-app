# job_startgewicht_20260820 — Startgewicht: die Code-Flaeche laedt erst beim Oeffnen

Wortgleich aus `Memory_Bank.md` ausgelagert am 2026-08-23 wegen der
800-Zeilen-Regel der Charta. Nichts geloescht, nichts gekuerzt.
Kurzfassung mit Verweis steht weiterhin in `Memory_Bank.md`; die Messwerte stehen zusaetzlich in `capsule.json`.

---

## 2026-08-20 — Startgewicht: die Code-Flaeche laedt erst beim Oeffnen (job_startgewicht_20260820)

Capsule: `task-capsules/2026/08/job_startgewicht_20260820/capsule.json`
(Object Brain: `s3://smejj-model-files/capsules/app/job_startgewicht_20260820/`).
Tag: `stand-2026-08-20-startgewicht`. App-Repo `8588fd99`, Frontend `94fd602`,
ausgeliefert mit `smejj-shell-v636`.

**Zuerst das Messgeraet geprueft — und es war falsch.** Der Service Worker
beantwortet Anfragen aus dem Vorrat; `performance.getEntriesByType` meldet dann
die ROHE Groesse und `transferSize: 0`. Gemessen an `chat-store.js`: 40.711 B
gemeldet, 13.048 B tatsaechlich uebertragen. Die Zahlen, die an diesem Tag als
"Seitengewicht" galten (4.054 -> 1.174 KB), sind also die Browser-Zahl, nicht
die Uebertragung. Gegen das 300-KB-Budget zaehlen uebertragene Bytes — gemessen
per gzip von aussen. (Die Chat-Verkehrszahlen 2,50 MB -> 15 KB sind NICHT
betroffen: API-Antworten liegen nicht im Vorrat.)

**Entscheidung:** `index.html` laedt ueber 20 Module per `<script>`-Tag sofort.
Mit schriftlicher Freigabe des Betreibers fuer EINEN Eintrag holt jetzt
`code-nachladen.js` (1,79 KB) die Code-Flaeche, sobald `#code` aufgeht.

**Verifikation (gzip, ausgelieferte Seite):**

| | vorher | nachher |
|---|---|---|
| sofort geladen | 383 KB | 365 KB |
| erst bei Bedarf | 125 KB | 145 KB |

Gewandert sind `code-flaeche.js` (11,7 KB) und `code-modell-menue.js` (7,9 KB);
netto 17,9 KB. Die vorab genannten 27,1 KB waren zu hoch — das Gruppen-Muster
zaehlte Dateien mit, die gar nicht an der Code-Flaeche haengen.

Live geprueft: Startseite ohne `code-flaeche.js`; Klick auf "Code" laedt nach
731 ms, `initCodeFlaeche` laeuft, Senden-Knopf und Feld da; direkter Aufruf von
`/code` nach 359 ms mit Modellanzeige "Auto"; Fehlerkonsole leer. Tests 8/8.

**Der Mechanismus:** MutationObserver auf `#code.is-active` — der einzige Weg,
auf dem der Bereich sichtbar wird (Klick, Zurueck/Vor, programmatisch). NICHT
IntersectionObserver, den die Tests verbieten (scrollabhaengig). Nach einem
Fehlschlag meldet sich der Beobachter nicht ab, der Fehler steht im Protokoll.

**Unterwegs korrigiert:** Der erste Entwurf haengte zwei Zeilen in `app.js` —
die steht exakt auf 800 Zeilen und waere auf 813 gesprungen; zwei Pruefer
schlugen an. Derselbe Test nennt das richtige Muster: "die Funktion haengt sich
selbst ein, app.js kennt sie nicht". `app.js` blieb byte-identisch. Ein
zunaechst ergaenztes `ladeFuerAnsicht` wurde wieder entfernt — ungenutzter Code
waere ein Blindgaenger.

**Noch offen (gzip):** Browser-Panel 59,9 KB, Verlauf 38,2, Maus 10,8, Konto
7,6, Kamera 7,1, Sprache 4,3 — rund 128 KB, die beim ersten Aufbau niemand
sieht. Jede Verschiebung braucht eine eigene Freigabe.

**Lehre:** Eine Optimierung muss zuerst ihr eigenes Messgeraet pruefen. Die
Zahl, die den ganzen Tag als Seitengewicht galt, haette jeden Fortschritt
falsch bewertet.
