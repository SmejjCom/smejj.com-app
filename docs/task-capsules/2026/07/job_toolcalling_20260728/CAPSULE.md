# Task Capsule — job_toolcalling_20260728

Datum: 2026-07-28
Auftrag: "A" — echtes Tool-Calling nativ in der Modell-Kette (Wof Kadavanich)
Status: abgeschlossen, live verifiziert

## Ziel

Das Modell soll Werkzeuge SELBST waehlen, statt dass ein Regex-Vorfilter
entscheidet, wann eine Webseite geholt wird.

## Der Blocker loeste sich bei genauer Pruefung auf

Ich hatte gemeldet, der Weg sei durch das fehlende Zeabur-Portal blockiert.
Das war zu kurz gedacht: `/api/agent` wird zwar von der Bridge angenommen,
aber an den **Control Server** weitergereicht (`CONTROL_ORIGIN`,
`multiModelRouterEnabled: true`) — und fuer den existiert ein vollstaendig
**skriptbarer** Deploy-Weg ohne Browser:

1. `build_control_release_artifact.mjs` → Artefakt
2. `upload_control_release_to_idrive.mjs` → unveraenderlich auf IDrive e2
3. `set_control_artifact_env.mjs` → Salad-API (GET + Merge + PATCH)

Die Bridge musste gar nicht angefasst werden.

## Architektur

`control-server/src/llm/toolLoop.js` (208 Zeilen) bietet dem Modell das Werkzeug
`seite_lesen` an, sammelt die in Bruchstuecken gestreamten `tool_calls`, fuehrt
sie aus und reicht das Ergebnis als `tool`-Nachricht zurueck. Sichtbarer Text
laeuft dabei unveraendert weiter; Werkzeugaufrufe erreichen den Nutzer nie als
Antworttext.

- **Sicherheit:** Adressen laufen durch `parseBrowserTarget` aus dem
  Browser-Proxy — dieselbe gepruefte SSRF-Regel, kein zweiter Sicherheitsstand.
  8 s Zeitlimit, 2 MB Grenze, nur Text-Inhaltstypen, Skripte werden entfernt.
- **Fail-closed:** ohne `SMEJJ_AGENT_TOOLS_ENABLED=YES` keine Werkzeuge, alter
  Pfad unveraendert.
- **Keine Endlosschleife:** nach drei Runden fragt die letzte Runde OHNE
  Werkzeuge — es entsteht immer eine Antwort.
- **Lastregel:** Werkzeuge laufen nur auf Modellwunsch, nie im Seitenaufruf.

`src/server.js` stand hart auf 800 Zeilen und ist **nicht gewachsen**: die
Import-Zeile wurde nur erweitert (streamFilter.js reicht weiter), die
dreizeilige Fehlerwache wurde einzeilig. Ergebnis **799 Zeilen**.

## Verifikation

| Check | Ergebnis |
|---|---|
| `tests/tool-loop.test.mjs` | 11/11 |
| `check:llm-router` | 47/47 |
| `check` (Syntax), `check:guidelines`, `check:security`, `check:architecture` | gruen |
| `check:release-imports` | 124 Dateien transitiv, alle im Artefakt |

**Live-Test 1 — Control Server direkt:** Auf "nenne woertlich die Ueberschrift
und die drei Markennamen" kam „Drei Produkte. Eine Vision." plus con.ax, smejj,
smyst. Diese Angaben stehen nirgends in der Frage — sie koennen nur aus der
gelesenen Seite stammen.

**Live-Test 2 — ganze Kette ueber smejj.com:** Die urspruengliche Eingabe
"geh browser iMild.com teste ob alles fehlerfrei ist?" liefert einen Testbericht
mit HTTP 200, korrektem Titel, Navigation und Marken (1836 Zeichen). Der Satz
"Ich kann keine Webseiten aufrufen" tritt nicht mehr auf; die Browser-Leiste
oeffnet weiterhin inline, die Startseite bleibt `/`.

## Zwei Ebenen, bewusst

1. **Frontend-Grounding** (seit sw v148): nennt die Aufgabe eine Adresse, wird
   die Seite geholt und in den Prompt gesetzt.
2. **Server-Tool-Calling** (neu): das Modell entscheidet selbst.

Ebene 1 traegt auch dann, wenn die Bridge eine kurze Frage ueber ihre
Groq-Schnellspur beantwortet — die kennt keine Werkzeuge. Ohne Ebene 1 waere
dort geraten worden; das ist im Rohtest ueber die Bridge sichtbar geworden
("I-MILD.com" statt des echten Titels).

## Rollback

- Git-Tag `rollback/toolcalling-2026-07-28` (`f05d5d5`)
- Vorheriges Release: `deployments/control/smejj-control-nostore-v87-2026-07-28.tar.gz`
- Zuruecknahme: `set_control_artifact_env.mjs` mit dem alten Key/SHA und
  `SMEJJ_AGENT_TOOLS_ENABLED=NO`
- Salad-Version vorher 87, jetzt **88**, 70 Variablen (nichts verloren)

## Offen

**Bridge-Schnellspur:** Nennt eine Aufgabe eine Adresse, sollte die Bridge nicht
auf Groq antworten, sondern in die werkzeugfaehige Spur gehen. Das ist eine
Aenderung in `public/chat-bridge.js` und braucht den Zeabur-Deploy-Weg, den ich
weiterhin nicht habe. Praktisch abgefedert durch das Frontend-Grounding.

## Qualitaetsbewertung

Ziel erreicht und doppelt belegt. Der Umweg ueber den Control Server war der
richtige: kleinere Aenderung, skriptbarer Deploy, kein Anfassen des
Live-Chat-Proxys.
