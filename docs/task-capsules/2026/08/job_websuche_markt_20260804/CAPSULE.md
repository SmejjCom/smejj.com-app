# job_websuche_markt_20260804 — die Websuche sucht im richtigen Markt

## Ziel

Betreiber-Befund vom 2026-08-04: Auf die Frage „ich suche eine buroe: 1 oder 2
Zimmer in Eine Neue Buorohaus, in Silikon Valley zum kaufen" antwortete smejj.com
mit **ImmobilienScout24 und immobilo.de**. Auf den Hinweis „wir sind in Amerika"
nannte die Antwort nur Portal-Startseiten, keine anklickbaren Objekte, und der
Knopf „Autonomer Lauf" wechselte die Ansicht.

Freigegeben wurden zwei Stufen:
1. Region und Sprache als Parameter statt fest im Code.
2. Suchbegriff und Markt bestimmt das Modell, Trefferadressen statt Startseiten.

## Ausgangslage, live gemessen VOR der Aenderung

`/api/search/web` auf dem Control Server:

| Frage | Treffer | Befund |
|---|---|---|
| Schlagzeilen Berlin heute | 0 | — |
| Bitcoin Kurs | 8 | `coinmarketcap.com/es/` — spanisch |
| Wetter Hamburg morgen | 0 | (laeuft ohnehin ueber Open-Meteo) |
| Öffnungszeiten Zoo Berlin | 0 | — |
| neueste Node.js Version | 0 | — |
| office space for sale San Jose | 8 | `office.com`/`microsoft.com` — falsch |
| ganzer Fragesatz des Betreibers | 0 | — |

Die Suche war also nicht „bei dieser einen Frage" kaputt, sondern grundsaetzlich.

## Vier Ursachen, jede einzeln reproduziert

1. **Der Markt stand dreifach fest im Code.** `kl=de-de` an DuckDuckGo,
   `setlang=de` an Bing, `Accept-Language: de,en;q=0.8` im Kopf. Die Sprache des
   Fragenden bestimmte den Markt, obwohl der Markt in der Frage stand.
   `lite.duckduckgo.com` bekam ueberhaupt keinen Regionsparameter und antwortete
   damit nach der IP des Servers — daher spanische Treffer aus einem
   Rechenzentrum.

2. **Der rohe Fragesatz war der Suchbegriff.** `buildWebContextBlock(task, …)`
   reichte den kompletten Satz samt „Kannst du mir finden" an die Suchmaschine.
   Live gemessen: 0 Treffer. Die Suche war nicht gescheitert — sie war nie
   gestellt worden.

3. **Ein einziges gemeinsames Wort galt als Relevanzbeleg.** Auf „office condo
   for sale San Jose CA" kamen acht `microsoft.com`-Seiten auf Spanisch durch,
   weil „office" vorkam. Der Filter von 2026-07-29 war zu grob.

4. **Ein Fehlschlag sah aus wie ein leeres Ergebnis.** Gesperrte Suchmaschinen,
   themenfremde Antworten und „nichts gefunden" waren von aussen nicht zu
   unterscheiden — auch nicht in den Logs.

## Umsetzung

**NEU `src/search/searchRegion.js`** (209 Zeilen): `detectSearchRegion` erkennt
den Markt am Ortsbezug (17 Maerkte). Bei zwei Orten gewinnt der **zuletzt**
genannte — „Flug von Berlin nach New York" nennt das Ziel hinten.
`buildSearchQuery` macht aus dem Satz Stichworte, fail-safe: es kommt nie ein
leerer Suchbegriff heraus. Ohne Ortsbezug bleibt es beim bisherigen `de`.

