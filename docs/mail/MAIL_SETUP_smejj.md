# E-Mail-Setup smejj.com — s@smejj.com

Stand: 2026-07-03. Ziel: `s@smejj.com` sauber, kostenlos, ohne Trials/Pflichtkosten.
Registrar/DNS: Spaceship (NS via Cloudflare-Infrastruktur). Postfach-Basis: kostenloses
Gmail-Konto `smejjcom@gmail.com`.

## 1. Aktive Mail-DNS-Einträge (live verifiziert am 2026-07-03)

| Host | Typ | Wert | TTL |
|---|---|---|---|
| @ | MX | mx1.efwd.spaceship.net (Prio 0) | 20 min |
| @ | MX | mx2.efwd.spaceship.net (Prio 0) | 20 min |
| @ | TXT (SPF, gemergt) | `v=spf1 include:spf.efwd.spaceship.net include:_spf.google.com ~all` | — |
| _dmarc | TXT (DMARC) | `v=DMARC1; p=none; rua=mailto:s@smejj.com` | 30 min |

Nicht-Mail-Einträge unverändert: A @ → 185.199.108–111.153 (GitHub Pages),
CNAME www → smejjcom.github.io, TXT @ google-site-verification=…

Hinweise:

- Genau **ein** SPF-Record ist veröffentlicht (Spaceship merged mehrere SPF-Records
  automatisch zu einem pro Hostname). Der Gmail-Include `_spf.google.com` ist enthalten,
  damit ausgehender Gmail-Versand als `s@smejj.com` später SPF besteht.
