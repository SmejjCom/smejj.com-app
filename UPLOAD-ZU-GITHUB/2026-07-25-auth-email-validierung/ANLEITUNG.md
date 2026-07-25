# Auth: E-Mail-Adresse wird jetzt geprüft (2026-07-25)

## Was war kaputt

Login, Registrierung und Magic-Link haben **jede** nicht-leere Eingabe abgeschickt.
Tippt man `keine-gueltige-email` ein, kam man ohne Beanstandung bis zum Passwortfeld
und erfuhr den Fehler erst nach dem Server-Roundtrip.

Ursache: Das Formular wird per Button-Handler statt per `form`-Submit abgeschickt.
Dadurch prüft der Browser das `type="email"`-Feld nie von selbst. Die passende
Fehlermeldung (`email_invalid`) war im Code längst vorhanden, wurde aber nie ausgelöst.

## Was geändert wurde

Neue Funktion `emailFieldValid()` in `auth-page.js`, eingehängt an allen drei
Einstiegspunkten (`submitEmailLogin`, `submitEmailRegister`, `requestMagicLink`).
Sie nutzt die native Browser-Prüfung `checkValidity()` — keine eigene Regex.

Leere Eingabe bleibt unverändert bei der bisherigen Meldung
("Bitte E-Mail und Passwort eingeben.").

## Hochladen

Ziel-Repo: **SmejjCom/smejj-app-frontend**, Branch `main`
→ https://github.com/SmejjCom/smejj-app-frontend/upload/main

Die Ordnerstruktur in diesem Paket entspricht exakt dem Ziel-Repo:

| Datei aus diesem Paket        | Ziel im Repo                  |
|-------------------------------|-------------------------------|
| `assets/auth/auth-page.js`    | `assets/auth/auth-page.js`    |
| `auth/login/index.html`       | `auth/login/index.html`       |
| `auth/register/index.html`    | `auth/register/index.html`    |

**Alle drei Dateien zusammen hochladen.** Die beiden HTML-Dateien enthalten nur
den erhöhten Cache-Buster (`?v=redesign-20260718` → `?v=email-validierung-20260725`).
Ohne sie liefert der Browser wiederkehrenden Nutzern die alte JS-Datei aus dem Cache,
und der Fix wirkt nicht.

Diff gegen den aktuellen Live-Stand geprüft: die HTML-Dateien unterscheiden sich
ausschließlich im Cache-Buster, `auth-page.js` ausschließlich um die 13 neuen Zeilen.

## Nach dem Upload prüfen

1. https://smejj.com/auth/login/ öffnen (mit Hard-Reload, Cmd+Shift+R)
2. `keine-gueltige-email` eintippen, „Weiter" klicken
3. Erwartet: **„Bitte eine gültige E-Mail-Adresse eingeben."** — das Passwortfeld
   darf *nicht* erscheinen
4. `name@example.com` eintippen → Passwortfeld erscheint wie gewohnt

## Herkunft

Repo `smejj.com-app`, Branch `feature/auth-redesign-github-magiclink`, Commit `3949da3`.
Die Basis (`auth-page.js` vor der Änderung) war byte-identisch mit dem Live-Stand
im Frontend-Repo — SHA-256 `241f800d58b1…` verifiziert.
