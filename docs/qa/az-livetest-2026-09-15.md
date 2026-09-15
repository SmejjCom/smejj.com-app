# A-bis-Z-Livetest smejj.com — 15.09.2026 (nach 100 %-Schutz)

Auftrag Betreiber: „Mach A bis Z Test komplett, alles live prüfen". Geprüfter Stand = Schutz-Anker
`schutz-100-2026-09-15` (Frontend SW `smejj-shell-v883`, Brücke v156, Control `d5295bbf`).
Methode: vier Prüfteams parallel, nur lesend bzw. mit Eval-Konto, **keine Code-Änderung** (100 %-Schutz).
Messfalle: Das Netz des Test-Macs war während des Tests stark überlastet (Referenz google.com 5,6 s,
github.com p95 12 s) — alle Zeitwerte sind obere Grenzen, nicht Serverwerte.

## Ergebnis auf einen Blick

| Bereich | Umfang | Ergebnis |
|---|---|---|
| Web-Frontend (Chrome 1440/390, Firefox) | Chat (17 Wege), 6 Modelle, Werkzeuge, Sprache, Verlauf/Papierkorb, Suche, Einstellungen, Konto, Projekte, Dateien, 18 Ansichten mit 123 echt geklickten Knöpfen, Offline, langsames Netz, 58 Seiten × 2 Größen, 152 Responsive-Punkte | bestanden bis auf 10 Befunde (unten) |
| Server & Sicherheit | 85 Autopiloten, Health anonym/angemeldet, 53 Admin-Routen ohne Ausweis (alle 401), Nicht-Admin (403), Methoden (405), CORS, Header, TLS, Geheimnisse in 198 JS-Dateien (0), Precache (alle 200), 8 Injektionsproben (0 kritisch, SSRF blockiert), Kernsuite, Sprachseiten 15/15, Sitemap, Sicherungen, Codeberg = GitHub | Sicherheit bestanden; 11 Befunde |
| Adminbereich | 35 Seiten + Control Center × 1440/390, Filter/Register bedient, 43 Links, abgemeldet (alle → Anmeldung), Rückfall-Host | 0 JS-Fehler, 0 fehlgeschlagene Anfragen; 8 Befunde |
| iPhone (iOS 26.5 Safari) / Android 15 (Chrome) | Start ab-/angemeldet, Anmeldung, Chat + Stopp, Menü, Verlauf, Einstellungen, Querformat, Offline, /admin | bestanden bis auf 3 Befunde; iOS-Querformat/Offline technisch nicht prüfbar |

## Befunde nach Schwere

### Mittel (spürbar für Nutzer oder Betreiber)
| Nr | Befund | Beleg | vermuteter Ort |
|---|---|---|---|
| M1 | Admin-Autopiloten-Seite bleibt am Handy > 30 s „wird geladen": API liefert 592 KB JSON **ohne Komprimierung** (alle Admin-APIs ohne gzip) | 591 831 Bytes, 2 von 3 Läufen hängen | `control-server/src/routes/adminOpsRoutes.js` / privateJson |
| M2 | Neues Gerät: Verlauf baut sich sehr langsam auf (jeder Chat einzeln), nach 40 s 30 von 368 Chats, danach keine weiteren | 126 Abrufe in 90 s | Chat-Abgleich (`?id=`-Schleife) |
| M3 | „Bild verstehen" antwortete 1 von 3 Mal leer — Bild ging an das Textmodell | `groq:openai/gpt-oss-120b`, leere Antwort | Brücke, Bild-Routing |
| M4 | Nach dem Anmelden: bis der volle Service-Worker aktiv ist, zeigt `/chat-history` die Landeseite, `/settings` bleibt stehen (Emulator > 7 min) | Android-Screenshot | `sw.js` huelleAusCache |
| M5 | Modell-Menü öffnet nach dem ersten Klick erst nach 0,8–5,1 s (Modul wird nachgeladen) | probe-menue4 | `code-modell-menue.js` |
| M6 | Erstes Zeichen im Chat: Median 4,1–5,4 s, p95 11 s (Budget unter 1 s; Netz gestört) | measure_first_token | Brücke/Router |
| M7 | Bild-Maler zeitweise nicht erreichbar (11:00 „fetch failed", 11:29 wieder bereit; 90-Tage-Quote 84 %) | Autopilot Nr. 12 | Dienst smejj-bild-maler |
| M8 | Admin-Anmeldeprüfung schwankt 5–13 s, einmal „Nutzerverzeichnis nicht erreichbar" beim Kaltstart | extra-kalt.json | `admin/adminAuth.js` getUserByEmail |

### Niedrig
Rollen-Seite 48 px Überlauf bei 390 px (langer Dateiname) · Android-Querformat: Werkzeugleiste 5 px unter der Kante ·
iOS: „Einstellungen" lässt die Spur offen · Touch-Ziele < 44 px (Eingabefeld 40, „Nachdenken" 38, Fußlinks 24) ·
Startseite kalt 303 KB (Budget 300), LCP kalt 2,0 s · Stopp in der Wartezeit: leere Antwort nach Neuladen weg ·
Handy: „Nächste Version" ragt 11 px heraus · nach Abmelden bleibt `smejj.session.v1` (ohne Token) ·
Firefox: SW-Fehler bei `api/chats?id=` während Ansichtswechsel · „Übersetze …:" löste mit Vorsatz eine Websuche aus ·
Doppelklick „Projekt erstellen" legt 2 Projekte an · Admin: Rückfall-Host 404 `frame-guard.js`, Hülle kurz vor
Bestätigung sichtbar, falscher aktiver Menüpunkt während der Prüfung · Control Center zählt „aktiv 71" vs. Autopiloten-Seite
„läuft 83" (Bausteine) · 3 der 12 Fragen ohne Belege · Erste Hilfe (Nr. 33) wird rot durch den gewollten 24-h-Alarm der
Konto-Wache (Alarm-Mails) · Auslieferungs-Ansicht: Control „dahinter" trotz Bau-Wache „läuft", Bild-Maler/Video 404 als
„erreichbar" · Brücke ohne HSTS/Frame-Schutz-Header, smejj.com (GitHub Pages) ohne nosniff/Frame-Header ·
Ampel beachtet nur den letzten Lauf (90-Tage-Quoten 34–44 % bei Nr. 29/42/63/75/79/82) ·
Messwerkzeug: `(?i)` im Muster wird still als „trifft nicht" gewertet.

