# smejj.com — Verbindungs- und Endzustandsbericht 2026-07-04

Auftrag: GitHub, IDrive e2, Salad, Spaceship und Cloudflare sauber verbinden bzw. entkoppeln.
Richtungsentscheidung (schriftlich, Wof Kadavanich 2026-07-04): „Ich will ohne cloudflare, nehm cloudflare von überal raus." — Cloudflare-Exit vom 2026-07-02 wird vollendet, NICHT reaktiviert.

## Zielbild (aktiv)

User → Browser/PWA → lokaler Cache → **Spaceship-DNS** → **GitHub Pages** (statisches Frontend) → später api.smejj.com → **Salad Control Server** (Gatekeeper im Node-Server) → **IDrive e2** (Hauptspeicher, presigned URLs) → AI-Router (local-browser / BYOK / free-demo-hardlimit / disabled / Salad-Compute kontrolliert).
Cloudflare hat KEINE Funktion mehr (Restzone nur als Übergangs-Spiegel, Löschung nach 2026-07-05).

## Was wurde heute geändert

1. **Cloudflare (Rückbau, alles reversibel dokumentiert in CLOUDFLARE_EXIT_BACKUP_2026-07-04.md):**
   - Worker-Custom-Domains smejj.com + www.smejj.com entfernt.
   - Worker `smejj-com` gelöscht (inkl. der dort gespeicherten IDrive-Secrets; workers.dev-URLs waren bereits deaktiviert).
   - CF-Zone mit 10 DNS-only-Einträgen als exakter Spiegel der Spaceship-Zone befüllt (A/CNAME GitHub Pages, MX/SPF/DMARC/Site-Verification) — schützt Resolver mit altem NS-Cache (bis ~2026-07-05) vor Mail-Verlust und Site-Ausfall. Vorher fehlten dort ALLE Mail-Records (aktives Mail-Risiko, behoben).
   - Kein Proxy, keine Paid-Funktion, kein Auto-Billing. Zone Free, passiv.
2. **IDrive e2:** Bucket smejj-app um fehlende Soll-Prefixe ergänzt: objects/, manifests/, models/, providers/, deployments/, indexes/, checksums/, static-assets/. Bestand (app, artifacts, backups, benchmarks, logs, memory, projects, rag, releases, rollbacks, screenshots) unverändert. Nebenprodukt: leerer Marker objects/manifests/ (Fehlklick der Console-Navigation) — kann gelöscht werden, wartet auf Freigabe.
3. **Dokumentation:** dieses Dokument + Cloudflare-Exit-Backup + Memory-Bank-Eintrag.

## Aktive DNS-Einträge (autoritativ: Spaceship, live per DoH verifiziert, DNSSEC AD=true)

- NS: launch1/launch2.spaceship.net (Registrar-Panel: ONLINE)
- @ A 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153 (GitHub Pages)
- www CNAME smejjcom.github.io
- @ MX 0 mx1.efwd.spaceship.net, 0 mx2.efwd.spaceship.net (Email Forwarding Free → smejjcom@gmail.com)
- @ TXT "v=spf1 include:spf.efwd.spaceship.net include:_spf.google.com ~all" (EIN gemergter Record, live bestätigt)
- @ TXT google-site-verification=Ln-4qTMMVcSDj5Rcy5G8mR942wxH4Z1oyH7hQ1peopY
- _dmarc TXT "v=DMARC1; p=none; rua=mailto:s@smejj.com"
- api.smejj.com existiert bewusst noch NICHT (kommt erst mit live geschaltetem Salad Control Server).

Hinweis Befund vom Vormittag: einzelne Resolver lieferten noch die alte Cloudflare-Delegation (plato/joyce) aus dem Cache — dank Spiegel-Zone jetzt in beiden Sichten identische Antworten.

## IDrive e2 (Hauptspeicher)

- Region us-west-2 (LA), Endpoint s3.us-west-2.idrivee2.com, Plan Yearly 2 TB (Bestand).
- Buckets: smejj-app (Struktur s. o.), smejj-model-files (449 Objekte, 1,23 TB — Modelle).
- Upload/Download: presigned-URL-Fluss ist im Control-Server implementiert (s3Signer.js, gatekeeper/) — live nutzbar, sobald der Control Server deployed ist. Keine IDrive-Keys im Browser, keine Keys in .env.local, Cloudflare-Kopie der Keys gelöscht. Empfehlung: Keys rotieren.

## Salad (Compute, minimal)

- Container Group smejj-control: STOPPED, 0/1 Replicas (CPU 2vCPU/2GB, ~0,008 USD/h wenn an, Gateway offen, Priority Lowest).
- Container Group smejj-llm-qwen3: STOPPED, 0/1 (RTX 4090, TGI, Auth Required, ~0,30 USD/h wenn an).
- Laufende Kosten aktuell: 0 USD. Idle-Strategie: beides bleibt STOPPED bis ghcr.io-Image bereit und Kostenfreigabe erteilt. Laufzeit-Watchdog + Budget-Gate (402 fail-closed) im Control-Server vorhanden.

## GitHub (nur Code-Werkbank)

