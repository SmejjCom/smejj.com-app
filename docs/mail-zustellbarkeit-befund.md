# Zustellbarkeit der Anmelde-Mails — Befund und Fix

**Datum:** 2026-08-12 · **Auslöser:** Beim zweiten Magic-Link-Test blockte Gmail
die E-Mail mit `550 5.7.1 … Gmail has detected that this message is likely
unsolicited mail` (Bounce vom Mail Delivery Subsystem). Die erste Mail 20 Minuten
zuvor kam an — der Versand ist also **unzuverlässig**, nicht tot.

## Diagnose

| Prüfung | Befund |
|---|---|
| Absender der Live-Mails | `From: smejj.com <smejjcom@gmail.com>` — also **@gmail.com**, nicht @smejj.com |
| SPF für smejj.com | vorhanden: `v=spf1 include:spf.efwd.spaceship.net include:_spf.google.com ~all` |
| DMARC für smejj.com | vorhanden: `v=DMARC1; p=none; rua=mailto:s@smejj.com` |
| MX für smejj.com | Spaceship-Weiterleitung (mx1/mx2.efwd.spaceship.net) |
| Gmail „Senden als" | **`smejj.com <s@smejj.com>` ist bereits eingerichtet** und verifiziert (über smtp.gmail.com, Port 465 SSL) |
| Mail-Kopfzeilen | `Message-ID` und `Auto-Submitted` fehlten |

**Kern:** Die Mails gehen mit einer privaten @gmail.com-Adresse als Absender raus.
Damit greifen die SPF-/DMARC-Freigaben von smejj.com **gar nicht** — sie gelten für
die Domain smejj.com, nicht für gmail.com. Zusätzlich ist Gmail→Gmail mit
Tokenlink ein klassisches Spam-Muster.

## Fix 1 — kostenlos, eine Zeile (Betreiber)

Im Zeabur-Portal beim Dienst **smejj-control** die Umgebungsvariable setzen:

```
SMEJJ_SMTP_FROM=s@smejj.com
```

`SMEJJ_SMTP_HOST/USER/PASS` bleiben unverändert (smtp.gmail.com mit dem
bestehenden Konto). Gmail darf unter dieser Adresse senden, weil der Alias
`s@smejj.com` im Konto schon verifiziert ist. Wirkung:

- Absender-Domain wird **smejj.com**
- SPF passt UND ist ausgerichtet (`include:_spf.google.com` deckt smtp.gmail.com)
- DMARC (p=none) bestanden
- kein Gmail→Gmail-Selbstversand mehr

Danach: Magic-Link an eine externe Adresse schicken und im Original-Kopf
`spf=pass … header.from=smejj.com` prüfen.

## Fix 2 — bereits im Code erledigt (2026-08-12)

`control-server/src/auth/mailer.js` setzt jetzt zusätzlich:
- `Message-ID: <…@<From-Domain>>` — jede Mail eindeutig (Fehlen ist ein
  Spam-Signal); Domain folgt der Absenderadresse
- `Auto-Submitted: auto-generated` (RFC 3834) — kennzeichnet transaktionale Post

Tests: `tests/email-auth.test.mjs` (14/14 grün).
**Wird erst mit dem nächsten Control-Server-Deploy live.**

## Fix 3 — später, wenn Volumen kommt

Ein transaktionaler Versender mit eigener DKIM-Signatur für smejj.com
(Resend/Brevo/MailerSend haben kostenlose Kontingente). Erst dann ist DKIM
ausgerichtet und DMARC kann auf `p=quarantine` hochgezogen werden.
**Neuer Dienst = eigene Betreiber-Freigabe** (siehe MASTER_POLICY).
