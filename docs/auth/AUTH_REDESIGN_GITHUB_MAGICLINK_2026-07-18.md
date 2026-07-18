# Task Capsule — Auth-Redesign + GitHub-Login + Magic Link (2026-07-18)

Job-Kontext: Login/Registrierung nach Mockup neu gestaltet, zwei neue Login-Methoden
(GitHub, Magic Link) ergänzt. Apple bewusst zurückgestellt. Branch:
`feature/auth-redesign-github-magiclink`. Rollback-Tag: `rollback/pre-auth-redesign-2026-07-18`.

## Ziel

- Login, Registrierung optisch am Mockup, in der bestehenden smejj.com-Designsprache.
- Neue Methoden: GitHub-Login (eigene OAuth-App) und Magic Link (passwortlos, E-Mail).
- Alle Methoden fail-closed: sichtbar nur bei serverseitiger Konfiguration.

## Fachliche Entscheidungen (bewusst getroffen)

1. Markenschreibweise überall `smejj.com` (nicht „smejj" wie im Mockup) — Naming-Lock.
2. Statt Tabler-Icons per CDN: **inline-SVG** (MIT-Lizenz) — No-CDN/Free-only-Policy.
3. Warmes smejj.com-Dark-Theme beibehalten (Konsistenz mit der App), Layout/Komponenten
   folgen dem Mockup — statt das fremde Slate-Farbschema zu übernehmen.
4. GitHub-Login als **eigene OAuth-App** (`SMEJJ_GITHUB_LOGIN_*`), strikt getrennt vom
   bestehenden GitHub-App-Publisher (`SMEJJ_GITHUB_APP_*`).
5. GitHub verlangt eine **verifizierte** GitHub-E-Mail (kein Account-Takeover).
6. Magic-Link-Token: HMAC-signiert (sessionSecret), 15 Min. gültig, best-effort Single-Use.
7. Apple: nur Platzhalter, per `/api/auth/config` ausgeblendet (Backend folgt später).
8. Profil-Methodenverwaltung („alle Methoden = ein Konto") **zurückgestellt**: braucht ein
   Account-Linking-Modell (Provider per verifizierter E-Mail zu einem Kontodatensatz). Das
   aktuelle Modell ist stateless-pro-Methode. Kein Fake-Panel — ehrlich/fail-closed.

## Geänderte / neue Dateien

Backend (neu): `src/auth/githubAuth.js`, `src/auth/githubAuthRoutes.js`,
`src/auth/extraAuthRoutes.js`, `control-server/src/routes/magicLinkRoutes.js`.
Backend (geändert): `src/server.js` (Wiring, Methods-Report, ≤800 Zeilen),
`src/shared/platform.js` (ROUTES), `public/config.js` (CLIENT_ROUTES), `.env.example`.
Frontend (geändert): `public/auth/login/index.html`, `public/auth/register/index.html`,
`public/auth/auth.css`, `public/auth/auth-page.js`.
Tests (neu): `tests/github-auth-routes.test.mjs`, `tests/magic-link.test.mjs`.

## Verifikation (lokal ausgeführt, grün)

- Unit-Tests: `github-auth-routes` + `magic-link` = 14, plus `google-auth-routes`/
  `session-token`/`control-access-policy`/`cors` = 15 → keine Regression.
- Frontend: `auth-pages`, `i18n-ui` (inkl. Orphan-Key- und 15-Sprachen-Test), `a11y-structure`,
  `auth-ui` = 22 grün.
- `check:guidelines` grün (server.js exakt 800 Zeilen), `check:favicon-lock` grün.
- Live-HTTP-Smoke (eigener Harness, Routen über echten http.Server): GitHub-Start → 303 zu
  github.com; Magic-Link-Verify → 303 + gültiges `smejj_session`-Cookie (method=magiclink);
  Magic-Link ohne SMTP → 503 fail-closed.

## Vorbestehende Blocker (NICHT von diesem Task verursacht, vor Go-Live zu klären)

1. **Control-Server bootet aktuell nicht**: `control-server/src/routes/jobRoutes.js`
   importiert `runFreeAppExecutor` aus `src/jobs/index.js`; der uncommittete Arbeitsstand
   dieser Datei hat den Export entfernt (HEAD hatte ihn). Muss repariert/committet werden.
2. Vorbestehende rote Checks aus dem Arbeitsstand (nicht auth-bezogen):
   `check:start-lock` meldet `public/ai/chatClient.js: VERAENDERT`; 5 `check:frontend`-Tests
   (Startseite/Composer/Branding/Routing) — alle aus vorbestehender, uncommitteter Drift.

## Go-Live-Schritte (nach schriftlicher Freigabe, DEPLOYMENT_PLAN)

1. Vorbestehende Blocker oben klären (v. a. `src/jobs/index.js`-Export).
2. GitHub OAuth App registrieren (Settings → Developer settings → OAuth Apps):
   Callback `https://<control-server-origin>/api/auth/github/callback`. Client-ID/Secret in
   die Secret-Umgebung setzen: `SMEJJ_GITHUB_LOGIN_CLIENT_ID`, `SMEJJ_GITHUB_LOGIN_CLIENT_SECRET`.
3. Für Magic Link: `SMEJJ_SMTP_*` konfiguriert sicherstellen.
4. `pnpm run check:all` + `release:preflight` grün.
5. Staging deployen, Live-Test (siehe unten), dann Produktion nach schriftlicher Freigabe.

## Live-Test-Checkliste

- `/auth/login/` und `/auth/register/` laden; nur konfigurierte Methoden sichtbar.
- GitHub-Button → GitHub-Consent → Rückkehr in die App angemeldet.
- Magic Link anfordern → E-Mail-Link → in der App angemeldet; Link zweitmalig ungültig.
- Bestehende Methoden (E-Mail, Google, Passkey) unverändert funktionsfähig.

## Memory_Bank.md — vorgeschlagener Eintrag (nach Validierung)

> 2026-07-18 (Job auth-redesign-github-magiclink): GitHub-Login (eigene OAuth-App,
> Authorization-Code-Flow, verifizierte E-Mail-Pflicht) und Magic-Link-Login (HMAC-Token,
> 15 Min., Single-Use, SMTP-Mailer) als fail-closed Methoden ergänzt; Login/Registrierung
> nach Mockup in bestehender Designsprache neu gebaut (inline-SVG, kein CDN). Router-Wiring
> in `src/auth/extraAuthRoutes.js` ausgelagert (server.js ≤800 Zeilen). 36 Auth-/Frontend-
> Tests grün, Live-HTTP-Smoke grün. Muster: externe Login-Provider injizierbar + unit-testbar
> analog Google. Offen: Account-Linking-Modell für Profil-Methodenverwaltung.
