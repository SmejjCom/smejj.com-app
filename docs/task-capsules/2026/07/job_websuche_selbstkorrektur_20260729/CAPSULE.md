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

## Offen — echter Blocker

Die **Bridge** traegt die entscheidende Weiche und ist **nicht** ausgerollt.
`scripts/deploy/deploy_chat_bridge_zeabur.mjs` braucht `ZEABUR_API_TOKEN` in
`~/.config/smejj.com/env.local`; der Wert fehlt. Das Anlegen eines API-Tokens
ist ein Zugang und damit Rote Liste — es gehoert dem Betreiber.

Bis dahin gilt: Fragen, die schon die **alte** Bridge-Liste erkannte
(`heute`, `aktuell`, `news`, `nachricht`, `wetter`, `preis`, `kurs`, `stand`,
`quelle`, `internet`, `web`, `jetzt`, `2026`), laufen ueber den Control-Server
und profitieren sofort. Alles andere — darunter `Schlagzeile` — bleibt in der
Schnellspur.
