# smejj.com – Gap-Analyse Launch-Bereitschaft

Datum: 2026-07-02
Basis: Live-Prüfung von https://smejj.com, Code-Audit des Repos, Testlauf (131/131 Tests bestanden, alle Guard-Skripte grün).

Legende: ✅ vorhanden · ⚠️ teilweise / mit Einschränkung · ❌ fehlt · 🔑 nur extern erledigbar (Konto/Vertrag/Recht, keine Code-Aufgabe)

## Gesamtbild

Die Plattform ist als **Single-User-MVP live und stabil** (Cloudflare Free, fail-closed, 0-EUR-Risiko). Sie ist aber **kein öffentliches Produkt**: Login ist auf eine einzige E-Mail beschränkt, die eigene KI-Inferenz existiert noch nicht (GLM-5.2-Gewichte nicht im Vault, kein Compute freigegeben), und die Pflicht-Rechtstexte fehlen komplett. Der ChatGPT-Prompt fordert vieles, was entweder schon erledigt ist oder deiner eigenen Free-only-Policy widerspricht.

## 1. Infrastruktur

| Punkt | Status | Befund |
|---|---|---|
| Domain + SSL | ✅ | smejj.com und www.smejj.com live über Cloudflare Custom Domain, HTTPS aktiv (`wrangler.jsonc`) |
| GitHub + Deployment | ✅ | Repo mit Wrangler-Deployment, Release-Guards (`release:preflight`) |
| IDrive e2 | ⚠️ | Integration komplett (presigned URLs, Checksums, Verify-Skripte). **Aber: GLM-5.2-FP8-Gewichte (703,8 GiB) noch nicht übertragen** – nur Metadaten archiviert (`docs/release/IMPLEMENTATION_STATUS_2026-06-22.md`) |
| Salad | ⚠️ | Client, Worker, Dockerfile, Tests vorhanden (`workers/glm-salad/`). Kein Compute freigegeben – **Salad kostet Geld und kollidiert mit der Free-only-Policy**. Bewusste Entscheidung nötig |
| Backups | ⚠️ | Rollback-Simulation prüft nur Metadaten; Restore aus Sync-Deltas getestet (Unit-Ebene). Echter Restore-Test gegen IDrive e2 offen |
| Monitoring / Logging | ❌ 🔑 | Kein externes Uptime-Monitoring, kein Error-Tracking, keine Alarme. Kostenlos lösbar (z. B. UptimeRobot Free) |

## 2. Frontend

| Punkt | Status | Befund |
|---|---|---|
| PWA / responsive | ✅ | Manifest, Service Worker, Icons; Tests `platform-pwa`, `frontend-structure` grün |
| SEO-Grundlagen | ✅ | robots.txt, sitemap.xml, canonical, meta-description, llms.txt |
| Fehler-/Offline-Seiten | ✅ | Offline-Ansicht und Fail-closed-Fehleransicht in der App |
| Dark/Light Mode | ⚠️ | Nicht verifiziert – bei Bedarf prüfen |

## 3. Backend

| Punkt | Status | Befund |
|---|---|---|
| API-Endpunkte + Tests | ✅ | 131 Tests bestanden, u. a. job-api, sync, abuse, gatekeeper |
| Fehlerbehandlung | ✅ | Konsequent fail-closed (Policy + Tests) |
| Rate-Limits | ✅ | Quota/Hard-Limits mit 429, fail-closed (`cloudflare-worker/quota.js`) |
| Skalierung | ⚠️ | Cloudflare Workers Free: ~100k Requests/Tag. **„Unbegrenzt viele Nutzer" ist auf Free-Tier physisch unmöglich** – Erwartung anpassen oder Policy ändern |

## 4. Benutzerkonten — größte Produktlücke

| Punkt | Status | Befund |
|---|---|---|
| Login | ⚠️ | Google Sign-In funktioniert, ist aber **hart auf eine einzige E-Mail beschränkt** (`GOOGLE_ALLOWED_EMAIL`) |
| Registrierung | ❌ | Keine öffentliche Registrierung möglich |
| Passwort-Reset / E-Mail-Verifizierung | ❌ 🔑 | Kein E-Mail-System vorhanden. Bei Google-only-Auth entfällt Passwort-Reset – bewusste Design-Option |
| Profil | ⚠️ | Nur lokal im Browser |
| DSGVO-Kontolöschung | ⚠️ | Serverseitig werden bisher kaum Nutzerdaten gespeichert – das vereinfacht DSGVO erheblich, muss aber bei Multi-User neu bewertet werden |

## 5. KI-System — Kernentscheidung offen

