# smejj.com – Marktstart-Status (Live-Test 2026-07-03)

## Live verifiziert (Browser, https://smejj.com)

- Startseite lädt korrekt, Design-Lock intakt ("Was sollen wir in smejj entwickeln?", Eingabefeld, Icons).
- Alle 28 statischen Assets: HTTP 200 (styles, app.js, ai/*, storage/*, manifest, icons).
- Keine Konsolenfehler beim Laden.
- start-lock OK: 15 Startseiten-Dateien byte-identisch zum eingefrorenen Stand.
- Lokale Test-Suiten grün: check (Syntax 37 Dateien), check:users 12/12, check:frontend 27/27, check:ai, check:llm-router 6/6.

## Blocker für Marktstart (live nachgewiesen)

**B1 – Kein öffentliches Backend.** Alle API-Aufrufe der Live-Seite gehen an dieselbe Domain und laufen auf GitHub Pages (statisch) ins Leere:

- GET /api/auth/config → 404
- GET /api/models/kimi-k2-7/status → 404
- GET /api/models/glm-5-2-fp8/status → 404

**B2 – Chat live nicht funktionsfähig.** Nachricht gesendet → Fehlermeldung: "Chat-Stream aktuell nicht erreichbar. Free-safe gestoppt: keine kostenpflichtigen Fallbacks gestartet." (Fehlermeldung selbst ist sauber – Free-safe-Verhalten korrekt.)

**Folge:** Login, Chat und AI-Coding können live nicht funktionieren, solange kein Backend erreichbar ist. Kein Test-Zyklus der Welt ändert das – zuerst muss B1 gelöst werden.

## Erforderliche Schritte (Reihenfolge)

1. **Control Server öffentlich deployen** (per Plan: Salad CPU-Container hinter Container Gateway, ~0,01–0,04 USD/h). Dockerfile/deploy/ ist vorbereitet. Braucht: Salad-Portal-Aktion + Kostenfreigabe durch Nutzer.
2. **API-Origin im Frontend konfigurierbar machen bzw. api.smejj.com** (Spaceship-DNS → Salad-Gateway-Domain, da Gateway nur *.salad.cloud). Erst danach zeigen /api/*-Aufrufe der Live-Seite auf ein echtes Backend.
3. **LLM-Backend anbinden:** Container Group smejj-llm-qwen3 läuft laut Memory bereits; SMEJJ_LLM_SALAD_BASE_URL/-API_KEY in .env (Key trägt Nutzer ein).
4. **Auth live schalten** (/api/auth/config), dann Login/Registrierung/Session live testen.
5. **Erneuter Live-Smoke-Test:** Chat E2E, AI-Coding-Job (/api/jobs → Worker → passed), Mobile/PWA, Reload/Back-Button.
6. **Arbeitskopie von Google Drive auf lokale Platte umziehen** (Script scripts/migrate-to-local-disk.command liegt bereit; Drive beschädigt .git und erzeugt Sync-Konflikte). Muss der Nutzer per Doppelklick ausführen.
7. **Monitoring:** einfacher externer Uptime-Check auf https://smejj.com und api.smejj.com (kostenloser Dienst, Free-only-konform), Fehler-Logs weiter nach IDrive e2.

## Bewertung des ChatGPT-Prompts

Der Prompt ist eine vollständige Wunschliste, aber kein Plan. Schwächen:

- Er testet "alles von A bis Z", obwohl der eine Blocker (kein Backend) 80 % der Punkte von vornherein unmöglich macht. Richtig ist: Blocker zuerst, dann breit testen.
- Er widerspricht den Projektregeln: CHANGE-LOCK (keine Änderung ohne schriftliche Bestätigung), Free-only-Policy, kein KI-Umgang mit Tokens/Secrets, Deploy per Browser-Upload statt Pipeline. "Behebe alles sofort ohne Nachfragen" ist mit diesen Regeln unvereinbar.
- Er nennt Staging, iOS/Android-Builds, Datenbank-Migrationen usw., die in dieser Architektur (GitHub Pages + IDrive e2 + Salad, PostgreSQL nur geplant) so nicht existieren.
- Was im Prompt fehlt: Kostenfreigabe-Prozess, Monitoring/Alerting nach Launch, Support-Kanal (s@smejj.com existiert), Drive→lokale-Platte-Migration, Rollback-Weg für das Site-Repo.

## Nicht kaputt / kein Handlungsbedarf

- Startseiten-Design (Lock verifiziert), Impressum/Datenschutz (laut Memory 200), i18n 15 Sprachen, sitemap/hreflang/llms.txt, 404-SPA-Fallback, Quellcode-Backup (smejj-com-source Bundle).
