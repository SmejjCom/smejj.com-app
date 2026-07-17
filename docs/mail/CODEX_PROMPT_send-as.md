# Codex-Prompt: Gmail „Senden als" s@smejj.com fertigstellen + Tests + DMARC

Kopiere alles unterhalb der Linie in Codex. Codex hat Terminal-Zugriff; du (Nutzer)
lieferst die Credentials, wenn Codex danach fragt. Claude durfte diese Credential-
Schritte nicht ausführen — Codex/du schon.

---

Du bist DevOps-Engineer. Domain **smejj.com** (Registrar/DNS: Spaceship). Postfach-Basis:
kostenloses Gmail `smejjcom@gmail.com`. Ziel: `s@smejj.com` als ausgehende Absenderadresse
(„Send mail as") in Gmail einrichten, testen und DMARC verschärfen. Alles kostenlos, keine
Bezahldienste, keine Trials.

## Bereits erledigt (nicht nochmal machen)
- DNS live korrekt: SPF (ein gemergter Record) `v=spf1 include:spf.efwd.spaceship.net include:_spf.google.com ~all`; DMARC `v=DMARC1; p=none; rua=mailto:s@smejj.com`.
- MX: `mx1/mx2.efwd.spaceship.net` (Spaceship Email Forwarding Free, catch-all `*@smejj.com` -> `smejjcom@gmail.com`).
- Empfang extern live bewiesen (sendtestemail.com -> s@smejj.com in ~10s im Posteingang; SPF/DKIM PASS).
- Guard vorhanden: `npm run verify:free-stack:live-dns` (+ `SMEJJ_MAIL_RECEIVE_REQUIRED=1`); Doku unter `docs/mail/`.

## Noch zu tun

### 1. „Send mail as" s@smejj.com anlegen (Gmail API)
Nutze die Gmail API mit Scope `https://www.googleapis.com/auth/gmail.settings.basic` und
`https://www.googleapis.com/auth/gmail.settings.sharing`. Beschaffe einen OAuth-Access-Token
für `smejjcom@gmail.com` (OAuth Playground https://developers.google.com/oauthplayground/
ODER eigene OAuth-Client-Credentials). Dann:

```bash
ACCESS_TOKEN="<dein_access_token>"
curl -s -X POST \
  "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sendAsEmail":"s@smejj.com","displayName":"smejj.com","treatAsAlias":true}'
```

Erwartung: JSON mit `"verificationStatus":"pending"`. Gmail sendet eine Verifizierungsmail
an s@smejj.com (kommt per Weiterleitung in smejjcom@gmail.com an).

Alternative ohne API (falls gewünscht): Gmail -> Einstellungen -> Konten & Import ->
„Weitere E-Mail-Adresse hinzufügen" -> `s@smejj.com`, Alias, SMTP `smtp.gmail.com:465`,
Benutzer `smejjcom@gmail.com`, **Google App-Passwort** (2FA nötig).

### 2. Verifizierung bestätigen
Öffne die Mail von `send-as-noreply@google.com` in smejjcom@gmail.com und klicke den
Bestätigungslink (oder rufe die enthaltene Bestätigungs-URL auf). Danach prüfen:

```bash
curl -s "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/s@smejj.com" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# erwartet: "verificationStatus":"accepted", "isDefault" nach Wunsch
```

### 3. Sende- und Antwort-Test
- Sende eine Mail **als** `s@smejj.com` an eine externe Adresse (z. B. ein zweites Konto).
- Prüfe im Ziel „Original anzeigen": `From: s@smejj.com`, **SPF pass** (Google-IP durch
  include:_spf.google.com), DKIM (gmail.com signiert). DMARC-Alignment realistisch bewerten
  und dokumentieren.
- Antwort-Test: von extern auf diese Mail antworten -> muss über die Weiterleitung in
  smejjcom@gmail.com ankommen.

### 4. DMARC schrittweise verschärfen (erst nach 1–3 grün)
In Spaceship Advanced DNS den `_dmarc`-TXT ändern, nach je 24–48h Monitoring:
- Stufe 1: `v=DMARC1; p=quarantine; rua=mailto:s@smejj.com; pct=100`
- Stufe 2 (wenn stabil): `v=DMARC1; p=reject; rua=mailto:s@smejj.com`
Nach jeder Änderung live prüfen (siehe unten).

### 5. Guard, Doku, Commit
```bash
npm run verify:free-stack:live-dns
SMEJJ_MAIL_RECEIVE_REQUIRED=1 npm run verify:free-stack:live-dns   # muss grün sein
```
- `docs/mail/MAIL_SETUP_smejj.md` aktualisieren: Send-as aktiv (Datum, verificationStatus),
  Sende-/Antwort-Test-Ergebnis, DMARC-Stufe.
- `docs/mail/RECEIVE_TEST.json` bleibt `passed:true`.
- `Memory_Bank.md`: nur validierte Ergebnisse eintragen (Format wie bestehende Einträge:
  Typ/Capsule/Entscheidung/Begründung/Verifiziert durch).
- Schreibregel beachten: Plattform überall exakt `smejj.com` (keine Varianten).
- `npm run check:guidelines && npm run check:security` müssen grün sein.
- Commit mit klarer Message; Rollback: Send-as-Eintrag via `DELETE .../settings/sendAs/s@smejj.com`
  bzw. Gmail-UI „Delete"; DMARC zurück auf `p=none`.

### Live-Prüfbefehle (frischer DNS-Lookup, umgeht Cache)
```bash
curl -s "https://dns.google/resolve?name=_dmarc.smejj.com&type=TXT&edns_client_subnet=0.0.0.0/0"
curl -s "https://dns.google/resolve?name=smejj.com&type=TXT&edns_client_subnet=0.0.0.0/0"
curl -s "https://dns.google/resolve?name=smejj.com&type=MX&edns_client_subnet=0.0.0.0/0"
```

## Wichtig
- Keine bestehenden smejj.com-Funktionen beschädigen; vor DNS-Änderung Rollback notieren.
- Kein Bezahldienst, kein Trial. Nur der Gmail-SPF-Include ist erlaubt (plus der schon
  vorhandene Spaceship-Forwarder-Include, da er zum kostenlosen Empfang gehört).
- Am Ende berichten: Send-as-Status, Sende-/Antwort-Test-Ergebnis, aktuelle DMARC-Stufe,
  Guard-Ausgabe (beide Modi), was committet wurde.