- Der Include `spf.efwd.spaceship.net` gehört untrennbar zur aktiven, dauerhaft
  kostenlosen Empfangslösung (Spaceship „Email Forwarding Free"). Er lässt sich nicht
  entfernen, ohne die Gratis-Weiterleitung (= unseren Empfang) zu deaktivieren. Reiner
  Google-only-SPF wäre nur um den Preis des kostenlosen Empfangs zu haben — bewusste
  Abwägung zugunsten des kostenlosen Empfangs.
- **Kein** fremder MX (nur der Spaceship-Forwarder), **kein** doppelter SPF, **kein**
  kostenpflichtiger Mailbox-Anbieter, **kein** Trial.
- DKIM für smejj.com: **nicht vorhanden / N/A**. Freies Gmail signiert ausgehende Mail mit
  dem `gmail.com`-DKIM, nicht mit einem smejj.com-Schlüssel. Ein eigener smejj.com-DKIM ist
  ohne (kostenpflichtiges) Workspace/eigenen Mailserver nicht möglich.

## 2. Ausgehender Versand über Gmail (Senden als s@smejj.com)

Status: **AKTIV & LIVE BESTÄTIGT (Gmail-Send-as am 2026-07-03, 20:47 CEST).**

- Gmail „Senden als" ist eingerichtet als `smejj.com <s@smejj.com>`.
- Versandweg: `smtp.gmail.com`, Port `465`, SSL, Benutzer `smejjcom@gmail.com`,
  Google-App-Passwort `smejj Mail` (Passwort nicht dokumentieren / nicht speichern).
- Gmail-Einstellung live gesehen: „Nachricht wurde gesendet über: smtp.gmail.com" und
  „Sichere Verbindung auf Port 465 mit SSL".
- Verifizierungsmail an `s@smejj.com` kam per Spaceship-Forwarding in
  `smejjcom@gmail.com` an; Bestätigungslink wurde geklickt. Ergebnis:
  **„Bestätigung erfolgreich — Der Gmail-Nutzer kann jetzt E-Mails als s@smejj.com senden."**

API-Befund (wichtig für spätere Automatisierung): Der Gmail-API-Weg wurde getestet und ist
für dieses kostenlose Gmail-Konto nicht nutzbar. Mit Scope `gmail.settings.basic` meldete
Google zuerst `gmail.settings.sharing` als zusätzlich nötig; mit beiden Scopes blockierte
`POST /gmail/v1/users/me/settings/sendAs` dann mit `Access restricted to service accounts
that have been delegated domain-wide authority`. Der stabile kostenlose Weg ist daher die
Gmail-UI plus `smtp.gmail.com` plus App-Passwort.

### Externer Sendetest (2026-07-03, 20:49 CEST)

- Von `s@smejj.com` an externes Konto `alanbestus@gmail.com` gesendet.
- Betreff: `smejj.com send-as test 2026-07-03T18-49-08-639Z`.
- Extern angekommen nach ca. 13 Sekunden.
- Gmail-Originalnachricht:
  - `From: "smejj.com" <s@smejj.com>`
  - `SPF: PASS` mit Google-IP `209.85.220.41`
  - `Return-Path: <smejjcom@gmail.com>`
  - `smtp.mailfrom=smejjcom@gmail.com`
  - `DMARC: FAIL (p=NONE ... header.from=smejj.com)`
  - Anzeige beim Empfänger: `smejj.com <s@smejj.com> via gmail.com`

Bewertung: Ausgehender Versand funktioniert. SPF besteht für den tatsächlichen
Google-Envelope-Sender (`smejjcom@gmail.com`), aber DMARC-Alignment für `smejj.com`
besteht nicht, weil freies Gmail keinen `smejj.com`-DKIM signiert und der Envelope-Sender
`gmail.com` bleibt. Deshalb darf DMARC für `smejj.com` **nicht** auf `p=quarantine` oder
`p=reject` verschärft werden, solange dieser kostenlose Gmail-Send-as-Weg genutzt wird.

### Antwort-Test (2026-07-03, 20:53 CEST)

- Externes Konto `alanbestus@gmail.com` antwortete auf die Testmail.
- Reply-Token: `reply-2026-07-03T18-51-54-597Z`.
- Antwort wurde in `smejjcom@gmail.com` gefunden und lag im Posteingang in derselben
  Konversation. Damit ist der Rueckweg `s@smejj.com` → Spaceship Email Forwarding Free →
  `smejjcom@gmail.com` fuer Antworten bestaetigt.

## 3. Empfang für s@smejj.com

Status: **AKTIV & LIVE BESTÄTIGT (externer Test am 2026-07-03, 14:56 UTC).**

- Spaceship „Email Forwarding Free" ist aktiv (ONLINE), Catch-all `*@smejj.com` →
  `smejjcom@gmail.com`, MX korrekt gesetzt. Dauerhaft kostenlos (im Domainpreis enthalten).
- **Externer Live-Test bestanden:** `sendtestemail.com` (externer Absender
  `noreply@sendtestemail.com`, Email-ID `6e03d98d6f2376b80a9a2b333b105e81`) →
  `s@smejj.com` → in ~10 s im Gmail-**Posteingang** zugestellt. Received-Kette:
  `mail.sendtestemail.com` → `asp-relay-spaceship-ef.jellyfish.systems` →
  `mail-11.efwd.spaceship.net` (SRS, DKIM `d=efwd.spaceship.net`) → `mx.google.com`.
  Gmail-Auth: SPF PASS, DKIM PASS. (Das angezeigte „DMARC FAIL" betrifft die
  Absender-Domain sendtestemail.com — normales Weiterleitungsverhalten, nicht smejj.com.)
- Früherer Selbst-Test (`RXTEST-2026-07-03`) war wegen Gmail-Message-ID-Deduplizierung
  nicht beweiskräftig und wurde durch den externen Test ersetzt.
- Nachweis-Datei: `docs/mail/RECEIVE_TEST.json` (`passed=true` inkl. vollständiger
  Header-Evidenz). Damit wird auch der harte Guard-Modus grün.

## 4. Automatischer Live-DNS-Guard

Skript: `scripts/release/verify_free_stack_live_dns.mjs`
NPM: `verify:free-stack:live-dns`

```bash
# Normaler Check (Empfang = Hinweis, solange nicht extern bestätigt):
npm run verify:free-stack:live-dns

# Harter Empfangsmodus (nur grün, wenn RECEIVE_TEST.json passed=true):
SMEJJ_MAIL_RECEIVE_REQUIRED=1 npm run verify:free-stack:live-dns
```

Prüft live per DNS-over-HTTPS (kein UDP nötig): DNS erreichbar (NS/SOA), Gmail-SPF-Include
vorhanden, DMARC-Monitoring vorhanden, kein fremder MX (nur efwd.spaceship.net), keine
fremden SPF-Includes außer Gmail + dem geduldeten Forwarder, kein doppelter SPF-Record,
keine kostenpflichtige Mail-Infrastruktur (Workspace/365/Zoho-Paid u. a.). Empfang wird im
Normalmodus nur als Hinweis, im harten Modus als Fehler gemeldet, bis er live bewiesen ist.

## 5. Rollback

Backup des Ausgangszustands: `docs/mail/DNS_BACKUP_2026-07-03.md`.

1. **SPF zurücksetzen:** in Spaceship Advanced DNS den Custom-TXT
   `v=spf1 include:_spf.google.com ~all` löschen. Übrig bleibt der Forwarder-SPF
   `v=spf1 include:spf.efwd.spaceship.net ~all` (Ausgangszustand).
2. **DMARC entfernen:** den `_dmarc`-TXT-Record löschen.
3. **Gmail „Senden als":** falls eingerichtet, unter Konten & Import den Eintrag
   `s@smejj.com` entfernen.

MX, A-, CNAME- und google-site-verification-Einträge wurden nicht verändert und brauchen
kein Rollback.

## 6. Offene Punkte

- [x] Externer Live-Empfangstest an `s@smejj.com` — **bestanden am 2026-07-03**
      (`RECEIVE_TEST.json` auf `passed=true` gesetzt, harter Guard-Modus damit grün).
- [x] „Senden als" `s@smejj.com` in Gmail abgeschlossen — **bestanden am 2026-07-03**
      (SMTP `smtp.gmail.com:465`, SSL, App-Passwort, Gmail-Bestaetigung erfolgreich).
- [x] Externer Sendetest als `s@smejj.com` — **bestanden am 2026-07-03**
      (`From: "smejj.com" <s@smejj.com>`, externe Zustellung, SPF PASS fuer Google-IP).
- [x] Antwort-Test — **bestanden am 2026-07-03**
      (Reply von `alanbestus@gmail.com` kam ueber `s@smejj.com` in `smejjcom@gmail.com`
      an).
- [ ] DMARC bleibt vorerst `p=none`; **nicht** auf `p=quarantine`/`p=reject`
      verschaerfen, solange Gmail-Send-as ohne aligned `smejj.com`-DKIM genutzt wird.
