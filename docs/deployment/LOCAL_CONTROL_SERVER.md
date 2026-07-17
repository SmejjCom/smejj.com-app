# Lokaler Control Server — Chat mit echtem LLM (Phase 2, lokal)

Stand: 2026-07-03. Verifiziert per E2E-Test (Mock-LLM, SSE-Streaming ueber /api/agent und /api/chat).

Der Node-Control-Server (`src/server.js`) serviert die komplette smejj.com App lokal
UND beantwortet Chat-Anfragen ueber einen OpenAI-kompatiblen LLM-Endpoint.
Free-only-konform: laeuft auf dem eigenen Rechner, kein Hosting, keine zentralen Kosten.

## Schnellstart (Mac)

```bash
cd "<Projektordner>"                 # dieser Ordner (smejj.com App)
cp .env.example .env                 # einmalig, dann .env anpassen (siehe unten)
npm run dev                          # startet http://127.0.0.1:3000
```

Dann im Browser oeffnen: `http://127.0.0.1:3000` — die volle App inkl. Chat,
Composer-Werkzeugen (Plus-Menue, Diktat, Sprachmodus, Vorlesen) und allen Panels.

## Chat mit echtem Modell aktivieren (.env)

Der LLM-Pfad ist doppelt fail-closed. Ohne diese Variablen antwortet der Server
mit einem sicheren lokalen Assistenten-Template (0 Kosten, kein Netz):

```bash
SMEJJ_SERVER_AI_ENABLED=true         # Hauptschalter
SMEJJ_SERVER_AI_REMAINING=100        # einfacher Anfragezaehler (Kosten-Guard)
SMEJJ_LLM_BASE_URL=http://127.0.0.1:8000/v1   # OpenAI-kompatibler Endpoint
SMEJJ_LLM_API_KEY=local              # Key (bei lokalen Servern beliebig)
SMEJJ_LLM_MODEL=glm-5.2              # Modellname des Endpoints
```

Beispiele fuer `SMEJJ_LLM_BASE_URL`:

- Eigener GLM-Server (SGLang): `python -m sglang.launch_server --model-path zai-org/GLM-5.2 --port 8000` -> `http://127.0.0.1:8000/v1`
- Eigener Server (vLLM): `vllm serve zai-org/GLM-5.2 --port 8000` -> `http://127.0.0.1:8000/v1`
- llama.cpp Server: `http://127.0.0.1:8080/v1`

## Was der E2E-Test bewiesen hat (2026-07-03)

1. `GET /api/health` -> ok, `GET /` liefert die App mit allen Composer-Werkzeugen.
2. `/assets/*` inkl. `composer-tools.js` und `ai/chatClient.js` (Fallback src/ai -> public/ai).
3. Fehlende Assets antworten 404 — frueher crashte ein unbehandelter
   ReadStream-Fehler den ganzen Prozess (behoben in src/server.js, streamFromDir).
4. `POST /api/agent` und `POST /api/chat` streamen die Antwort des konfigurierten
   OpenAI-kompatiblen Endpoints tokenweise als SSE in den Chat.

## Abgrenzung

- smejj.com (GitHub Pages) bleibt statisch: dort antworten die Modi "BYOK" und
  "local browser" client-seitig (public/ai/chatClient.js); Server-Modi bleiben offline.
- Ein OEFFENTLICHER Control Server braucht eine Betriebsort-Entscheidung
  (siehe PROMPT_WEITERMACHEN.md, Punkt 1) — nichts davon ist hier noetig.
