# Freigabe-Nachweis — Control-Server-Release 2026-08-04 (Websuche: Markt und Suchbegriff)

Der Release-Builder schreibt in jedes Manifest `productionDeployAuthorized: false`
und `separateApprovalEvidenceRequired: true`. Die Freigabe wird deshalb hier
getrennt festgehalten, nicht im Artefakt.

## Wortlaut des Betreibers

Der Betreiber hat am 2026-08-04 einen konkreten Umsetzungsplan bekommen
(Stufe 1: Region und Sprache als Parameter; Stufe 2: Suchbegriff und Markt vom
Modell bestimmen lassen, Trefferadressen statt Portal-Startseiten) und darauf
geantwortet:

```
Ja,

... Nach der Umsetzung bitte live gehen, live testen und prüfen, ob alles
richtig funktioniert. Fehler sofort beheben und erneut testen, bis alles 100 %
sauber läuft.

Zum Schluss bitte 100 % Schutz aktivieren: nichts darf kaputtgehen, gelöscht
oder ohne meine schriftliche Freigabe geändert werden. Bestehende Funktionen,
Daten, Design, Einstellungen und Zugänge müssen sicher bleiben.
```

**Einordnung:** Das ist keine allgemeine Autonomie-Anweisung, sondern eine
ausdrueckliche schriftliche Freigabe fuer GENAU diese Aenderung — der Plan lag
vor der Zustimmung vor. Sie deckt ausschliesslich den hier beschriebenen
Release. Jeder weitere Produktions-Release braucht eine neue Freigabe.

## Was freigegeben wurde

| Feld | Wert |
|---|---|
| Artefakt | `smejj-control-websuche-region-2026-08-04.tar.gz` |
| sha256 | `dde66d533cd776c8f7d6ffbbc02ca37e1a9e635b963b8e093e8be30ba5671e08` |
| contentRootSha256 | `2bfd59e2c4258ef5a9c7bfb0e5357d1bcc057f48f5f3a051814cfd445cb8920c` |
| Dateien | 949 |
| Groesse | 2 127 020 Bytes |
| Geheimnisse enthalten | nein (`secretsIncluded: false`) |
| Quelle | Commit `d13e510` (sauberer `git archive`, siehe unten) |
| Ziel | Salad-Container `smejj-control` (redbean-caesar-…salad.cloud) |
| Kosten | keine neuen. Kein neuer Anbieter, kein neuer Dienst, kein Schluessel. |

## Warum aus einem sauberen Checkout gebaut wurde

