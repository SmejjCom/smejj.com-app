# job_gedaechtnis_dreifach_20260804 — Gesprächsgedächtnis an drei Stellen repariert

## Ziel (Betreiber-Auftrag 2026-08-04, wörtlich)
„Ich bin kein Programmierer und überlasse dir die komplette Umsetzung. Triff alle
technischen Entscheidungen selbst und arbeite vollständig autonom. […] entwickeln
und implementieren, Datenbank erstellen oder aktualisieren, online bereitstellen,
alle Funktionen live testen, erkannte Fehler beheben, erneut hochladen und testen.
Wiederhole diesen Ablauf so oft, bis alles zu 100 % fehlerfrei, stabil und
produktionsbereit funktioniert. Nach Abschluss aktiviere einen Change-Lock."

Ausgangspunkt war die Restpunkt-Liste vom 2026-08-03: Zeabur-Token, RAG nur auf
der letzten Frage, Memory_Bank am Limit, Codeberg-Spiegel.

## Befund (vier Wurzeln, alle gemessen)

1. **Der Wartetext war eine Nachricht.** `app.js` legt vor dem Absenden den
   Antwort-Knoten an; dessen sichtbarer Text lautet „smejj denkt nach…".
   `collectConversationHistory` sammelt `.entry.assistant` — der Platzhalter ging
   also als **jüngste Assistenten-Antwort** in jede Anfrage. Dazu stand die
   aktuelle Frage doppelt darin: einmal am Ende des Verlaufs, einmal als `task`,
   das der Server ohnehin anhängt.

