# DNS-Bestand smejj.com (Spaceship, Stand 2026-08-06)

Aufgenommen im Spaceship-Portal (Advanced DNS) **und** gegen die echte
Auflösung geprüft (`dig`). Diese Datei ist der **Rückfallplan**: Wer die
Nameserver umstellt (z. B. auf Cloudflare), muss jeden Eintrag hier drüben
nachbauen, sonst fällt smejj.com aus.

## Nameserver (aktuell)

    launch1.spaceship.net
    launch2.spaceship.net

Registrar und DNS liegen also beide bei Spaceship. Letzte Änderung laut
Portal: 03.07.2026 16:20.

## Einträge — 11 Stück

### Gruppe „Email Forwarding Free" (3, TTL 20 min)

| Host | Typ | Wert | Prio |
| --- | --- | --- | --- |
| `@` | MX | `mx1.efwd.spaceship.net` | 0 |
| `@` | MX | `mx2.efwd.spaceship.net` | 0 |
| `@` | TXT | `v=spf1 include:spf.efwd.spaceship.net ~all` | — |

### Gruppe „Default record group" (8, TTL 30 min)

| Host | Typ | Wert |
| --- | --- | --- |
| `@` | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |
| `www` | CNAME | `smejjcom.github.io` |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:s@smejj.com` |
| `@` | TXT | `google-site-verification=Ln-4qTMMVcSDj5Rcy5G8mR942wxH4Z1oyH7hQ1peopY` |
| `@` | TXT | `v=spf1 include:_spf.google.com ~all` |

Die vier A-Einträge sind die GitHub-Pages-Adressen — daher kommt smejj.com.

## Eine Eigenheit, die man kennen muss: die zwei SPF-Einträge

Im Portal stehen **zwei** SPF-Zeilen auf `@` (Spaceship-Weiterleitung und
Google). Zwei getrennte SPF-Records auf demselben Namen wären nach RFC 7208
ungültig — Empfänger müssten mit `permerror` antworten.

**Spaceship führt sie beim Ausliefern zusammen.** Gemessen:

    dig +short TXT smejj.com
    "v=spf1 include:spf.efwd.spaceship.net include:_spf.google.com ~all"

Es liegt also **kein** Fehler vor, solange das DNS bei Spaceship liegt.

**Achtung beim Umzug:** Ein anderer DNS-Anbieter (Cloudflare u. a.) merged
NICHT. Wer die Einträge einzeln überträgt, hätte dort plötzlich zwei
SPF-Records und würde die eigene Mail-Zustellung beschädigen. Beim Umzug
gehört genau **eine** Zeile angelegt — die zusammengeführte oben.

## Warum das erfasst wurde

Ziel war `admin.smejj.com` für die Operations Console. Ein reiner
CNAME auf `redbean-caesar-yccqb9olg70i1ehu.salad.cloud` reicht dafür
**nicht**: Salad stellt kein TLS-Zertifikat für einen fremden Hostnamen aus,
der Browser würde jeden Aufruf mit Zertifikatswarnung abbrechen. Es braucht
einen Proxy davor, der das Zertifikat hält (Cloudflare o. ä.) — und der
verlangt die Nameserver-Umstellung, für die diese Liste der Rückfallplan ist.

Siehe `docs/approvals/2026-08-06-admin-step-up.md` und die Weiterleitung
`public/admin/index.html` (smejj.com/admin), die heute schon funktioniert.
