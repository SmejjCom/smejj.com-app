# Task Capsule — Werkzeugstrategie: die Suche liefert Attrappen (job_websuche_komposita_20260805)

## Auftrag
Betreiber, 2026-08-05: „Werkzeugstrategie angehen." Vorlauf: Der Werkzeug-Pfad
braucht rund 24–28 s; das Arbeitssignal macht die Wartezeit sichtbar, kürzt sie
aber nicht.

## Ergebnis in einem Satz
Der Engpass ist **nicht** die Werkzeugschleife und **nicht** der Relevanzfilter,
sondern die Suchquelle selbst: **Bing liefert dem Rechenzentrum in 7 von 12
Fällen absichtlich themenfremde Treffer**, DuckDuckGo sperrt vollständig. Der
Filter erkennt das korrekt und meldet ehrlich „nichts gefunden". Behebbar ist
das nur mit der bereits freigegebenen Quelle mit Schlüssel — dort fehlt **allein
der Schlüssel**, und den darf nur der Betreiber eingeben.

## Weg 1 verworfen: Parallelisierung der Werkzeuge
Die Werkzeuge einer Runde laufen in `toolLoop.js:177` streng nacheinander.
Nachgemessen fordert das Modell oft zwei auf einmal an, die zweite startet exakt
beim Ende der ersten (3151 → 3932 → 4471 ms). Parallelisieren spart aber nur
**0,2–1,4 s von 16 s**: die Aufteilung ist **~15 s Modellrunden gegen ~3,9 s
Werkzeuge**. Der Hebel liegt nicht dort. Die richtige Frage war: *warum braucht
es überhaupt drei Runden?*

## Weg 2: die richtige Frage — und eine falsche Antwort
Live gemessen (Frage: Einwohnerzahl Wien und Zürich):

| ms | Suche | Treffer |
|---|---|---|
| 4324 | Einwohnerzahl Wien 2024 | **0** |
| 6979 | Wien Bevölkerung 2024 | **0** |
| 9344 | Wien population | **6** |

Vier deutsche Suchen ins Leere, dann Sprachwechsel — rund 6 von 16 s verschenkt.

**Mein Schluss daraus war falsch.** Ich schloss auf den Relevanzfilter: er
verlangt bei ≥3 Suchbegriffen zwei wortgleiche Treffer, und „Einwohnerzahl"
steht nicht wortgleich in einem Text, der „Einwohner" schreibt. Die Erklärung
war plausibel, ließ sich am Filter reproduzieren — und war **nicht die
Ursache**. Ich habe sie ausgeliefert, bevor ich sie an echten Daten geprüft
hatte. Das ist die Reihenfolge, die falsch war.

## Was wirklich passiert — an den Rohdaten nachgesehen
Der neue Diagnoseblock `attempts` zeigte: `bing parsed 10, kept 0,
themenfremd`. Also **zehn** Treffer geliefert, alle verworfen. Statt dem Filter
zu misstrauen, habe ich die zehn Treffer ausgedruckt.

Bing liefert auf **„Einwohnerzahl Wien 2024"** zehn organische Treffer über
**Justin-Bieber-Songtexte auf Chinesisch** (zhidao.baidu.com, zhihu.com). Die
Seite selbst ist echt — Titel „Einwohnerzahl Wien 2024 - Search", das Suchfeld
enthält die Anfrage, `<li class="b_algo">` zehnmal wie immer. **Nur der Inhalt
ist Attrappe.** Bei Wiederholung kommt jedes Mal anderer Müll: Grafikkarten,
Altersrechner, Reddit-Rezepte, eine Asien-Landkarte.

**Der Filter hatte recht. Die Suchmaschine hat gelogen.**

