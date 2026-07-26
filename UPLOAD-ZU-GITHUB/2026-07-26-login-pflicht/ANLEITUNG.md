# Login-Pflicht (Auth-Gate) — LIVE seit 2026-07-25 abends

> **ERLEDIGT — nichts mehr hochzuladen.** Dieser Ordner ist Doku + Rollback.

## Was live ist

smejj.com verlangt jetzt eine Anmeldung, bevor die App nutzbar ist
(Freigabe Betreiber 2026-07-25: "erst einloggen, dann nutzen", wie claude.ai).

- Neu: `assets/auth-gate.js` (Kopie hier im Ordner) — leitet Abgemeldete
  auf `/auth/login/` um. Angemeldete (Server-Token oder lokales Profil)
  merken nichts. Fail-closed bei gesperrtem Storage.
- `assets/profile-dock.js`: +1 Zeile `import "./auth-gate.js?v=1";` (App-Shell `/`)
- `assets/voice-landing.js`: +1 Zeile `import "./auth-gate.js?v=1";` (Sprachseiten `/en/` ...)
- Oeffentlich bleiben: `/auth/*`, `datenschutz.html`, `impressum.html`, `maus-replay.html`

## Live-Tests (2026-07-25, bestanden)

- `/` ohne Anmeldung → `/auth/login/` ✓
- `/en/` ohne Anmeldung → `/auth/login/` ✓
- `/` mit Token → App laedt, Start-Design unveraendert (#startSend, #profileDock) ✓
- start-lock, favicon-lock, check:guidelines OK; 21 Tests gruen
  (5 neue in tests/auth-gate.test.mjs)

## Rollback

Gate abschalten = in `assets/profile-dock.js` und `assets/voice-landing.js`
die eine Zeile `import "./auth-gate.js?v=1";` entfernen (GitHub-Web-Editor,
je 1 Commit). `assets/auth-gate.js` kann liegen bleiben (ohne Import inaktiv).

## Quelle

Code-Repo smejj.com-app, Branch `feature/auth-redesign-github-magiclink`,
Commit `d818db8` (Gate + Importe + Tests).
