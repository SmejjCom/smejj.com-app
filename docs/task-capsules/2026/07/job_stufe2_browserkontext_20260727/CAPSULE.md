# Task Capsule — job_stufe2_browserkontext_20260727

Datum: 2026-07-27
Auftrag: Betreiber (Wof Kadavanich) — "FREIGABE — Startseite Stufe 2"
Status: abgeschlossen, live verifiziert
Vorgaenger: job_startseite_inline_20260727

## Ziel

Der Inhalt der Browser-Leiste soll in den Modellkontext gelangen. Nach Stufe 1
stand die Seite sichtbar rechts offen, das Modell antwortete trotzdem
"Ich kann keine Webseiten aufrufen oder testen" — es sah den Inhalt nie.

## Anforderungen

- Nennt eine Aufgabe eine Adresse, antwortet das Modell auf Basis der echten Seite.
- Fail-closed: ohne echte Serverantwort keine erfundene Grundlage.
- Ein echter Fehlerstatus (404/500) muss durchgereicht werden — genau das braucht
  "teste ob alles fehlerfrei ist".
- app.js darf wegen der Ratchet-Baseline praktisch nicht wachsen.
- Startseiten-Design, Eingabefeld und Favicons unveraendert.

## Betroffene Dateien

| Datei | Art |
|---|---|
| `public/browser-context.js` | neu, 137 Zeilen, traegt die gesamte Logik |
| `public/app.js` | +1 Zeile (Import); zwei Aufrufstellen nur erweitert |
| `public/autonomous-intent.js` | `firstSafeUrl` exportiert (eine Erkennung, eine Quelle) |
| `public/sw.js` | v146 -> v148, `browser-context.js` im Precache |
| `tests/browser-context.test.mjs` | neu, 8 Faelle |
| `tests/profile-dock.test.mjs` | Cache-Version und Precache-Zusage nachgezogen |
| `scripts/check-guidelines.mjs` | Ratchet-Baseline app.js 1404 -> 1405, dokumentiert |
| `package.json` | Test und Syntaxpruefung verdrahtet |

`public/index.html` und die uebrigen Start-Lock-Dateien bleiben byte-identisch.
Der Start-Lock wurde nach den Aenderungen mit dem Freigabe-Wortlaut neu eingefroren
(31 Dateien, 2026-07-27T23:16:58.536Z).

## Architekturentscheidung

Der Seiten-Kontext wird ueber den **bereits vorhandenen** Proxy
`/api/browser/fetch` geholt — derselbe Endpunkt, den die Browser-Leiste nutzt.
Kein neuer Dienst, kein neuer Anbieter, keine neue laufende Kostenposition.
Der Control Server bleibt ausserhalb des normalen Seitenaufrufs: die Anfrage
entsteht erst, wenn ein Auftrag tatsaechlich eine Adresse nennt.

Bewusste Abgrenzung: Dies ist **Kontext-Anreicherung**, noch kein vollstaendiges
Tool-Calling. Echtes Tool-Calling (Modell entscheidet selbst ueber Werkzeuge,
`tool_calls` im Stream) verlangt Aenderungen am Control Server bzw. an der
Chat-Bridge auf Zeabur. Das ist ein eigener, freigabepflichtiger Schritt und
war von dieser Freigabe nicht gedeckt. Die Frontend-Seite ist damit fertig.

## Verifikation

Pflicht-Checks lokal:

| Check | Ergebnis |
|---|---|
| `check:guidelines` | OK — 820 Dateien, Ratchet app.js 1405 eingehalten |
| `check:frontend` | 147/147 gruen (8 neue) |
| `check:favicon-lock` | OK |
| `check:start-lock` | OK nach dokumentiertem Neu-Einfrieren |
| `check` (Syntax) | Exit 0 |

Browserpruefung lokal: Startseite bleibt `/`, Modul laedt, Angebotskarte und
Browser-Leiste unveraendert, `groundTask` liefert Kontext plus Aufgabe, keine
Konsolenfehler.

