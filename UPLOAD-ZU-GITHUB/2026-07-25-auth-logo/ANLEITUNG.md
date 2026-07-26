# Auth: echtes smejj-Logo + E-Mail-Validierung live (2026-07-25)

> **ERLEDIGT — bereits deployt am 2026-07-25 abends.** Claude hat alle vier
> Dateien ueber den GitHub-Web-Editor auf main committet (baa34bf, d33c4bb,
> ababa8c; auth-page.js kam separat als a9b8aa6). Live-Test bestanden.
> Dieses Paket muss NICHT mehr hochgeladen werden; es dient nur noch als
> Doku und Rollback-Quelle.

## Was dieses Paket enthält

1. **Logo-Fix**: Auf Login- und Registrierungsseite stand oben links ein per CSS
   gebasteltes `</>`-Kästchen mit Farbverlauf statt des echten Logos.
   `auth.css` lädt jetzt das echte `/icons/smejj_favicon.svg`
   (türkise Klammern mit zwei Punkten, identisch zum Favicon).
2. **E-Mail-Validierung nachgeholt**: Das Paket `2026-07-25-auth-email-validierung`
   war noch nicht live (Live-Prüfung: `emailFieldValid` fehlt in der Live-JS).
   Die hier enthaltene `auth-page.js` bringt den Fix mit.
3. **Cache-Buster** in beiden HTML-Dateien:
   `auth.css?v=logo-20260725` und `auth-page.js?v=email-validierung-20260725`.

## Hochladen

Ziel-Repo: **SmejjCom/smejj-app-frontend**, Branch `main`
→ https://github.com/SmejjCom/smejj-app-frontend/upload/main

Ordnerstruktur entspricht exakt dem Ziel-Repo:

| Datei aus diesem Paket        | Ziel im Repo                  |
|-------------------------------|-------------------------------|
| `assets/auth/auth.css`        | `assets/auth/auth.css`        |
| `assets/auth/auth-page.js`    | `assets/auth/auth-page.js`    |
| `auth/login/index.html`       | `auth/login/index.html`       |
| `auth/register/index.html`    | `auth/register/index.html`    |

**Alle vier Dateien zusammen hochladen** — die HTML-Cache-Buster wirken nur,
wenn CSS und JS gleichzeitig aktualisiert werden.

## Rollback

`rollback-live-stand/` enthält die vier Dateien exakt so, wie sie am
2026-07-25 vor diesem Deploy live auf smejj.com lagen. Zum Zurückrollen
diese Dateien an dieselben Ziele hochladen.

## Geprüft

- `check:start-lock` OK (Auth-Seiten stehen außerhalb des Start-Locks)
- `check:favicon-lock` OK (Favicon-Dateien unverändert, nur referenziert)
- `check:guidelines` OK
- Diff gegen Live-Stand geprüft: nur die beschriebenen Änderungen
