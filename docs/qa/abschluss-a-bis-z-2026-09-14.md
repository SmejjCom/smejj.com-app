# Abschlussbericht A-bis-Z-Qualitätskontrolle smejj.com — 14.09.2026

**Auftrag:** ChatGPT-Prüfplan (22 Punkte) prüfen, an unser System anpassen, komplett durchführen; Fehler sofort beheben,
live gehen, live testen, bis alles sauber läuft; danach 100 % Schutz. Master-Prompt (Ship-Loop, Rote/Grüne Liste,
Performance-Budgets) gilt.

**Ergebnis in einem Satz:** Vier Fixrunden sind live (SW v867 → v871, Control-Server fünfmal abgeglichen), 14 Frontend-
und 6 Server-Befunde behoben, darunter ein seit dem 25.08. immer leerer Papierkorb und ein Löschen, das nie zum Server
kam; die komplette Suite (3.832 Tests) und alle Wächter sind grün, die Live-Matrix ist ohne Befund, die drei Design-
Entscheide (F18/F20/F14) sind nach dem Betreiber-OK umgesetzt, ein kleiner Design-Punkt (F27) und vier Betreiber-Handgriffe bleiben offen.

---

## 1. Was live geändert wurde (Ship-Loop, jede Runde: Rollback-Punkt → Fix → Checks → Stempel → Deploy → Live-Test)

| Runde | Live seit (UTC) | SW | Inhalt |
|---|---|---|---|
| Server 1 | 13.09. 23:03 | — | Bündel-Abgleich api.smejj.com (sw.js v839 → v867), Modell-Katalog-Wache bestätigt ungelistete Modelle, AI-Act-Eintrag smejj-1 |
| Server 2 | 13.09. 23:13 | — | GLM-5.2 zurück als Fundament (coding/reasoning/Registry), glm-4.5-flash als automatischer Rückfall; Wache prüft rote Ablage nach |
| Fixrunde 1 | 14.09. 00:0x | v868 | Papierkorb (F1), Lösch-Sync (F2), Browser-Knopf-Puffer (F3), Such-Overlay Escape (F4), Mikrofon aria-pressed (F5), Sprach-Vorwärmer (F7) |
| Fixrunde 2 | 14.09. 00:47 | v869 | Lösch-Sync wirklich wirksam (`window.smejjChatStore`) |
| Server 3 | 14.09. 00:55 | — | Bündel-Abgleich v869, Tests an die neue Modellkette angepasst |
| Fixrunde 3 | 14.09. 06:21 | v870 | Review-Befunde: Vorwärmer auf `/health`, `PAPIERKORB_TAGE` an einem Ort, Altlast-Löschungen erst synchronisieren statt sofort räumen, Lösch-Sync ohne Rettungs-Toasts, Escape schließt genau eines, Registry kennt Profile (Schnell/Web bleiben glm-4.5-flash), Zweitversuch mit eigener Kennung, Altlast `admin/uebersicht` aus dem Repo |
| Server 4 | 14.09. 06:22 | — | Katalog-Wache: Nachprüfung nur bei genau einem fehlenden Modell, 6-h-Frist nach Fehlversuch, Deckel 5 Proben, 8-s-Timeout; Registry-Profile; Kennung `glm-4-5-flash` |
| Fixrunde 4 | 14.09. 10:22 | v871 | Betreiber-OK „OK – F18, F20 und F14 umsetzen“: Werkzeug-Kacheln unter 430 px zwei Spalten ohne Silbentrennung (F18), Farbschema hell/system gesperrt mit Hinweis (F20), Spur-Einträge 44 px bei grobem Zeiger (F14) |
| Server 5 | 14.09. 10:26 | — | Bündel-Abgleich v871 in den Bauzweig (010d7abc); Bündel-Skript dort auf die V12-Quellen nachgezogen |

Rollback-Punkte: Tag `stand-2026-09-14-vor-qa-a-bis-z` (Arbeitszweig 95e06b2a, Klon 6abe1b1), Release-Tags
`release-2026-09-14-qa-fixrunde-2`, `-3` und `-4` auf Arbeitszweig, Klon, Bauzweig (GitHub + Codeberg).

## 2. Gefundene Fehler (vollständige Liste in `docs/qa/befunde-2026-09-14.md`)

**Behoben und live (20):** F1 Papierkorb immer leer · F2 Löschen nie synchron (3 Ursachen) · F3 Panel sprang nach Schließen
wieder auf · F4 Escape im Such-Overlay · F5 Mikrofon a11y · F7 Vorwärmer 404 · R1 Escape traf Panels mit · R2 tote Zweit-
konstante · R3 Erstlauf der 30-Tage-Räumung hätte Altlasten überall gelöscht · R4 Lösch-Sync lud verworfene Chats hoch ·
R5 Registry ohne Profil (Schnellspur lief auf glm-5.2) · R6 Gesundheit der Modellkette (Zweitversuch überschrieb 5.2) ·
S1 Katalog-Wache falsch rot · S2 AI-Act ohne smejj-1 · S3 api.smejj.com mit altem Bündel · S4 tiefe Spur auf dem kleinen
Modell · S6 dritte Admin-Kopie · F18 Werkzeug-Kacheln zwei Spalten · F20 Farbschema „hell“ gesperrt · F14 Spur 44 px
(Fixrunde 4 nach Betreiber-OK, 10:22 UTC).

