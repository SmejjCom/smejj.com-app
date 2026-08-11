# Freigabe-Nachweis — Suchquelle mit Schluessel (Tavily), 2026-08-04

Ein neuer Anbieter steht auf der Roten Liste und braucht eine getrennt
festgehaltene schriftliche Freigabe mit Dienst und Betrag. Sie wird hier
festgehalten. Policy-Eintrag: `docs/architecture/FREE_ONLY_MASTER_POLICY.md`,
Ausnahme 3.

## Wortlaut des Betreibers

Dem Betreiber wurde am 2026-08-04 der gemessene Befund vorgelegt (beide freien
Suchquellen antworten dem Rechenzentrum nicht mehr) samt der Feststellung, dass
verlaessliche Websuche eine Quelle mit Schluessel braucht und das Rote Liste ist.
Antwort:

```
Ja, mach die Suchquelle mit Schlüssel
```

## Was freigegeben wurde

| Feld | Wert |
|---|---|
| Dienst | Tavily Search API, `https://api.tavily.com/search` |
| Tarif | Gratiskontingent, 1000 API-Credits pro Monat |
| **Betrag** | **0,00 USD** |
| Zahlungsart | **keine hinterlegt** — Tavily verlangt fuer das Gratiskontingent keine Karte |
| Konto | wird vom Betreiber angelegt; die Sitzung sieht den Schluessel nie |
| Variable | `SMEJJ_SEARCH_TAVILY_API_KEY` im Salad-Container `smejj-control` |

## Warum Tavily und nicht Brave

Konditionen am 2026-08-04 geprueft:

| Anbieter | Gratis | Karte | Urteil |
|---|---|---|---|
| Brave Search API | **im Februar 2026 abgeschafft** | ja, metered | echte Kostenposition — ausgeschieden |
| Google Custom Search | 100/Tag | nein | **fuer Neukunden geschlossen, Abschaltung 2027-01-01** — ausgeschieden |
| Tavily | 1000 Credits/Monat | **nein** | gewaehlt |
| Mojeek | frei | nein | liefert leere Seiten — ausgeschieden |
| Marginalia | frei | nein | Nischenindex, fuer Angebote unbrauchbar — ausgeschieden |
| oeffentliche SearXNG (8 Instanzen) | frei | nein | 429/403, JSON meist abgeschaltet — ausgeschieden |

## Kostenschutz, doppelt

1. **Keine Zahlungsart beim Anbieter.** Ohne Karte kann dort nichts abgerechnet
   werden. Das ist die eigentliche Garantie, nicht der Code.
2. **Monatsdeckel im Code.** `SMEJJ_SEARCH_API_MONTHLY_MAX`, Standard 900 von
   1000. Der Deckel greift VOR dem Aufruf. `search_depth: "basic"` kostet
   1 Credit statt 2. Der Zaehler liegt im Arbeitsspeicher und faellt beim
   Neustart zurueck — er ist bewusst die ZWEITE Linie.

Fail-closed: Ohne Schluessel findet kein einziger Netzaufruf dorthin statt.

## Auslieferung

| Schritt | Ergebnis |
|---|---|
| Artefakt | `smejj-control-suchschluessel-2026-08-04.tar.gz`, sha256 `e785a51379d1294c7c8f8540ee2c7cd252e62647a0e460e8b0ca55435ec86513`, 958 Dateien, 2 207 092 Bytes, `secretsIncluded: false` |
| Quelle | Commit `c2dfbab`, sauberer `git archive` (keine Fremdarbeit) |
| IDrive e2 | `created: true`, `immutable: true`, `contentVerified: true`, `overwriteProofStatus: 412` |
| Container | Version 135 -> 136, 85 Variablen erhalten |
| `check:all` | gruen, 1512 Zusicherungen |

## Rueckweg

| Variable | Wert vor dem Release |
|---|---|
| `SMEJJ_CONTROL_ARTIFACT_KEY` | `deployments/control/smejj-control-websuche-region-b-2026-08-04.tar.gz` |
| `SMEJJ_CONTROL_ARTIFACT_SHA256` | `7363d25dcbc5c064566fe577fedb74f22a81f089fecd61104477707b3d2503cc` |

Container-Beschreibung vorher: `backups/salad/smejj-control-2026-08-04-vor-suchschluessel.json`
(nicht im Git). Den Schluessel allein wieder entfernen:

```
CONFIRM_SEARCH_KEY=YES SMEJJ_SEARCH_KEY_REMOVE=YES node scripts/deploy/set_search_api_key.mjs
```

## Abnahme ohne Schluessel (Non-Regression)

Der Schluessel liegt noch nicht vor — geprueft wurde deshalb, dass sich ohne ihn
NICHTS aendert:

- `/api/health` -> `suchquelle: {konfiguriert: false, verbraucht: 0, deckel: 900}`
- `/api/search/web?q=Bitcoin Kurs` -> 8 Treffer aus `duckduckgo-html`,
  `finanzen.net` und `coinmarketcap.com/de/`
- `/api/search/web?q=office space for sale San Jose` -> 8 Treffer,
  `loopnet.com`, `crexi.com`, `realmo.com`

Bemerkenswert: DuckDuckGo antwortet inzwischen wieder. Die Sperre vom selben Tag
war zeitweilig, nicht dauerhaft. Damit ist die Schluesselquelle **kein Ersatz,
sondern eine Absicherung**: Sie nimmt der Suche die Abhaengigkeit davon, ob
DuckDuckGo gerade antwortet.

## Was der Betreiber noch tun muss

Doppelklick auf `smejj.com Suchschluessel-setzen.command`. Die Datei erklaert den
Weg zum Schluessel, prueft das Format, schreibt genau einen Wert und wartet auf
den Neustart. Sie zeigt den Schluessel nie an.
