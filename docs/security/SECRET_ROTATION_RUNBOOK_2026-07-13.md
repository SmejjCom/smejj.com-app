# Secret-Rotation-Runbook (AP1) — 2026-07-13

Status: VORBEREITET. Die eigentliche Schlüsseleingabe ist eine zwingende
persönliche Nutzeraktion (siehe „Warum Nutzeraktion“). Alles andere
(Reihenfolge, Tests, Widerruf, Verifikation) ist hier exakt vorgegeben.

## Warum Nutzeraktion

Neue Schlüsselwerte dürfen niemals in Chat-Protokollen, Task Capsules,
Screenshots oder Agent-Logs erscheinen (Schutzregel + Incident-Lehre vom
2026-07-11). Ein Agent, der den Wert aus dem Provider-Portal kopiert oder in
Salad-Env-Felder eintippt, protokolliert ihn zwangsläufig. Deshalb: Der
Nutzer erzeugt und trägt jeden Wert selbst ein; der Agent verifiziert danach
nur über Health-/Funktionstests (ohne Werte zu sehen).

## Grundregeln

- Reihenfolge je Secret: NEU erzeugen → in Salad-Env setzen (Env-only-Deploy)
  → Tests grün → erst DANN alten Wert widerrufen/löschen.
- Neue Werte zusätzlich in `~/.config/smejj.com/env.local` (lokal, außerhalb
  des Sync-Ordners) aktualisieren. Niemals in Repo, Google Drive oder Chat.
- Nach JEDER Rotation die Testbatterie (unten) ausführen.
- Auto-Recharge/Trials bleiben überall OFF.

## Betroffene Container Groups (Salad, Org smejjcom/default)

- `smejj-control` (Control Server; IDrive-, Session-, Zhipu-, Kimi-, Worker-Variablen)
- `smejj-chat-bridge-v88b-live` (Bridge; Zhipu-/Router-Variablen)
- kombinierter Browser-/Coding-Worker (Worker-Token/Callback)

## Rotationsschritte je Secret (Nutzeraktionen)

### 1. IDrive e2 Access/Secret Key
1. IDrive-e2-Dashboard → Access Keys → NEUEN Key erstellen (alten NICHT löschen).
2. Salad → smejj-control → Env: `IDRIVE_E2_ACCESS_KEY`, `IDRIVE_E2_SECRET_KEY`
   auf neue Werte setzen → Deploy (Env-only, neue Version).
3. Tests (unten) — insbesondere `storage:true`, IDrive-Read/Write.
4. Erst nach grünen Tests: alten Access Key im IDrive-Dashboard löschen.
5. Negativbeweis: alter Key liefert 403 (z. B. `aws s3 ls` mit altem Key).

### 2. Session Secret (`SMEJJ_SESSION_SECRET`)
1. Lokal erzeugen (nicht im Chat): `openssl rand -base64 48`
2. Salad → smejj-control → Env aktualisieren → Deploy.
3. Folge: ALLE bestehenden Sessions/Handoffs werden ungültig (gewollt);
   Worker-Token-Ableitung (HMAC aus Session-Secret) rotiert automatisch mit.
4. Tests: Login (Google/Passkey) neu, geschützte Route 401→200 nach Re-Login.

### 3. Worker-/Remote-Browser-Token
- Sofern explizites `SMEJJ_WORKER_*`/Callback-Secret gesetzt ist: neu erzeugen
  (`openssl rand -base64 32`), in smejj-control UND Worker-Group setzen,
  beide neu deployen. Wenn nur die HMAC-Ableitung aus dem Session-Secret
  genutzt wird, ist Schritt 2 ausreichend.

### 4. Z.ai / GLM-API-Key (`SMEJJ_LLM_ZHIPU_API_KEY`)
1. Z.ai-Konsole → API Keys → neuen Key „smejj-control-2026-07-13“ erstellen.
2. In smejj-control (und, falls dort direkt gesetzt, in der Chat-Bridge) eintragen → Deploy.
3. Tests: GLM-Chat (unten). 4. Alten Key in der Z.ai-Konsole löschen.

### 5. Kimi / Moonshot-API-Key (`SMEJJ_LLM_KIMI_API_KEY`)
1. platform.moonshot.ai → neuen Key erstellen → in smejj-control setzen → Deploy.
2. Tests: Kimi-Chat nativ; bei Störung muss der GLM-Fallback greifen.
3. Alten Key löschen.

### 6. Salad Account-API-Key
- Wurde am 2026-07-10 bereits rotiert und der alte Wert per 403 verifiziert
  (Memory_Bank). Nur erneut rotieren, falls er in der Exposition vom
  2026-07-11 sichtbar war.

### 7. Google OAuth Client
- Client-ID ist öffentlich (kein Secret; ID-Token-Flow ohne Client-Secret).
  Keine Rotation nötig; Redirect-URIs prüfen (siehe Auth-Doku).

## Testbatterie nach jeder Rotation

1. Control-Health: `GET https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/health`
   → `ok:true`, `ai:true`, `storage:true`.
2. IDrive-Read: Status-/Vault-Check über die App oder `npm run idrive:check`.
3. IDrive-Write/Presign: `npm run idrive:connection-test` (lokal mit env.local)
   oder App-Funktion „IDrive e2 prüfen“.
4. GLM-Chat: Prompt „Antworte exakt mit OK“ auf https://smejj.com/ →
   Header `x-smejj-model-backend: zhipu:glm-5.2`, kein Fallback.
5. Kimi-Chat: Modell Kimi K2.7 wählen → Antwort mit
   `x-smejj-model-fallback:false`; alternativ ehrlicher GLM-Fallback.
6. Worker-Health: `GET <worker>/health` → `codingWorker:true`.
7. Browser-Worker: integrierten Browser mit example.com öffnen (Screenshot).
8. Auth-Session: Login → `GET /api/auth/me` → `authenticated:true`;
   geschützte Route ohne Session → 401.

## Abschlusskriterium

Rotation gilt erst als abgeschlossen, wenn für JEDEN Wert gilt:
neuer Wert aktiv + Tests grün + alter Wert widerrufen + Negativbeweis
(403/401 mit altem Wert) im Incident-Protokoll notiert — ohne dass irgendwo
ein Klartextwert dokumentiert wurde.
