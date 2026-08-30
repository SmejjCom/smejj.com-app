# DNS smejj.com — Einstieg

Domain `smejj.com`, Registrar und DNS: **Spaceship** (NS launch1/launch2).
Kein Cloudflare (Cloudflare-Exit 2022-07-02-Regel, siehe AGENTS.md).

| Dokument | Inhalt |
| --- | --- |
| `DNS_VERIFIKATION_2026-08-30.md` | Vollständige Live-Gegenprobe aller Records inkl. `api.smejj.com` und `admin`-Weiterleitung |
| `../infrastruktur/DNS_SMEJJ_COM_BESTAND_2026-08-06.md` | Portalaufnahme aller 11 Einträge + Rückfallplan bei Nameserver-Umzug (Stand vor `api`) |
| `../mail/DNS_BACKUP_2026-07-03.md` | Mail-DNS (MX/SPF/DMARC) zum Empfangs-Umbau |

Aktiver Bestand: `@` (4× A auf GitHub Pages), `www` (CNAME), `api`
(CNAME auf smejj-control.zeabur.app), `admin` (URL-Weiterleitung),
MX/SPF/DMARC (Spaceship-Forwarding Free) — Details in der Verifikation.

Automatischer Guard vor jedem Release: `npm run verify:free-stack:live-dns`.
