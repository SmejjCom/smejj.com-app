# Task Capsule — job_bridge_schnellspur_20260728

Datum: 2026-07-28
Auftrag: "Ja / Mach komplett fertig" (Wof Kadavanich) — Bridge-Schnellspur
Status: Code fertig und getestet, **nicht ausgeliefert** — Deploy-Weg fehlt

## Befund

`shouldSearchWeb()` in `public/chat-bridge.js` prueft nur Stichwoerter (heute,
aktuell, wetter, ...) und kennt **keine Adressen**. Eine Aufgabe wie
"Lies https://imild.com/ und nenne den Titel" gilt damit als Plauderei und
landet in der Groq-Schnellspur — die kennt keine Werkzeuge und **raet**:
gemessen "I-MILD.com" statt "iMild.com — Drei Produkte. Eine Vision.".

## Umsetzung (fertig, getestet)

Neu: `mentionsWebAddress()` erkennt Adressen mit und ohne Schema, fail-closed
ueber eine Endungsliste — dieselbe Regel wie im Frontend
(`autonomous-intent.js`), damit Dateinamen wie `app.js` nicht faelschlich als
Web-Ziel gelten. Solche Aufgaben gehen jetzt in die Tiefspur zum Control Server,
wo seit heute echtes Tool-Calling laeuft.

`BRIDGE_VERSION` 20260726-v102 -> **20260728-v103-adresse-nie-schnellspur**.
Tests: drei neue Faelle, `check:llm-router` **54/54** gruen, `check:guidelines`
und Syntaxpruefung gruen. Commit `653b5f9`.

## Warum nicht ausgeliefert — Befundlage zum Zeabur-Dienst

Im Portal (eingeloggt, Projekt `untitled`, Tencent Ashburn 2C 8GB) untersucht:

| Beobachtung | Bedeutung |
|---|---|
| Dienst `smejj-chat-bridge`, Quelle `docker.io/library/node:22-bookworm` | ein **nacktes** Node-Image, kein eigenes Abbild |
| `/root` enthaelt nur `.bashrc`/`.profile`, `/srv` ist leer | der Code liegt **nicht** auf der Platte |
| Keine Volumes farblich hervorgehoben | kein gemountetes Verzeichnis |
| Laufzeitprotokoll zeigt nur Containerstart und `smejj.com chat-bridge: http://:::8080` | **kein** Download-Schritt beim Start |
| Reiter *Settings* des Dienstes markiert sich, rendert aber keinen Inhalt | die Startbedingung ist derzeit nicht einsehbar |

Schlussfolgerung: Der Quelltext wird ueber die **Startbedingung** in den
Container gebracht (vermutlich inline). Ohne Einsicht in dieses Feld laesst sich
die Datei nicht zuverlaessig ersetzen.

**Bewusst nicht getan:** ueber die *Command*-Konsole im laufenden
Produktionscontainer herumprobieren. Das ist der Live-Chat aller Nutzer; ohne
verstandenen Startvertrag waere das ein Eingriff auf Verdacht und verstiesse
gegen die Schutzregel.

## Wirkung auf Nutzer: keine

Ueber die App greift seit `sw v148` das Frontend-Grounding
(`browser-context.js`): nennt eine Aufgabe eine Adresse, wird die Seite geholt
und in den Prompt gesetzt. Die Schnellspur bekommt damit **echten Seiteninhalt**
und raet nicht. Betroffen sind nur direkte API-Aufrufer, die an der App vorbei
auf die Bridge zugreifen.

## Was zum Abschluss fehlt (einer von beiden Wegen)

1. **Zeabur-API-Token** (Betreiber erzeugt ihn, Zugangs-Lock) — danach laesst
   sich der Deploy genauso skripten wie beim Control Server ueber die Salad-API.
2. **Ein Blick in die Startbedingung** des Dienstes: Reiter *Settings* oeffnen
   oder Projekt als YAML exportieren. Daraus ergibt sich, wo `chat-bridge.js`
   herkommt — und der Rest ist Routine.

## Rollback

Git-Tag `rollback/bridge-adresserkennung-2026-07-28`, Dateikopie in
`backups/rollback-aufteilung-2026-07-28/chat-bridge.js.vorher`. Live ist
unveraendert `v102` — es wurde nichts ausgeliefert, also gibt es nichts
zurueckzunehmen.