**Offen, Entscheidung des Betreibers (Design-Lock):** F27 die vier Vorlagen-Knöpfe der Code-Ansicht („Fehler suchen“,
„Funktion einbauen“, „Tests schreiben“, „Code erklären“) sind 38 px hoch — gleicher Fix wie F14 (44 px bei grobem Zeiger),
Bündel = Design-Lock; bestand schon in v870.

**Offen, klein (nächste Runde, ohne Betreiber):** F6 doppelte Anfragen beim Laden · F8 Emoji-Icons im Verlauf-Menü ·
F10 Messwerkzeug pwa-offline zählt falsch · F11/F16 Layout bei offenem Panel · F12 verwaiste Browser-Tabs · F13 „Maus
beauftragen“ · F21 Hinweisstreifen über Überschrift (Android) · F23 Bild nur als Platzhalter · R7 Lösch-Sync ist
Last-Write-Wins (Hinweis bei Konflikt fehlt) · R8 tote Bündel-Quelle `chat-bridge-weather.js` live veraltet.

**Betreiber-Handgriffe:** Zeabur-Schlüssel erneuern (Betriebswache) · `CODEBERG_TOKEN` in GitHub (Spiegel-Action) ·
Apple-Freigabe X29W6DM972 abwarten, dann 99 USD (TestFlight) · Keystore aus `~/Downloads` sichern · 4 Python-CVEs im
Bild-Maler-Worker (transformers 5.5.0, accelerate 1.1.1) brauchen eine GPU-Bauumgebung.

## 3. Getestete Bereiche, Geräte, Browser

| Bereich | Werkzeug / Weg | Ergebnis |
|---|---|---|
| Desktop angemeldet (Betreiber-Sitzung) | Chrome-Erweiterung, 232 Elemente inventarisiert | Chat, Streaming, Stopp, Aktionen, Neu generieren, Modell-Menü, Nachdenken, Plus-Menü, Sprachmodus, Diktat, Code, Websuche (Quelle), Bild verstehen, Datei-Anhang, Maus (Ada Lovelace 1815 in 58 s), Verlauf (Umbenennen, Löschen, Papierkorb, Wiederherstellen), Einstellungen, Profil-Menü, Deep-Links — grün; 0 Konsolenfehler |
| Modellzeilen mit Kopfzeilen-Beweis | POST Brücke, `x-smejj-model-backend/-fallback` | Schnell/Auto: groq 0,7–1,2 s · smejj 1.2: zhipu:glm-5.2 6 s · smejj 1: hausmodell:smejj-1-basis 6 s — alle `fallback: false` |
| Web nicht angemeldet | `rundgang.mjs` 19 Ansichten × 2 Runden, viermal (v867/v868/v869/v870) | 0 Befunde |
| Responsive | `messe_responsive.mjs` 8 Größen 320–1920, hoch/quer | 152 Messpunkte, 0 Verstöße (zweimal) |
| Touch-Ziele | `measure_touch_targets_app.mjs` 375×812, vor und nach Fixrunde 4 | v870: nur F14 (16 Verstöße) · v871: Startseite/Spur 0, übrig F27 (4 Code-Vorlagen, vorbestehend) |
| Mobil angemeldet | headless Chrome 402×874 + Eval-Ausweis | Bubble-Umbruch, Composer an der Unterkante |
| Datei-Anhang | CDP `setFileInputFiles` angemeldet | Chip + Inhalt kommen an („Ananas“) |
| PWA | `pwa-offline.mjs`, Cache-Zählung | SW aktiv, 235 Einträge, App offen ohne Netz; Update v867→v870 ohne leere Caches |
| iOS | Simulator iPhone 17 Pro, Safari (angemeldet), `simctl io screenshot` | Layout/Safe-Areas sauber; F18 (in Fixrunde 4 behoben, v871); Bildschirmtastatur nicht prüfbar (Hardware-Tastatur) |
| Android | Emulator `smejj_pixel`, installierte Play-App `com.smejj.app` (TWA), CDP | 38 Ansichten grün (abgemeldet); F21 |
| Web Vitals v870 (5 Läufe) | `measure_web_vitals.mjs` → `docs/benchmarks/webvitals_v870_2026-09-14.json` | kalt TTFB p75 132 ms, LCP 544 ms, CLS 0,021, INP 16 ms, Gewicht 302 KB; warm LCP 172 ms — Budgets eingehalten (Gewicht 2 KB über 300, F15) |
| API-Latenz (20 Aufrufe je Route) | `api-latenz.mjs` → `docs/benchmarks/api-latenz_v870_2026-09-14.json` | 5xx-Rate 0/200; p95: health 741, auth/config 246, capabilities 256, chats-Abgleich 957, billing 432, projekte 484, models/status 951 ms — p50 240 ms Grundlatenz vom Betreiber-Netz; Abgleich und models/status über dem 300-ms-Budget (F26) |
| Sicherheit | check:security/abuse/gatekeeper/passkey/users, CVE-Wächter, Dependabot, Zweigschutz | grün; 4 bekannte CVEs im nicht gebauten/GPU-Worker; kein Force-Push/Löschen mehr auf Klon `main`, Bauzweig, Arbeitszweig |
| Suite | `check:all` 1.117 Tests + `test:tests` 3.832 Tests (Arbeitszweig); Bauzweig control-server/llm-router/ai/frontend/voice/rag | grün (2 Pins an die neue Modellkette angepasst, 1 Kettenlängen-Annahme entfernt) |
| Ampel (85 Autopiloten) | Live-Ampel | nach Fixrunde 4: 79 grün, 1 gelb (Qualitätsmessung in der Schonfrist), 5 rot: Codeberg-Token und Zeabur-Schlüssel (Betreiber), Web-Vitals 302 KB (F15, Messung vor v871), tiefe Spur zeigt den 19 h alten Stand vor dem GLM-5.2-Fix (Tagesmessung steht aus), Projektwissen-Export (Brücke neu bauen); Test-/Vitals-Wächter auf dem Mac scheitern nachts an SSH zu GitHub |
| Adversarische Review | Workflow: 3 Blickwinkel, 26 Befunde, je 3 Skeptiker | 20 bestätigt → 10 mit Code behoben (Fixrunde 3 / Server 4), Rest dokumentiert |

