# Offen: Mailversand — ein einziger Handgriff des Betreibers

**Stand 2026-08-14.** Vier von fünf Werten sind gesetzt, es fehlt nur das
Passwort. Ein Assistent darf Passwörter weder erzeugen noch in Felder
eintragen — das ist der Grund, warum dieser Zettel existiert.

## Was fehlt

Auf Zeabur → Projekt `untitled` → Dienst **smejj-control** → Reiter
**Variable** fehlt genau eine Zeile:

    SMEJJ_SMTP_PASS = <Google-App-Passwort, 16 Zeichen>

Bereits gesetzt und geprüft:

| Variable | Wert |
| --- | --- |
| `SMEJJ_SMTP_HOST` | `smtp.gmail.com` |
| `SMEJJ_SMTP_PORT` | `465` |
| `SMEJJ_SMTP_USER` | `smejjcom@gmail.com` |
| `SMEJJ_SMTP_FROM` | `s@smejj.com` |

## Warum es fehlt

Am 2026-08-14 löschte ein Zeabur-Aufruf, der EINEN Wert setzen wollte, die
gesamte Variablenliste von smejj-control (die Sammel-Form
`updateEnvironmentVariable(data: Map)` ersetzt statt zu ergänzen; sie ist
seither in `scripts/deploy/zeabur-umgebung-setzen.mjs` gesperrt).
Google- und GitHub-Zugang liessen sich aus `~/.config/smejj.com/env.local`
zurückholen — die SMTP-Zugangsdaten lagen dort nicht und sind verloren.
Google zeigt ein App-Passwort nur einmal an; das alte ist nicht auslesbar.

## Was heute NICHT geht (und was schon)

Anmelden geht über **Google, GitHub, Passkey und E-Mail+Passwort**
(bestehende Konten). Ohne Mailversand fehlen nur:

1. **E-Mail-Bestätigung** neuer Konten (`sendVerification`)
2. **Passwort-Zurücksetzen** (`sendReset`)

Kein Bestandskunde mit Google/GitHub/Passkey merkt etwas davon.

## Die drei Schritte (ca. 2 Minuten)

1. https://myaccount.google.com/apppasswords öffnen, App-Name eingeben
   (z. B. `smejj Mailversand 2026-08`), **Erstellen**, den 16-stelligen Wert
   **Kopieren**. Das alte „smejj.com SMTP" kann danach gelöscht werden.
2. Zeabur → smejj-control → Variable → **+ Add**:
   Key `SMEJJ_SMTP_PASS`, Value = eingefügtes Passwort → **Save**.
3. **Zeabur startet NICHT von selbst neu.** Danach Bescheid geben — der
   Neustart und die Messung sind Assistenten-Arbeit:
   `curl -s https://smejj-control.zeabur.app/api/auth/config` muss
   `"magicLink": true` zeigen.

## Danach: sofort sichern

Damit derselbe Verlust nicht wieder unwiederbringlich ist, gehört der Wert
zusätzlich nach `~/.config/smejj.com/env.local` (dieselbe Zeile). Dann kann
`scripts/deploy/control_umgebung_wiederherstellen.mjs` ihn künftig
zurückholen.
