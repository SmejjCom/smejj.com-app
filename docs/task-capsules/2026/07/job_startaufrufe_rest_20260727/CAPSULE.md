# Task Capsule — job_startaufrufe_rest_20260727

Datum: 2026-07-27
Auftrag: "FREIGABE — Startaufrufe Rest (Wof Kadavanich, 2026-07-27)"
Status: abgeschlossen, live verifiziert — mit einem benannten Rest
Vorgaenger: job_ladezeit_20260727

## Ziel

Die vier verbliebenen Control-Server-Startaufrufe hinter den ersten Bildaufbau
verschieben, damit die Architekturregel "Der Control Server steht nie im Pfad
des normalen Seitenaufrufs" vollstaendig erfuellt ist.

## Korrektur am eigenen Befund

Die Freigabe nannte `public/cline-model-menu.js` als Quelle der beiden
Cline-Aufrufe. Das war falsch — sie stammen aus
`public/provider-settings.js` Zeile 22 (`load(root)` in
`initClineProviderSurface`). `cline-model-menu.js` laedt seinen Katalog schon
immer erst beim Oeffnen des Untermenues und wurde deshalb **nicht angefasst**;
die dafuer erteilte Start-Lock-Freigabe blieb ungenutzt. Ein Test haelt das
Verhalten jetzt fest, damit es nicht kippt.

## Umsetzung

| Aufruf | Datei | Stelle |
|---|---|---|
| `/api/auth/me` | `public/account-privacy.js` | `hydrateAuthSession(view)` |
| `/api/keys` | `public/api-keys-surface.js` | `refresh(root)` |
| `/api/providers/cline/models` + `/status` | `public/provider-settings.js` | `load(root)` |

Alle drei ueber `afterFirstPaint` aus `public/deferred-start.js`. Die
Oberflaechen werden weiterhin **sofort** aufgebaut, nur die Daten kommen kurz
danach — Deep-Links auf `/settings` und `/konto` bleiben unveraendert nutzbar.

## Fehler im ersten Anlauf — gefunden, behoben, erneut ausgeliefert

Nach dem ersten Deploy (`1b1f9a5`, sw v151) zeigte die Live-Messung: im warmen
Wiederbesuch starteten **sechs** Aufrufe bei 142–160 ms, waehrend der
Bildaufbau erst bei 168 ms lag. Der kalte Erstbesuch war korrekt.

**Ursache:** `requestAnimationFrame` laeuft VOR dem Malen seines Frames. Zwei
rAF garantieren also nicht, dass gemalt wurde — bei einem schnellen
Wiederbesuch liefen die Rueckrufe vor dem ersten gemalten Bild.

**Behebung** (`sw v152`): `deferred-start.js` wartet jetzt auf das
Paint-Ereignis des Browsers selbst (`PerformanceObserver`, `type: "paint"`,
`buffered: true`). Rueckfallweg ohne Beobachter: zwei rAF **plus** ein
`setTimeout(0)` — der laeuft garantiert nach dem Malen. Der Notausgang fuer
unsichtbare Tabs bleibt unveraendert.

## Ergebnis

Gemessen headless, FCP gegen die Startzeiten aller neun API-Aufrufe:

| Phase | vor dem Bildaufbau | Stand vorher |
|---|---|---|
| Erstbesuch | **0 von 9** | 0 von 9 |
| Wiederbesuch | **1 von 9** | 1 von 9 (nach v151 zwischenzeitlich 6) |

Die drei verschobenen Aufrufe liegen im Wiederbesuch jetzt bei 579 ms, 804 ms
und 1039 ms — vorher bei 254–538 ms und teils vor dem Bildaufbau.

### Web Vitals (7 Laeufe, p75)

| Phase | Messwert | vorher | nachher |
|---|---|---|---|
| warm | **LCP** | 168 ms | **128–140 ms** |
| warm | TTFB | 65 ms | 53 ms |
| kalt | LCP | 368 ms | 120 / 308 / 408 ms |
| beide | CLS | 0 | 0 |
| beide | INP | 48–64 ms | 48 ms |

`verstoesse: keine`.

**Zur Kaltmessung:** Drei Kontrollaeufe auf **demselben** Build ergaben kalt
120, 308 und 408 ms. Die Streuung ist groesser als jeder Unterschied zwischen
vorher und nachher — aus der Kaltmessung laesst sich hier weder eine
Verbesserung noch eine Verschlechterung ableiten. Der Warmwert ist dagegen
stabil (128/128/140 ms) und reproduzierbar besser. Der Performance-Lock ist
damit eingehalten.

## Verifikation

| Check | Ergebnis |
|---|---|
| `check` (Syntax) | Exit 0 |
| `check:frontend` | 158/158 |
| `check:platform` | 7/7 |
| `check:users` | 25/25 |
| `check:guidelines` | OK — 836 Dateien |
| `check:favicon-lock`, `check:start-styles` | OK |
| `check:start-lock` | OK nach dokumentiertem Neu-Einfrieren (nur `sw.js` betroffen) |

## Rollback

- Git-Tag `rollback/startaufrufe-rest-2026-07-27` (`66c3ed3`)
- Dateikopien: `backups/rollback-startaufrufe-2026-07-27/`
- Arbeits-Commits `1b1f9a5` (Umsetzung) und der Paint-Fix danach
- Live-Commits `89d7aa3` und `9ce1fdc`; Rollback-Ziel `9b3fceb`

## Rest — bewusst nicht angefasst

Im Wiederbesuch liegt weiterhin **ein** Aufruf 11 ms vor dem Bildaufbau:
`/api/auth/me` aus `public/autonomous-coding.js` Zeile 27 (`refreshSession()`
in `initAutonomousCodingSurface`). Diese Datei steht unter dem Start-Lock und
wird in **keiner** der beiden Freigaben genannt. Praktisch vernachlaessigbar,
architektonisch aber der letzte offene Punkt.

Ein Umweg waere moeglich gewesen — den Aufruf von `premium-surfaces.js` aus zu
verschieben, das bereits freigegeben ist. Das haette die gesamte
Oberflaechen-Erzeugung verzoegert und Deep-Links auf `/automation` kurzzeitig
leer gezeigt. Bewusst nicht gemacht: Scope-Treue und Non-Regression vor
Vollstaendigkeit.

## Nebenbefund (nicht behoben, aelter als diese Arbeit)

`public/api-keys-surface.js` liegt **nicht** im Service-Worker-Precache, wird
aber von `settings-surface.js` importiert (die im Precache liegt). Offline
findet der Import damit nichts. Das bestand schon vorher und ist kein Ergebnis
dieser Aenderung — gehoert aber auf die Liste.

## Qualitaetsbewertung

Ziel weitgehend erreicht und belegt: Erstbesuch vollstaendig sauber,
Wiederbesuch bis auf einen Aufruf in einer nicht freigegebenen Datei. Der
eigene Fehler im ersten Anlauf wurde durch die Live-Messung gefunden und im
selben Ship-Loop behoben — genau wozu Schritt 7 und 8 da sind.