| Punkt | Status | Befund |
|---|---|---|
| BYOK / Local Browser / Free-Demo-Hardlimit | ✅ | Implementiert und getestet, Standard „disabled" |
| Eigene GLM-5.2-Inferenz | ❌ | Gewichte nicht im Vault, kein Compute. **Ohne Compute-Entscheidung gibt es kein eigenes KI-Produkt** |
| Queue / Worker-Steuerung | ⚠️ | Code + Tests vorhanden, nie gegen echte Salad-Instanz gelaufen |
| Kostenkontrolle | ✅ | Cost-Guardrails, Free-Guard, Tests grün |

## 6. Sicherheit

| Punkt | Status | Befund |
|---|---|---|
| HTTPS erzwingen | ✅ | Live verifiziert |
| Secrets-Handling | ✅ | Keine Secrets im Browser/Repo, Policy + Checks |
| Abuse-/Rate-Schutz | ✅ | Tests `security-abuse`, `presign.failclosed` grün |
| DDoS | ⚠️ 🔑 | Cloudflare Free bietet Basis-Schutz; mehr gibt es auf Free nicht |
| Spam-/Bot-Schutz Registrierung | ❌ | Existiert nicht, weil Registrierung nicht existiert |

## 7. Recht & Monetarisierung — dringendste Pflicht

| Punkt | Status | Befund |
|---|---|---|
| **Impressum** | ❌ 🔑 | **Fehlt komplett. Die Seite ist live → Impressumspflicht gilt JETZT, nicht erst zum Launch** |
| **Datenschutzerklärung** | ❌ 🔑 | Fehlt komplett (Google Sign-In + Session-Cookie + Cloudflare = Verarbeitung personenbezogener Daten) |
| Nutzungsbedingungen | ❌ 🔑 | Fehlt |
| Cookie-Banner | ✅ | Aktuell **nicht nötig**: nur technisch notwendiges Session-Cookie, kein Tracking, kein Analytics. Bleibt so, solange kein Tracking dazukommt |
| Werbung / Payment | ❌ 🔑 | Nicht vorhanden; Werbung/Abrechnung widerspricht teils der aktuellen Policy und braucht Gewerbe/Konten. Separate Entscheidung |

## 8. Qualitätssicherung

| Punkt | Status | Befund |
|---|---|---|
| Funktions-/Unit-Tests | ✅ | 131/131 grün, `check:all`-Kette vollständig |
| Browser-/Mobile-Reports | ✅ | Reports in `docs/testing/` vorhanden |
| Lasttest | ❌ | Nie durchgeführt; auf Free-Tier nur begrenzt sinnvoll |
| Analytics | ❌ 🔑 | Nicht vorhanden (Vorteil: kein Cookie-Banner nötig; privacy-freundliche Option: Cloudflare Web Analytics Free) |

## Priorisierte Roadmap

**P0 – sofort (rechtlich, Seite ist bereits öffentlich):**
Impressum und Datenschutzerklärung als statische Seiten erstellen und verlinken. Das ist die einzige Lücke, die schon heute ein reales Risiko ist. 🔑 Deine echten Daten (Name, Anschrift) nötig – kein Prompt kann das erfinden.

**P1 – Produktentscheidung (blockiert alles Weitere):**
Compute-Frage klären. Drei ehrliche Optionen: (a) Launch als BYOK-only-Produkt (0 EUR, sofort möglich), (b) Salad-Budget freigeben und GLM-5.2-Transfer + Worker-Pipeline real testen (Geld, Wochen Arbeit), (c) Free-Demo-Hardlimit mit Partner-API. „Unbegrenzt viele Nutzer kostenlos mit eigener GLM-Inferenz" existiert nicht.

**P2 – Multi-User:**
`GOOGLE_ALLOWED_EMAIL`-Beschränkung durch echte Nutzerverwaltung ersetzen (Google-OAuth für alle, Nutzer-Metadaten policy-konform speichern), plus Support-E-Mail-Adresse und DSGVO-Löschpfad.

**P3 – Betrieb:**
Externes Uptime-Monitoring (Free), Fehler-Alarmierung, echter Backup-Restore-Test gegen IDrive e2.

**P4 – Vor öffentlichem Marketing:**
Lasttest gegen Free-Tier-Limits, Launch-Checkliste, optional Analytics.

## Bewertung des ChatGPT-Prompts

Etwa die Hälfte der Checkliste ist bereits erledigt und getestet (Infrastruktur-Basis, Frontend, Backend-Härtung, Sicherheit, QS-Grundlagen). Ein Viertel widerspricht der eigenen Free-only-Policy oder physikalischen Free-Tier-Grenzen (unbegrenzte Nutzer, DDoS-Schutz, Salad-Autoscaling, Werbung/Payment). Das letzte Viertel ist gar keine KI-Aufgabe, sondern erfordert externe Konten, Geld oder rechtliche Angaben (🔑-Punkte). Ein einzelner „mach alles fertig"-Prompt kann daher nicht funktionieren – die P0–P4-Pakete oben sind einzeln beauftragbar und einzeln verifizierbar.
