# Task Capsule — job_startseite_inline_20260727

Datum: 2026-07-27
Auftrag: Betreiber (Wof Kadavanich)
Status: abgeschlossen, live verifiziert

## Ziel

Ein Auftrag im Startfeld von smejj.com soll die Startseite nie verlassen —
wie bei Claude/Codex antwortet das System im Gespraechsfaden. Werkzeuge sind
Karten im Faden, keine andere Seite.

## Befund (Ausgangslage)

Eingabe im Startfeld: `geh browser iMild.com teste ob alles fehlerfrei ist?`
Ergebnis: Sprung auf `https://smejj.com/automation` mit vorausgefuelltem
Formular, keine Antwort, kein Browserlauf.

Ursachenkette:

| Ort | Befund |
|---|---|
| `public/app.js:408` | `routeAutonomousRequest(...)` war der erste Schritt in `submitTask` — vor jedem Modellaufruf |
| `public/autonomous-intent.js:9` | Regex-Treffer: Verb `teste` + Ziel `browser` |
| `public/autonomous-intent.js:26` | `goToView("automation")` — harter Ansichtswechsel statt Antwort |
| `public/autonomous-intent.js:37` | URL-Erkennung verlangte `https://`; `iMild.com` ergab `previewUrl = ""` → Weiterleitung ohne Browserlauf |

## Anforderungen

- Kein Ansichtswechsel mehr aus dem Startfeld (Stufe 1).
- Adressen ohne Schema erkennen, fail-closed (Stufe 3).
- Autonomer Lauf bleibt vollstaendig erreichbar (Non-Regression).
- Start-Lock, Design-Lock, Favicon-Lock unberuehrt.

## Betroffene Dateien

- `public/autonomous-intent.js` — geaendert (nicht im Start-Lock)
- `tests/autonomous-intent.test.mjs` — neu
- `package.json` — Test in `check:frontend`, Syntaxpruefung in `check`
- Live: `SmejjCom/smejj-app-frontend` → `assets/autonomous-intent.js`, `sw.js`

`public/app.js`, `public/index.html` und alle 31 Start-Lock-Dateien bleiben
byte-identisch.

## Aenderungen

1. `routeAutonomousRequest` liefert immer `false`. Der normale Chat-/Agent-Pfad
   in `app.js` laeuft weiter und antwortet im Faden. Kein `goToView` mehr.
2. Erkannte Web-Ziele senden `smejj:browser-request` → die eingebettete
   Browser-Leiste rechts oeffnet inline (bestehende Funktion).
3. Der autonome Lauf erscheint als Angebotskarte unter der Antwort
   (`[data-run-offer]`, Klassen `.entry.assistant` + globale `button`-Regel —
   kein Eingriff in gesperrte Stylesheets). Erst der Klick fuehrt
   `goToView("automation")` + `smejj:autonomous-request` aus, in dieser
   Reihenfolge wie zuvor.
4. URL-Erkennung: Adressen mit und ohne Schema, immer auf `https` normalisiert,
   fail-closed ueber eine TLD-Allowlist. Dateinamen (`app.js`, `index.html`),
   Versionsnummern (`smejj 1.0`) und Satzreste (`morgen.Danach`) werden
   ausgeschlossen; Zugangsdaten in der Adresse werden abgewiesen.

## Verifikation

Pflicht-Checks (lokal):

| Check | Ergebnis |
|---|---|
| `check:guidelines` | OK — 815 Dateien, max 800 Zeilen, Naming smejj.com |
| `check:start-lock` | OK — 31 Startseiten-Dateien byte-identisch |
| `check:favicon-lock` | OK — 6 Dateien, 19 HTML-Seiten unveraendert |
| `check:frontend` | 139/139 Tests gruen (inkl. 8 neue) |
| `check` (Syntax) | Exit 0 |

Browserpruefung lokal (Dev-Server): Startseite bleibt `/`, Browser-Leiste
oeffnet `https://imild.com/`, Angebotskarte erscheint. Klick auf
„Autonomen Lauf starten" fuehrt auf `/automation` mit korrekt vorbelegtem
Formular (Aufgabe, `analyze`, Browser-Pruefung `true`,
Preview-URL `https://imild.com/`) — Non-Regression bestaetigt.

Live-Test auf der Produktionsdomain (angemeldete Sitzung, Chrome):
Gleiche Eingabe → URL bleibt `https://smejj.com/`, imild.com rendert in der
rechten Browser-Leiste, das Modell antwortet im Faden, Angebotskarte sichtbar.
Keine Konsolenfehler.

## Benchmarks

| Messwert | Ergebnis | Budget | Bewertung |
|---|---|---|---|
| Startseite gzip gesamt (HTML + JS/CSS) | 60 KB | < 300 KB | eingehalten |
| `autonomous-intent.js` gzip | 1028 B → 2885 B (+1857 B) | — | +0,6 % des Seitenbudgets |
| Asset-Auslieferung | HTTP 200, 6344 B, SHA256 `202828ac…d94a` | — | live identisch zur Quelle |
| Konsolenfehler live | 0 | 0 | eingehalten |
| TTFB live (6 Messungen von diesem Anschluss) | 0,36–1,38 s | < 200 ms (p95) | **verfehlt — Bestandsbefund** |

Der TTFB-Befund ist nicht durch diese Aenderung verursacht (statisches
GitHub-Pages-Asset, +1,8 KB gzip) und war vorher gleich. Er ist als offener
Punkt vermerkt, nicht als Regression.

LCP/INP/CLS konnten in dieser Sitzung nicht gemessen werden: die
In-Page-Messung wurde vom Sicherheits-Klassifikator blockiert. Restrisiko
gering — die Aenderung fuegt keine Render-Blocker und keine
Layoutverschiebung oberhalb des Faltbereichs hinzu.

## Rollback

- Git-Tag `rollback/startseite-inline-2026-07-27` (`b941c47`)
- Dateikopien: `backups/rollback-2026-07-27/autonomous-intent.js.vor-inline`
  und `.live-vorher` (byte-identisch, SHA gleich)
- Live-Rollback: `SmejjCom/smejj-app-frontend` auf `71c4e99` zuruecksetzen
- Arbeits-Commit: `ef34182` auf `feature/auth-redesign-github-magiclink`
- Live-Commits: `963e1fe` (Fix), `3ba9347` (`sw` v146 → v147)

## Qualitaetsbewertung

Ziel vollstaendig erreicht, mit Beleg. Offen bleibt Stufe 2 (Automatik als
echtes Werkzeug im Tool-Calling statt Regex-Vorfilter) — bewusst als eigener
Schritt, weil sie `app.js` beruehrt und damit eine Start-Lock-Freigabe braucht.
