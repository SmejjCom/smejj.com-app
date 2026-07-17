# smejj.com — GLM 5.2 als Fundament live schalten (Anleitung, 2026-07-09)

Stand der Pruefung vom 2026-07-09 (live verifiziert):

- Live-Chat/Coding auf smejj.com funktioniert (SSE-Stream OK), antwortet aber
  ueber das Salad-TGI-Backend (Qwen3 8B) — NICHT ueber GLM 5.2.
- Der Modell-Router (`control-server/src/llm/modelRouter.js`) unterstuetzt
  GLM 5.2 bereits vollstaendig: Provider `zhipu`, Default-Modell `glm-5.2`
  fuer die Profile coding/reasoning/default. Es ist KEIN Code-Change noetig.
- GLM-5.2-FP8-Vault in IDrive e2 ist verified-complete (149/149 Objekte,
  141 Safetensors, 703,8 GiB, verifiziert 2026-06-24) unter
  `s3://smejj-model-files/model-files/glm-5-2-fp8/original/`.
- WICHTIG: Der Vault ist Speicher, kein Inferenz-Rechner. Die FP8-Gewichte
  koennen auf keiner Salad-Consumer-GPU laufen (siehe
  `docs/architecture/NO_BIG_SERVER_KIMI_STRATEGY.md`). Der Free-only-konforme
  Weg zu echtem GLM 5.2 ist die offizielle Zhipu-API (BYOK, pay-per-use,
  Key traegt der Nutzer ein) — der Vault bleibt Grundlage fuer spaeteres
  Self-Hosting/Partner-Compute.

## UPDATE 2026-07-09 (Live-Pruefung im Salad-Portal): Chat laeuft ueber die chat-bridge

Der Live-Chat/Coding laeuft NICHT ueber den modelRouter von smejj-control,
sondern ueber die Container Group **smejj-chat-bridge-v88b-live**
(Access Domain: starfruit-thyme-cblgn6u06ca2z9d5.salad.cloud, Code:
`public/chat-bridge.js`, Quelle: raw.githubusercontent smejj-app-frontend).
Die Bridge spricht direkt EIN OpenAI-kompatibles Backend an:
`SMEJJ_LLM_SALAD_BASE_URL` + `SMEJJ_LLM_SALAD_API_KEY` + `SMEJJ_LLM_SALAD_MODEL`.
Header-Logik: mit `SMEJJ_LLM_HEADER=Authorization` sendet die Bridge korrekt
`Authorization: Bearer <key>` (chat-bridge.js Zeile 276).

**Der schnellste Weg zu GLM 5.2 live ist daher ein Env-Edit an
`smejj-chat-bridge-v88b-live` (nicht an smejj-control):**

| Variable | Alt (Rollback) | Neu |
|---|---|---|
| SMEJJ_LLM_SALAD_BASE_URL | https://tangerine-dill-g0pw1k0sdg3rhtb0.salad.cloud/v1 | https://api.z.ai/api/paas/v4 |
| SMEJJ_LLM_SALAD_API_KEY | (Salad-Gateway-Key, beim Nutzer) | (Z.ai-API-Key, beim Nutzer) |
| SMEJJ_LLM_SALAD_MODEL | tgi | glm-5.2 |
| SMEJJ_LLM_HEADER | (nicht gesetzt) | Authorization (NEU hinzufuegen) |

Alle anderen Variablen (PORT, SMEJJ_HOST, SMEJJ_CONTROL_ORIGIN,
SMEJJ_CHAT_BRIDGE_TIMEOUT_MS) NICHT anfassen. Nichts loeschen.
Rollback = die 3 Werte zuruecksetzen + SMEJJ_LLM_HEADER entfernen.

Hinweis Z.ai statt open.bigmodel.cn: open.bigmodel.cn ist die China-Plattform
(Login nur per chinesischer Handynummer). Fuer smejj.com gilt die
internationale Plattform **Z.ai** (Google-Login moeglich):
API-Keys unter https://z.ai/manage-apikey/apikey-list,
Endpoint https://api.z.ai/api/paas/v4, Modell-ID `glm-5.2`, Bearer-Auth.