## 4. iOS-/Android-Build, Datenbank, Backup, Release

- **Android:** die Play-App ist eine TWA-Hülle um smejj.com — die installierte Version (interner Testkanal, `com.smejj.app`, Emulator) zeigt nach `registration.update()` v870. Kein neues AAB nötig (Manifest/Hülle unverändert). Produktion bleibt in Google-Prüfung; Store-Eintrag nicht angefasst.
- **iOS:** kein Build möglich — Apple-Registrierung wartet. Vorbereitung (PWABuilder-iOS + Xcode Cloud) ist im Prüfplan beschrieben; TestFlight nach Freigabe.
- **Daten (IDrive e2):** Tages-Sicherung Nr. 46/47 grün (`sicherung_2026-09-13`, Rücksicherung geprobt); Replikation 2430_1/2431_1 in den Zweit-Eimer (nur Konsole); RAG-Export vom Mac am 14.09. versucht, Timeout am 30-s-Deckel (kein Schaden, alter Index bleibt). Keine Löschung, keine Migration; einzige Datenänderung: Test-Chats des Betreiber-Kontos (erstellt, umbenannt, gelöscht, wiederhergestellt) und des Eval-Kontos.
- **Release-Status:** live = Arbeitszweig af16932c (Klon 3f3a98b), Control-Server bae75d48 (Bauzweig). Schutz-Echtheit grün, Start-Lock dreimal gestempelt, Zweigschutz aktiv.

## 5. Was nicht geprüft werden konnte (ehrlich)

- Echte Geräte (Samsung/One UI, Bluetooth-Kopfhörer, Bildschirm sperren, Netzwechsel), iPad, Web-Clip vom Home-Bildschirm, Bildschirmtastatur im Simulator.
- 3G-Drosselung im Messwerkzeug (Netzemulation griff im CDP-Lauf nicht; Startseite ist auf dem Betreiber-Netz ~10 s nach dem Laden bedienbar — über dem 2-s-Budget, Ursache ist die Modulkette, kein Fehler dieser Runde).
- Sprachwelle mit künstlichem Mikrofon (Barge-in, erster Ton) — Werkzeug vorhanden (`sprachwelle-gespraech.mjs`), in dieser Nacht nicht gelaufen.
- Echte Klicks im Prüf-Chrome, sobald der Tab im Hintergrund liegt — JS-Klicks ersetzt, Mikrofon/Sprachmodus wurden mit echten Klicks geprüft, solange der Tab sichtbar war.

## 6. Nächste Schritte (Empfehlung)

1. Betreiber-Entscheid F27 (Code-Vorlagen 44 px, Design-Lock) — 15 Minuten nach „OK“; F18/F20/F14 sind seit 10:22 UTC live (SW v871).
2. Fixrunde 5 mit den kleinen offenen Punkten (F6, F8, F10, F11, F16, F21, F23, R7-Hinweis, R8).
3. Test-/Vitals-Wächter (Mac-launchd `com.smejj.test-waechter`, `com.smejj.web-vitals`): lesen GitHub per SSH und scheitern nachts — auf HTTPS umstellen wie der Codeberg-Spiegel (`~/.local/share/*/wache.sh`), Betreiber-Mac.
4. Nach Apple-Freigabe: iOS-Hülle bauen, TestFlight, Smoke-Test.
