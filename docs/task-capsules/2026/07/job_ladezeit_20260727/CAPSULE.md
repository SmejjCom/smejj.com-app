# Task Capsule — job_ladezeit_20260727

Datum: 2026-07-27
Auftrag: "FREIGABE — Startseite Ladezeit (Wof Kadavanich, 2026-07-27)"
Status: abgeschlossen, live verifiziert
Vorgaenger: job_webvitals_messung_20260727

## Ziel

Zwei Befunde aus der Messung beheben:

1. 45 Anfragen vor dem ersten Bildaufbau, davon acht render-blockierende
   Stylesheets, die alle bei ~822 ms starten und erst bei 1452–1531 ms fertig
   sind. Nicht die Bytes bremsen (37 KB), sondern die Anzahl der Runden.
2. Fuenf Control-Server-Aufrufe beim Seitenstart verletzen die Architekturregel
   "Der Control Server steht nie im Pfad des normalen Seitenaufrufs."

## Architekturentscheidung

**Buendeln ohne Bundler.** `scripts/build/bundle-start-styles.mjs` haengt die acht
unveraenderten Quelldateien in exakt der bisherigen Reihenfolge aneinander — die
Reihenfolge IST die Kaskade. Sicher, weil keine der acht Dateien `@import` oder
`url()` benutzt; das Skript prueft das und bricht sonst ab. Die Quelldateien
bleiben die Wahrheit, `start-styles.css` ist reines Ergebnis und wird von
`check:start-styles` fail-closed gegen die Quellen verifiziert.

Bewusst NICHT gemacht: die 37 JavaScript-Module buendeln. Das braeuchte einen
Bundler (neue Abhaengigkeit, Build-Schritt, GitHub Actions sind verboten) — viel
Maschinerie fuer einen Teil des Gewinns. Vom Betreiber ausdruecklich
ausgeschlossen.

**Verschieben statt abschalten.** `public/deferred-start.js` wartet zwei
Bildwechsel (dann steht das Bild) und eine Leerlaufphase, dann laufen die
Startaufrufe. Bewusst **fail-safe statt fail-closed**: in einem unsichtbaren Tab
liefert der Browser keine Bildwechsel, dort greift nach 3 s ein Notausgang.
Fail-closed waere hier falsch — die Anmeldeanzeige bliebe in einem
Hintergrund-Tab dauerhaft leer.

`app.js` bleibt bei **exakt 1405 Zeilen**; die Ratchet-Baseline wurde nicht
angefasst. Elf Zeilen wurden durch zehn ersetzt, der Import kam als elfte dazu.

## Betroffene Dateien

| Datei | Art |
|---|---|
| `scripts/build/bundle-start-styles.mjs` | neu, 84 Zeilen, Buendel-Erzeuger + `--check` |
| `public/start-styles.css` | neu, erzeugt (58 KB aus 8 Quellen) |
| `public/deferred-start.js` | neu, 56 Zeilen |
| `public/index.html` | 8 Stylesheet-Links → 1 |
| `public/app.js` | Import + vier Startaufrufe verschoben, 1405 Zeilen unveraendert |
| `public/premium-surfaces.js` | `/api/health` verschoben |
| `public/sw.js` | v149 → v150, Buendel und Modul rein, 8 Einzeldateien raus |
| `tests/deferred-start.test.mjs` | neu, 8 Faelle |
| 5 bestehende Tests | auf die neue Struktur nachgezogen, Schutzabsicht erhalten |
| `scripts/check-guidelines.mjs` | erzeugtes Buendel von der 800-Zeilen-Regel ausgenommen |

Start-Lock nach der Aenderung neu eingefroren (31 Dateien,
2026-07-28T00:26:50.551Z). Aussehen, Aufbau und Eingabefeld unveraendert.

## Ergebnis — vorher/nachher, je 7 Laeufe, p75

