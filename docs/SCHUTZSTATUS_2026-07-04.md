# smejj.com – Schutzstatus (aktiviert 2026-07-04, Abend)

Schriftliche Anweisung von Wof Kadavanich (2026-07-04): "Zum Schluss bitte 100 % Schutz aktivieren:
nichts darf kaputtgehen, gelöscht oder ohne meine schriftliche Freigabe geändert werden."

## Aktive Schutzebenen (alle verifiziert 2026-07-04)

1. CHANGE-LOCK (AGENTS.md): Keine Änderung an Code, Deploy, DNS, Diensten oder Daten
   ohne schriftliche Freigabe des Nutzers. Gilt unverändert und uneingeschränkt.
2. Start-Lock (Design-Lock): 15 Startseiten-Dateien eingefroren, check:start-lock OK 15/15
   (Stand 2026-07-04T12:55Z). Jede Abweichung schlägt in jeder Testrunde an.
3. Free-only-Policy + Budget-Gate: keine Trials, kein Auto-Billing; einzige laufende
   Kosten smejj-control ~0,01 USD/h; GPU STOPPED. Guards: check:security, check:cost,
   release:guard.
4. Fail-closed-Backend: ohne Secrets keine KI, kein Storage, kein Login
   (/api/health ai:false storage:false live verifiziert). Crash Guard implementiert
   (Deploy wartet auf Nutzer-Upload).
5. Rollback-Fähigkeit: backups/rollback-*, Start-Lock-Auto-Backups,
   Quellcode-Bundle SmejjCom/smejj-com-source, altes ghcr-Image-Digest dokumentiert.
6. Selbstheilung/Monitoring: Salad Startup+Liveness-Probes (TCP:3000), täglicher
   08:00-Health-Check (einzige erlaubte Aktion: dokumentiertes Reallocate-Muster;
   Stop/Delete/Edit/GPU verboten).
7. Memory-Regel: Memory lernt nie aus Fehlschlägen; nur verifizierte Ergebnisse.

## Nur mit schriftlicher Freigabe erlaubt

Deploys ins Site-Repo, Start-Lock-Dateien, DNS-Änderungen, Löschungen jeder Art,
neue/geänderte Salad-Container, Kostenaktionen (insb. GPU-Start ~0,30 USD/h),
Secrets-Handling (tippt grundsätzlich nur der Nutzer selbst).

## Live-Testlauf 2026-07-04 (A–Z, Ergebnis: keine behebbaren Fehler)

Getestet und grün: Startseite (Design-Lock intakt), 0 Konsolenfehler, Chat E2E
(Composer → /api/agent → Agent-Antwort fail-safe ohne GPU), Deep-Links /projects
und /settings (404-Restore), Sidebar-Navigation, Login-View (fail-closed korrekt,
lokale Session funktioniert), impressum/datenschutz/en/fr/sitemap/robots/llms.txt/
manifest/404 alle 200, PWA (SW v71 aktiv, Manifest ok), Canonical https://smejj.com/,
H1 + lang=de, Performance Load ~26 ms, Backend-API health/auth/model-status 200 via
Gateway (CORS ok). Lokale Suiten: frontend 34, users 12, platform 6, ai 14,
llm-router 6, control-server 55 — alle 0 fail; start-lock 15/15.

Hinweis GitHub Pages: eigene Security-Header (CSP/HSTS) sind serverseitig nicht
konfigurierbar; eine Meta-CSP in index.html wäre möglich, ist aber Start-Lock →
nur nach separater schriftlicher Freigabe.

## Verbleibende Schritte bis Voll-Betrieb (nur Nutzer kann sie ausführen)

1. Crash-Guard-Deploy: tmp/deploy-pkg/smejj-control-context.tar.gz nach
   github.com/SmejjCom/smejj-control/upload/main ziehen + committen
   (Actions baut+pusht automatisch; danach sage ich Bescheid bzw. Recreate).
2. Secrets in Salad eintragen (vorher NEUE IDrive-Keys erzeugen):
   Salad → smejj-control → Edit → Environment Variables:
   IDRIVE_E2_ENDPOINT / ACCESS_KEY / SECRET_KEY / BUCKET,
   SMEJJ_SESSION_SECRET, GOOGLE_CLIENT_ID → dann storage:true, Login/Uploads live.
3. Echte KI-Antworten: GPU smejj-llm-qwen3 starten (~0,30 USD/h) +
   SMEJJ_LLM_SALAD_BASE_URL/-API_KEY setzen — nur nach Kostenfreigabe.
4. Arbeitskopie von Google Drive auf lokale Platte: scripts/migrate-to-local-disk.command
   (Doppelklick), danach Git-Commit wieder möglich.

Geplant/aktiv: CF-Zonen-Löschung 2026-07-05 20:00 (Scheduled Task, freigegeben),
täglicher Health-Check 08:00.
