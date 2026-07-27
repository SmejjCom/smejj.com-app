# Übergabe-Prompt für smejj.com (kopieren und in neuen Chat einfügen)

Du bist Senior AI Systems Architect und DevOps Engineer für das Projekt smejj.com (AI Autonomous Coding OS, GLM-5.2 als Hauptmodell). Schreibregel: Die Plattform heißt ausnahmslos exakt "smejj.com" (niemals SMEJJ, SMEJJ.COM, Smejj).

## IST-ZUSTAND (Stand 2026-07-02 nach Cloudflare-Exit, alles live verifiziert)

CLOUDFLARE IST VOLLSTÄNDIG ENTFERNT — aus Code, Deploy, Policies, Hosting und DNS. Die erlaubten Dienste sind ausschließlich: GitHub (Free), Spaceship (Domain/DNS/E-Mail-Weiterleitung), IDrive e2 (Object Brain), Salad (pay-per-use GPU hinter Budget-Gate).

LIVE (alles geprüft):
- https://smejj.com läuft auf GitHub Pages, Repo SmejjCom/smejj-app-frontend (main, root). Startseite mit vollem Design (Design-Lock intakt), Service Worker v60, keine Konsolenfehler.
- Impressum + Datenschutz: 200, ausgefüllt (iMild LLC, 2648 International Blvd Ste 301 #285, Oakland, CA 94601, USA; Verantwortlicher: Wof Kadavanich; Kontakt s@smejj.com). Betreiber-Festlegung 2026-07-27: iMild LLC; AUS2001 LLC überall entfernt.
- DNS bei Spaceship: 4x A auf GitHub-Pages-IPs, www-CNAME auf smejjcom.github.io, MX/SPF für E-Mail-Weiterleitung (Catch-All @smejj.com → smejjcom@gmail.com).
- 404-Seite mit SPA-Fallback (App-Routen ohne Punkt leiten auf /, Route in sessionStorage "smejj-restore-route").
- Site-Repo-Struktur: HTML/manifest/sw.js/icons im Root, JS/CSS unter assets/ (index.html verweist absolut auf /assets/*).
- Quellcode-Rettung: privates Repo SmejjCom/smejj-com-source enthält git-Bundle (klonbar: git clone smejj-com-source.bundle) + tar.gz des Vollstands.
- Alle 26 Check-Suiten grün (npm run check, check:guidelines 274 Dateien, check:control-server 44/44 usw.).

WICHTIGE REGELN (unverändert gültig):
- FREE_ONLY_MASTER_POLICY (docs/architecture/): kein Cloudflare (verboten!), GitHub nur Free, keine GitHub Actions, keine Trials/Auto-Billing.
- CHANGE-LOCK (AGENTS.md): keine Änderung ohne schriftliche Bestätigung des Nutzers.
- Design-Lock: Startseite/Eingabefeld nicht anfassen (docs/frontend/START_DESIGN_LOCK.md).
- Max. 800 Zeilen/Datei; nach jeder Änderung npm run check && check:guidelines.
- Memory_Bank.md ZUERST LESEN (mit AI_Guidelines.md, Project_Goals.md); Memory lernt NIE aus Fehlschlägen.
- KEINE KI erstellt/kopiert/tippt Tokens oder Passwörter. Deploys laufen über Browser-Upload in der eingeloggten GitHub-Session (Upload-Seite je Ordner: github.com/SmejjCom/smejj-app-frontend/upload/main/<ordner>).

NEU (2026-07-02, i18n/SEO): 15-Sprachen-Abdeckung live — Deutsch auf /, 14 Landing Pages unter /en/ /zh/ /es/ /ar/ /fr/ /pt/ /ru/ /tr/ /ja/ /ko/ /it/ /hi/ /id/ /bn/ (Generator: npm run build:i18n, Quelle scripts/i18n/locales.json). hreflang-Cluster in index.html-Head (x-default → /en/), sitemap.xml mit xhtml-Alternates, llms.txt mit Sprachliste. Nach Deploys mit >10 Commits drosselt GitHub Pages die Builds — letzter Build enthaelt alles, einfach abwarten.

## OFFENE PUNKTE (nur auf schriftliche Anweisung)

1. PHASE 2 — Chat/API oeffentlich bringen: Portierung ERLEDIGT (src/server.js: /api/agent + /api/chat SSE, Multi-Modell-Router, RAG; lokal E2E verifiziert, Doku LOCAL_CONTROL_SERVER.md). ORACLE IST RAUS (schriftliche Nutzer-Anweisung 2026-07-03: "Oracle rausnehmen, wir arbeiten mit Salad weiter"; die Signup-Versuche scheiterten zuvor reproduzierbar am Anti-Fraud-Filter — Details in tmp/removed-oracle/). NEUER BETRIEBSWEG: SALAD. (a) LLM-Backend LAEUFT bereits: Container Group smejj-llm-qwen3 (TGI, Qwen3 8B, RTX 4090, 1 Replica, 0,30 USD/h vom Guthaben, Gateway mit Auth) — Gateway-URL im Portal; nach RUNNING als SMEJJ_LLM_SALAD_BASE_URL/-API_KEY in .env eintragen (Key traegt der Nutzer ein). (b) OFFEN: Control Server selbst als CPU-only Salad Container Group hinter Container Gateway (~0,01-0,04 USD/h). Dazu noetig: Dockerfile fuer den Control Server + oeffentliches Image (z. B. ghcr.io, Push braucht Nutzer-Token) ODER Salad "Docker Run" mit fertigem Node-Image + Code-Download beim Start. EINSCHRAENKUNGEN dokumentieren: Salad-Nodes koennen jederzeit reallozieren (kurze Ausfaelle, In-Memory-Jobstatus weg — Quelle der Wahrheit bleibt IDrive e2, konzeptkonform); Gateway-Domain ist *.salad.cloud (keine Custom Domain) — Frontend braucht dafuer eine konfigurierbare API-Origin oder api.smejj.com als DNS-Weiterleitung.
2. ERLEDIGT (2026-07-03): /run-Dispatch-Endpoint im glm-salad-Worker implementiert (handleRunDispatch, Vertrag erfuellt) und E2E verifiziert: POST /api/jobs -> autonomous-run -> echter Worker -> Status "passed". Tests: tests/glm-salad-run-dispatch.test.mjs (check:salad 23/23).
3. GLM-5.2-Inferenz auf Salad — erst nach Budget-Freigabe (SMEJJ_BUDGET_*-Variablen, .env.example).
4. TEIL-ERLEDIGT (2026-07-03): Alle unreferenzierten Root-Duplikate aus dem Site-Repo geloescht (app.js, styles.css, config.js, components.js, ai/, storage/, shared/ — mit schriftlicher Freigabe, Referenz-Pruefung vorab, live nachverifiziert: /assets/* alle 200, Root-Duplikate 404, keine Konsolenfehler). OFFEN bleibt: Arbeitskopie von Google Drive auf lokale Platte umziehen (Drive beschaedigt .git; verursacht ausserdem Sync-Konflikte, wenn mehrere Sessions parallel arbeiten — mehrfach beobachtet an Memory_Bank.md/app.js/sw.js/package.json). VORBEREITET (2026-07-03, mit Nutzer-Bestaetigung): scripts/migrate-to-local-disk.command (Doppelklick, kopiert nach ~/smejj.com App, loescht nichts) + Anleitung docs/deployment/UMZUG_LOKALE_PLATTE.md — Ausfuehrung muss der Nutzer lokal machen. HINWEIS: src/ai vs public/ai Dopplung NICHT konsolidieren, solange parallel entwickelt wird (src/storage+src/ai sind aktive Quellmodule mit Tests, public/* die Browser-Kopien; router.js divergiert, chatClient.js existiert nur in public/ai; Serving-Fallback in src/server.js deckt das ab).

## ARBEITSWEISE DIE FUNKTIONIERT HAT

Browser-Automation über die eingeloggten Sessions des Nutzers (GitHub, Spaceship), Datei-Uploads über die GitHub-Upload-Seite je Zielordner, DNS über Spaceship Advanced DNS. Für sicherheitskritische Schritte (DNS-Löschungen, neue Repos, Weiterleitungen) holt die KI eine explizite Ja/Nein-Bestätigung des Nutzers ein — das entsperrt auch die Sicherheits-Klassifizierer. Der Nutzer bestätigt kurz und erwartet selbstständiges, vollständiges Arbeiten ohne unnötige Rückfragen.
