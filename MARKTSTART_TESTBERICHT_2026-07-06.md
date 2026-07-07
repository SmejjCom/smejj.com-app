# smejj.com — A-bis-Z Live-Testbericht (2026-07-06)

Getestet live über den Browser auf https://smejj.com plus Code-, HTTP- und Testsuite-Prüfung im Repo. Rolle: QA / Security / DevOps-Review.

## Kernergebnis

**Der Blocker aus dem Statusbericht vom 03.07. ist gelöst.** Das öffentliche Backend läuft jetzt live auf Salad (`redbean-caesar-…salad.cloud`). Chat, Auth-Konfiguration, Login, RAG-Antworten und Health-Endpoint antworten mit HTTP 200. Die Plattform ist funktional, stabil und macht einen professionellen Eindruck. Sie ist **technisch marktstart-fähig mit kleinen Vorbehalten** (siehe „Offene Punkte").

## Was live verifiziert wurde (funktioniert)

**Startseite & Design.** Lädt sofort, Design-Lock intakt („Was sollen wir in smejj entwickeln?"). Alle 34 Assets HTTP 200. Keine App-Konsolenfehler beim Laden. Sidebar (Neu, Suche, Websites, smejj claw, Automatisierung, Chat History, Projekte, Dateien, Kosten, Einstellungen, Konto) öffnet und navigiert sauber. Rechtschreibung der sichtbaren UI-Texte korrekt.

**Chat & KI.** Nachricht gesendet → echte Streaming-Antwort vom Backend (`POST /api/agent`, CORS-Preflight 204 OK). Antwort inkl. Quellenangaben aus dem Projektwissen (RAG/BM25). Ladezeit im einstelligen Sekundenbereich.

**Internet-/Live-Zugriff.** `detectLiveInternetIntent` erkennt Wetter/News/Preise/URLs. Wetter über Open-Meteo, Suche über DuckDuckGo-HTML. Bei unklaren Treffern bricht das System **fail-safe** ab statt zu halluzinieren („Free-safe gestoppt").

**Login / Konto.** Google-Login-Widget lädt mit dem korrekten Konto (smejjcom@gmail.com), Client-ID und `allowedEmail` serverseitig konfiguriert (`/api/auth/config` → `configured: true`). „Login lokal testen" schaltet lokale Session (`user_local`, local-only, offline-fähig). Registrierung lokal vorbereitet.

**Projekte / Storage.** `/projects`: Projekt erstellen/öffnen/speichern/Snapshot/Export/Import/Manifest funktionieren, Manifest wird als valides JSON angezeigt. `/status`: Storage local-browser, IDrive e2 „presigned-sync-not-configured", Kosten „0 EUR Risiko / blockiert", Health `ok:true`.

**Responsive / PWA.** Manifest vorhanden (standalone, Icons SVG + maskable, Theme-Color). Service Worker `smejj-shell-v72` mit vollständigem App-Shell-Cache → Offline-Fähigkeit. Viewport-Meta + Apple-Web-App-Meta gesetzt. CSS mit 3 Breakpoints (560/680/920 px).

**SEO / GEO / AEO.** Vollständige Meta-Tags (description, OpenGraph, Twitter-Card, og-image 1200×630). Canonical + hreflang für 15 Sprachen + x-default. `robots.txt` (Allow /, Sitemap-Link), `sitemap.xml` mit hreflang-Alternates, `llms.txt` für KI-Crawler. Englische Landingpage `/en/` mit eigenem Title live.

**Sicherheit.** Security-Header serverseitig definiert (strikte CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy). Origin-Guard gegen fremde mutierende Requests. Fail-closed-Fehlerseite (`/error` „Aktion blockiert"). Unbekannte Route → sicherer Redirect statt Leak. Free-only-Kostengrenze aktiv blockiert.

**Impressum / Datenschutz.** `/impressum.html` vollständig (AUS2001 LLC, § 5 DDG, § 18 MStV, Kontakt s@smejj.com). Datenschutzseite vorhanden.

**Testsuiten (lokal, grün):** `check` (Syntax 39 Dateien) ✓, `check:frontend` 34/34 ✓, `check:users` 12/12 ✓, `check:platform` 6/6 ✓.

## Offene Punkte (nicht launch-blockierend, aber vor breitem Marketing empfehlenswert)

1. **Live-Suche liefert manchmal schwache Treffer.** Der DuckDuckGo-HTML-Parser gibt gelegentlich Bing-Redirect-Links zurück, die der Agent dann als „nicht verwertbar" verwirft. Ergebnis ist korrekt (kein Halluzinieren), aber Nachrichten-Anfragen bleiben teils unbeantwortet. Empfehlung: robustere Suchquelle bzw. `uddg`-Redirect-Auflösung härten. **Keine Änderung ohne deine Freigabe vorgenommen.**

2. **Security-Header nur am Backend, nicht auf GitHub Pages.** Die statischen HTML-Seiten (GitHub Pages) tragen die CSP/X-Frame-Options nicht, da GitHub Pages keine Custom-Header erlaubt. Nur API-Antworten des Salad-Servers sind gehärtet. Für die reine Chat-SPA vertretbar, aber ein Meta-CSP-Fallback wäre eine Verbesserung.

3. **Google One Tap FedCM-Warnung.** Konsole zeigt eine GSI-Deprecation-Warnung und einen `AbortError` beim Abbrechen des One-Tap-Prompts — kosmetisch, blockiert Login nicht.

4. **IDrive e2 Presigned-Sync noch nicht konfiguriert** (Status „presigned-sync-not-configured"). Projekte laufen lokal; Cloud-Sync ist vorbereitet, aber nicht scharf geschaltet.

5. **147 uncommittete Änderungen** im Arbeitsbaum (aus früheren Sessions, nicht von diesem Test). Sollten vor einem Deploy bewusst gereviewt und committet werden — ich habe sie **nicht** blind committet.

## Nicht durchgeführt (bewusst, wegen Schutzregeln)

Gemäß deiner Projekt-Change-Lock und den Sicherheitsvorgaben habe ich **nichts committet, deployt, gelöscht oder an Secrets/Keys angefasst**. Für Code-Fixes + Commit + Deploy brauche ich deine ausdrückliche Freigabe — die uncommitteten Fremdänderungen und ein Live-Deploy sind zu risikoreich für einen automatischen Durchgriff.

## Marktstart-Bewertung

Grün für einen **kontrollierten Soft-Launch**: Kernfunktionen (Chat, Login, Projekte, PWA, SEO, Sicherheit, Recht) sind live und stabil, Kostenrisiko ist auf 0 fail-closed. Vor breitem Marketing sollten Punkt 1 (Suchqualität) und Punkt 5 (Repo-Zustand/Deploy-Hygiene) adressiert werden.
