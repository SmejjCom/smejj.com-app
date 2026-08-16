# Anmelde-Mails auf Brevo umstellen (kostenlos, 300 Mails/Tag)

Stand: 2026-08-13. **Vorbereitet, noch nicht ausgerollt.**

## Warum

Heute versenden wir ueber smtp.gmail.com mit Absender `s@smejj.com`
(Gmail-Alias). Das funktioniert seit dem `SMEJJ_SMTP_FROM`-Fix vom 2026-08-13,
hat aber zwei Restschwaechen (siehe `docs/mail-zustellbarkeit-befund.md` und
Memory `smejj-mail-zustellbarkeit`):

- **DKIM signiert d=gmail.com**, nicht smejj.com — sobald wir DMARC auf
  `p=quarantine` verschaerfen wollen, faellt das durch.
- **Gmail ist kein transaktionaler Versender**: Rate-Limits, gelegentliche
  550-Blocks, Return-Path bleibt gmail.com.

Brevo (Gratis-Stufe: 300 Mails/Tag, keine Kreditkarte) ist ein echter
transaktionaler Versender mit eigener DKIM-Signatur fuer smejj.com.

## Was der Betreiber tun muss (Konto + DNS — nur du)

1. **Konto anlegen** auf brevo.com (Gratis-Plan). E-Mail: smejjcom@gmail.com.
2. **Domain authentifizieren:** Brevo → Settings → Senders & Domains →
   Domains → `smejj.com` hinzufuegen. Brevo zeigt dann DNS-Eintraege
   (Brevo-Code TXT + zwei DKIM-Eintraege).
3. **DNS-Eintraege setzen** beim DNS-Anbieter (Spaceship, dort liegen MX/SPF):
   die von Brevo angezeigten TXT/CNAME-Eintraege eintragen. Den bestehenden
   SPF-Eintrag ERGAENZEN, nicht ersetzen — aus
   `v=spf1 include:spf.efwd.spaceship.net include:_spf.google.com ~all`
   wird
   `v=spf1 include:spf.efwd.spaceship.net include:_spf.google.com include:spf.brevo.com ~all`
   (den exakten include-Wert nimmt man aus der Brevo-Anzeige).
4. **Absender anlegen:** Senders → `smejj.com <s@smejj.com>`.
5. **SMTP-Schluessel holen:** Brevo → SMTP & API → Reiter SMTP.
   Dort stehen: Server `smtp-relay.brevo.com`, Port `587`,
   Login (Form `8......@smtp-brevo.com`) und der SMTP-Schluessel.

## Umgebungsvariablen (Zeabur → smejj-control → Variable)

Nur diese fuenf Werte aendern, Redeploy nicht vergessen:

| Variable | neuer Wert |
| --- | --- |
| `SMEJJ_SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMEJJ_SMTP_PORT` | `587` |
| `SMEJJ_SMTP_USER` | Brevo-SMTP-Login (`8......@smtp-brevo.com`) |
| `SMEJJ_SMTP_PASS` | Brevo-SMTP-Schluessel |
| `SMEJJ_SMTP_FROM` | `s@smejj.com` (bleibt) |

Unser Mailer (`control-server/src/auth/mailer.js`) beherrscht Port 587 mit
STARTTLS und AUTH LOGIN — beides genau das, was Brevo erwartet. **Kein
Code-Deploy noetig**, nur Env + Restart.

## Abnahme (erst dann ist es "fertig")

1. Magic-Link-Anmeldung an eine EXTERNE Adresse ausloesen (nicht die
   Gmail-Eigenkopie-Falle: Gmail legte frueher trotz Block eine Kopie in den
   Posteingang — massgeblich ist der Kopf der EMPFANGENEN Mail).
2. Im Original-Kopf pruefen:
   - `spf=pass` mit `header.from=smejj.com`
   - `dkim=pass` mit `d=smejj.com` (NEU — das war mit Gmail unmoeglich)
   - kein Bounce im Absender-Postfach
3. Danach optional: DMARC von `p=none` auf `p=quarantine` verschaerfen —
   erst NACH mehreren Tagen fehlerfreier Brevo-Zustellung.

## Rueckfall

Die fuenf alten Gmail-Werte im Zeabur-Portal wiederherstellen
(smtp.gmail.com, 465, Gmail-User/App-Passwort, `s@smejj.com`) — ein
Speichern, ein Restart. Vorher die alten Werte aus dem Portal notieren!
