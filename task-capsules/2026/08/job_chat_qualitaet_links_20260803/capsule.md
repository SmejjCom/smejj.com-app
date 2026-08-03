# Task Capsule — Chat-Qualität + klickbare Links (job_chat_qualitaet_links_20260803)

## Ziel (Betreiber-Auftrag 2026-08-03, wörtlich)
„geh chrome browser smejj.com behebe Fehler, soll wie Chatgpt, gemini und soweiter
oder noch besser sein" + „Wieder eine Fehler, ich kann link nicht klicken, muss
jede link klickbar sein." + „Nach der Umsetzung bitte live gehen, live testen".

## Befund (drei Wurzeln, alle gemessen)
1. **Kontextverlust**: Frontend sprach primär die Zeabur-Bridge an, die seit
   2026-07-29 auf v104 eingefroren ist (ZEABUR_API_TOKEN fehlt). v104 hat kein
   `history`-Parameter in `buildAgentMessages` — der mitgeschickte Verlauf wurde
   weggeworfen. Live-Fehlbild: „Privat konto?" → „Nein, smejj.com ist ein
   öffentliches Portal." Der v109-Fix (History+RAG) lag fertig auf der
   Salad-Bridge, erreichte die Nutzer aber nie (Fallback greift nur bei
   Hänger/5xx/429).
2. **Sprachqualität**: Schnellspur-Default `llama-3.1-8b-instant` (8B) schrieb
   fehlerhaftes Deutsch und erfand Kontodetails.
3. **Links**: `chat-markdown.js` renderte bewusst keine `<a>`-Elemente — URLs
   erschienen als fetter Text, nicht klickbar.

## Umsetzung
- **Bridge v111** (`20260803-v111-schnellspur-70b`): Schnellspur-Default auf
  `llama-3.3-70b-versatile`. Modellwahl GEMESSEN (lokales Bündel, echter
  Groq-Schlüssel aus Salad-Env, Fehlbild-Konversation mit Verlauf):
  - 70B: Kontext gehalten, bestes Deutsch, 1,2 s → Sieger
  - 8B (alt): Kontext ok (v109-History), aber erfundene Details, holprig
  - gpt-oss-120b: stark, aber 1,8 s und Abriss am 700-Token-Deckel
  - qwen3.6-27b: leerer `content` (Reasoning-Modell) → disqualifiziert
  Gleicher Groq-Free-Tier-Zugang, KEINE neue Kostenposition.
- **config.js**: Salad-Bridge primär (`starfruit-thyme-…salad.cloud`), Zeabur
  nur Reserve — bis der Betreiber-Token den Zeabur-Gleichstand erlaubt.
- **chat-markdown.js**: `[Text](URL)` + nackte URLs → `<a class="chat-link"`,
  escape-first bleibt, nur http/https, `target=_blank rel="noopener noreferrer"`.
  2 neue Schutztests (Klickbarkeit + XSS: javascript:/data:/Attribut-Ausbruch).
  chat-markdown.css: Unterstrich, currentColor (kein Design-Eingriff).
- **sw v205** (von Parallel-Session sofort auf v206 überholt — enthalten).
- Start-Lock: config.js/sw.js mit Betreiber-Wortlaut neu eingefroren
  (Backup backups/start-design-lock/2026-08-03T21-56-25-167Z/ = Rollback-Punkt).

## Checks
check:guidelines OK (nach Kommentar-Kürzung: chat-bridge.js exakt 800),
check:frontend 301 pass/0 fail, chat-markdown 10/10, check:favicon-lock OK,
check:start-lock OK (neu eingefroren), Secret-Scan vor Push sauber.

## Live-Beweise (Produktionsdomain, echter Klickpfad in Chrome)
- Salad-Bridge `/health`: v111, `fastLaneModel groq:llama-3.3-70b-versatile`,
  Projektwissen 662 Chunks; stabil über 6 min (36/36 Messpunkte).
- curl-Livetest „Privat konto?" MIT Verlauf → korrekte Kontoarten-Antwort im
  Bankkontext, sauberes Deutsch.
- Browser (sw v206 aktiv): „webseite von Wells Fargo hier schreiben" →
  unterstrichene Links; DOM-Prüfung 2/2/2 (Anker, _blank+noopener, https).
- Kontextfolge „Und von der Bank of Amerika?" → richtige Antwort samt Link.
- Echter Klick auf https://www.bankofamerica.com → öffnete im neuen Tab.
- Antwort-Header live: `x-smejj-model-backend: groq:llama-3.3-70b-versatile`.

## Rollback
Frontend: git revert eb101c9 (smejj-app-frontend) + Salad-Container Stop/Start.
Dev-Repo: 7a95d4b. Start-Lock-Backup s.o. Bridge-Neustart-Skript-Muster:
Stop/Start via Salad-API, NIE Env-PATCH (Ersetzungs-Falle).

## Offen / Merkregeln
- Zeabur-Bridge bleibt v104-Reserve, bis ZEABUR_API_TOKEN kommt; dann
  `CONFIRM_BRIDGE_DEPLOY=YES node scripts/deploy/deploy_chat_bridge_zeabur.mjs`.
- chat-markdown.js enthält ABSICHTLICH NUL-Bytes (Platzhalter-Schutz gegen
  BLOCK-Spoofing) — git zeigt „Bin", grep braucht `-a`. Nicht „reparieren".
- RAG sucht weiter nur auf der letzten Frage (Schwelle MIN_TOP_SCORE=20 dämpft).
