# Auth-Dokumentation und Release-Plan — 2026-07-13

## 1. Architektur (neu implementiert, lokal verifiziert)

Module (alle < 800 Zeilen, dep-frei, fail-closed):

- `control-server/src/auth/passwordHash.js` — scrypt (N=32768, r=8, p=1, 32-Byte-Key),
  versioniertes Format `scrypt$v1$…`, timing-sicherer Vergleich, Passwort-Policy
  (min. 10 Zeichen). Niemals Klartextspeicherung.
- `control-server/src/auth/emailUserStore.js` — Kontenablage
  `auth/email-users/{sha256(email)}.json` in IDrive e2 (Memory-Fallback lokal).
  Nur Hashes (Passwort scrypt, Tokens SHA-256). Session-Registry je Nutzer.
- `control-server/src/auth/emailAuthService.js` — Registrierung (enumeration-
  sicher, optionale Allowlist `SMEJJ_AUTH_ALLOWED_EMAILS`), Login (Lockout nach
  8 Fehlversuchen für 15 min, Timing-Angleichung), E-Mail-Verifikation
  (24-h-Einmal-Token), Passwort-Reset (30-min-Einmal-Token, Hash-Ablage,
  Einmalverwendung, Session-Invalidierung), Passwortwechsel (beendet andere
  Sessions), Session-Liste/-Widerruf, Konto-Export, Konto-Löschung
  (Soft-Delete nur mit Passwort + wörtlich „KONTO LÖSCHEN“).
- `control-server/src/auth/mailer.js` — minimaler SMTP-Client (465 implizites
  TLS / 587 STARTTLS, TLS ≥1.2). Fail-closed: ohne `SMEJJ_SMTP_*` wird ehrlich
  `email_delivery_unconfigured` gemeldet, nie heimlich gesendet.
- `control-server/src/routes/emailAuthRoutes.js` — Endpunkte mit IP-Rate-Limits
  (Login ~8/min, Registrierung ~5/h, Reset ~5/15min), no-store-Headern und
  serverseitigem Session-Registry-Check (`emailSessionStillValid`, 30-s-Cache,
  fail-closed bei Storage-Störung).

## 2. Endpunkte

POST `/api/auth/email/register|login|verify|reset/request|reset/confirm|password/change`
GET `/api/auth/sessions`, POST `/api/auth/sessions/revoke`,
GET `/api/auth/account/export`, POST `/api/auth/account/delete`.
Bestehend: `/api/auth/google`, `/api/auth/logout` (jetzt mit serverseitigem
Session-Widerruf), Passkey-Routen unverändert.

## 3. Session-Sicherheit

- Cookie `smejj_session`: HttpOnly, Secure, SameSite=Lax, Max-Age 7 Tage.
- HMAC-SHA256-signierter Token; E-Mail-Sessions tragen zusätzlich eine
  Server-Session-ID (`sid`), neu bei jedem Login (Fixation-Schutz), server-
  seitig widerrufbar (Logout, Reset, Passwortwechsel, Fern-Widerruf, Ablauf).
- CSRF/Origin: globale Origin-Prüfung für alle Mutationen
  (`isSafeMutatingControlRequest`); Fremd-Origin → 403 (lokal verifiziert).
- Google: Nonce+State signiert, Issuer/Audience/`email_verified`/Allowlist
  geprüft (bestehend); Live-Konfiguration verifiziert (2026-07-13):
  `configured:true`, Allowlist `smejjcom@gmail.com`.
- Passkey: RP-ID/Origin-Prüfung, Sign-Count-Update, mehrere Credentials je
  Nutzer, Widerruf über Store vorbereitet (bestehend); Assets live 200.
- Apple Login: extern blockiert — kein vorhandener kostenloser Apple-OAuth-
  Zugang; Developer-Mitgliedschaft wird NICHT gekauft. UI meldet dies ehrlich.

## 4. Lokal bestandene Verifikation (2026-07-13)

- `tests/email-auth.test.mjs`: 12/12 (Hashing, Lockout, Verify-/Reset-Token,
  Sessions, Passwortwechsel, Allowlist, Mailer, Routen, Konto-Löschung).
- HTTP-E2E gegen laufenden lokalen Server: Registrierung → 401 bei falschem
  Passwort → Login mit HttpOnly-Cookie → /me → Session-Liste → 403 bei
  Fremd-Origin → Export → Logout mit Server-Widerruf → /me `false` →
  Login-/Register-Seiten 200.
- Pipeline: 32 `check:*`-Suiten grün inkl. control-server 161/161, users 24/24,
  passkey, start-lock 26/26 byteidentisch, favicon-lock, guidelines (560
  Dateien), release-safety, rollback. Umgebungsbedingt offen NUR
  `check:branding`/1 Frontend-Test (natives resvg-Binary existiert nicht für
  die Linux-arm64-Sandbox; auf dem Mac heute grün; Favicons per Lock
  byteidentisch belegt).

## 5. Release-Reihenfolge (zwingend)

Die Live-Produktion (Salad `smejj-control`) besitzt die neuen Routen noch
NICHT. Auth-Seiten dürfen erst NACH dem Control-Deploy publiziert werden,
sonst wäre E-Mail-Login live sichtbar, aber kaputt.

1. Secret-Rotation gemäß `SECRET_ROTATION_RUNBOOK_2026-07-13.md` (Nutzerschritte).
2. Auf dem Mac (mit `~/.config/smejj.com/env.local`):
   `npm run check:all && npm run release:preflight`
   → `npm run control:artifact` → `npm run idrive:control-release`
   (deterministisches Artefakt, If-None-Match-Upload, SHA-256-Readback).
3. Salad `smejj-control`: neue Version mit dem neuen Artefakt-Key starten;
   Health → `ok:true, ai:true, storage:true`; dann
   `POST /api/auth/email/register` (Allowlist-Konto) live testen.
4. GitHub Pages (SmejjCom/smejj-app-frontend, Free-Branch-Deploy, keine
   Actions): publizieren von `auth/login/index.html`, `auth/register/index.html`,
   `assets/auth/auth-page.js`, `assets/auth/auth.css`, `assets/account-sessions.js`,
   `assets/account-privacy.js` (Cache-Buster `?v=` erhöhen).
5. Live-Tests Desktop+Mobil: Login/Logout/Reset/Passkey/Google/Sessions/
   Export/Löschung; Browserkonsole 0 Fehler; Startseite+Composer bytegenau
   vergleichen (`check:start-lock` gegen Live-Dateien).
6. Rollback: Salad auf vorherige Version; Pages-Commit revertieren;
   Quell-Rollback `backups/rollback-2026-07-13-restarbeiten/`.

## 6. Externe Blocker (nur echte Nutzeraktionen)

1. Secret-Eingabe in Portale (IDrive/Z.ai/Moonshot/Salad-Env) — persönlich.
2. SMTP-Zugang für E-Mail-Verifikation/Reset-Mails: Gmail-App-Passwort
   (erfordert persönliche MFA) ODER anderer vorhandener SMTP-Zugang; Werte
   nur als `SMEJJ_SMTP_*` in Salad-Env. Bis dahin: Registrierung funktioniert,
   Verifikation wird nicht erzwungen (fail-closed dokumentiert).
3. IDrive-Upload + Salad-Deploy des Control-Artefakts: Ausführung auf dem Mac
   (Zugangsdaten liegen nur dort) oder nach Rotation durch Agent-Session mit
   lokalem Terminalzugriff.
4. Apple Login: bleibt blockiert (kein kostenloser Zugang; kein Kauf).