- Repos: smejj.com-app (privat, Haupt-Repo), smejj-app-frontend (public, Pages-Deploy), smejj-site (public), smejj-control (public, Image-Build), smejj-com-source (privat, Quell-Backup). Alles Free-Tier.
- Keine Secrets im Repo (tracked nur .env.example; .env/.env.local ignoriert), keine Dateien >5 MB, Modell-/Medien-Endungen per .gitignore blockiert.
- Arbeitskopie enthält die (noch uncommitteten) Cloudflare-Exit-Änderungen vom 02.–04.07. **Commit aus der Sandbox unmöglich:** .git/index.lock im Google-Drive-Mount nicht entfernbar (bekanntes Muster; zusätzlich fehlende Objekte in der History → Drive beschädigt .git). → Commit/Push ist Nutzerschritt; besser vorher scripts/migrate-to-local-disk.command ausführen.
- smejj-control: Workflow vorhanden, Run #1 rot (Build-Context fehlt). tmp/deploy-pkg/smejj-control-context.tar.gz liegt bereit — Upload = Nutzerschritt.

## Durchgeführte Tests (2026-07-04)

- DNS frisch (DoH, Cache-Bust): NS, A, CNAME, MX, TXT/SPF, DMARC — alle korrekt (s. o.).
- HTTPS https://smejj.com → 200, Inhalt korrekt, Canonical https://smejj.com/, Fail-closed-Texte vorhanden.
- https://www.smejj.com → Redirect auf https://smejj.com/ mit gültigem TLS.
- sitemap.xml erreichbar.
- Cloudflare-Zone nach Umbau: 10 Einträge, alle „Nur DNS", Empfehlungen „Alles erledigt", Worker-Liste leer.
- Salad: beide Groups STOPPED verifiziert (Portal).
- IDrive: Bucket-Listing nach Anlage verifiziert (18 Top-Level-Prefixe in smejj-app).
- Nicht testbar heute: Chat-E2E/API-Healthcheck (kein Backend deployed — Blocker unverändert), Mail-Sendetest (Nutzer-Aktion), PWA-Install-Verhalten (unverändert seit letztem grünen Test).

## Kostenrisiken ausgeschlossen

- Cloudflare: Worker gelöscht, Zone Free/passiv, keine Paid-Features, kein Proxy.
- Salad: alles STOPPED, Start nur mit Freigabe; Budget-Gate + Watchdog fail-closed.
- GitHub: Free-Tier, Actions nur im separaten Public-Build-Repo (GITHUB_TOKEN, kostenlos).
- Keine Trials, kein Auto-Billing, keine neuen Dienste.

## NACHTRAG 2026-07-04 nachmittags — BACKEND IST LIVE

Mit schriftlichen Freigaben („Ja, hochladen" + „Ja, starten", Wof Kadavanich 2026-07-04):

- **Public-safe Build-Kontext** (ohne Memory Bank/interne Doku, Rechte 644/755 normalisiert) ins Public-Repo SmejjCom/smejj-control hochgeladen (Commits b526adf → a40a018 Workflow-Diagnose → c336fe4 Rechte-Fix).
- **GitHub Actions Run #4 GRÜN**: Image gebaut, im Container smoke-getestet, gepusht → ghcr.io/smejjcom/smejj-control:latest (public).
- **Salad smejj-control**: Image umgestellt, Command `node src/server.js` (Version 3), gestartet — RUNNING/READY, ~0,01 USD/h, jederzeit stoppbar.
- **LIVE-VERIFIZIERT:** https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/health → `{"ok":true,"app":"smejj.com Code","ai":false,"storage":false}` (fail-closed, da bewusst keine Secrets gesetzt).
- Debug-Erkenntnisse: Drive-600er-Rechte brachen das Image (EACCES); Salad-Portal verliert reine Command-Löschungen (sleep lief in V2 weiter → Gateway 503).
- **api.smejj.com bewusst NICHT angelegt:** Ohne TLS-Terminator vor dem Gateway (Zertifikat nur *.salad.cloud) würde ein CNAME HTTPS brechen. Architektur ohne Cloudflare: Frontend nutzt die Gateway-URL direkt (CORS ist für https://smejj.com bereits fail-closed konfiguriert).

## Offen (in Reihenfolge)

1. Nutzer: Secrets in Salad-Env eintragen (IDrive e2 Keys — vorher rotieren! —, SMEJJ_SESSION_SECRET, SMEJJ_WORKER_CALLBACK_SECRET, GOOGLE_CLIENT_ID) → storage:true, Auth live.
2. Frontend-Bindung: config.js DEFAULT_API_ORIGIN auf die Gateway-URL (Start-Lock-Datei → separate schriftliche Freigabe + Pages-Deploy). Testweg ohne Deploy: localStorage `smejj.apiOrigin.v1` auf der Live-Seite.
3. Nach 2026-07-05 abends: Cloudflare-Zone smejj.com löschen (finaler Exit-Schritt) — kurze Freigabe genügt.
4. Leeren Marker objects/manifests/ in IDrive entfernen (Freigabe nötig, da Löschung).
5. Git: Migration auf lokale Platte + Commit der offenen Änderungen (Nutzerschritt; Sandbox-Commit weiterhin blockiert).
6. Optional: kostenloser externer Uptime-Check für smejj.com + Gateway-Health.
