# Live-Abgleich: die Bestandsaufnahme vom 12.09.2026

Anlass: `check:schutz-echtheit` meldet, dass der Start-Lock Fassungen bewacht, die
smejj.com nicht ausliefert. Gefragt war: **Wer ist wo neuer — und was gehört zusammengeführt?**

Verglichen wurde `public/*` gegen die Auslieferung (byte-genau gegen den Frontend-Klon,
stichprobenhaft gegen `https://smejj.com/assets/…` — beide stimmen überein).

## Das Ergebnis in Zahlen

| Lage | Dateien |
|---|---|
| identisch | **187** |
| nur die Cache-Marke unterscheidet sich | **26** |
| inhaltlich abweichend | **14** |
| im Zweig, nicht ausgeliefert | 1 |

## Der eine echte Fehler — gefunden und behoben

In `start-styles.css` standen **live** 18 Zeilen, die nur aus einem Punkt bestehen: Reste
von Selektoren, die am 08.09. als „tote Regeln" entfernt wurden. Der CSS-Parser hängt so
einen Punkt an die nächste Regel und verwirft dann beide. **Drei Regeln waren dadurch live
wirkungslos**: `.browser-panel-nav`, `.bp-tab.is-active .bp-tab-dot` und
`body.task-indicator-active .split-icon span:last-child`.

Gemessen, indem dieselbe Datei einmal live und einmal lokal in ein `<style>`-Element gelegt
und der Browser gefragt wurde, was er daraus macht: **1131 gegen 1138 Regeln**. Behoben,
ausgeliefert (SW v856), live gegengemessen: 1138, keine fehlt. Wächter dagegen:
`tests/css-regelreste.test.mjs`.

## Die 14 inhaltlich abweichenden Dateien

„nur live" = Zeilen, die nur die Auslieferung hat; „nur Zweig" = Zeilen, die nur `public/` hat.

| Datei | nur live | nur Zweig | Einschätzung |
|---|---:|---:|---|
| `chat-bridge.js` | 4721 | 702 | live ist ein **Bündel** (`scripts/deploy/bundle_chat_bridge.mjs`), der Zweig die Quelle — kein Konflikt |
| `chat-bridge-bilder.js` | 170 | 64 | beide Seiten eigene Arbeit |
| `chat-bridge-auth.js` | 4 | 63 | Zweig deutlich weiter |
| `browser-pane-maus-frei.js` | 51 | 8 | live weiter (Token-Weg, Aussetzer-Meldungen), Zweig hat eigene Zeilen |
| `chat-medien.js` | 55 | 2 | **live weiter** — der Fix „Parken statt Blockieren" (09.09.) fehlt im Zweig |
| `chat-sync.js` | 9 | 18 | Zweig weiter |
| `browser-pane-maus-plan.js` | 16 | 3 | live weiter |
| `chat-store.js` | 14 | 6 | live weiter (parkeMedien) |
| `sw.js` | 5 | 8 | getrennte Versionszählung — live führt (v856) |
| `spur-start.js` | 3 | 10 | Zweig weiter |
| `code-flaeche.js` | 3 | 4 | beide klein |
| `browser-pane-fernwege.js` | 0 | 3 | Zweig weiter |
| `impressum.html`, `status.html` | 2/3 | 3/3 | Kleinkram |

**Die Richtung ist also keine Einbahnstraße.** In `chat-medien.js`, `chat-store.js` und den
Maus-Modulen ist **live neuer**; in `chat-bridge-auth.js`, `chat-sync.js`, `spur-start.js`
ist der **Zweig neuer**. Wer eine Seite pauschal über die andere zieht, vernichtet Arbeit.

## Die 26 Marken-Divergenzen

Reine Buchhaltung: derselbe Inhalt unter verschiedenen `?v=`-Nummern. Beispiele:
`chat-store.js` — live durchgängig `b69`, Zweig durchgängig `b70`; `composer-tools.js`
live `werkzeuge-24`, Zweig `werkzeuge-22`. **Beide Seiten sind je für sich konsistent**
(live: 15 Verweise, alle `b69`) — es gibt live *keine* doppelt geladenen Module.

Eine Markenangleichung ist nicht harmlos: `chat-store.js` wird von 28 Dateien geladen; eine
neue Marke ändert deren Inhalt und löst eine Kette aus, die am Ende **rund 30 Dateien**
ausliefern müsste. Ohne inhaltlichen Gewinn.

## Empfehlung

1. **Erledigt:** der CSS-Fehler (live behoben und bewiesen).
2. **Als eigener Arbeitsgang, Datei für Datei:** die 14 inhaltlichen Abweichungen mit
   `scripts/diagnose/live-abgleich-merge.mjs` zusammenführen (Drei-Wege-Merge über die
   gemeinsame Basis aus der Frontend-Historie). Acht davon würden sauber zusammenfließen,
   `sw.js` hat eine Konfliktstelle (die Versionszeile).
3. **Zuletzt:** die Marken angleichen — erst wenn die Inhalte stimmen, sonst zeigt eine
   neue Marke auf einen Stand, der gleich wieder überschrieben wird.

Bis dahin bleibt `check:schutz-echtheit` rot. Das ist ein ehrlicher Befund, kein Defekt:
die App läuft auf allen geprüften Geräten grün.
