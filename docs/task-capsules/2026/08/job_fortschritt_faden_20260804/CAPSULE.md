# job_fortschritt_faden_20260804 — sichtbarer Fortschritt und Lauf im Faden

## Ziel

Die drei letzten offenen Punkte der Betreiber-Liste vom 2026-08-04:

- **Punkt 3:** „Dann sucht, merkt man nicht, ob es funktioniert."
- **Punkt 4:** „Dann denkt man, es hat aufgehoert, aber im Hintergrund arbeitet
  es weiter — in diesem Moment muesste er zeigen: laeuft noch."
- **Punkt 6:** „Autonomer Lauf wird geoeffnet — wenn ich drauf klicke, schickt
  er mich auf eine andere Seite. Das ist nicht richtig."

## Punkt 3 + 4 — der blinde Fleck

Beide Beschwerden sind DERSELBE Fehler: Das Modell schreibt einen Satz, ruft
danach ein Werkzeug auf, und sekundenlang passiert sichtbar nichts. Wer das
sieht, haelt die Antwort fuer beendet.

**Umsetzung, drei Schichten:**

1. `control-server/src/llm/toolLoop.js` meldet jeden Werkzeuglauf VOR und NACH
   der Ausfuehrung (`sendeSchritt`). `beschreibeWerkzeug` liest Suchbegriff und
   Markt aus den Argumenten, ohne auszufuehren; `zaehleTreffer` zaehlt das
   eigene Ausgabeformat, nicht fremden Text.
2. `public/chat-bridge-strom.js` (NEU) reicht die Schritte durch.
3. `public/ai/chat-stream.js` baut daraus eine Liste, die waehrend der Arbeit
   waechst. CSS in `chat-markdown.css`.

**Drei Entwurfsentscheidungen, die den Unterschied machen:**

- **Eigenes Feld `smejj_schritt`, kein `choices[].delta`.** Ein aelterer Client
  liest `delta.content`, bekommt `undefined` und haengt nichts an. Der Schritt
  ist damit unsichtbar, aber nie stoerend — rueckwaertskompatibel per Bauart.
- **Die Liste ist GESCHWISTER der Antwort, nicht ihr Kind.** Der Markdown-
  Renderer ersetzt am Ende das `innerHTML` des Antwort-Knotens und liest dessen
  `textContent`. Ein Kind waere weg — und wuerde vorher die Antwort faelschen.
- **Kein Attribut-Selektor auf Modelltext.** Die Zeilen werden durchgegangen
  statt per `querySelector` gesucht. Suchbegriffe landen ausschliesslich als
  `textContent`.

## Der Fehler, den erst der Livetest zeigte

Nach dem ersten Release sendete der Control Server die Schritte nachweislich
(6 Ereignisse im Rohstrom) — **beim Nutzer kam kein einziger an**.

Ursache: `pipeVisibleStream` in der Bruecke baut JEDEN Event neu auf und behaelt
nur `choices[0].delta.content`. Ein Filter, der nur Bekanntes durchlaesst, ist
richtig — er kannte die Schritte nur noch nicht.

`schrittDurchreichen` laesst sie durch, aber eng: nur das eine bekannte Feld,
neu serialisiert aus geprueften Werten, mit Laengen- und Zahlenbegrenzung. Kein
blindes Weiterreichen fremder Nutzlast.

**MERKREGEL: Ein Ereignis, das der Server sendet, ist noch lange nicht eines,
das der Nutzer sieht. Zwischen beiden liegt jeder Filter auf dem Weg — und ein
guter Filter laesst per Bauart nur Bekanntes durch.**

## Punkt 6 — Lauf im Faden

Ursache: Der Lauf wurde ueber die Formularfelder der Automatik-Ansicht gestartet
(`#acTask`, `#acRepository` …). Die gibt es nur dort, also musste die Ansicht
vorher aufgehen. **Der Job-Endpunkt braucht die Felder gar nicht** — er nimmt
alles im Rumpf entgegen.

NEU `public/autonomous-thread-run.js` spricht direkt mit ihm und schreibt den
Fortschritt in die Karte im Faden.

**Fail-safe, und das ist hier die wichtigste Eigenschaft:** Geht irgendetwas
schief — keine Anmeldung, Endpunkt weg, unerwartete Antwort — gibt
`starteImFaden` `false` zurueck und der bisherige Weg uebernimmt unveraendert.
Ein Test nagelt fest, dass der Ansichtswechsel HINTER dem Rueckfall-Abbruch
steht. Der neue Weg kann nur gewinnen, nie verlieren.

## Abnahme live

| Glied der Kette | Beleg |
|---|---|
| Control Server | 6 Schritt-Ereignisse im Rohstrom, mit Suchbegriff und Markt |
| Bruecke v114 | `/health` meldet `20260804-v114-arbeitsschritte`, Buendel enthaelt den Code |
| Anzeige (ausgeliefertes Modul) | im Browser geladen und gefuettert: „🔍 Suche: office condo for sale San Jose CA · Markt us ✓ 8 Treffer", Liste steht VOR der Antwort, Antwort-Knoten unberuehrt |
| CSS | `.chat-schritte` im ausgelieferten `start-styles.css` |
| Anmeldepflicht der Bruecke | unangemeldet sauber 401 mit Hinweistext, kein 500 |

**Nicht abgenommen:** der angemeldete Durchlauf durch die Bruecke. Ein gemintetes
Sitzungs-Token wurde mit `authenticated: false` abgewiesen (der Wert im
Salad-Env passt nicht zur laufenden Instanz), und eine Sitzung darf sich nicht
anmelden. Die Kette ist an jedem einzelnen Glied belegt, nur nicht in einem Zug.

## Nebenbefunde

- `public/chat-bridge.js` stand bei 824 Zeilen. Der Antwortstrom liegt jetzt in
  `chat-bridge-strom.js` — ohnehin eine eigene Aufgabe.
- **Der Zeabur-Buendler lehnt Re-Export-Listen ab** (`bundle_export_list_unsupported`):
  sie verstecken die Namensherkunft und entziehen der Kollisionspruefung den
  Boden. Die drei Tests importieren deshalb direkt aus dem Strom-Modul.
- Der Import von `chat-bridge.js` startet einen echten HTTP-Server. Tests
  brauchen `process.env.SMEJJ_CHAT_BRIDGE_NO_START = "1"` VOR dem Import.