**`src/search/webSearch.js`**: `searchWeb(query, {limit, region})` reicht den
Markt an **alle drei** Quellen durch. `searchWebDetailed` liefert zusaetzlich
Quelle und Zustand jedes Versuchs; `looksBlocked` erkennt Sperrseiten. Der Markt
gehoert in den Cache-Schluessel, sonst vermischen sich die Maerkte.
`resultsLookRelevant`: ab drei pruefbaren Begriffen muessen zwei davon in
DEMSELBEN Treffer stehen (bei ein bis zwei Begriffen bleibt es bei einem, sonst
faellt „Zoo Berlin" durch).

**NEU `src/search/webSearchRoute.js`** (85 Zeilen): HTTP-Seite der Suche.
`src/server.js` stand exakt auf der 800-Zeilen-Grenze und waere durch die
Aenderung auf 832 gewachsen — jetzt 781.

**`control-server/src/llm/toolLoop.js`**: `web_suche` nimmt `region` entgegen.
Die Beschreibung sagt ausdruecklich „Sprache und Markt des ZIELS, nicht der
Frage". Werkzeugergebnis und System-Anweisung fordern die vollstaendigen
Trefferadressen — der Nutzer bekam vorher nur Portal-Startseiten.
Sind ALLE Quellen gesperrt, weist das Werkzeugergebnis das Modell an, **nicht**
erneut zu suchen, sondern die Lage zu erklaeren.

**Tests**: `tests/websuche-region.test.mjs`, 23 Faelle. Dabei aufgefallen:
`src/search/webSearch.test.js` lief in **keinem** npm-Skript — jetzt beide in
`check:llm-router` (160 -> 163 Tests).

## Ergebnis, live gemessen NACH der Aenderung

| Kriterium | vorher | nachher |
|---|---|---|
| `office space for sale San Jose` | 8 microsoft.com-Treffer | 0 Treffer, Markt `us` |
| `Bitcoin Kurs` | `coinmarketcap.com/es/` | `finanzen.net`, `coinmarketcap.com/de/` |
| Quellenzustand sichtbar | nein | `region`, `source`, `attempts` |
| Antwort auf die Originalfrage | deutsche Immobilienportale | US-Markt, ehrlich, mit LoopNet/Crexi und Suchbegriffen |

Ende-zu-Ende ueber die echte Nutzerkette: „Was kostet ein Bitcoin in Euro?"
15,7 s, Antwort mit deutscher Quelle `finanzen.net` und klickbarem Link.

## Zwei Runden Ship-Loop

**Runde 1** (`d13e510`, Artefakt `…-2026-08-04.tar.gz`, Container 133 -> 134):
Markt und Suchbegriff korrekt — aber das Modell suchte bei leeren Ergebnissen
immer weiter, verbrauchte alle drei Werkzeugrunden und **brach mitten im Satz
ab**. Genau das Bild, das der Betreiber als „dann denkt man, es hat aufgehoert"
beschrieben hatte.

**Runde 2** (`3299067`, Artefakt `…-b-2026-08-04.tar.gz`, Container 134 -> 135):
Gesperrte Quellen beenden die Suche. Antwort seitdem vollstaendig.

Freigabe-Nachweis und Rueckweg:
`docs/approvals/2026-08-04-control-release-websuche-region.md`.

## Merkregeln (teuer erkauft)

- **EIN FESTVERDRAHTETER SPRACHKOPF IST EINE MARKTENTSCHEIDUNG.** `Accept-Language`
  und `kl=`/`setlang=` sehen aus wie Darstellungsdetails. Sie bestimmen, WELCHE
  Welt die Suchmaschine zeigt. Wer sie fest verdrahtet, verdrahtet den Markt fest.
- **EIN FEHLENDER PARAMETER IST SCHLIMMER ALS EIN FALSCHER.** `lite.duckduckgo.com`
  hatte gar keine Region und antwortete nach der Server-IP. Bei drei Quellen muss
  JEDE den Parameter bekommen — eine ohne faellt nur im Rechenzentrum auf.
- **EIN GANZER SATZ IST KEINE SUCHANFRAGE.** Der Weg vom Nutzertext zum
  Suchbegriff ist ein eigener Schritt. Fehlt er, sieht eine nie gestellte Suche
  wie eine gescheiterte aus.
- **EIN WORT IST KEIN BELEG.** Ein Relevanzfilter, der einen Treffer bei einer
  einzigen Wortuebereinstimmung durchlaesst, laesst bei mehrwortigen Fachfragen
  fast alles durch — und verdeckt damit, dass die Quelle tot ist.
- **EIN SCHWACHER FILTER VERSTECKT EINEN TOTEN DIENST.** Erst der schaerfere
  Filter machte sichtbar, dass beide Suchmaschinen seit laengerem nichts
  Brauchbares liefern. Vorher sah eine kaputte Suche aus wie eine funktionierende.
- **AUS DER ARBEITSKOPIE BAUEN IST GEFAEHRLICH.** Der Release-Builder nimmt die
  Arbeitskopie. Zum Bauzeitpunkt hatte eine Parallel-Sitzung 20 Dateien in
  Release-Pfaden offen (Auth-Seiten, 14 Sprachdateien). Das erste Artefakt haette
  halbfertige Fremdarbeit live gestellt. Weg: `git archive <commit> | tar -x` in
  ein Arbeitsverzeichnis, `buildControlReleaseArtifact({ rootDir })` von dort.
- **HTTP 200 HEISST NICHT „ANTWORT".** Bing liefert erkannten Automaten
  absichtliche Taeuschtreffer: brasilianische Motorrad-Preistabellen auf
  „Schlagzeilen Berlin", Tom-Hanks-Filmografie auf „Öffnungszeiten Zoo Berlin".
  Cookies, `Referer` und ein sauberer Browser-Kennstring aendern nichts.

## Offen — Rote Liste, Entscheidung des Betreibers

Beide freien Quellen antworten dem Rechenzentrum nicht mehr:
DuckDuckGo HTTP 202 mit Sperrseite (jede Messung), Bing Taeuschtreffer
(5 von 6 Fragen). Geprueft und ausgeschieden: Mojeek (leer), Marginalia
(Nischenindex), Brave HTML (zweite Anfrage 429), acht oeffentliche
SearXNG-Instanzen (429/403).

Verlaessliche Websuche braucht eine Quelle mit Schluessel (BYOK), z. B. Brave
Search API oder Tavily im Gratiskontingent. Neuer Anbieter = Rote Liste, es
braucht eine getrennte schriftliche Freigabe mit Dienst und Betrag.

Ebenfalls offen, weil nicht freigegeben (Stufen 3 und 4 des Plans): sichtbarer
Suchfortschritt in der Oberflaeche und der autonome Lauf als Karte im
Gespraechsfaden statt Ansichtswechsel.

## Nachtrag 2026-08-04, A-bis-Z-Durchlauf: der blinde Passagier

Beim Livetest fiel auf: Auf `commercial office for sale Santa Clara` lieferte
Bing acht Treffer — LoopNet und Crexi (richtig), aber auch das
Merriam-Webster-Woerterbuch, das Cambridge Dictionary und eine TV-Werbeseite.
**Alle acht gingen ans Modell.**

Die Ursache war nicht der Schwellwert, den ich vormittags geschaerft hatte,
sondern die **Bauart**: `resultsLookRelevant` war ein Tor fuer die GANZE Liste
(`results.some`). Ein einziger guter Treffer machte sie gueltig — und der Muell
fuhr als blinder Passagier mit.

NEU `relevanteTreffer` prueft jeden Eintrag EINZELN. Das Tor bleibt unveraendert
(eine Quelle mit mindestens einem passenden Treffer gilt weiter als brauchbar),
nur was danach weitergereicht wird, ist gefiltert. Die Diagnose nennt es mit:
`attempts[].kept` neben `parsed`.

**MERKREGEL: Ein Filter, der die Liste als Ganzes bewertet, ist kein Filter,
sondern ein Tor. Wer Muell aussortieren will, muss jeden Eintrag einzeln
ansehen.**

Live belegt (Control 138): `geparst=10 behalten=3` — nur LoopNet und Crexi
bleiben. Gegenprobe ueber sechs Fragen ohne Verlust; `neueste Node.js Version`
liefert seitdem sogar 3 Treffer statt 0.
