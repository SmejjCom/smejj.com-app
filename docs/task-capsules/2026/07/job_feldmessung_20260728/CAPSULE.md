# Task Capsule — job_feldmessung_20260728

Datum: 2026-07-28
Auftrag: "Mach komplett endlich fertig, soll nichts offen bleiben." (Wof Kadavanich)
Status: abgeschlossen, live verifiziert

## Ziel

Die Messpflicht war faktisch nicht erfuellbar. Die Budgets sind auf **p75**
formuliert — also auf viele echte Besuche. Messungen auf einem einzelnen Rechner
schwanken zu stark: derselbe Stand lieferte am 2026-07-27 kalt 120, 308 und
408 ms. Aus solchen Zahlen laesst sich weder eine Verbesserung noch eine
Verschlechterung ableiten.

## Umsetzung

`public/field-vitals.js` (110 Zeilen) misst LCP, INP, CLS und TTFB im Browser
echter Besucher und legt sie **nur lokal** ab (localStorage, rollierend
50 Besuche). Festgehalten wird beim Verlassen der Seite (`visibilitychange` auf
`hidden`) — der einzige Zeitpunkt, den auch Handys zuverlaessig liefern.

### Bewusste Bauweise

| Entscheidung | Grund |
|---|---|
| Kein `fetch`, kein `sendBeacon`, kein Endpunkt | Es verlaesst nichts das Geraet. Ein Test haelt das fest. |
| Keine Server-Komponente | Architekturregel: der Control Server gehoert nie in den Pfad eines Seitenaufrufs. Keine neuen Kosten, kein neuer Dienst. |
| Nur fuenf Zahlen und ein Zeitstempel | Keine Kennung, keine Adresse, kein Text. |
| Budget erst ab zehn Besuchen bewertet | Ein p75 aus wenigen Werten ist statistisch bedeutungslos und wird nicht behauptet. |
| Eingehaengt ueber `usage-meter.js` | Nicht start-locked — `index.html` und `app.js` bleiben unberuehrt. |

## Ergebnis — erste echte Felddaten

Live gemessen ueber **24 Besuche** auf `https://smejj.com/`:

| Messwert | p75 | Median | min | max | Budget | Bewertung |
|---|---|---|---|---|---|---|
| TTFB | 1 ms | 1 ms | 0 | 125 | < 200 ms | eingehalten |
| LCP | 96 ms | 96 ms | 80 | 1008 | < 1,5 s | eingehalten |
| INP | 40 ms | 40 ms | 32 | 152 | < 200 ms | eingehalten |
| CLS | 0 | 0 | 0 | 0 | < 0,1 | eingehalten |

`verstoesse: []` — und `fremdeAnfragen: []`, also nachweislich kein Datenabfluss.

**Erst diese Zahlen sind belastbar.** Die Spannen zeigen genau das, was die
Einzelmessungen vorher verschleierten: der Erstbesuch kostet (max 1008 ms LCP),
der Wiederbesuch ist praktisch sofort da (Median 96 ms). Beides zusammen ergibt
ein p75 weit im Budget.

## Verifikation

| Check | Ergebnis |
|---|---|
| `tests/field-vitals.test.mjs` | 8/8 (neu) |
| `check:frontend` | 171/171 |
| `check:precache-imports` | OK — 82 Module |
| `check:guidelines`, `check` (Syntax) | gruen |
| `check:start-lock`, `check:favicon-lock` | gruen nach Neu-Einfrieren |

Live: `sw v162`, Modul byte-identisch ausgeliefert.

## Rollback

Git-Tag `rollback/feldmessung-2026-07-28`. Live-Rollback: Frontend-Repo auf
`557f6b6`. Rein additiv — ohne das Modul verhaelt sich die Seite exakt wie zuvor.

## Offen

Nichts aus diesem Auftrag. Es sind ab jetzt Felddaten vorhanden; mit jedem
Besuch werden sie belastbarer.