### Einordnung „Kernsuite 61,8 % auf dem Nutzerweg"
Die Kernsuite-Fälle bringen ihr Wissen im **System-Prompt** mit (z. B. „LCP unter 1,5 s"). `/api/agent` nimmt keinen
fremden System-Prompt an — die vier kritischen Fälle (budget-lcp-grounding, regel-800-zeilen, schutz-design-lock,
naming-schreibweise) fehlen deshalb vor allem Kontext, nicht Können. Echter Anteil: die Antwort schrieb den Namen einmal mit großem Anfangsbuchstaben und ohne „.com"
(Schreibregel). Die Qualitätsmessung Nr. 01 misst weiterhin `/api/chat` mit Suite-Kontext (97,1 %).

## Zwischenfall während des Tests
Der Tote-Knopf-Detektor klickte 13:10–13:16 UTC in `/papierkorb` 14× „Wiederherstellen" und holte Test-Chats der
Parallelsitzung zurück (kein Produktfehler; Werkzeug überspringt jetzt Wiederherstellen/Rückgängig/Archivieren).
Aufräumen der Test-Chats übernimmt die Parallelsitzung mit Betreiber-Freigabe.

## Nicht geprüft
Video senden (Kosten), Magic-Link/Registrierung/Passkey anlegen/Konto löschen (Außenwirkung), Abmelden am Server,
Barge-in und Spracherkennungs-Genauigkeit am echten Gerät, iOS-Querformat und iOS-Offline (Simulator-Grenzen).

## Freigabe und Umsetzung
Betreiber am 15.09.2026 per Auswahl: „Alle beheben (Empfehlung)", danach „Mach weiter bis alles live und 100 % fertig"
und „Mach weiter bis alles fertig". Umgesetzt, ausgeliefert und live nachgetestet:

| Nr | Korrektur | Live-Beleg nach der Auslieferung |
|---|---|---|
| M1 | Admin-APIs komprimiert (brotli/gzip ab 1 KB) | Autopiloten-API 592 KB → 50 KB, 1,0–1,7 s; am Handy (390 px) Seite in 2,0 s |
| M2 | Verlauf auf neuem Gerät: 4 parallele Abrufe mit Zeitgrenze, zweite Runde; zuerst sichtbare Chats, dann Papierkorb (Server nennt `deletedAt`, Index-Fassung 2) | erste Seite (30 Chats) nach 10 s voll statt 40–90 s ein Eintrag; 368 Abrufe, alle 200, nie mehr als 4 gleichzeitig |
| M3 | Bild verstehen fällt nie still an ein Textmodell; Wiederholung, sichtbare Meldung | 6 von 7 richtig beschrieben (qwen3.8-27b), 1× sichtbare Meldung „konnte gerade nicht ausgewertet werden" |
| M4 | Service-Worker: Hülle für App-Routen aus dem Netz zuerst, `/api/` nie abgefangen | /chat-history und /settings direkt aufgerufen: nie die Landeseite |
| M5 | Modell-Menü vorladen; Erste-Schritte-Karten verschieben das Eingabefeld nicht mehr (Ursache der verlorenen Klicks: Sprung um 95 px) | 10 von 10 frühen Klicks öffnen das Menü (vorher 8 von 10), Knopf bleibt stehen; Handy-Layout unverändert (Sichtprüfung 390×844) |
| M6 | Brücke: 15-s-Grenze für Websuche und Anmeldeprüfung, Textarbeit mit Vorsatz ohne Websuche | „Übersetze …" 3× ohne Websuche, erstes Zeichen 4,9–9,1 s (Netz des Test-Macs gestört) |
| M7 | Autopilot Nr. 12 wertet „beschäftigt"/429 nicht als Ausfall, 10-s-Wiederholung; Bild-Maler meldet `beschaeftigt` | Nr. 12 grün, Bild-Maler neu gebaut (deploy/smejj-bild-maler 85aa44b5) |
| M8 | Admin-Anmeldeprüfung mit 30-s-Zwischenspeicher und Wiederholung | Hülle 1–4 ms nach /api/admin/me, vorher nur Ladehinweis |
| niedrig | alle 17 Punkte (Überläufe, Touch-Ziele 44 px, „Gestoppt." bleibt, Abmelden räumt `smejj.session.v1` auch auf der Kontoseite ab, Projekt-Doppelklick, Querformat, Header, Rückfall-Host, Control-Center-Zählung, befristeter Konto-Wache-Alarm, Auslieferungs-Ansicht, Messwerkzeug `(?i)`) | Oberflächen-Nachtest 12 Punkte bestanden; Startseite 230 KB gzip (Budget 300) |

Zusätzlich im Nachtest gefunden und behoben: Autopilot Nr. 79 stand rot, obwohl `/api/agent` den Angriff dreimal
abwehrte (Prüfwortliste kannte „verhindert die Weitergabe" nicht; Suite smejj-chat-breit 1.3.0). Der Qualitäts-Messlauf
auf dem Mac brach ab, weil die Xcode-Lizenz git blockierte (Skript nutzt jetzt die Command Line Tools) — nachgeholt: 100 %.

**Stand danach (15.09., 21:19 UTC):** smejj.com SW `smejj-shell-v888`, Control `654a184f`, Brücke v157, alle Dienste
„gleich"; Autopiloten 85 von 85 grün, 0 gelb, 0 rot (21:22 UTC). Alle Sperren grün,
check:all grün in Arbeits- und Bauzweig.

**Bewusst nicht angehoben (Dependabot):** `pipecat-ai` 0.0.67 (kritisch, Pickle-RCE über LiveKit) — der Sprachdienst wird
nicht gebaut und nutzt LiveKit nicht; sauber erst ab 1.4.0 mit API-Umbau. `transformers` 5.5.0 (hoch, Pfad-Traversal in
`save_pretrained`) — der Bild-Maler ruft `save_pretrained` nie auf; zwei frühere Anhebungen legten ihn live still.
Beide sind im Betrieb nicht erreichbar; ein ungetesteter Umbau würde eine laufende Funktion gefährden.

## Nachtrag 15.09. abends — Sicherheitsmeldungen geschlossen
Betreiber: „Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen."

- **transformers (hoch) — behoben und live.** Bild-Maler auf transformers 5.17.0, diffusers 0.40.0, torch 2.14.0
  (osv.dev: 0 Lücken; torch 2.5.1 trug 22). Vorher in GitHub Actions bewiesen (Zweig `pruef/bild-maler-2026-09-15`,
  kostenlos, öffentliches Repo): Abbild gebaut, sd-turbo geladen, Bild in 32 s wie vorher, Porträt mit aktivem
  Gesichtsfix. Die Probe fand dabei einen **Live-Fehler**: der Gesichtsfix scheiterte bei jedem Porträt an fehlendem
  `libxcb.so.1` (Porträts kamen unrepariert) — Systembibliotheken ergänzt. Zweite Anpassung: `pipe.vae.enable_slicing()`
  statt des entfallenen `enable_vae_slicing()`. Live nach dem Bau (deploy/smejj-bild-maler b8def9f5): Apfel und Porträt
  als echtes PNG in 53–58 s über die Brücke (vorher 136 s). Dependabot #1: *fixed*.
- **pipecat-ai (kritisch) — begründet geschlossen.** `workers/smejj-voice` wird nirgends gebaut oder betrieben (war für
  Salad, abgeschaltet); die Live-Stimme läuft über smejj-voice-piper ohne pipecat; `LivekitFrameSerializer` ungenutzt.
  Sauber erst ab pipecat 1.x mit API-Umbau (Transport- und Kontextpfade) — Pflicht vor jedem künftigen Bau.
  Dependabot #3: *dismissed (not_used)* mit dieser Begründung.
- **Offen beim Betreiber:** Doppelklick auf „smejj.com Admin-Regeltext stempeln und ausliefern.command" (Admin-Lock-Stempel
  darf keine Sitzung selbst setzen). Die GitHub-Action „Code-Sicherung nach Codeberg" braucht ein Codeberg-Token als
  Secret `CODEBERG_TOKEN` — die tägliche Codeberg-Spiegelung vom Mac läuft unabhängig davon (zuletzt 15.09. 10:21 UTC, OK).
