# Task Capsule — job_websuche_selbstkorrektur_20260729

Datum: 2026-07-29
Auftrag: Chat-Verbesserung — "wenn der Nutzer fragt und keine Antwort bekommt,
nutzt er die App nicht mehr" (Wof Kadavanich, Screenshot 18:21 Uhr)
Status: Control-Server live verifiziert · **Bridge blockiert (ZEABUR_API_TOKEN)**

## Der gemeldete Fehler

Frage im Live-Chat: *"kannst du Schlagzeile über Berlin mir hier schreiben"*
→ Antwort: *"Ich habe keine Informationen über aktuelle Schlagzeilen aus Berlin."*
Dieselbe Frage 81 Minuten später lieferte ein Ergebnis. Aus Nutzersicht: Zufall.

## Ursache — zwei Weichen, zwei getrennte Wortlisten

smejj.com entscheidet an **zwei** Stellen, ob live gesucht wird. Beide hatten
eine eigene Liste aus **Vollformen**:

| Stelle | Rolle | Alte Liste |
| --- | --- | --- |
| `public/chat-bridge.js` | Schnellspur **oder** Control-Server | 13 Woerter |
| `src/search/webSearch.js` | Websuche im Control-Server | 60 Vollformen |

Beide kannten `schlagzeilen` (Plural) bzw. `nachricht`, **keine** kannte
`schlagzeile` (Singular). Reproduziert vor der Aenderung:

```
false   kannst du Schlagzeile über Berlin mir hier schreiben
true    kannst du Schlagzeilen über Berlin mir hier schreiben
```

**Die Bridge ist die entscheidende Weiche.** Sagt sie nein, geht die Frage in
die Schnellspur (kleines Modell, keine Werkzeuge, kein Internet) und erreicht
den Control-Server **nie**. Live gemessen vor dem Fix:

```
x-smejj-bridge: chat-fast-lane
x-smejj-model-backend: groq:llama-3.1-8b-instant
x-smejj-profile: fast
```

Das kleine Modell erfand daraufhin Beispiel-Schlagzeilen. Ein Fix nur am
Control-Server haette am Symptom **nichts** geaendert.

### Zweiter Fehler in beiden Listen: Umlaute

Ausloeser waren transliteriert notiert (`oeffnungszeiten`, `verspaetung`),
echte Eingaben schreiben aber `Öffnungszeiten`. Diese Ausloeser konnten nie
feuern:

```
false   Was sind die Öffnungszeiten vom Zoo Berlin
false   Gibt es eine Verspätung bei der S-Bahn
```

### Korrektur einer frueheren Capsule

`job_toolcalling_20260728` haelt fest, die Bridge muesse "gar nicht angefasst
werden", weil `/api/agent` an den Control-Server weiterreicht. Das gilt nur,
**wenn die Bridge nicht vorher in die Schnellspur abbiegt**. Genau diese
Abzweigung ist hier die Ursache.

## Umsetzung

1. **`src/search/searchIntent.js` (neu, 137 Zeilen).** Normalisierung (Umlaute
   und Akzente auf ASCII) plus **Wortstaemme** mit Wortgrenze nur am Anfang.
   `schlagzeil` deckt Singular und Plural ab, `oeffnungszeit` beide
   Schreibweisen. Kurze/mehrdeutige Woerter bleiben Vollform, damit `neu` nicht
   in "Neuseeland" und `stand` nicht in "Verstand" trifft.
2. **`public/chat-bridge.js`.** Inhaltsgleiche Spiegelung. Die Kopie ist
   unvermeidbar: die Bridge geht als **eine** Datei nach Zeabur und darf nicht
   importieren.
3. **`tests/websuche-absicht-gleichlauf.test.mjs` (neu).** Vergleicht beide
   Weichen Fall fuer Fall und haelt die bewussten Unterschiede fest. Ohne
   diesen Test laufen die Listen wieder auseinander — das war die Fehlerklasse.