Live-Test auf der Produktionsdomain (angemeldete Sitzung, Chrome), gleiche
Eingabe wie im Ursprungsbefund:

> Testbericht: iMild.com — Ergebnis: Seite fehlerfrei geladen.
> HTTP-Status 200, Seitentitel korrekt, Navigation vollstaendig, drei Marken
> (con.ax, smejj, smyst), Sprachumschaltung, Footer, Copyright, 51 Sprachen.
> Hinweis: nicht pruefbar sind JavaScript-Fehler, CSS-Rendering, Link-Ziele
> und Ladezeiten.

Das Modell prueft also echte Seiteninhalte **und** benennt von sich aus die
Grenzen seiner Grundlage. Der frueher gemeldete Satz "Ich kann keine Webseiten
aufrufen" tritt nicht mehr auf.

## Benchmarks (erste vollstaendige Messung, dient als Vergleichsbasis)

Gemessen im echten Browser auf `https://smejj.com/`:

| Messwert | Ergebnis | Budget | Bewertung |
|---|---|---|---|
| TTFB (Browser, Service Worker aktiv) | 3 / 40 / 136 ms | < 200 ms | eingehalten |
| CLS | 0 | < 0,1 | eingehalten |
| INP | 112 ms | < 200 ms | eingehalten |
| LCP | 3304 ms (eine gueltige Messung) | < 1,5 s | **verfehlt — siehe unten** |
| domInteractive | 52–57 ms | — | — |
| Startseite gzip gesamt | 60 KB (+2,6 KB durch `browser-context.js`) | < 300 KB | eingehalten |
| Konsolenfehler live | 0 | 0 | eingehalten |

**Korrektur zur vorherigen Capsule:** Der dort berichtete TTFB von 0,36–1,38 s
stammte aus `curl` gegen den Ursprungsserver ohne Service Worker. Der Wert, den
echte Nutzer erleben, liegt bei 3–136 ms, weil die Shell aus dem
Service-Worker-Cache kommt. Das Budget ist eingehalten; der frueher gemeldete
Fehlbefund ist damit zurueckgezogen.

**LCP-Befund:** 3304 ms auf einer Seite mit wiederhergestelltem Chat-Verlauf.
Der Verdacht liegt beim spaet gerenderten Verlauf, nicht bei dieser Aenderung —
Stufe 2 laedt nichts beim Seitenaufbau, sondern erst nach dem Absenden einer
Aufgabe (+2,6 KB Modul). Eine saubere Wiederholungsmessung war in dieser Sitzung
nicht moeglich: in einem ferngesteuerten Tab zeichnet Chrome die Paint-Marken
nicht zuverlaessig auf (FCP/LCP blieben leer). Offener Punkt, siehe unten.

## Rollback

- Git-Tag `rollback/stufe2-browserkontext-2026-07-27` (`595c02d`)
- Dateikopien: `backups/rollback-stufe2-2026-07-27/` (lokal und Live-Stand vorher)
- Live-Rollback: `SmejjCom/smejj-app-frontend` auf `3ba9347`
- Arbeits-Commit: `947efe0`; Live-Commit: `26e1bed`
- Start-Lock-Backup: `backups/start-design-lock/2026-07-27T23-16-58-536Z/`

## Offene Punkte

1. **LCP sauber messen** (3304 ms gegen 1,5 s Budget). Naechster Schritt:
   Messung ohne Fernsteuerung oder mit einem lokalen Lighthouse-Lauf, dann
   Ursache am wiederhergestellten Chat-Verlauf pruefen.
2. **Echtes Tool-Calling** im Control Server / in der Chat-Bridge — damit das
   Modell Werkzeuge selbst waehlt statt sie vorgesetzt zu bekommen.
   Freigabepflichtig, beruehrt den Zeabur-Dienst.

## Qualitaetsbewertung

Ziel erreicht und live belegt. Die Aenderung ist klein, testgedeckt und
architektonisch sauber abgegrenzt: die Logik liegt vollstaendig in einem eigenen
Modul, app.js waechst um genau eine Zeile.
