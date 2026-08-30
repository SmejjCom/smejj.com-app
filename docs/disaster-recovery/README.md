# Disaster Recovery smejj.com — Einstieg

Ausfall-Szenarien und ihre Wiederanlauf-Pfade. Grundprinzip: Das statische
Frontend (GitHub Pages) ist vom Control Server unabhängig — fällt Zeabur aus,
bleibt smejj.com als Seite erreichbar; Auth/Chat/API ruhen dann.

| Szenario | Wiederanlauf | Dokument |
| --- | --- | --- |
| DNS-Ausfall / Umzug | Records aus Bestandsliste neu anlegen (SPF als EINE Zeile!) | `../dns/`, insbesondere Bestand 2026-08-06 |
| Frontend kaputt | Rollback auf letzten Stand `SmejjCom/smejj-app-frontend@main` (Deploy-from-Branch) | `../deployment/ROLLBACK_PLAN.md`, `../deployment/GITHUB_PAGES_DEPLOY.md` |
| Control Server defekt | Neu-Bau aus Bauzweig `feature/auth-redesign-github-magiclink` via `control-neu-bauen.mjs`; Rollback-Stand in IDrive e2 | `../deployment/CONTROL_SERVER_ZEABUR_UMZUG.md` |
| GitHub-Ausfall | Codeberg-Spiegel (fünf private Repos) | `../architecture/CODEBERG_SPIEGEL.md` |
| Chat-Brücke defekt | Bündel neu bauen+pushen, Dienst-Restart (PREBUILT_V2) | `../deployment/DEPLOYMENT_PLAN.md` |
| Sync-Daten verlustig | Restore aus IDrive e2 mit Checksummen-Verifikation | `../architecture/SYNC_RECOVERY_POLICY.md`, `../storage/CHECKSUM_AND_RESTORE_TEST.md` |

Verbindliche Policys: `../architecture/ROLLBACK_AND_BACKUP_POLICY.md`,
`../architecture/SYNC_RECOVERY_POLICY.md`, `../architecture/SYNC_CONFLICT_POLICY.md`.

Regel: Nach jeder Wiederanlauf-Maßnahme komplette Verifikations-Pipeline
(`npm run check:all`) und Live-Test auf smejj.com.
