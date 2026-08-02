# Task Capsule — job_rag_livekette_20260801

**Status:** gebaut und lokal bewiesen; Auslieferung blockiert (Zugangstoken fehlt).
**Rollback:** Commit `a69b198` (Stand vor diesem Auftrag), Live-Bridge unveraendert `20260729-v104`.

## Ziel

Projektwissen (RAG) in den Live-Chat von smejj.com verdrahten. Vorlauf: `job_rag_projektwissen_20260801`
hat die Schicht gebaut und gemessen (88,2 % -> 96,1 % ab Punktzahl 20), aber ausdruecklich
nur ueber den Eval-Harness. Der Dienst selbst nutzte sie nicht.

## Anforderungen

1. Die Live-Kette baut den Kontextblock selbst.
2. `MIN_TOP_SCORE = 20` bleibt unveraendert — Kontext bleibt die Ausnahme.
3. Non-Regression: 800-Zeilen-Regel, Start-Lock, Kostenpolitik, bestehende Spuren.
4. Danach: Deploy, Live-Test, Eval-Lauf ohne `--rag` gegen 88,2 % vergleichen.

## Die drei Blocker und wie sie geloest sind

1. **800-Zeilen-Grenze.** `public/chat-bridge.js` stand exakt auf 800. Der Wetterpfad ist
   nach `public/chat-bridge-weather.js` gezogen (er kennt weder Modelle noch Streams), die
   neue Logik liegt in `public/chat-bridge-rag.js`. Bridge jetzt 732 Zeilen.
2. **Eine Datei je Deploy.** `scripts/deploy/bundle_chat_bridge.mjs` loest relative Importe
   transitiv auf; ausgeliefert wird weiterhin genau eine Datei. Der Buendler versteht nur,
   was dieses Projekt schreibt, und bricht bei allem anderen ab (Zyklus, Namenskollision,
   Fremdabhaengigkeit, Default-Export, Sammel-Export).
3. **Kein Zustand, keine Repo-Dateien.** Der BM25-Index reist als gzip+base64-Artefakt im
   Buendel mit: 657 Abschnitte, 424 kB gesamt (statt 1,3 MB roh).

### Entscheidung gegen `https://smejj.com/rag-index.json`

Die Vorgabe nannte Static-First als naheliegenden Weg. Dagegen sprechen drei Dinge, darum
liegt der Index im Buendel:

- Der Korpus besteht aus den internen Regeldokumenten. Als Datei auf der oeffentlichen
  Domain waere er ein vollstaendiger Abzug davon — waehrend `stripInternalReferences()` in
  derselben Bridge Muehe darauf verwendet, interne Dateinamen aus Antworten herauszuhalten.
- Bridge-Version und Wissensstand bleiben atomar; ein "neue Bridge, alter Index"-Zustand
  kann nicht entstehen, und beim Start haengt nichts am Netz.
- Der Frontend-Deploy waechst nicht um rund 1 MB je Wissensstand
  (`docs/policy/GITHUB_KOSTENFREI.md`).

Der Index bleibt ausserdem unveraendert ueber `npm run rag:export` auf IDrive e2 auditierbar;
das Buendel verwendet exakt dasselbe Artefakt.

## Betroffene Dateien

Neu:
- `control-server/src/rag/ragContextBlock.js` — Suche + Blocktext, ohne Datei-Ein-/Ausgabe
- `public/chat-bridge-rag.js` — Artefakt entpacken, Block einsetzen, fail-closed
- `public/chat-bridge-weather.js` — Wetterpfad, unveraendert umgezogen
- `scripts/deploy/bundle_chat_bridge.mjs` — Buendelschritt
- `tests/chat-bridge-projektwissen.test.mjs` — 11 Zusicherungen

Geaendert:
- `control-server/src/rag/agentContext.js` — nutzt das gemeinsame Modul, Verhalten gleich
- `public/chat-bridge.js` — Verdrahtung, Version `20260801-v105`, `/health` meldet den Wissensstand
- `scripts/deploy/deploy_chat_bridge_zeabur.mjs` — liefert das Buendel statt der Rohdatei
- `package.json` — `bundle:bridge`, `check:rag` erweitert, `node --check` fuer die neuen Dateien
- `docs/architecture/RAG_PROJEKTWISSEN.md` — Regel 4 und 5, Stand der Live-Kette
- `tests/chat-bridge.test.mjs` — Wetter-Zusicherungen zeigen auf das neue Modul

