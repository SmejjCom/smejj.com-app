# Cloudflare-Exit — Backup des Ist-Zustands vor Rückbau (2026-07-04)

Schriftliche Freigabe: „Ich will ohne cloudflare, nehm cloudflare von überal raus." (Wof Kadavanich, 2026-07-04)

Quelle: Cloudflare Dashboard (Account Smejjcom@gmail.com, Account-ID 19d0a5d46e63289080c7da0625ad5e76), live ausgelesen 2026-07-04.

## Zone smejj.com (Free-Plan) — Zustand VOR Rückbau

DNS-Einträge (2 Stück, beide Worker-Custom-Domains):

| Name | Typ | Inhalt | Proxy | TTL |
|---|---|---|---|---|
| smejj.com | Worker | smejj-com | Mit Proxy | Auto |
| www.smejj.com | Worker | smejj-com | Mit Proxy | Auto |

Keine MX-, SPF-, DMARC- oder sonstigen Records in der Cloudflare-Zone (Cloudflare warnte selbst: E-Mails nicht zustellbar).

Cloudflare-Nameserver der Zone: plato.ns.cloudflare.com, joyce.ns.cloudflare.com.
Registry-Delegation zeigt seit 2026-07-03 ~16:20 wieder auf launch1/launch2.spaceship.net (Spaceship-Panel: ONLINE). Rest-Traffic auf der CF-Zone (~35 Req/24h) stammt aus Resolver-Caches (Delegation-TTL bis zu 48 h, d. h. bis ca. 2026-07-05 abends).

## Worker `smejj-com` — Konfiguration VOR Löschung

- Kompatibilitätsdatum: 2026-06-15, keine Flags, Logs/Traces deaktiviert, keine Cron-Trigger.
- Custom Domains: smejj.com, www.smejj.com.
- Variablen/Secrets (Werte der Geheimnisse NICHT ausgelesen, nur Namen):
  - Klartext: GOOGLE_ALLOWED_EMAIL=smejjcom@gmail.com; GOOGLE_CLIENT_ID=457164842646-pgnrulbj893hlahhjijank4bd6o8n0as.apps.googleusercontent.com; SMEJJ_LLM_BASE_URL=disabled; SMEJJ_LLM_MODEL=disabled
  - Geheimnisse (verschlüsselt): IDRIVE_E2_ACCESS_KEY, IDRIVE_E2_SECRET_KEY, IDRIVE_E2_ENDPOINT, IDRIVE_E2_REGION, IDRIVE_E2_BUCKET, MODEL_S3_PREFIX, SMEJJ_SESSION_SECRET
- Worker-Code liegt versioniert im Repo-Verlauf (ehem. `cloudflare-worker/`, seit 2026-07-02 als runtime-neutrales Modul `gatekeeper/`).

## Rückbau-Plan und Ausführungsstatus (2026-07-04)

1. ✅ ERLEDIGT 2026-07-04: Custom Domains smejj.com + www.smejj.com vom Worker gelöst.
2. ✅ ERLEDIGT 2026-07-04: CF-Zone als 1:1-Spiegel der Spaceship-Zone befüllt — 10 Einträge, alle „Nur DNS" (kein Proxy): 4× A 185.199.108–111.153, www CNAME smejjcom.github.io, 2× MX mx1/mx2.efwd.spaceship.net (Prio 0), TXT SPF gemergt, TXT google-site-verification, _dmarc TXT. Cloudflare-Empfehlungsprüfung: „Alles erledigt". Zweck: Resolver mit gecachter CF-Delegation sehen bis zum Cache-Ablauf identische Antworten (kein Mail-Verlust, Site direkt zu GitHub Pages).
3. ✅ ERLEDIGT 2026-07-04: Worker `smejj-com` gelöscht (Workers und Pages: „No projects found"). Damit sind auch die dort hinterlegten IDrive-Secrets aus Cloudflare entfernt.
4. ✅ ERLEDIGT 2026-07-05: Zone smejj.com aus dem Cloudflare-Account entfernt (schriftliche Freigabe erneut am 2026-07-05: „Cloudflare nehm von überal raus."). Account danach verifiziert leer: keine Domains, keine Workers/Pages. Cloudflare ist vollständig raus.
   - Befund vor Löschung: Die alten CF-Nameserver (plato/joyce) beantworteten A-Fragen für smejj.com weiterhin mit Proxy-IPs 172.67.211.38/104.21.83.37 (TTL 300), obwohl alle Zonen-Records im Dashboard auf „Nur DNS" standen. Resolver mit gecachter CF-Delegation (z. B. Google DNS) bekamen daher bis zur Löschung Cloudflare- statt GitHub-Pages-IPs; Site funktionierte trotzdem (Proxy → GitHub Pages). Nach Zonen-Löschung + Ablauf des Delegation-Caches (bis ca. 2026-07-05 abends) liefern alle Resolver die Spaceship-Zone (4× A 185.199.108–111.153).
5. ⏳ EMPFOHLEN: IDrive-e2-Keys rotieren (waren als Secrets im jetzt gelöschten Cloudflare-Worker hinterlegt).

## Rollback

Zone existiert bis Schritt 4 weiter; Worker-Code im Git-Verlauf; Custom Domains ließen sich jederzeit wieder anlegen. Spaceship-Zone bleibt unverändert die produktive Wahrheit (Backup: docs/mail/DNS_BACKUP_2026-07-03.md + dieses Dokument).

## Spaceship-Zone (produktiv, live verifiziert 2026-07-04 per DoH, frisch)

- NS: launch1/launch2.spaceship.net (ONLINE)
- @ A 185.199.108.153 / .109.153 / .110.153 / .111.153 (GitHub Pages)
- www CNAME smejjcom.github.io
- @ MX 0 mx1.efwd.spaceship.net, 0 mx2.efwd.spaceship.net (Email Forwarding Free)
- @ TXT "v=spf1 include:spf.efwd.spaceship.net include:_spf.google.com ~all" (von Spaceship automatisch gemergt publiziert)
- @ TXT google-site-verification=Ln-4qTMMVcSDj5Rcy5G8mR942wxH4Z1oyH7hQ1peopY
- _dmarc TXT "v=DMARC1; p=none; rua=mailto:s@smejj.com"