2. **Die Reserve hing nicht am Token, sondern an der Route.** Der Reserve-Server
   (Zeabur) steht seit 2026-07-29 auf v104 und kennt `history` in `/api/agent`
   nicht. Gemessen an derselben Konversation (Verlauf: Privatkonto Deutsche Bank →
   Frage: „Und von der Bank of Amerika?"):

   | Weg | erstes Byte | Antwort |
   | --- | --- | --- |
   | `/api/agent` + `history` | 0,85 s | „Die Bank of America ist eine der größten Banken in den USA…" — **Kontext weg** |
   | `/api/chat` + `messages` | 0,41 s | „…bietet AUCH verschiedene Optionen für die Eröffnung eines Kontos" — **Kontext gehalten** |
   | Verlauf in `task` eingebettet | 15,9 s | Kontext gehalten, aber vom Schnellspur-Router auf die tiefe Spur geworfen |

3. **Der Sprach-Modus hatte nie ein Gedächtnis.** `buildAgentPayload` baute
   `{ task, model, files, preferences }` — kein `history`. Jede gesprochene Frage
   begann bei null. Der getippte Chat war am 2026-08-02 repariert worden, der
   gesprochene nicht, weil beide ihre Anfrage getrennt bauen.

4. **Projektwissen fand keine Anschlussfragen.** Gemessen gegen den echten Korpus:
   „Und wie sichere ich das ab?" erreicht allein **7,65** Punkte (Schwelle 20), das
   Thema davor **22,51**. Die Frage bekam nie Kontext, obwohl das Thema gedeckt war.

## Umsetzung

| Datei | Änderung |
| --- | --- |
| `public/chat-history-context.js` | Platzhalter (`dataset.thinking`) übersprungen; `buildRequestHistory` entfernt die Dublette; `buildReserveChatRequest` + `buildChatTargets` bauen die Reserve-Anfrage |
| `public/ai/fetch-retry.js` | `normalizeTargets`: ein Endpunkt darf `{ url, body }` sein — eigener Rumpf **und** eigenes Zeitbudget je Ziel |
| `public/ai/chat-stream.js` | **NEU** — SSE-Empfang aus `app.js` ausgelagert (800-Zeilen-Grenze), Verhalten unverändert |
| `public/app.js` | Reserve über `/api/chat`; `agentFallback` wird nicht mehr benutzt |
| `public/voice-conversation.js` | **NEU** — `appendVoiceTurn` + `buildAgentPayload` mit `history`, ohne Browser prüfbar |
| `public/voice-landing.js` | `state.verlauf`, Wendung erst **nach** gelieferter Antwort merken, Reserve über `/api/chat` |
| `public/chat-bridge-rag.js` | `istAnschlussfrage`, `previousUserContent`, `buildRagBlockMitVerlauf` |
| `public/chat-bridge-websuche.js` | **NEU** — `buildWebContext` aus der Bridge ausgelagert (800-Zeilen-Grenze) |
| `public/chat-bridge.js` | beide Live-Wege nutzen die Anschluss-Suche; Version v112 |
| `public/sw.js` | v207 → v208, zwei neue Module im Precache |
| `scripts/deploy/restart_chat_bridge_salad.mjs` | **NEU** — Bridge-Neustart per Stop/Start, nie Env-PATCH, wartet auf die Zielversion im `/health` |

**Warum getrennt gesucht wird und nicht zusammen.** Naheliegend wäre eine
Suchanfrage aus Frage + Thema. Gemessen (5 Paare) ist deren Punktzahl aber genau
das Maximum der Einzelanfragen, sobald die Hälften verschiedene Dokumente treffen
(10,66/4,62 → 10,66; 7,47/5,06 → 7,47). Es entscheidet also die Hälfte mit mehr
Wortdeckung, nicht das Thema — und hinterher ist nicht mehr zurechenbar, worauf
sich ein Treffer stützt. Getrennt gesucht steht die Aussage fest: entweder ist die
Frage gedeckt, oder das Thema, auf das sie sich bezieht.

## Checks
`npm run check:all` grün (1643 bestandene Zusicherungen), einzig `check:start-lock`
rot bis zum Neu-Einfrieren am Ende — so vorgesehen.
Neue Schutztests: 13 in `chat-bridge-gedaechtnis`, 9 in `chat-bridge-projektwissen`.

## Live-Beweise (Produktionsdomain)

| Fall | Beleg |
| --- | --- |
| Hauptweg, Anschlussfrage mit Verlauf | 0,82 s, `groq:llama-3.3-70b-versatile`, Antwort im Bankkontext |
| Reserve in der neuen Form | 0,41 s, Kontext gehalten — **ohne** Zeabur-Deploy |
| Projektwissen über die Anschlussfrage | „Und wie sichere ich das ab?" antwortet über **IDrive e2** — das Thema der Frage davor |
| Nicht-Regression | „Hauptstadt von Portugal?" → „Lissabon.", 1,18 s |
| Ausgeliefertes Frontend | Module von `https://smejj.com/assets/…` gegen ein nachgebautes Chat-Log: Platzhalter raus, keine Dublette, Reserve trägt 3 Nachrichten, Sprach-Modus trägt 2 Wendungen |
| Bridge live | `/health` meldet v112, 662 Wissensabschnitte, 70B-Schnellspur (280 s nach Neustart) |

## Rollback
Frontend: `git revert 3c18f58` in `smejj-app-frontend` + Container-Neustart über
`scripts/deploy/restart_chat_bridge_salad.mjs`. Dev-Repo: `c518e44`.
Start-Lock-Backup unter `backups/start-design-lock/`.

## Offen / Merkregeln
- **`ZEABUR_API_TOKEN`** bringt die Reserve auf Gleichstand (dann auch dort 70B und
  Projektwissen). Der Verlust des Verlaufs hängt nicht mehr daran.
- **Der angemeldete Browser-Durchlauf braucht den Betreiber** — eine Sitzung darf
  sich nicht anmelden. Alles andere ist ohne Anmeldung live belegt.
- **Ein Platzhalter im DOM ist für jeden Leser echter Inhalt.** Dieselbe Falle wie
  am 2026-08-02 in der Sprachwelle, nur an der anderen Naht.
- **Ein eingefrorener Dienst hat oft eine zweite Tür.** Bevor man auf ein fehlendes
  Geheimnis wartet, prüft man die anderen Routen desselben Servers.
- **Vor dem Deploy den Live-Stand gegen die Arbeitskopie halten.** Eine
  Parallel-Sitzung hatte app.js/sw.js halb geändert; der Abgleich mit dem
  Frontend-Repo zeigte, dass ihr Stand bereits ausgeliefert war — das App-Repo
  hinkte nur hinterher.
