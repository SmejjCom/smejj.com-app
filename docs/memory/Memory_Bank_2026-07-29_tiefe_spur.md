# Memory_Bank — tiefe Spur, Modul-Kennungen, Codeblock-Kopieren (2026-07-29)

Wortgleich ausgelagert am 2026-08-04 aus `Memory_Bank.md` (820/800 Zeilen).

---

### [2026-07-29] TIEFE SPUR: DREI SPERREN, ZWEI BEHOBEN (job_tiefe_spur_routing_20260729)

Volltext + Benchmarks: `task-capsules/2026/07/job_tiefe_spur_routing_20260729/`.
- **ZWEI Dienste, nicht einer:** `smejj-chat-bridge` ist nicht `src/server.js` —
  fest `groq:llama-3.1-8b-instant`, kein `/api/health` (404).
- **Tiefe Spur NICHT angeschlossen:** `glm-5-2` = `fallback-only` — ins Leere.
- **Behoben:** `handleChat` rief `streamLLM` ohne `profile` → alles lief auf
  `default`, Coding-Modelle unerreichbar.
- **Behoben, gefaehrlichster Fund:** Denken zaehlt gegen dasselbe Token-Budget wie
  die Antwort — `max_tokens 600` + Denken an = 600 Token verbraucht, content LEER.
  Ein brauchbares Modell waere als Totalausfall gemessen worden. Jetzt
  `THINKING_MIN_TOKEN_BUDGET`; Suite unangetastet.
- **Kosten beantwortet:** `glm-4.7-flash` ist gratis. **Diese Datei ist am
  800-Zeilen-Limit: neue Eintraege nach `docs/memory/` auslagern.**

### [2026-07-29] EIN MODUL, EINE KENNUNG — plus Waechter (job_module_kennungen_20260729)

Live smejj.com, **sw v193** (Frontend `7136de5`, App-Repo `5531619`). Volltext:
`docs/task-capsules/2026/07/job_module_kennungen_20260729/CAPSULE.md`.
- **Beim Nachmessen des Seitengewichts gefunden:** `voice-speech-queue.js` wurde
  ZWEIMAL geladen (zwei Kennungen) — doppeltes Gewicht und zwei Modulinstanzen mit
  getrenntem Zustand. Daher `check:module-queries`.
- **Zweiter Fund in HTML:** `public/de/index.html` lud `voice-landing.js` unter
  `?v=voice-send-20260721` — sechs Aenderungen alt, waehrend die 14 anderen
  Sprachseiten die aktuelle nutzten. Deutsche Seite lief live auf altem Stand.
- **DRITTER Fall derselben Ursache nach sw v184/v185, deshalb ein Waechter:**
  `scripts/check-module-queries.mjs` (in `check:all`, 7 Tests). Er liest auch
  `<script src>`-Tags (der zweite Fund steckte in HTML) und zaehlt `./x.js`,
  `/assets/x.js`, `../x.js` als EIN Modul — daran scheiterte die Handpruefung.
- **Gewicht geprueft, Lazy-Load begruendet VERWORFEN:** 284/300 KB. Weitere
  ~22 KB liegen in settings-surface/account-privacy/autonomous-coding, die beim
  Start unsichtbar mitladen — aber `bindSettings()`/`bindProfile()` in app.js
  greifen beim Boot auf Elemente zu, die erst deren `init()` rendert (boot
  braeche ab), und autonomous-coding.js registriert beim Init
  `smejj:autonomous-request` und `message` (Magic-Link-Handoff). Erst app.js
  loesen, dann verzoegern.

### [2026-07-29] CODEBLOCK MIT EINEM KLICK KOPIEREN (job_chat_code_copy_20260729)

Live smejj.com, **sw v192** (Frontend `4697269`, App-Repo `5af5738`). Volltext:
[docs/memory/Memory_Bank_2026-07-29_chat_code_copy.md](docs/memory/Memory_Bank_2026-07-29_chat_code_copy.md).
- **REGEL: kein Textknoten in einem Bedienelement INNERHALB einer Nachricht** —
  `chat-store.js` speichert `entry.textContent`, daraus baut
  `chat-history-context.js` den Modellkontext. Beschriftung aus CSS `::after`.
- Nur per Browsertest gefunden: Touch-Ziel 31x23 statt 42 px (`min-height: 0`
  hebelt die Projektregel aus), 17 px Ueberlappung durch hoehere Spezifitaet
  von `.entry.assistant .chat-code`.
- **Deploy auf LIVE-Basis:** live v191, Repo v186 — lokale `sw.js` hochladen
  haette fuenf Fremdversionen zurueckgerollt. Erstbesuch-Gewicht 288/300 KB.
