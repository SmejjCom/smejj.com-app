# DNS-Verifikation smejj.com (Live-Messung 2026-08-30)

Vollständige Gegenprobe aller DNS-Einträge gegen die echte Auflösung
(`dig`/`curl`), aufgenommen im Rahmen des Infrastruktur-Auftrags vom
30.08.2026. Rückfallplan und Portalaufnahme: siehe
`../infrastruktur/DNS_SMEJJ_COM_BESTAND_2026-08-06.md` (dort stammt der
Bestand vom 06.08. — noch OHNE `api.smejj.com`, das seit 23.08. live ist).

## Nameserver

    launch1.spaceship.net.
    launch2.spaceship.net.

Registrar und DNS bleiben bei Spaceship. Kein Cloudflare (Betreiber-Regel).

## Gemessene Einträge (alle bestätigt)

| Host | Typ | Gemessener Wert | Rolle |
| --- | --- | --- | --- |
| `@` | A ×4 | `185.199.108.153` … `185.199.111.153` | GitHub Pages (statisches Frontend) |
| `www` | CNAME | `smejjcom.github.io.` | leitet auf Apex weiter (301) |
| `api` | CNAME | `smejj-control.zeabur.app.` (`43.166.240.69`) | Control Server (Zeabur-TLS) |
| `@` | MX ×2 | `mx1./mx2.efwd.spaceship.net` (Prio 0) | Spaceship-Email-Forwarding Free |
| `@` | TXT | `v=spf1 include:spf.efwd.spaceship.net include:_spf.google.com ~all` | SPF (von Spaceship zusammengeführt) |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:s@smejj.com` | DMARC |
| `@` | TXT | `google-site-verification=Ln-4…` | Google-Verifizierung |
| `admin` | URL-Weiterleitung | `302 → https://smejj.com/admin/` | Spaceship-Forwarding (kein eigener Host, kein TLS-Risiko) |

## Subdomain-Bestand (bewusst minimal)

Genau vier Namen sind aktiv: `@`, `www`, `api`, `admin` (Weiterleitung).
Keine weiteren Subdomains — entspricht der Regel „nur tatsächlich
benötigte Subdomains".

## Live-Verhalten (gemessen 30.08., ~08:00 Ortszeit)

- `https://smejj.com/` → HTTP/2 200, `server: GitHub.com`, HSTS aktiv,
  `last-modified` frisch (gleicher Tag).
- `https://www.smejj.com/` → 301 auf `https://smejj.com/`.
- `https://api.smejj.com/healthz` → 200 (Warm-TTFB ~0,77 s; Server steht
  in Ashburn/USA — Messung von Europa).
- `https://admin.smejj.com` → 302 auf `https://smejj.com/admin/`.
- Service Worker live: `smejj-shell-v712` (passend zum Repo-Stand).

## Automatischer Guard

`npm run verify:free-stack:live-dns` (scripts/release/verify_free_stack_live_dns.mjs)
prüft NS, SPF, DMARC, MX und den Gratis-Empfang gegen die Live-Auflösung —
Stand 30.08.2026: **OK**.

## Zwei-SPF-Eigenheit (weiterhin gültig)

Spaceship führt die zwei im Portal getrennten SPF-Zeilen (Forwarder + Google)
beim Ausliefern zu einer zusammen. Beim DNS-Umzug zu einem anderen Anbieter
muss die zusammengeführte Zeile als EIN Record übertragen werden (Details
im Bestandsdokument von 2026-08-06).
