# DNS-Backup smejj.com — Stand 2026-07-03 (vor Mail-Umstellung)

Quelle: Spaceship Advanced DNS + Live-Abfrage (dns.google), 2026-07-03.

## Nameserver
- launch1.spaceship.net
- launch2.spaceship.net

## Zone (9 Records)

### Gruppe "Email Forwarding Free" (von Spaceship verwaltet)
| Host | Typ | Wert | TTL |
|---|---|---|---|
| @ | MX | mx1.efwd.spaceship.net (Prio 0) | 20 min |
| @ | MX | mx2.efwd.spaceship.net (Prio 0) | 20 min |
| @ | TXT | v=spf1 include:spf.efwd.spaceship.net ~all | 20 min |

### Custom Records ("Default record group")
| Host | Typ | Wert | TTL |
|---|---|---|---|
| @ | A | 185.199.108.153 | 30 min |
| @ | A | 185.199.109.153 | 30 min |
| @ | A | 185.199.110.153 | 30 min |
| @ | A | 185.199.111.153 | 30 min |
| www | CNAME | smejjcom.github.io | 30 min |
| @ | TXT | google-site-verification=Ln-4qTMMVcSDj5Rcy5G8mR942wxH4Z1oyH7hQ1peopY | 30 min |

## E-Mail-Weiterleitung (Spaceship, kostenlos)
- Catch-all "To a single address": alle Mails an *@smejj.com → smejjcom@gmail.com
- Status: ONLINE

## Kein DMARC-Record vorhanden (vor Umstellung), kein DKIM.

## Rollback
1. SPF zurücksetzen: TXT @ = "v=spf1 include:spf.efwd.spaceship.net ~all"
2. DMARC-Record (_dmarc TXT) löschen.
3. Gmail: Einstellungen → Konten → "Senden als" s@smejj.com entfernen.
Alle anderen Records blieben unverändert.
