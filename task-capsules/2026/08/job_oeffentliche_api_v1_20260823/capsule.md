# Task Capsule — Oeffentliche API /v1 (job_oeffentliche_api_v1_20260823)

**Ziel:** smejj.com tritt als Modellanbieter auf: eigene API-Schluessel, OpenAI-kompatibles `/v1`, Selbstbedienung unter `/entwickler.html`.

**Rollback-Punkt:** `8d269819` (Arbeitsbranch), Bau-Branch vor dem Ausrollen `6ca3240f`.

**Commits (Bau-Branch `feature/auth-redesign-github-magiclink`):**
- `abe70763` feat(api): eigene Schluessel + /v1
- `cbf9fe8b` fix(api): Denken aus — Kunde bekam `content:""` bei `finish_reason: length`
- `254447b2` fix(api): Identitaet als erste Systemnachricht — Backend stellte sich als GLM vor

**Umgebung (Zeabur smejj-control, per Einzel-Mutation `createEnvironmentVariable`, 48 -> 50 Werte, nichts verloren):**
`SMEJJ_PUBLIC_API_ENABLED=1`, `SMEJJ_PUBLIC_API_BASE_URL=https://smejj-control.zeabur.app/v1`.
Domain `api.smejj.com` am Dienst angemeldet (Status `INVALID_DNS`, CNAME bei Spaceship steht aus — Spaceship im Browser gesperrt, kein API-Schluessel).

**Ship-Loop: 3 Runden.**
1. Ausgerollt 04:40Z. Live-Befund: `max_tokens=50` -> 50 Reasoning-Token, leerer Inhalt. → Fix Denken aus.
2. Ausgerollt 04:47Z. Live-Befund: Stream-Inhalt „the GLM language model trained by Z.ai". → Fix Identitaets-Systemnachricht.
3. Ausgerollt 04:49Z. Alles sauber.

**Live-Nachweis (https://smejj-control.zeabur.app, 2026-08-23 04:50Z):**
- `/entwickler.html` als smejjcom@gmail.com: Schluessel erzeugt (`smejj-live-••••CmSv`), Liste + Verbrauch gezeigt.
- `POST /v1/chat/completions` „Antworte mit genau einem Wort: Hallo" -> `"Hallo"`, `finish_reason: stop`, 1,6 s.
- Stream `smejj-1.0-fast` „1..5" -> 6 Chunks, jeder mit `model: smejj-1.0-fast`.
- „Wer bist du?" -> „Ich bin smejj 1.0, das Sprachmodell von smejj.com." (Stream und nicht-Stream).
- Ohne Schluessel 401 + `WWW-Authenticate`; OPTIONS 204; unbekannter Schluessel 401.
- Widerruf in der Oberflaeche -> derselbe Schluessel 401 `api_key_revoked`.
- `/v1/models` p: 0,41 / 0,42 / 0,42 s (Netz des Betreibers, siehe Memory „Netz ist der Flaschenhals").

**Tests:** `tests/oeffentliche-api.test.mjs` 19/19; check:frontend 604/604; check:architecture 7/7; favicon-lock OK; start-lock OK; assets-sync OK.

**Offen:** CNAME `api` -> `smejj-control.zeabur.app` bei Spaceship (Betreiber), danach `SMEJJ_PUBLIC_API_BASE_URL=https://api.smejj.com/v1`. Abrechnung (Verbrauch wird gezaehlt, nicht bepreist). Menueeintrag zu `/entwickler` (index.html unter Start-Lock).