Der zhipu-Pfad im modelRouter (unten) bleibt der richtige Weg, sobald der
Control-Server-Router wieder der Live-Chat-Pfad wird; fuer den Router gilt
dann zusaetzlich `SMEJJ_LLM_ZHIPU_BASE_URL=https://api.z.ai/api/paas/v4`
(Katalog-Default zeigt auf open.bigmodel.cn).

## Warum nicht vom Agenten gesetzt

Der Zhipu-API-Key ist ein Geheimnis. Kein KI-Agent tippt Keys (Policy,
siehe `docs/deployment/AI_AKTIVIERUNG_2026-07-05.md`). Alle Variablen werden
in EINEM Save gesetzt, damit der Live-Chat nie in einen 4xx-Zustand kippt.

## Schritt 1 — Zhipu-API-Key holen (Nutzerschritt)

1. Konto auf https://open.bigmodel.cn (Zhipu AI / Z.ai) anlegen bzw. anmelden.
2. API-Key erzeugen (Konsole -> API Keys). Abrechnung ist pay-per-use;
   kein Auto-Billing-Fallback in smejj.com — ohne Key bleibt alles fail-closed.

## Schritt 2 — Env-Variablen im Control-Server setzen (Salad-Portal)

Portal -> Container Groups -> **smejj-control** -> **Edit** ->
**Environment Variables** -> **Bulk Edit** -> folgende Zeilen ERGAENZEN
(bestehende Variablen NICHT loeschen, Image/Command/Probes NICHT anfassen):

```
SMEJJ_LLM_ZHIPU_API_KEY=<DEIN_ZHIPU_KEY>
SMEJJ_LLM_PROVIDER_ORDER=zhipu,salad,openrouter,custom
```

Wirkung:

- `zhipu` steht in der Fallback-Kette an erster Stelle: GLM 5.2 ist damit das
  Fundament-Modell fuer Chat, Coding und Agent.
- Salad/TGI (Qwen3 8B) bleibt automatischer Fallback, wenn Zhipu nicht
  erreichbar ist — Non-Regression, nichts geht kaputt.
- Optional uebersteuerbar: `SMEJJ_LLM_ZHIPU_MODEL=<modellname>` bzw.
  `SMEJJ_LLM_ZHIPU_MODEL_CODING=...` pro Profil.

## Schritt 3 — Live-Test (nach dem Roll)

1. `https://smejj.com` oeffnen, Nachricht senden -> Antwort streamt.
2. Pruefen, welches Backend geantwortet hat: Antwort-Header
   `x-smejj-model-backend` muss `zhipu:glm-5.2` zeigen (vorher `salad:tgi`).
3. Coding-Test: "Schreibe eine JavaScript-Funktion add(a,b). Nur Code."
4. Agent-Test ueber die App (Dateien lesen / Diff-Vorschlag) und
   `POST /api/terminal/run` mit erlaubtem Kommando.

## Bekannter Befund: IDrive-Bucket-Anzeige im Live-Status

`/api/models/status` zeigt live `objectCount: 0`, weil der Control-Server
`IDRIVE_E2_BUCKET=smejj-app` prueft, die Modell-Vaults aber in
`smejj-model-files` liegen. Die Dateien sind vorhanden und verifiziert;
nur der Live-Check schaut in den falschen Bucket.

NICHT einfach `IDRIVE_E2_BUCKET` umstellen: derselbe Wert wird fuer Jobs,
Projekte und Memory-Objekte genutzt (Regression-Gefahr). Sauberer Fix ist ein
separates `IDRIVE_E2_MODEL_BUCKET` (kleiner Code-Change + Tests) — als
Folgeaufgabe vorgesehen, erst nach schriftlicher Freigabe.

## Rollback

- Env-Rollback: die zwei neuen Variablen im Salad-Portal wieder entfernen ->
  Kette faellt automatisch auf `salad:tgi` zurueck.
- Doku-Rollback: diese Datei loeschen; `.env.example`-Sicherung liegt unter
  `backups/glm-fundament-2026-07-09/.env.example.bak`.

## Kosten- und Policy-Check

- GitHub bleibt Free-only, Cloudflare bleibt ungenutzt, IDrive e2 bleibt
  Hauptspeicher. Zhipu ist BYOK/pay-per-use durch den Nutzer — kein Trial,
  kein Auto-Billing, fail-closed ohne Key. Konform mit
  `docs/architecture/FREE_ONLY_MASTER_POLICY.md`.