| Phase | Messwert | vorher | nachher | Differenz |
|---|---|---|---|---|
| kalt | LCP | 1536 ms | **368 ms** | −1168 ms |
| kalt | FCP | 1536 ms | **368 ms** | −1168 ms |
| kalt | TTFB | 429 ms | 130 ms | −299 ms |
| kalt | Anfragen | 102 | 96 | −6 |
| warm | LCP | 284 ms | **168 ms** | −116 ms |
| warm | FCP | 284 ms | 168 ms | −116 ms |
| warm | TTFB | 173 ms | 65 ms | −108 ms |
| warm | Gewicht | 39 KB | 39 KB | 0 |

Kein Budget verletzt (`verstoesse: keine`). Benchmarks:
`docs/benchmarks/webvitals_vorher_2026-07-27.json` und `..._nachher_...json`.

**Ehrliche Einordnung:** Der LCP/FCP-Gewinn von ~1,17 s ist gross und deckt sich
mit sieben eingesparten Runden im kritischen Pfad — das ist der belastbare Teil.
Die TTFB-Verbesserung liegt dagegen im Bereich der Netzschwankung, die schon in
der Vormessung bei 48–775 ms lag; sie sollte nicht als Verdienst dieser
Aenderung verbucht werden.

## Architekturregel: belegt eingehalten

Headless gemessen, FCP gegen die Startzeiten aller API-Aufrufe:

- **Erstbesuch:** FCP 592 ms — **kein einziger** der neun API-Aufrufe davor.
- **Wiederbesuch:** FCP 128 ms — die fuenf verschobenen Aufrufe starten bei
  136 ms, also danach.

## Verifikation

| Check | Ergebnis |
|---|---|
| `check` (Syntax) | Exit 0 |
| `check:frontend` | 155/155 |
| `check:platform` | 7/7 |
| `check:guidelines` | OK — 832 Dateien |
| `check:favicon-lock` | OK |
| `check:start-lock` | OK nach dokumentiertem Neu-Einfrieren |
| `check:start-styles` | Buendel deckt sich mit den Quellen |
| `check:json`, `check:security`, `check:architecture` | OK |

Live-Klickpfad auf smejj.com (angemeldete Sitzung, Chrome): Startseite unveraendert
im Aussehen, Profil-Dock zeigt den angemeldeten Nutzer, Eingabe
"Regressionstest Ladezeit: antworte nur mit OK." → Antwort "OK". Keine
Konsolenfehler.

## Rollback

- Git-Tag `rollback/ladezeit-2026-07-27` (`5e18c42`)
- Dateikopien: `backups/rollback-ladezeit-2026-07-27/`
- Live-Rollback: `SmejjCom/smejj-app-frontend` auf `42cc6a8`
- Arbeits-Commit `33c3e26`, Live-Commit `9b3fceb`
- Start-Lock-Backup: `backups/start-design-lock/2026-07-28T00-26-50-551Z/`

## Neuer Befund — bewusst NICHT mit umgesetzt

Bei der Verifikation kamen **vier weitere** Startaufrufe zum Vorschein, die
vorher nicht bekannt waren und die diese Freigabe nicht nennt:

| Aufruf | Quelle | Datei gesperrt? |
|---|---|---|
| `/api/auth/me` (zweiter) | `public/account-sessions.js` | frei |
| `/api/keys` | `public/api-keys-surface.js` | frei |
| `/api/providers/cline/models` | `public/cline-model-menu.js` | **Start-Lock** |
| `/api/providers/cline/status` | `public/cline-model-menu.js` | **Start-Lock** |

Im Wiederbesuch startet der zweite `/api/auth/me` bei 117 ms und liegt damit
11 ms **vor** dem FCP. Die Architekturregel ist also noch nicht vollstaendig
erfuellt. Da eine der Quellen unter dem Start-Lock steht und die Freigabe diese
Dateien nicht nennt, wurde bewusst nichts davon angefasst — Scope-Treue vor
Vollstaendigkeit. Eigener Freigabetext liegt dem Betreiber vor.

## Qualitaetsbewertung

Ziel erreicht und mit Vorher/Nachher-Zahlen belegt. Die Aenderung ist
testgedeckt, rueckrollbar und beruehrt kein sichtbares Design. Offen bleibt der
oben benannte Rest des zweiten Befunds.
