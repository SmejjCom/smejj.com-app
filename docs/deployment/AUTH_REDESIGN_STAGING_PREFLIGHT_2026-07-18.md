# Staging-Preflight — Auth-Redesign + GitHub-Login + Magic Link (2026-07-18)

Freigegeben von Wof Kadavanich (schriftlich, 2026-07-18): Commit, lokale Checks +
Boot-Test, Staging-Vorbereitung — ausschließlich auf Branch
`feature/auth-redesign-github-magiclink`, kein Produktions-Deploy, kein Anfassen
von Secrets, keine Änderung an Live-Website/Config/Policies, Non-Regression-Pflicht.

## 1. Rollback-Punkt (gesetzt)

- Tag: `rollback/pre-auth-redesign-2026-07-18` (Stand vor diesem Task).
- Voller Rückweg (falls nötig):
  `git checkout main` bzw. `git reset --hard rollback/pre-auth-redesign-2026-07-18`.
- Produktion ist unangetastet; ein Rückzug betrifft nur den Branch.

## 2. Commit sichern (Freigabe Punkt 1)

Voraussetzung: altes Lock entfernen (einmalig, wegen früherem git-Absturz):

```
cd "<Projektordner>"
rm -f ".git/index.lock"
```

Dann committen (nur die freigegebenen Dateien):

```
git add \
  src/auth/githubAuth.js src/auth/githubAuthRoutes.js src/auth/extraAuthRoutes.js \
  control-server/src/routes/magicLinkRoutes.js \
  tests/github-auth-routes.test.mjs tests/magic-link.test.mjs \
  src/server.js src/shared/platform.js public/config.js .env.example \
  src/jobs/index.js \
  public/auth/login/index.html public/auth/register/index.html \
  public/auth/auth.css public/auth/auth-page.js \
  docs/auth/AUTH_REDESIGN_GITHUB_MAGICLINK_2026-07-18.md \
  docs/deployment/AUTH_REDESIGN_STAGING_PREFLIGHT_2026-07-18.md
git commit -m "feat(auth): GitHub-Login + Magic Link + Login/Registrierung-Redesign

Backend (GitHub OAuth code flow, Magic Link SMTP), Frontend-Redesign (inline-SVG,
fail-closed Methoden), Boot-Fix (src/jobs/index.js Re-Export). 43 Tests gruen."
```

## 3. Preflight-Checkliste (Freigabe Punkt 2 — lokal ausführen)

Boot-Test (bestätigt den Boot-Fix + neue Routen):

```
SMEJJ_SESSION_SECRET=test123456789 PORT=3999 node src/server.js
# erwartet: "smejj.com Code MVP: http://127.0.0.1:3999" ohne runFreeAppExecutor-Fehler
# dann in zweitem Terminal:
curl -s localhost:3999/api/auth/config      # -> methods-Objekt sichtbar
curl -s -o /dev/null -w "%{http_code}\n" localhost:3999/api/auth/github  # -> 503 (fail-closed, ohne Secret)
```

Zielgerichtete Tests (bereits grün geprüft, zur Wiederholung):

```
node --test tests/github-auth-routes.test.mjs tests/magic-link.test.mjs \
  tests/google-auth-routes.test.mjs tests/session-token.test.mjs \
  tests/auth-pages.test.mjs tests/i18n-ui.test.mjs tests/a11y-structure.test.mjs \
  tests/auth-ui.test.mjs                       # erwartet: 43 pass, 0 fail
node scripts/check-guidelines.mjs              # OK
node scripts/check-favicon-lock.mjs            # OK
```

Vor Release zusätzlich (dein Standard): `pnpm run check:all` und `release:preflight`.

## 4. Bekannte, VORBESTEHENDE rote Checks (nicht aus diesem Task)

Damit Staging nicht verwirrt: Diese waren schon vor dem Task rot (uncommittete Drift),
nicht auth-bezogen, von mir NICHT verändert:
- `check:start-lock`: `public/ai/chatClient.js: VERAENDERT`.
- 5 `check:frontend`-Tests (Startseite/Composer/Branding/Routing).
Empfehlung: vor Release separat klären/committen.

## 5. Release-Notiz (Entwurf)

> Auth: GitHub-Login (eigene OAuth-App, verifizierte E-Mail-Pflicht) und Magic-Link-
> Login (SMTP, 15-Min-Single-Use-Token) ergänzt, beide fail-closed. Login/Registrierung
> nach Mockup neu (inline-SVG, smejj.com-Design). server.js ≤800 Zeilen. Boot-Fix für
> `src/jobs/index.js`. 43 Tests grün, Live-HTTP-Smoke grün.

## 6. Go-Live (bleibt bei dir — NICHT Teil dieser Freigabe)

1. GitHub Client-Secret generieren, `SMEJJ_GITHUB_LOGIN_CLIENT_ID/SECRET` + `SMEJJ_SMTP_*`
   in die Server-Umgebung setzen.
2. Deploy über dein Skript (`smejj.com Auth-Release.command` / `Deploy.command`).
3. Staging testen → schriftliche Produktions-Freigabe → Live-Test → Release-Notiz sichern.

## 7. Live-Test nach Deploy (Kurzcheck)

- `/auth/login/` + `/auth/register/` laden; nur konfigurierte Methoden sichtbar.
- GitHub-Button → Consent → zurück in der App angemeldet.
- Magic Link anfordern → E-Mail-Link → angemeldet; Link zweitmalig ungültig.
- E-Mail/Google/Passkey unverändert funktionsfähig (Non-Regression).