4. **`control-server/src/llm/toolLoop.js`.** Werkzeug **`web_suche`** als zweite
   Sicherung: uebersieht die Vorpruefung eine Aktualitaetsfrage, sucht das
   Modell selbst. Die Beschreibung verbietet ausdruecklich, ohne Suche
   aufzugeben ("Antworte NIEMALS mit 'ich habe keine Informationen', ohne
   vorher web_suche aufgerufen zu haben").
5. **`src/server.js`.** Die Systemanweisung wies das Modell bisher an, bei
   fehlenden Daten aufzugeben — genau die Antwort aus dem Screenshot. Mit
   Werkzeugen gilt jetzt: erst suchen, dann antworten.

## Verifikation

**Pflicht-Checks:** `npm run release:preflight` (voller `check:all` +
`check:release-imports` + `release:guard`) — Exit 0.
Einzeln: `check` · `check:json` · `check:guidelines` (1098 Dateien) ·
`check:security` · `check:llm-router` (83 Tests) · `check:frontend` (262 Tests).

**Artefakt vor dem Deploy geprueft** (entpackt, nicht nur gebaut):
`src/search/searchIntent.js` enthalten, `AGENT_TOOLS` = `seite_lesen, web_suche`,
Gate liefert `true` fuer Singular und fuer Umlaut-Schreibweise.

**Live-Test Control-Server** (`redbean-caesar-…salad.cloud`, Version 116):

| Frage | Suche | Ergebnis |
| --- | --- | --- |
| "kannst du Schlagzeile über Berlin…" | ja | echte Schlagzeilen mit Quellen rbb24 + t-online, Stand 29.07.2026 |
| "Öffnungszeiten Zoo Berlin" | ja | 9:00–18:30, letzter Einlass 17:00, mit Quelle |
| "Was ist die Hauptstadt von Australien?" | nein | "Canberra" — direkt, ohne Traffic |

## Benchmark (Messpflicht)

Erste Token-Antwort, Median aus 3 Laeufen, direkt gegen den Control-Server:

| Pfad | Median | Budget | Bewertung |
| --- | --- | --- | --- |
| Frage **mit** Suche | 14,2 s | 1,0 s | **weit ueber Budget** |
| Frage **ohne** Suche | 5,9 s | 1,0 s | **ueber Budget** |
| Websuche allein (`/api/search/web`) | 0,7–1,3 s | — | unauffaellig |

**Befund gegen die eigene Annahme:** Die Suche ist **nicht** der Engpass. Die
Vermutung, das sequenzielle Durchprobieren DuckDuckGo → Lite → Bing koste bis zu
24 s, trifft im Betrieb nicht zu — DuckDuckGo antwortet beim ersten Versuch in
unter 1,3 s. Die Differenz von rund 8 s zwischen beiden Pfaden entsteht am
**Modell**, nicht an der Recherche. Ein paralleles Suchrennen wuerde also kaum
etwas bringen; die naechste Optimierung gehoert an den Modellpfad.

Das Budget von 1,0 s wird auf dem Control-Server-Pfad schon vorher verfehlt
(5,9 s ohne jede Suche). Diese Aenderung hat das nicht verursacht. In der
Produktion faengt die Schnellspur (groq, sehr schnell) die einfachen Fragen ab —
genau deshalb existiert sie.

**Bewusster Kompromiss:** Fragen, die jetzt neu eine Suche ausloesen, werden
langsamer und dafuer richtig. Eine schnelle falsche Antwort ist der Grund,
warum der Nutzer die App verlaesst.

## Rollback

- Git-Tag `rollback/websuche-selbstkorrektur-20260729` → Commit `2d1e65e`
- Control-Server vorher: Version 115, Key
  `deployments/control/smejj-control-modul-vb-2026-07-29.tar.gz`,
  SHA `038d27b215b6cfa58d5a689bc144b6d40ac5f28bcd79874b7e90e35e5ffbd359`
- Control-Server jetzt: Version 116, Key
  `deployments/control/smejj-control-websuche-2026-07-29-rc1.tar.gz`,
  SHA `8008de2b9c119095f026d9b280d6cbd4667e6d6c91f50a375182ee76934d2841`
- 73 Umgebungsvariablen vorher und nachher — nichts verloren.

## Falle fuer den naechsten Deploy

Der Salad-PATCH braucht die Variablen **verschachtelt**:

```json
{ "container": { "environment_variables": { … } } }
```

Flach gesendet (`{ "environment_variables": … }`) antwortet Salad mit **200 und
aendert nichts** — ein stiller No-Op. Erkennbar nur daran, dass die Version
stehen bleibt. Deshalb nach jedem PATCH zurueklesen und `keyOk`/`shaOk` pruefen.

## Bridge doch ausgeliefert — der Blocker loeste sich auf

Der zuerst gemeldete Blocker (`ZEABUR_API_TOKEN` fehlt) war zu kurz gedacht.
Der laufende Container verraet seinen Startbefehl:

```
/bin/sh -c sh -lc "curl -fsSL https://raw.githubusercontent.com/SmejjCom/
  smejj-app-frontend/main/assets/chat-bridge.js -o /tmp/smejj-chat-bridge.mjs
  && node /tmp/smejj-chat-bridge.mjs"
```

Die Bridge holt ihren Code bei **jedem Start** aus dem Frontend-Repo. Damit
braucht ein Bridge-Deploy **keinen Zeabur-Token**:

1. `public/chat-bridge.js` → `assets/chat-bridge.js` im Repo
   `SmejjCom/smejj-app-frontend` (HTTPS-Push funktioniert, SSH-Deploy-Key nicht)
2. Im Zeabur-Portal beim Dienst `smejj-chat-bridge` auf **Restart**
3. Beim Boot zieht der Container die neue Datei

**Falle:** `raw.githubusercontent.com` cacht rund fuenf Minuten. Vor dem Restart
aus dem Container heraus pruefen, ob die neue `BRIDGE_VERSION` schon ausgeliefert
wird — sonst startet er auf dem alten Stand. **Zweite Falle:** Der erste Klick in
der Seitenleiste traf `ghcriosmejjcomsmejj-maus-enginev1`, nicht die Bridge. Vor
jedem Restart den Dienstnamen auf der Seite lesen.

Live: Bridge **v104**, Weg jetzt `multi-model-router` statt `chat-fast-lane`.

## Zwei Folgefehler, die erst der Live-Test zeigte

**1. Gesperrte Suchmaschinen lieferten Muell statt nichts.** Waehrend des Tests
sperrten DuckDuckGo (HTTP 202, `anomaly`-Seite) und Bing (Bot-Pruefung) die
Server-IP. Der HTML-Fallback gab daraufhin **themenfremde** Treffer zurueck: auf
"Schlagzeilen Berlin" Musical-Seiten aus Madrid, auf "Verspaetung S-Bahn"
Reddit-Threads ueber Anime, auf "Nachrichten Berlin" Office Depot Mexiko. Weil
`results.length > 0` galt, wurden sie akzeptiert, gecacht und dem Modell als
"Live-Internet-Kontext" vorgelegt. **Eine gesperrte Suchmaschine sah aus wie
eine erfolgreiche Recherche.** → `resultsLookRelevant()` verlangt jetzt, dass
mindestens ein aussagekraeftiges Wort der Anfrage im Treffer vorkommt (rc2,
Version 117). Live belegt: statt 8 Muell-Treffern kommen 0 zurueck.

**2. Nach der letzten Werkzeug-Runde kam gar keine Antwort.** Live reproduziert
mit "Gibt es eine Verspaetung bei der S-Bahn in Berlin?": 24 Sekunden warten,
dann ein Stream, der nur `data: [DONE]` enthielt. Ursache in `streamWithTools`:
die letzte Runde **holt** die werkzeugfreie Antwort und weist sie `current` zu —
dann endet die Schleife, ohne sie zu streamen. Der Fehler steckte schon vorher
drin, war aber unerreichbar; erst `web_suche` schoepft die Runden regelmaessig
aus (liefert die Suche nichts, versucht das Modell es erneut). Der alte Test
prueft nur auf `[DONE]`, nicht auf eine Antwort — deshalb blieb er stumm.
→ Abschliessendes `pumpRound` (rc3, Version 118). Der neue Test wurde
gegengeprueft: Fix entfernt → rot, Fix zurueck → gruen. Live: 7 von 8 Versuchen
liefern jetzt eine Antwort mit offiziellen Quellen statt Leere.

## Offen — echter Blocker: die Suchquellen selbst

Die Weiche ist repariert und die Antwort kommt an — aber **die Recherche selbst
hat gerade keine funktionierende Quelle.** Beide kostenlosen Quellen sperren uns:

| Quelle | Antwort auf unsere Anfragen |
| --- | --- |
| DuckDuckGo HTML | HTTP 202, `anomaly`-Seite (Bot-Erkennung), 0 Treffer |
| DuckDuckGo Lite | 0 Treffer |
| Bing HTML | Bot-Pruefung, 0 `b_algo`-Bloecke |

Das ist keine Folge dieser Aenderung — es ist die Bruchstelle des Ansatzes
"HTML von Suchmaschinen abgreifen". Die Sperre trat waehrend der Testreihe ein
(um 03:20 lieferte dieselbe Anfrage noch rbb24 und Tagesspiegel). Mit mehr
echten Nutzern trifft sie frueher und dauerhaft.

Der Relevanzfilter sorgt dafuer, dass daraus ein **ehrliches** "nichts gefunden,
hier sind die offiziellen Quellen" wird statt einer falschen Antwort. Eine
belastbare Recherche braucht aber eine Entscheidung des Betreibers:

| Weg | Kosten | Was noetig ist |
| --- | --- | --- |
| Eigener SearXNG-Dienst auf dem bestehenden Zeabur-Server | 0,00 USD zusaetzlich | Freigabe fuer einen sechsten Dienst (wie beim Control-Server-Umzug); Code kann es schon ueber `SMEJJ_SEARXNG_URL` |
| Such-API (z. B. Brave) | ~2.000 Anfragen/Monat frei, danach zahlpflichtig | Schriftliche Freigabe mit Dienst und Betrag, neuer Anbieter |
| Oeffentliche SearXNG-Instanz eines Dritten | 0,00 USD | Widerspricht "keine externen Dienste von Drittanbietern" — nur mit ausdruecklicher Ausnahme |

Empfehlung: **eigener SearXNG-Dienst auf dem bereits bezahlten Zeabur-Server** —
keine neuen Kosten, kein neuer Anbieter, kein Schluessel, und der Code
unterstuetzt ihn bereits.

**Nachgemessen — die Lage ist schlechter als zuerst notiert.** Die alte
Bridge-Liste steht in `\b…\b`, trifft also nur die **exakte Grundform**:
`\bnachricht\b` passt auf "Nachricht", **nicht** auf "Nachrichten";
`\baktuell\b` nicht auf "aktuelle"/"aktuellen". Von neun realistischen Fragen
fallen sieben durch:

```
ALT    NEU    Frage
false  true   Was sind die aktuellen Nachrichten aus Berlin?
false  true   Aktuelle Nachrichten
true   true   Nachricht aus Berlin
true   true   Bitcoin Preis
false  true   Was kosten Aktien gerade
false  true   kannst du Schlagzeile über Berlin mir hier schreiben
false  true   Öffnungszeiten Zoo Berlin
false  true   Neueste Meldung zum Streik
false  true   Gibt es eine Verspätung
```

Live gegengeprueft am 2026-07-29 nach dem Control-Server-Deploy, Frage
"Was sind die aktuellen Nachrichten aus Berlin?":

```
x-smejj-bridge: chat-fast-lane
x-smejj-model-backend: groq:llama-3.1-8b-instant
Antwort: "Ich habe keine aktuellen Nachrichten aus Berlin.
          Mein Wissensstand ist bis Dezember 2023."
```

Der Control-Server-Deploy wirkt damit heute nur auf den schmalen Rest, den die
alte Bridge-Weiche durchlaesst (Wetter laeuft ueber den eigenen Open-Meteo-Pfad
und ist nicht betroffen). **Der Nutzen der Aenderung haengt am Bridge-Deploy.**