Der Builder baut normalerweise aus der Arbeitskopie. Zum Bauzeitpunkt hatte eine
**Parallel-Sitzung** 20 Dateien in Release-Pfaden offen — `public/auth/auth-page.js`,
alle 14 Sprachdateien unter `public/i18n/`, `public/settings-surface.js` und die
LoRA-Trainer-Worker. Ein Bau aus der Arbeitskopie haette diese halbfertige
Fremdarbeit live gestellt; `tests/i18n-ui.test.mjs` schlug dadurch bereits fehl
(verwaister Uebersetzungsschluessel „Neues Passwort für smejj.com …").

Deshalb: `git archive d13e510 | tar -x` in ein Arbeitsverzeichnis, Bau von dort.
Das Artefakt enthaelt damit ausschliesslich committeten Stand.

## Vorpruefungen vor der Freigabe

| Pruefung | Ergebnis |
|---|---|
| `check` (Syntax, alle Module) | OK |
| `check:llm-router` | OK — 160 Tests, davon 23 neu |
| `check:rag` | OK |
| `check:guidelines` | OK — 1285 Dateien, `src/server.js` von 832 auf 781 Zeilen |
| `check:architecture` | OK |
| `check:security` | OK |
| `check:cost` | OK |
| `check:release-safety` | OK |
| `check:release-imports` | OK |
| `release:guard` | OK |
| `check:all` | **rot** — einzig `tests/i18n-ui.test.mjs`, Ursache ist die oben genannte Parallel-Sitzung, nicht dieser Release. Im Artefakt ist der Fehler nicht enthalten. |

## Rueckweg

Der Container zieht sein Artefakt ueber zwei Umgebungswerte. Zuruecksetzen
bedeutet, beide auf den Stand vor dem Release zu stellen:

| Variable | Wert vor dem Release |
|---|---|
| `SMEJJ_CONTROL_ARTIFACT_KEY` | `deployments/control/smejj-control-v104-stt-aus-2026-08-03.tar.gz` |
| `SMEJJ_CONTROL_ARTIFACT_SHA256` | `e6ffc14eff2e9966943212797be6f0dafbd9dcff8e9936ea327b766dbdfb5f52` |

Container-Version vor der Aenderung: **133**, Status `running`, 85 Variablen.
Vollstaendige Container-Beschreibung:
`backups/salad/smejj-control-2026-08-04-vor-websuche-region.json`
(nicht im Git — `.gitignore:21` deckt `backups/` ab, die Datei enthaelt Zugangsdaten).

Rueckrollen mit:

```
CONFIRM_CONTROL_ARTIFACT_SWITCH=YES \
SMEJJ_CONTROL_ARTIFACT_KEY=deployments/control/smejj-control-v104-stt-aus-2026-08-03.tar.gz \
SMEJJ_CONTROL_ARTIFACT_SHA256=e6ffc14eff2e9966943212797be6f0dafbd9dcff8e9936ea327b766dbdfb5f52 \
node scripts/deploy/set_control_artifact_env.mjs
```

## Abnahmekriterium

Gemessen wurde der Ist-Zustand VOR dem Release, live ueber `/api/search/web`:

| Frage | Treffer vorher | Befund |
|---|---|---|
| Schlagzeilen Berlin heute | 0 | — |
| Bitcoin Kurs | 8 | `coinmarketcap.com/es/` — spanisch statt deutsch |
| Öffnungszeiten Zoo Berlin | 0 | — |
| neueste Node.js Version | 0 | — |
| office space for sale San Jose | 8 | `office.com` / `microsoft.com` — thematisch komplett falsch |

Nach dem Release muss gelten:

1. `office space for sale San Jose` liefert **keine** microsoft.com-/office.com-Treffer
   mehr (lieber null Treffer als falsche).
2. `Bitcoin Kurs` liefert weiterhin Treffer, jetzt aber nicht mehr aus dem
   spanischen Markt (Non-Regression der einzigen bisher funktionierenden Frage).
3. Die Antwort enthaelt `region`, `source` und `attempts` — der Zustand jeder
   Suchquelle ist damit sichtbar.

Wird 1 oder 2 nicht erreicht, wird ohne Rueckfrage zurueckgerollt.

## Durchfuehrung und Ergebnis

Zwei Runden des Ship-Loops, beide live abgenommen.

### Runde 1 — Markt, Suchbegriff, Relevanz (Commit `d13e510`)

| Schritt | Ergebnis |
|---|---|
| Artefakt auf IDrive e2 | `created: true`, `immutable: true`, `contentVerified: true`, `overwriteProofStatus: 412` |
| Container `smejj-control` | Version 133 -> 134, alle 85 Variablen erhalten, `startup_probe` unveraendert |
| Neustart | ~70 s (18:05:26 alt, 18:06:33 neue Version) |

### Runde 2 — gesperrte Quellen beenden die Suche (Commit `3299067`)

Live-Befund nach Runde 1: Das Modell suchte jetzt korrekt im US-Markt mit
englischen Fachbegriffen, bekam aber von keiner Quelle etwas, formulierte immer
weiter um, verbrauchte alle drei Werkzeugrunden und **brach mitten im Satz ab**.

| Schritt | Ergebnis |
|---|---|
| Artefakt | `smejj-control-websuche-region-b-2026-08-04.tar.gz`, sha256 `7363d25dcbc5c064566fe577fedb74f22a81f089fecd61104477707b3d2503cc`, 951 Dateien, 2 145 846 Bytes |
| `check:all` vor dem Bau | **gruen**, 1473 Zusicherungen, 0 Fehler |
| Container | Version 134 -> 135, 85 Variablen erhalten |
| Neustart | ~80 s, danach vier Messungen in Folge HTTP 200 |

### Abnahme

| Kriterium | Ergebnis |
|---|---|
| 1. keine microsoft.com-Treffer mehr auf `office space for sale San Jose` | **bestanden** — 0 Treffer, Markt korrekt `us` |
| 2. `Bitcoin Kurs` weiterhin Treffer, nicht mehr spanisch | **bestanden** — 8 Treffer: `finanzen.net`, `coinmarketcap.com/de/`, `bisonapp.com` (vorher `coinmarketcap.com/es/`) |
| 3. `region`, `source`, `attempts` sichtbar | **bestanden** |
| 4. Antwort bricht nicht mehr mitten im Satz ab | **bestanden** (Runde 2) |

Ende-zu-Ende ueber die echte Nutzerkette (Bruecke -> Control -> Modell):

- „Was kostet ein Bitcoin aktuell in Euro?" -> 15,7 s, Antwort mit **deutscher**
  Quelle `finanzen.net` und klickbarem Link.
- Die Originalfrage des Betreibers (Buero im Silicon Valley) -> vollstaendige
  Antwort, benennt offen „Der Markt ‚us' lieferte in der Suche keine aktuellen
  Treffer", nennt LoopNet/Crexi mit konkreten Suchbegriffen, Entwicklernamen und
  eine Rueckfrage. **Kein deutsches Immobilienportal mehr.**

Ein Rueckrollen war nicht noetig. Der Rueckweg oben bleibt gueltig.

## Offener Blocker (Rote Liste — Entscheidung des Betreibers)

Die Diagnose macht sichtbar, was vorher unsichtbar war: **beide freien
Suchquellen antworten dem Rechenzentrum nicht mehr.**

| Quelle | Verhalten aus dem Salad-Container | belegt |
|---|---|---|
| `html.duckduckgo.com` | HTTP 202 mit Sperrseite | jede Messung |
| `lite.duckduckgo.com` | HTTP 202 mit Sperrseite | jede Messung |
| `www.bing.com` | HTTP 200 mit **absichtlichen Taeuschtreffern** | 5 von 6 Fragen |

Bing liefert auf „Schlagzeilen Berlin heute" brasilianische Motorrad-Preistabellen,
auf „Öffnungszeiten Zoo Berlin" die Tom-Hanks-Filmografie, auf „office … San Jose"
Microsoft-Office-Anmeldeseiten. Session-Cookies, `Referer` und ein sauberer
Browser-Kennstring aendern daran nichts — nachgemessen. Nur sehr haeufige,
generische Anfragen („Bitcoin Kurs") bekommen die echte Trefferliste.

Ebenfalls geprueft und ausgeschieden: Mojeek (leere Seiten), Marginalia (eigener
Nischenindex, fuer Angebote unbrauchbar), Brave HTML (erste Anfrage 200, zweite
429), acht oeffentliche SearXNG-Instanzen (429/403, JSON meist abgeschaltet).

**Folge:** Der Fix ist richtig und wirkt, aber ohne antwortende Quelle kann die
Suche keine Objektlinks liefern. Verlaessliche Websuche braucht eine Quelle mit
Schluessel (BYOK) — z. B. Brave Search API oder Tavily im Gratiskontingent.
Das ist ein **neuer Anbieter** und damit Rote Liste: es braucht eine getrennte
schriftliche Freigabe mit Dienst und Betrag, siehe
`docs/architecture/FREE_ONLY_MASTER_POLICY.md`.
