# Task Capsule — job_letzte_reste_20260728

Datum: 2026-07-28
Auftrag: "Ja / Mach komplett fertig, lass nicht offen." (Wof Kadavanich)
Status: abgeschlossen, live verifiziert — nichts offen
Vorgaenger: job_startaufrufe_rest_20260727

## Ziel

Die beiden gemeldeten Reste abraeumen: den letzten fruehen
Control-Server-Aufruf und den Precache-Befund zu `api-keys-surface.js`.

## 1) Letzter Startaufruf verschoben

`/api/auth/me` aus `public/autonomous-coding.js` (`refreshSession` in
`initAutonomousCodingSurface`) laeuft jetzt hinter `afterFirstPaint`.

## 2) Der Precache-Befund war viel groesser als gemeldet

Beim Aufraeumen zeigte sich: nicht **eine** Datei fehlte im Precache, sondern
**acht** — darunter `chat-history-context.js`, das `app.js` **selbst**
importiert. Offline lieferte der Fetch-Handler dafuer den Rueckfall `/`
(index.html), der Browser bekam HTML statt JavaScript und brach das Modul ab:
die App war offline tot. Genau die Falle, die seit v130 als Warnung in `sw.js`
steht.

Neu im SHELL: `account-sessions.js`, `api-keys-surface.js`,
`chat-history-context.js`, `i18n/ui.js`, `language-options.js`,
`onboarding-welcome.js`, `usage-meter.js`, `ai/providers-catalog.js`.

Alle acht vorher live auf HTTP 200 geprueft — ein einziger 404 im SHELL laesst
`cache.addAll` scheitern und der Service Worker installiert sich **gar nicht**.

## 3) Damit es nie wiederkehrt

`scripts/check-precache-imports.mjs` (72 Zeilen) verfolgt den Importgraph aller
Precache-Module — relative Pfade korrekt am Ordner der Quelldatei aufgeloest —
und meldet jede Luecke, fail-closed. In `check:frontend` verdrahtet.
Ergebnis: **72 Module erreichbar, Precache vollstaendig.**

Die Pruefung fand transitiv sofort eine weitere Luecke
(`ai/providers-catalog.js`), die von Hand niemand gesehen haette.

## Zwei eigene Fehler, live gefunden und behoben

**Fehler A (sw v152 -> v154, zwei Runden):** In `deferred-start.js` rannten
Paint-Beobachtung und Rueckfallweg per `Promise.race` gegeneinander — der
**schnellere** gewann. Zwei `requestAnimationFrame` plus `setTimeout` sind bei
warmem Cache schneller als der echte Bildaufbau. Der Rueckfall hat die
Beobachtung damit ueberholt und ihren Zweck ausgehebelt: im warmen
Wiederbesuch liefen weiterhin sechs Aufrufe bei 112 ms, waehrend der Bildaufbau
erst bei 140 ms lag. Behebung: Der Rueckfall gilt nur noch, wenn
`PerformanceObserver` fehlt. Ein Test haelt die Reihenfolge fest.

**Fehler B (Start-Lock-Manifest):** Beim Einfrieren lagen unfertige Dateien
einer parallelen Sitzung (`app.js`, `search.js`, `composer-tools.js`) im
Arbeitsordner. Deren Zwischenstand landete dadurch faelschlich als
"eingefrorener Stand" im Manifest. Neu erzeugt aus einem isolierten Worktree
auf dem committeten Stand. **Lehre: bei parallelen Sitzungen niemals gegen den
Arbeitsordner einfrieren.**

## Ergebnis

| Zusage | Nachweis |
|---|---|
| Kein API-Aufruf im Ladepfad, Erstbesuch | **0 von 9** vor dem Bildaufbau |
| Kein API-Aufruf im Ladepfad, Wiederbesuch | **0 von 9** vor dem Bildaufbau |
| Service Worker installiert sauber | aktiv, `smejj-shell-v154`, 100 Eintraege |
| App funktioniert offline | 74 Module aus dem Cache, **0 Modulfehler**, **0 JavaScript-Fehler**, Eingabefeld und 7 Navigationsknoepfe da |

Die drei offline auffaelligen Antworten sind HTTP 401 der Control-Server-API
(Authentifizierung) — erwartetes Verhalten, keine Ladefehler.

### Web Vitals (7 Laeufe, p75)

| Phase | TTFB | LCP | CLS | INP | Gewicht |
|---|---|---|---|---|---|
| kalt | 58 ms | 180 ms | 0 | 56 ms | 239 KB |
| warm | 143 ms | 232 ms | 0 | 40 ms | 39 KB |

`verstoesse: keine`. Die Schwankung zwischen Laeufen bleibt bekannt und
dokumentiert (siehe job_webvitals_messung_20260727) — belastbar sind CLS, INP,
Gewicht und die Anfragezahl.

## Verifikation

Isoliert auf dem committeten Stand geprueft, weil im Arbeitsordner unfertige
Dateien einer parallelen Sitzung lagen:

| Check | Ergebnis |
|---|---|
| `check` (Syntax) | Exit 0 |
| `check:frontend` | 159/159 |
| `check:platform` | 7/7 |
| `check:users` | 25/25 |
| `check:architecture` | 7/7 |
| `check:precache-imports` | OK — 72 Module |
| `check:guidelines` | OK — 839 Dateien |
| `check:favicon-lock`, `check:start-styles`, `check:json` | OK |
| `check:start-lock` | OK nach korrigiertem Einfrieren |

## Rollback

- Git-Tag `rollback/letzte-reste-2026-07-28` (`8d987d1`)
- Dateikopien: `backups/rollback-reste-2026-07-28/`
- Live-Commits `83f5bda`, `96eeb20`; Rollback-Ziel `9ce1fdc`

## Offen

Nichts mehr aus diesem Auftrag.

## Qualitaetsbewertung

Ziel vollstaendig erreicht. Der eigentliche Gewinn war nicht der geplante
11-ms-Aufruf, sondern der dabei gefundene Offline-Totalausfall — acht fehlende
Precache-Eintraege, die niemand bemerkt haette, plus eine automatische Pruefung,
die den Fehler kuenftig unmoeglich macht. Beide eigenen Fehler wurden durch
Live-Messung gefunden und im selben Ship-Loop behoben.
