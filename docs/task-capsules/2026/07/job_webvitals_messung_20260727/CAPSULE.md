# Task Capsule — job_webvitals_messung_20260727

Datum: 2026-07-27
Auftrag: Betreiber — "mach Punkt 1" (LCP sauber nachmessen)
Status: abgeschlossen
Vorgaenger: job_stufe2_browserkontext_20260727

## Ziel

Der LCP-Wert 3304 ms aus der Vorgaenger-Capsule war nicht belastbar (Messung in
einem ferngesteuerten Chrome-Tab). Er sollte sauber nachgemessen und die Ursache
geklaert werden, bevor jemand daraufhin optimiert.

## Architekturentscheidung: eigenes Messwerkzeug statt Paket

Puppeteer, Playwright oder Lighthouse haetten je ein eigenes Chromium (~150 MB)
nach `node_modules` geladen. Das verstoesst gegen "jede neue Abhaengigkeit muss
ihr Gewicht in Kilobyte rechtfertigen" und blaeht den Google-Drive-Ordner auf,
dessen Git-Index ohnehin empfindlich ist.

Gewaehlt: Chrome ist auf dem Rechner installiert, Node 22+ bringt `WebSocket`
mit. Damit reicht ein eigener, minimaler Client fuer das DevTools-Protokoll.

| Datei | Zweck | Zeilen |
|---|---|---|
| `scripts/testing/cdp-client.mjs` | Chrome headless starten, Seite oeffnen, auswerten | 121 |
| `scripts/testing/measure_web_vitals.mjs` | LCP, TTFB, CLS, INP, Gewicht gegen Budgets | 197 |
| `docs/benchmarks/webvitals_smejj_2026-07-27.json` | erster gespeicherter Benchmark | — |

Aufruf: `npm run measure:vitals` (optional `--url`, `--runs`, `--json`).
Null neue Pakete, null laufende Kosten. Exit-Code 1, wenn ein Budget reisst.

## Drei Messfehler, die unterwegs behoben wurden

1. **Nur der erste Lauf war kalt.** Alle Laeufe teilten ein Chrome-Profil, ab
   Lauf 2 kam alles aus dem Cache. Jetzt werden vor jedem Kaltlauf HTTP-Cache,
   Service Worker und Cache Storage geleert.
2. **Der Wiederbesuch sah langsamer aus als der Erstbesuch.** Ursache: neu
   geladen wurde, waehrend der Service Worker noch installierte. Jetzt wartet
   die Messung auf `navigator.serviceWorker.controller`.
3. **INP fehlte.** Ein Blindklick auf feste Koordinaten traf nichts. Jetzt wird
   das Eingabefeld gezielt angeklickt und getippt.

## Ergebnis

**Der Wert 3304 ms war ein Artefakt.** Kein Nachlauf hat ihn reproduziert. Er
entstand in einem ferngesteuerten Tab mit wiederhergestelltem Chat-Verlauf.

Stabil und reproduzierbar ueber alle Laeufe:

| Messwert | Ergebnis | Budget | Bewertung |
|---|---|---|---|
| CLS | 0 | < 0,1 | eingehalten |
| INP | 40–48 ms | < 200 ms | eingehalten |
| Seitengewicht kalt | 242 KB | < 300 KB | eingehalten |
| Seitengewicht warm | 39 KB | < 300 KB | eingehalten |
| LCP-Element | `H2` der Startseite | — | Text, kein Bild — gut |

Schwankend ueber drei Messlaeufe zu je 5–7 Iterationen:

| Messwert | Spanne p75 (kalt) | Spanne p75 (warm) | Budget |
|---|---|---|---|
| LCP | 488 – 1624 ms | 144 – 652 ms | < 1,5 s |
| TTFB | 159 – 767 ms | 116 – 360 ms | < 200 ms |

**Bewertung der Schwankung:** Ein einzelner Mac an einem Netz ist keine
p75-Feldmessung. Die Streuung (TTFB 48–775 ms bei identischem Aufbau) stammt aus
Verbindungsaufbau und Netz, nicht aus der Anwendung. Aus diesen Zahlen laesst
sich **nicht** belastbar ableiten, dass ein Budget verfehlt wird. Fuer eine
echte p75-Aussage braucht es Felddaten von echten Besuchern.

Belegt per `curl` (7 Laeufe): DNS 2 ms, TCP 37–134 ms, TLS 88–327 ms, reine
Serverzeit danach 60–110 ms. GitHub Pages liefert per Fastly-Edge mit
`x-cache: HIT`. **Der Server ist schnell; die Zeit geht in den
Verbindungsaufbau.**

## Der eigentliche, harte Befund

Nicht die Bytes sind das Problem, sondern die **Anzahl der Anfragen**:

| Kennzahl | Wert |
|---|---|
| Anfragen gesamt (kalt) | **103** |
| davon vor dem ersten Bildaufbau | **45** |
| Stylesheets | **16** (37 KB) |
| JavaScript-Dateien | **37** (54 KB) |
| FCP kalt | 1596 – 2204 ms |

Die acht render-blockierenden Stylesheets starten alle bei ~822 ms und sind erst
bei 1452–1531 ms fertig. Jede einzelne Datei kostet eine Runde Latenz. 91 KB in
53 Dateien zu holen dauert deutlich laenger als 91 KB in fuenf Dateien.

**Zweiter Befund — Architekturregel verletzt:** Beim Seitenstart laufen fuenf
Aufrufe an den Control Server (`/api/auth/me`, `/api/auth/config`,
`/api/health`, zwei Modell-Status), jeder 1,4–1,9 s. Sie blockieren den ersten
Bildaufbau nicht, stehen aber im Pfad eines normalen Seitenaufrufs — die
Architekturregel sagt ausdruecklich, dass der Control Server das nie tun darf.
Bei Lastspitzen trifft das den bewusst kleinen 2-vCPU-Server zuerst.

## Verifikation

| Check | Ergebnis |
|---|---|
| `check` (Syntax, inkl. beider neuer Dateien) | Exit 0 |
| `check:guidelines` | OK — 826 Dateien, max 800 Zeilen |
| `check:json` | OK |

Kein Frontend wurde geaendert; es gibt daher nichts zu deployen und keinen
Live-Klickpfad zu pruefen. Die Messung selbst lief gegen die Produktionsdomain.

## Rollback

Git-Tag `rollback/webvitals-messung-2026-07-27` (`3a8d3e7`). Die Aenderung ist
rein additiv: zwei neue Skripte, ein Benchmark, ein npm-Skript.

## Offene Punkte (beide freigabepflichtig)

1. **Anfragen buendeln.** 16 Stylesheets und 37 Module auf wenige Dateien
   zusammenfassen. Erwartete Wirkung: FCP und LCP im Erstbesuch deutlich runter.
   Beruehrt `index.html` (Design-Lock) — braucht schriftliche Freigabe.
2. **Startaufrufe an den Control Server verschieben.** Erst nach dem ersten
   Bildaufbau oder auf Bedarf laden. Beruehrt die Startdateien — freigabepflichtig.
3. **Felddaten statt Labormessung.** Ohne echte Besucherdaten bleibt jede
   p75-Aussage eine Schaetzung. Vorschlag als eigener Schritt bewerten.

## Qualitaetsbewertung

Ziel erreicht: Der Alarmwert ist als Artefakt entlarvt, es gibt ein
wiederholbares Messwerkzeug ohne Zusatzkosten, einen gespeicherten Benchmark und
zwei belegte, konkrete Ursachen. Ehrlich benannt bleibt, dass die Laborzahlen
fuer eine p75-Zusage zu stark schwanken.
