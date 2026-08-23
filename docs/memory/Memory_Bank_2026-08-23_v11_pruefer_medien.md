# Memory_Bank 2026-08-23 — V11 komplett, Medien-Fix, vier Pruefer

Wortgleich aus `Memory_Bank.md` ausgelagert am 2026-08-23 wegen der
800-Zeilen-Regel der Charta. Nichts geloescht, nichts gekuerzt.
Kurzfassung mit Verweis steht weiterhin in `Memory_Bank.md`.

---

## 2026-08-23 — V11 komplett, Medien-Fix, und vier Pruefer, die nichts prueften

**Ergebnis:** 20 von 20 Bereichen im neuen Design, live (sw v645 -> v651).
Fuenf Deploys, alle im Browser gegen den echten Service-Worker-Vorrat verifiziert.

**Design.** Der sichtbare Bruch zwischen Startseite und Rest war keine schlechte
Regel, sondern eine ueberfluessige SCHICHT: design-cyan-views.css faerbte die
Flaeche unter allen 19 Nicht-Start-Ansichten kalt ein. Die richtige, neutrale
Fassung lag die ganze Zeit darunter in app-surfaces.css und war nur ueberdeckt.
Geheilt durch Abraeumen, nicht durch eine vierte Generation Gegenregeln.
Gemessen 0 -> 18 von 18 Ansichten ohne eigene Flaeche. Zuletzt trug auch die
Startseite den einen Cyanton (15 Werte, 41 % heller — auf dunklem Grund bei
0.13-0.35 Deckkraft aber nur 2-6 % effektive Abweichung, im A/B nicht
unterscheidbar).

**Der teuerste Befund: vier Pruefer, die etwas behaupteten, ohne es zu messen.**
1. Die assets/-Kopie pflegte kein Skript. Zwei am selben Tag committete Fixes
   waren live nie angekommen — lautlos. -> `npm run check:assets`
2. Alle sieben Dateisperren bewachten die QUELLEN, nicht die Auslieferung. Die
   live laufende Startseite war ungeschuetzt. -> `check:auslieferung-lock`
3. Ein Test pinnte `outline: 2px solid #2dd4bf` und versprach "sichtbar in
   beiden Schemata". Nachgerechnet: 1.86 gegen 3.0 gefordert. Tastaturnutzer im
   hellen Schema hatten seit jeher keinen Fokusring — app-weit, nicht nur im
   Konto. -> `tests/fokusring-kontrast.test.mjs`, das RECHNET.
4. Der Digest-Test prueft nur, DASS ein Pin existiert. Als ich selbst eine
   Manipulationssperre brach, blieb die Suite gruen. Er rechnet jetzt nach.
Dazu: der abo-lock hatte keinen npm-Alias und lief nie in check:all — deshalb
blieb seine Verletzung tagelang unbemerkt.

**Medien-Fix (der groesste Einzelfund).** Zehn von 113 Gespraechen wurden NIE
gesichert. Median aller Chats 7 KB, groesster 1938 KB bei NEUN Nachrichten,
einer 1537 KB bei DREI — nie zu viel Text, immer ein Medium. Ursache:
readEntries() speichert dasselbe Medium DREIFACH (html/text/raw, gemessen
7/4/10 Vorkommen, 11,5 MB). Die Auslagerung arbeitete nur auf dem DOM und fand
<img>/<video>: drei von sieben. Die anderen standen als Markdown da —
`![Bild](data:…)`, kein Element. Jetzt drei Wege mit EINER gemeinsamen Karte.
Die 512-KB-Grenze und chatSyncStore.js (vier Sperren) blieben unberuehrt.

**Benchmark (docs/benchmarks/webvitals_2026-08-23_medien-fix-v651.json):**
TTFB 3 ms, domInteraktiv 98 ms, vollstaendig geladen 441 ms, CLS 0.0222,
Seitengewicht 41 KB komprimiert. **141 von 141 Ressourcen aus dem Vorrat, 0
ueber Netz** — der Static-First-Beweis. API-p95 303 ms (Budget 300), bei ~220 ms
Netz-Grundlast hier ueberwiegend Laufzeit. LCP nicht messbar: der MCP-Tab ist
immer document.hidden, es gab NULL LCP-Eintraege; Obergrenze ueber
loadEventEnd = 441 ms.

**Verifizierte Muster (fuer kuenftige Arbeit):**
* Ein Test, der einen Literalwert festnagelt, prueft die Schreibweise, nicht die
  Sache. Wo eine Zusicherung im Testnamen steht ("sichtbar", "gepinnt",
  "aktuell"), muss sie NACHGERECHNET werden.
* Jeder neue Waechter braucht einen TUEV (kaputte UND gesunde Probe) und ein
  Fund-Minimum — sonst meldet er bei leerer Trefferliste gruen.
* Cache-Nummern IMMER live messen: v647 war bereits von einer Parallelsitzung
  vergeben.
* chat-history-cards.js ist zum dritten Mal das vergessene Glied der
  chat-store-Kette. Grund gefunden: der Import ist MEHRZEILIG, der Modulname
  steht in eigener Zeile und entgeht jeder einzeiligen Suche. Nur
  check:markenkette findet es. Eine Aenderung an chat-store.js zieht ELF Module
  ueber VIER Stufen nach sich, bis app.js.
* assets/sw.js ist eine LEICHE (v328). app.js registriert /sw.js aus der WURZEL.

**Offen, mit Freigabebedarf:** favicon-lock ist verletzt (htmlHeadReferences).
Ursache liegt vor dieser Sitzung: seit b97f5b02 (15.08.) liegen HTML-Seiten in
public/assets/, der Lock wurde am 14.08. eingefroren. Dabei ein echter Fund:
willkommen.html (die LANDESEITE) und programmieren.html tragen nur EINE
Favicon-Referenz statt fuenf — es fehlen die PNG-Fallbacks, apple-touch-icon
und die Cache-Marke ?v=112. Favicons sind Rote Liste, deshalb nicht angefasst.

**Nachtrag 2026-08-23 — favicon-lock geschlossen (sw v652).** Der Ship-Loop
deckte auf, was seit dem 15.08. bestand: willkommen.html — die LANDESEITE, erste
Seite fuer jeden neuen Besucher — trug nur EINE Favicon-Referenz statt fuenf
(nur das SVG, ohne favicon.ico, ohne PNG-Fallbacks 32x32/16x16, ohne
apple-touch-icon, ohne Cache-Marke ?v=112). Dasselbe bei programmieren.html.
Wirkung: in Browsern ohne SVG-Favicon und beim Hinzufuegen zum Homescreen fehlte
das Icon. Herkunft nachgemessen: b97f5b02 (15.08.) gegen Lock-Einfrierung
(14.08.) — nicht aus dieser Sitzung. Mit Betreiber-Freigabe repariert (exakt der
Block aus index.html), vorher UND nachher geprueft: alle fuenf Zieldateien live
HTTP 200, die Favicon-DATEIEN selbst und webManifestIcons unveraendert — nur
Referenzen. favicon-lock neu eingefroren (6 Dateien, 43 HTML-Seiten), voriger
Manifest-Stand unter backups/ gesichert.

**Schutzstand am Ende des Tages: 8 von 8 Sperren gruen** — start, security, abo,
einwilligung, deploy, admin, favicon, auslieferung. 591 Tests gruen,
markenkette 95/95. MERKREGEL daraus: check:favicon-lock gehoert in JEDEN
Ship-Loop mit Frontend-Anteil — er hat einen Fehler gefunden, der acht Tage lang
auf der wichtigsten Seite der Plattform stand und den niemand gesehen hat.
