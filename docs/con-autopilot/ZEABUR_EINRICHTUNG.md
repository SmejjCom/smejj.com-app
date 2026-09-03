# con-Autopilot auf Zeabur einrichten (Betreiber-Klicks, einmalig)

Stand 2026-09-03. Der Code liegt im Bauzweig (`feature/auth-redesign-github-magiclink`),
Dockerfile `Dockerfile.con-autopilot`. Bis der Zeabur-Dienst laeuft, tickt der Kreislauf
vom Mac aus (`node workers/con-autopilot/cli.mjs tick`, alle 5 Minuten).

## 1. Dienst anlegen (Zeabur-Portal, Projekt `untitled-1`, Server Silicon Valley — dort sind ~3 GB frei)

1. Add Service → Git → Repository `SmejjCom/smejj.com-app`, Branch `feature/auth-redesign-github-magiclink`.
2. Dienstname exakt **`con-autopilot`** (dann greift `Dockerfile.con-autopilot`; Docker-Wal-Symbol pruefen).
3. Port 8080. Keine Domain noetig (optional `con-autopilot.zeabur.app` fuer das Dashboard).

## 2. Umgebungsvariablen (Add → Redeploy; die Liste wird beim Schreiben komplett ersetzt — immer alle setzen)

| Variable | Wert |
|---|---|
| `CON_AUTOPILOT_ENABLED` | `YES` |
| `CON_SALAD_FREIGABE` | `YES` (weglassen = nur beobachten, nie starten) |
| `CON_TAGESBUDGET_USD` | `5.5` (≈ 5 EUR/Tag; Ueberschreitung stoppt Salad-Jobs) |
| `CON_GESAMTDECKEL_USD` | Betrag je Auftrag, z. B. `20` |
| `CON_JOB_MAX_MINUTEN` | `170` |
| `CON_TAKT_MS` | `300000` |
| `CON_ADMIN_KEY` | frei gewaehltes Geheimnis fuer `POST /api/con/tick` |
| `CON_MIN_PAARE` | `3000` (Minuten-Test: `300`) |
| `IDRIVE_E2_ENDPOINT` | `https://s3.us-west-2.idrivee2.com` |
| `IDRIVE_E2_REGION` | `us-west-2` |
| `IDRIVE_E2_BUCKET` | `smejj-model-files` |
| `IDRIVE_E2_ACCESS_KEY` / `IDRIVE_E2_SECRET_KEY` | wie bei `smejj-control` |
| `SALAD_ORGANIZATION_NAME` | `smejjcom` |
| `SALAD_PROJECT_NAME` | `default` |
| `SALAD_API_KEY` | aus `~/.config/smejj.com/env.local` |

Optional: `CON_MESS_ENDPUNKT` (OpenAI-kompatibler Endpunkt fuer kostenlose Probemessungen, z. B. Mac-MLX).

## 3. Pruefen

- `https://<dienst>/health` → `{"ok":true,"aktiviert":true,"e2":true,"salad":true}`
- `https://<dienst>/api/con/dashboard` → Versionen, Kosten, laufender Job, naechster Schritt
- Zeabur-Log: `listening 0.0.0.0:8080 aktiviert=true takt=300s`, danach alle 5 min ein Takt.

## 4. Notbremsen

- `CON_NOTAUS=YES` setzen + Redeploy → stoppt den laufenden Salad-Job, startet nichts mehr.
- Sofort vom Mac: `node workers/con-autopilot/cli.mjs job:stop`
- Im Salad-Portal: Container-Gruppe `con-job` → Stop.