Das war im Projekt bereits bekannt: der Kopf von `src/search/searchKeyProvider.js`
beschreibt seit dem 2026-08-04 exakt dieses Verhalten („HTTP 200 mit
ABSICHTLICHEN Taeuschtreffern"). **Ich habe eine gemessene, dokumentierte
Erkenntnis im Nachbarmodul übersehen und stattdessen neu geraten.**

## Die Messung, die zählt (12 realistische Fragen, Bing direkt)

| | Roh → behalten | Frage |
|---|---|---|
| ATTRAPPE | 10 → 0 | Einwohnerzahl Wien 2024 |
| ATTRAPPE | 7 → 0 | Wetter Berlin morgen |
| OK | 7 → 5 | Bundesliga Tabelle aktuell |
| ATTRAPPE | 10 → 0 | Zugverbindung München Hamburg |
| ATTRAPPE | 10 → 0 | Krankenversicherung Vergleich 2026 |
| ATTRAPPE | 7 → 0 | Schlagzeilen Deutschland heute |
| OK | 10 → 6 | Wien Bevölkerung |
| OK | 10 → 10 | Berlin Einwohner |
| ATTRAPPE | 9 → 0 | Zürich Einwohnerzahl |
| OK | 10 → 10 | population of Vienna |
| ATTRAPPE | 10 → 0 | current news Germany |
| OK | 10 → 1 | best restaurants Zurich |

**5 gut, 7 Attrappe.** Entscheidend: **„current news Germany" ist Englisch und
scheitert genauso.** Die Sprachthese ist damit widerlegt — es liegt an der IP,
nicht an der Anfrage.

Gegenprobe: Bings maschinenlesbare RSS-Ausgabe (`&format=rss`, kein neuer
Anbieter, kostenfrei) liefert **dieselben** Attrappen. Es ist nicht die
Darstellung, es ist die Adresse, von der gefragt wird.

## Was mit der ausgelieferten Änderung geschieht
`begriffTrifft` (Stammtreffer ab 8 Zeichen, 60 % des Wortes, mind. 6) ist live.
A/B an **identischen** Rohtreffern, neue Fassung gegen die echte Vorgängerfassung
aus `1ed22db~1`:

```
Frage                              roh  ALT  NEU
Einwohnerzahl Wien 2024             10    0    0
Wien Bevoelkerung                   10    6    6
Berlin Einwohner                    10   10   10
Zuerich Einwohnerzahl                9    0    0
Krankenversicherung Vergleich 2026  10    0    0
Bundesliga Tabelle aktuell           7    5    5
population of Vienna                10   10   10
Wetter Berlin morgen                 7    0    0
                       Unterschiede: 0 von 8
```

**Sie ändert an echtem Verkehr nachweislich nichts** — sie schadet auch nicht
(keine Attrappe kommt durch, die Mindestpunktzahl ist unangetastet, 4 neue Tests
grün, Gegenbeweis 3 rot). Ich habe sie **stehen lassen statt zurückzurollen**:
Ein Rückbau kostet einen weiteren Neustart des Control Servers, der die
Anmeldung trägt — realer Ausfall für null messbaren Gewinn. Die Entscheidung
gehört dem Betreiber; der Rückweg steht unten und ist jederzeit gangbar.

## Auslieferung — Control-Release (vollständig, sauber)
1. **Vorprüfung** `npm run release:preflight` Exit 0 (`check:all`,
   `check:release-imports` 183 Dateien, `release:guard`).
2. **Artefakt** `smejj-control-websuche-komposita-2026-08-05.tar.gz`,
   2 398 822 B, 1019 Dateien, `secretsIncluded: false`,
   sha256 `3ea6c65b692a015e5ea0aa02f4eac2cdf1b2a166a36f26b0af8de24ffbb08fb9`.
3. **IDrive e2** hochgeladen, `immutable`, `contentVerified`, Überschreibversuch
   würde mit 412 abgewiesen.
4. **Umschaltung** Version 142, **85 Variablen vorher wie nachher**.
5. **Ausrollen bestätigt**: Instanz `a95e0504…` meldet `version: 142`,
   `ready: true`, `state: running`. Der Neustart war ohne Ausfall — Salad
   ersetzt rollierend, `/api/health` blieb durchgehend 200.

Freigabe Wof Kadavanich, 2026-08-05, im Wortlaut:
> „Du darfst den Control Server neu ausliefern, damit der Websuche-Fix live
> geht: Release-Artefakt bauen, nach IDrive e2 laden, Container neu starten.
> Mir ist bewusst, dass der Control Server die Anmeldung trägt und während des
> Neustarts kurz nicht erreichbar ist. Danach live prüfen, ob die deutschen
> Suchen Treffer liefern. Bei Fehlverhalten sofort auf die vorige Fassung
> zurück und melden."

**Die verlangte Live-Prüfung ist erfolgt und ist negativ ausgegangen**: die
deutschen Suchen liefern weiterhin keine Treffer. Kein Fehlverhalten des
Servers — die neue Fassung läuft stabil, sie behebt das Problem nur nicht.
Deshalb **kein automatischer Rückbau**, sondern diese Meldung.

## ROLLBACK — gesichert und geprüft
```
SMEJJ_CONTROL_ARTIFACT_KEY    = deployments/control/smejj-control-sitzungen-180-tage-2026-08-05.tar.gz
SMEJJ_CONTROL_ARTIFACT_SHA256 = 20b799e9fa8044ea26ea9df674d43c6feef9bdf9da027012916f5c37dd0199c4
```
Rückweg: beide Werte mit `set_control_artifact_env.mjs` zurückschreiben.
App-Repo: Fix-Commit `1ed22db`, davor `11c4af8`.

## Der einzige echte Weg nach vorn — und er liegt beim Betreiber
Alles ist gebaut: `src/search/searchKeyProvider.js` (fail-closed, Monatsdeckel
900 von 1000), Verdrahtung in `webSearch.js:423`, Tests, Setzskript, sogar eine
Doppelklick-Datei `smejj.com Suchschluessel-eingeben.command`.

Live nachgesehen: von den **85** Umgebungsvariablen des Containers ist
**keine einzige** suchbezogen. `SMEJJ_SEARCH_TAVILY_API_KEY` ist **nicht
gesetzt** — deshalb greift die Absicherung nicht, wenn Bing täuscht.

Der Anbieter ist am 2026-08-04 schriftlich freigegeben („Ja, mach die Suchquelle
mit Schlüssel"), **0,00 USD, keine Zahlungsart hinterlegt**. Es fehlt nur der
Schlüssel selbst. **Ich gebe grundsätzlich keine API-Schlüssel ein** — das muss
der Betreiber tun, und das Skript zeigt ihn nie an und schreibt ihn nie ins
Protokoll.

## Was bewusst offen bleibt
- **Parallelisierung** der Werkzeuge: 0,2–1,4 s Gewinn, Eingriff in die
  Werkzeugschleife. Erst neu bewerten, wenn die Suche verlässlich ist — dann
  fallen Runden weg und die Rechnung ändert sich.
- **„Wetter Berlin morgen"**: Bing lieferte hier einen echten Wetterdienst, den
  der Filter verwarf (Titel enthält „Wetter", aber weder „Berlin" noch
  „morgen"). Ein möglicher echter Fehlalarm des Filters — nicht verfolgt, weil
  er im Rauschen der Attrappen nicht sauber messbar ist. Erst nach dem
  Schlüssel wieder aufnehmen.

## Merkregel
**Erst die Rohdaten ansehen, dann die Erklärung bauen.** Ich hatte eine
plausible Theorie am Filter reproduziert und ausgeliefert, ohne einmal
auszudrucken, was die Suchmaschine tatsächlich zurückgibt. Ein einziger
Ausdruck von zehn Zeilen hätte den Umweg erspart — und die Antwort stand
zusätzlich schon im Kopf der Nachbardatei.
