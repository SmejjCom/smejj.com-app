# Produktionsstand und Rollback-Weg — smejj.com, 14.09.2026 (Phase 0 des Prüfplans)

Aufgenommen VOR der ersten Änderung der A-bis-Z-Prüfung. Keine Geheimniswerte, nur Namen und Stände.

## Rollback-Punkte

| Ort | Kennung | Stand |
|---|---|---|
| Arbeitszweig `feature/design-start-chat-2026-09-13` (GitHub + Codeberg) | Tag `stand-2026-09-14-vor-qa-a-bis-z` | 95e06b2a |
| Frontend-Klon `~/smejj-app-frontend` → GitHub Pages `main` | Tag `stand-2026-09-14-vor-qa-a-bis-z` | 6abe1b1 (deploy design-v12d) |
| Control-Server (Zeabur) | Container läuft mit Commit 0cedb084 (Bau-Wache 13.09.) | gestartet 2026-09-13 19:44 UTC |
| Chat-Brücke (Zeabur) | 20260907-v150-smejj-familie (Brückenwächter) | gesund, 181 Prüfungen |
| Hausmodell (Zeabur) | deploy/smejj-hausmodell 2f58741a | HTTP 200 |
| Maus-Engine (Zeabur) | HTTP 200 | — |

Rollback Frontend: im Klon `git revert` auf den Deploy-Commit (kein Force-Push), Push auf `main`, 1–3 min Pages, SW-Marke live prüfen.
Rollback Server: Zeabur-Konsole → vorheriger Bau (Redeploy) — oder Bau-Zweig auf den vorherigen Commit setzen und pushen.
Rollback Daten: Tages-Schnappschuss `sicherung_2026-09-13` (8 Ablagen, 37 Datensätze, Prüfsumme geprüft, Rücksicherung geprobt); Chats über Replikation 2430_1 im Eimer `smejj-sicherung` (nur IDrive-Konsole).
`npm run check:rollback` am 14.09.: ok, rollbackAvailable true.

## Live-Stand

- Frontend: `smejj.com`, Service Worker `smejj-shell-v867`, Startseite HTTP 200 in 0,33 s, 74,6 KB.
- API: `api.smejj.com` → `smejj-control.zeabur.app`, `/api/health` ok, Standardmodell `glm-5-2`, Backend-Schnellspur `zhipu:glm-4.5-flash`.
- Verbindungs-Landkarte (`kette-pruefen.mjs`): 17 von 17 messbaren Kanten stehen (nach dem Codeberg-Nachzug).
- Ampel (85 Autopiloten): 76 grün, 2 gelb, 7 rot — siehe unten.
- Play Console: `com.smejj.app`, interner Test Release 1 (1.0.0.0) live seit 08.09., Produktion in Prüfung seit 09.09.
- Apple: Registrierung X29W6DM972 wartet (Unterlagen 14.09. hochgeladen).

## Sperren (Manifeste, alle unter Versionskontrolle)

`docs/frontend/start-lock-manifest.json`, `docs/frontend/favicon-lock-manifest.json`, `docs/frontend/marken-manifest.json`,
`docs/security/security-lock-manifest.json`, `docs/security/admin-lock-manifest.json`, `docs/deploy/deploy-lock-manifest.json`,
`docs/approvals/abo-lock-manifest.json`, `docs/approvals/modell-menue-lock-manifest.json`, `docs/approvals/einwilligung-lock-manifest.json`.
Stempel nur über die Kaskade (`scripts/einmal/*.sh`) mit Betreiber-Wortlaut.

## Konfiguration (nur Namen)

Lokal `~/.config/smejj.com/env.local`: IDRIVE_E2_* (Endpoint, Region, Access, Secret, Bucket), GOOGLE_CLIENT_ID, SMEJJ_SESSION_SECRET,
SALAD_*, SMEJJ_GITHUB_APP_* / PUBLISHER_*, SMEJJ_GITHUB_LOGIN_*, SMEJJ_MAUS_ENGINE_TOKEN, SMEJJ_LLM_ZHIPU_*, SMEJJ_LLM_GROQ_API_KEY,
SMEJJ_SEARCH_TAVILY_API_KEY, SMEJJ_ADMIN_OWNER_EMAILS, SMEJJ_SMTP_*, STRIPE_SECRET_KEY, SMEJJ_HAUSMODELL_KEY.
Zeabur zusätzlich: SMEJJ_LLM_SMEJJ1_API_KEY (13.09.), Zeabur-API-Schlüssel (ABGELAUFEN, 401 — Betreiber).

## Sicherung

- Nr. 46 Daten-Sicherung: täglich, `sicherung/taeglich/sicherung_JJJJ-MM-TT`, Aufbewahrung 30 Tage; Nr. 47 Wiederherstellungs-Probe grün.
- Code-Sicherung → e2: heutiger Stand liegt in e2 (7 Schnappschüsse).
- Codeberg-Spiegel: Mac-Job `com.smejj.codeberg-spiegel` täglich 14:20; am 14.09. von Hand nachgezogen (3 Zweige waren im Rückstand). Die GitHub-Action bleibt rot, bis der Betreiber `CODEBERG_TOKEN` einträgt.
- Zweiter Eimer `smejj-sicherung`: Replikation 2430_1 (ganzer Eimer) + 2431_1 (sicherung/); Dienst-Schlüssel hat dort bewusst keinen Zugriff; Prüfung nur in der IDrive-Konsole.

## Rote Ampeln beim Start (14.09., 22:45 UTC-Stand 13.09.)

1. codeberg-spiegel — Action ohne Secret (Betreiber); Mac-Job trägt allein.
2. synthetic-user-watchdog — Nutzerreise P1: `sw.js` auf smejj.com weicht von api.smejj.com ab (Bündel-Gleichheit).
3. oberflaechenwache — Betriebswerte nicht messbar, Zeabur-Schlüssel 401 (Betreiber).
4. modell-katalog-wache — `zhipu:glm-4.5-flash` beim Anbieter verschwunden.
5. ai-act-wache — smejj-1 ohne Bestandsverzeichnis-Eintrag (Art. 50).
6. tiefe-spur-messung — Note 80,4 %, 2 kritisch, p95 63 s.
7. schutz-echtheit — 14 Sperren bewachen eine Fassung, die niemand bekommt.
