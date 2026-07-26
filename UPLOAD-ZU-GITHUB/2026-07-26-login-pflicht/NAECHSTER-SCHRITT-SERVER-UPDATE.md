# Server-Update: Magic-Link-Fix + GitHub-Login (vorbereitet 2026-07-25)

Alles ist vorbereitet — es fehlen nur zwei Nutzer-Handgriffe (Geheimnisse
fasst Claude grundsaetzlich nicht an).

## Bereitgestellt (fertig)

- **Release-Paket mit Magic-Link-Fix** (lokal gebaut, deterministisch, ohne Secrets):
  - Datei: `tmp/releases/smejj-control-magiclink-fix-2026-07-25-rc1.tar.gz`
  - SHA-256: `2445eed255245add52ae98d6cde394a04c644abfb3371c86ce7883c6431e5f0c`
  - Inhalt geprueft: enthaelt den Handoff-Verfall-Fix (Commit 89fab38), 579 Dateien.
- **GitHub-OAuth-App existiert**: "smejj.com Login", Client ID `Ov23liSqth5JlAHAtaZV`,
  Callback korrekt (`https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/auth/github/callback`).
  Es fehlt NUR ein Client Secret (nie erzeugt).

## Schritt A — GitHub-Login aktivieren (5 Minuten)

1. github.com → Settings → Developer settings → OAuth Apps → "smejj.com Login"
   → **"Generate a new client secret"** → Wert kopieren (wird nur einmal gezeigt).
2. portal.salad.com → Container Groups → **smejj-control** → **Edit**
   → Environment Variables → zwei neue Eintraege:
   - `SMEJJ_GITHUB_LOGIN_CLIENT_ID` = `Ov23liSqth5JlAHAtaZV`
   - `SMEJJ_GITHUB_LOGIN_CLIENT_SECRET` = (kopierter Wert)
   → Speichern/Deploy. Der Login-Knopf "Mit GitHub anmelden" erscheint danach
   automatisch (fail-closed ueber /api/auth/config).

## Schritt B — Magic-Link-Fix live bringen

Variante 1 (empfohlen, Claude macht fast alles): IDrive-e2-Zugangsdaten
(ACCESS_KEY/SECRET_KEY/ENDPOINT/REGION/DEPLOY_BUCKET) selbst in eine lokale
`.env` im Projektordner eintragen (Vorlage: `.env.example`, Zeilen IDRIVE_E2_*).
Danach Claude Bescheid geben — Upload, SHA-Wechsel im Salad-Portal
(`SMEJJ_CONTROL_ARTIFACT_KEY`/`SMEJJ_CONTROL_ARTIFACT_SHA256`), Deploy
und Live-Test uebernimmt Claude. Rollback = alte KEY/SHA-Werte zuruecksetzen
(dokumentiert im Salad-Versionsverlauf).

Variante 2: Wie im Runbook docs/security/INCIDENT_ROTATION_2026-07-13.md —
Nutzer laedt das Paket selbst nach IDrive (deployments/control/…) und setzt
KEY/SHA im Portal.

## Danach (Claude, automatisch)

- Live-Test Magic-Link mit >2 Minuten Wartezeit (der eigentliche Fehlerfall)
- Live-Test GitHub-Login Ende-zu-Ende
- Frontend-Kosmetik (neutrale Fehlermeldung, Commit 89fab38) deployen
- Abschlussbericht + Locks pruefen