## Zwei Befunde, die den Zuschnitt geaendert haben

1. **Die Startseite nutzt `/api/agent`, nicht `/api/chat`** (`public/app.js:298`). Der
   Eval-Harness misst aber `/api/chat` (`src/evaluation/evalTransport.js`). Waere nur der
   gemessene Weg verdrahtet worden, waere die Note gestiegen, ohne dass ein Nutzer etwas
   davon hat. Verdrahtet sind darum beide.
2. **Eine Frage, die "smejj.com" nennt, gilt der Suchweiche als Web-Ziel** und geht in
   `/api/agent` nicht auf die Schnellspur, sondern zum Control Server — der Projektwissen
   bereits selbst ergaenzt. Die Luecke auf diesem Weg betraf also die Fragen OHNE
   Web-Absicht. Genau die deckt die Verdrahtung ab.

## Beleg

`tests/chat-bridge-projektwissen.test.mjs`, 11 von 11 bestanden. Der Kern sind zwei Tests:

- **Die gebuendelte Datei im Betrieb.** Sie wird als eigener Prozess gestartet, mit einem
  Stub anstelle von Groq, und es wird geprueft, was der Upstream WIRKLICH bekommt: gedeckte
  Frage (Punktzahl 21,9) -> Block im System-Teil, Rollenfolge `system, system, user`;
  ungedeckte Frage -> unveraendert ohne Kontext; `/api/agent` ebenso. Eine Pruefung gegen
  die Repo-Module wuerde genau die Luecke nicht finden, um die es hier geht.
- **Gleichstand von Live-Kette und Messweg.** Fuer jeden Fall der Suite wird der Block der
  Bridge mit dem des Harness verglichen; sie sind zeichengleich. Ohne diese Zusicherung
  wuerde die Eval-Wiederholung zwei verschiedene Dinge vergleichen und den Unterschied als
  Fortschritt oder Regression melden.

Weiter gruen: `check:rag`, `check:llm-router`, `check:frontend`, `check:guidelines` (max 800
Zeilen), `check:start-lock` (31 Dateien byte-identisch), `check:security`, `check:architecture`,
`check:cost`, `check:json`, `check:paths`, `check`.

## Offen — und warum es die Sitzung nicht selbst kann

`npm run deploy:bridge` bricht fail-closed ab: `ZEABUR_API_TOKEN` fehlt in
`~/.config/smejj.com/env.local`. Nichts wurde veraendert, live laeuft weiter `20260729-v104`.

Das ist keine Bequemlichkeit, sondern die eigene Regel des Projekts:
`smejj.com Zeabur-Token-eintragen.command` haelt fest, dass der Token *"das einzige Stueck
[ist], das eine KI-Sitzung nicht selbst anlegen darf"*.

Nach Eintragen des Tokens sind es drei Befehle:

```bash
CONFIRM_BRIDGE_DEPLOY=YES npm run deploy:bridge
curl -s https://smejj-chat-bridge.zeabur.app/health
node scripts/evaluation/run_model_eval.mjs --live --wiederholungen 3 --delay-ms 4000
```

Erwartung: `/health` meldet `version: 20260801-v105-projektwissen-rag` und
`projektwissen.enabled: true` mit 657 Abschnitten. Der Eval-Lauf laeuft OHNE `--rag` — die
Kette traegt den Kontext dann selbst — und ist gegen die Basis 88,2 % ± 5,0 zu stellen, nicht
gegen die 96,1 % (die sind ein `--rag`-Bericht und ein anderer Vergleichsschluessel).

## Restrisiko

Die Groesse der ausgelieferten Datei springt von rund 30 kB auf 424 kB. Ob die
Zeabur-Schnittstelle eine so grosse Mutation annimmt, ist ohne Token nicht pruefbar. Faellt
sie durch, bricht der Deploy fail-closed ab und die laufende Bridge bleibt unberuehrt; der
Rueckfallweg waere dann, das Artefakt als zweite Datei zu schreiben statt es einzubetten.
