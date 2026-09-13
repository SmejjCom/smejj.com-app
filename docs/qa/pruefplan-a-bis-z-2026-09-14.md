# Prüfplan A bis Z für smejj.com — angepasst an unser System (14.09.2026)

Grundlage: der ChatGPT-Vorschlag des Betreibers (22 Punkte). Dieses Dokument sagt, was daran
für uns stimmt, was fehlt, was bei uns anders heißt — und in welcher Reihenfolge ich es
durchführen würde. Alles darin ist gegen den Stand vom 14.09. geprüft (Arbeitszweig
`feature/design-start-chat-2026-09-13`, live SW `smejj-shell-v867`).

---

## 1. Bewertung des ChatGPT-Vorschlags

**Was stimmt und bleibt:** die Grundhaltung (jedes Element wirklich benutzen, nicht nur ansehen),
der Arbeitsablauf Verstehen → Planen → Ausführen → Testen → Beheben → erneut testen → verifizieren,
die Regel „ein Fehler wird behoben, bevor der nächste gesucht wird", die Abschlussprüfung von vorn,
und die Schutzphase nach der Freigabe.

**Was ChatGPT nicht wissen konnte — und was deshalb falsch oder leer ist:**

| ChatGPT sagt | Bei uns heißt das | Folge für den Plan |
|---|---|---|
| „Datenbank-Backup, Migrationen rückwärtskompatibel" | Es gibt keine Datenbank. Chats, Konten, Passkeys, Admin-Datensätze, Jobs liegen als JSON-Objekte auf IDrive e2 (S3). Sicherung = zweiter Eimer `smejj-sicherung` per Replikation. | „DB-Backup" wird zu: Replikation prüfen, Präfix-Export vor dem Start, Formatversionen der JSON-Dateien nicht brechen. |
| „Staging-Umgebung, dann Produktion" | Es gibt kein Staging. Frontend = GitHub Pages (Klon `~/smejj-app-frontend`, main), Backend = Zeabur (Control-Server, Chat-Brücke, Hausmodell). | Ersatz: lokaler Server (`npm run dev`) + Suite + Browser/Simulator/Emulator gegen lokal, dann Deploy per Kaskade, dann Live-Nachmessung (SW-Version, 224 Precache-Einträge = 200, `nach-auslieferung`). |
| „iOS Build, TestFlight" | Es gibt keinen iOS-Build. Die iOS-App ist ein Web-Clip (Home-Bildschirm) der PWA. Apple-Registrierung X29W6DM972 wartet seit dem 14.09. auf Apple. Danach 99 USD/Jahr (Betreiber). | TestFlight ist von außen blockiert. Vorbereiten ja (Hülle per PWABuilder-iOS + Xcode Cloud, damit der Mac frei bleibt), hochladen erst nach Apple-Freigabe. |
| „Android Build, Play-Testkanal" | Die Android-App ist eine TWA-Hülle um `https://smejj.com` (PWABuilder, Cloud-Bau, kein Mac). Interner Test läuft seit 08.09., Produktion in Prüfung seit 09.09. | Jeder Web-Deploy erreicht die installierte App sofort — ein neues AAB braucht es nur bei Manifest/assetlinks/Hülle. Während der Play-Prüfung NICHTS am Store-Eintrag ändern. |
| „Signierung kontrollieren" | Google signiert (App-Signaturschlüssel), Upload-Schlüssel liegt im ZIP in `~/Downloads`. | Betreiber muss den Keystore sichern — ohne ihn kein Update mehr möglich. Prüfpunkt, keine Handlung meinerseits. |
| „Branch Protection, Rollback-Version" | Unser Schutz sind die Sperren (Start-, Security-, Admin-, Deploy-, Modellmenü-, Abo-, Einwilligungs-, Auslieferungs-Lock) mit Stempel, `check:schutz-echtheit`, Tags `stand-…`, GitHub Secret Protection (09.09.). | Jeder Frontend-Fix braucht den Stempel (Kaskade als Skript, `--freeze` allein blockiert der Auto-Modus). Rollback = Tag + `check:rollback` + Klon-Revert + Zeabur-Vorgängerbau. |
| „Datenbankänderungen sicher rückgängig" | JSON-Formatversionen in e2, Sync mit Delta/Merge/Konflikt/Restore. | Prüfen: alte Chat-Datei wird von neuer App gelesen und umgekehrt (`check:sync`). |
| „Login testen, Session-Wiederherstellung" | Anmeldung per Magic-Link, GitHub, Passkey; 10-Minuten-Ausweis mit Refresh, Sitzung 180 Tage. Ich darf keine Zugangsdaten eintippen. | Angemeldete Tests brauchen EINMAL den Betreiber: angemeldeter Browser-Pane / Safari im Simulator / Chrome-Erweiterung. Alles Nicht-Angemeldete läuft ohne ihn. |
| „Mehrere Android-Hersteller" | Nur Emulator (`smejj_pixel`, `smejj_tablet`); der Emulator starb am 12.09. dreimal am Grafikfehler 12297. Kein echtes Samsung-Gerät vorhanden. | Erst Emulator heilen (Version/Treiber/AVD neu), dann Größen und Dichten per AVD abdecken. Herstellerspezifisch (One UI, Samsung Internet) nur mit echtem Gerät des Betreibers. |
| „CPU/RAM messen, Build erstellen" | MAC IST TABU (kein Rechnen/Training auf dem Betreiber-Mac). | Messungen leichtgewichtig (CDP, headless Chrome); AAB/iOS-Hülle in der Cloud bauen. |

**Was im Vorschlag komplett fehlt (und bei uns entscheidend ist):**

1. **Service Worker und Precache** — `cache.addAll` ist alles oder nichts; Cache-Marken `?v=`; Update-Pfad v867 → v868; ein Gerät, das Tage nicht offen war, misst die App von vorgestern (`registration.update()` zuerst).
2. **GitHub-Pages-Routen** — Deep-Link am Pfad greift nie; App-Routen müssen ein Neuladen überleben (404-Kreisel war behoben, bleibt Prüfpunkt).
3. **Die Modell-Kette als Beweis** — „ready" heißt nicht „antwortet". Maßgeblich ist `x-smejj-model-fallback: false` über Brücke → Control → Anbieter/Hausmodell, je Menüzeile (Auto, Schnell, Gründlich, smejj 1, BYOK GLM-5.2/Kimi).
4. **Kostenschutz** — Budget 100 EUR, Ausgabentor, Groq 8.000 Tokens/Minute, GLM-Kontingent, `check:cost`, `check-no-paid-services`. Ein Test darf keine Kosten auslösen, die nicht gedeckelt sind.
5. **Zwei Maus-Wege** — Chrome-Brücke (Erweiterung im Browser des Nutzers) UND ferner Browser (Worker). Beide getrennt prüfen; die Nummern-Wahl `n` ist der Zuverlässigkeitshebel.
6. **Sprachwelle hat drei Pfade** — Web-Speech im Browser, Ohr-Solo auf iOS (kein RecognitionCtor), Realtime-Relay `wss://api.smejj.com/api/voice-realtime` (Gemini Live). Barge-in ist nur mit künstlichem Mikrofon messbar.
7. **Lokales Modell** — Kurzprompts beantwortet Gemini Nano im Browser; ein „Chat-Test" kann lokal grün sein, ohne dass der Server je antwortete.
8. **Autopiloten und Ampeln** — Nr. 29 Nutzerreise (alle 15 min), Nr. 61 Test-Wächter, Nr. 62 Modell-Katalog, Nr. 72 Modell-Evolution, Nr. 81 Besucher-Puls. Sie sind Teil der Testmatrix, nicht Beiwerk — und derzeit stehen fünf auf Rot.
9. **Adminbereich** — 8 Menüs, geschützte Nummern, drei Kopien der Konsole, Impersonation, DSGVO-Anfragen, Mail-Zustellprotokoll, öffentliche API-Schlüssel.
10. **Rechtliches im Produkt** — EU-AI-Act Art. 50 (smejj-1 fehlt im Bestandsverzeichnis → Ampel rot), Impressum/Datenschutz, Einwilligungs-Lock.
11. **29 Sprachen, RTL** — `/en/*`-Seiten, Sprachseiten-Interaktion, `rechtslinks.test.mjs`. Layout-Tests ohne Arabisch/Hebräisch sind halb.
12. **Hell- und Dunkelmodus** — der Hellmodus riss am 05.09. die App im Simulator auseinander. Jede Ansicht in beiden Modi.
13. **Betreiber-Netz** — 500 ms Umlaufzeit, 16 KB/s gemessen. Performance IMMER mit 3G-Profil, sonst lügt jede Zahl.
14. **Messregeln** — das Wichtigste, was fehlt: eine Liste der Fallen, in die wir selbst schon gelaufen sind (Abschnitt 4).
15. **Parallelsitzungen** — andere Claude-Sitzungen können den Zweig zurücksetzen; live ist nicht immer neuer als der Zweig; Klon trägt Wurzel- UND `assets/`-Kopien.
16. **Werkstatt-Tor** — Dateien über der Zeilengrenze (browser-pane-maus.js 972, session-engine.js 846, browser-pane.js 825) halten das Tor zu; Fixes dort müssen aufteilen, nicht anhängen.
17. **Bekannte Altlasten mit Wirkung auf Ampeln** — Kimi K2.7 (554 GiB weg, `/api/models/status` ok:false), `/api/git/status` tot, Zeabur-Schlüssel abgelaufen (401, nur Betreiber), Codeberg-Spiegel überfällig, drei Python-CVEs.

---

## 2. Reihenfolge — so würde ich es jetzt machen

Jede Phase hat ein Ausstiegskriterium. Ohne Kriterium keine nächste Phase.

### Phase 0 — Sicherung (vor der ersten Änderung)

- [ ] Tag `stand-2026-09-14-vor-qa-a-bis-z` auf Arbeitszweig, Bauzweig und Frontend-Klon.
- [ ] Live-Stand notieren: SW-Version (`curl smejj.com/sw.js`), Control-Build-ID (`/api/health`), Brücken-Version.
- [ ] e2-Replikation in den Eimer `smejj-sicherung` prüfen (letzter Lauf, Objektzahl gleich).
- [ ] Präfix-Export: `chats/`, `konten/`, `admin/`, `passkeys/`, `jobs/` als tar in den Backup-Ordner (Datum im Namen).
- [ ] Sperr-Manifeste und Zeabur-Variablen-NAMEN (keine Werte) in `docs/qa/konfiguration-2026-09-14.md`.
- [ ] `npm run check:rollback` grün.
- [ ] Codeberg-Spiegel nachholen (Ampel „Code-Sicherung" ist rot).
- **Ausstieg:** Tag da, Export da, Rollback-Weg in einem Absatz beschrieben.

### Phase 1 — Inventar (automatisch, nicht von Hand)

- [ ] Skript: je Ansicht alle `button, [role=menuitem], a, input, select, [tabindex]` — auch verborgene — mit Text, ARIA, Größe, Handler-Vorhandensein (`getEventListeners`) → `docs/qa/inventar-2026-09-14.json`.
- [ ] Jedes Element ohne Handler = Attrappe = Fehler (Falle vom 10.09.).
- [ ] Jedes Element bekommt eine Zeile in der Matrix: Ansicht · Element · Aktion · erwartetes Ziel · Test vorhanden ja/nein.
- [ ] Menüs vollständig: Modell-Menü, Aktionen ⋯ (Quellen, ohne Formatierung, Vorlesen, Neu generieren, Fork, Ab hier löschen), Profil-Menü (Konto, Einstellungen, Sprache, Plan, Verbrauch, Papierkorb, Systemzustand, Hilfe, Abmelden), Plus-Menü, Code-Plus-Menü, Sprachmodus-Overlay (Datei, Auge, Tippen, Senden, Stumm, X), Kamera-Modus, Browser-Leiste, Spur (Start/Code, Verlauf, Kostenschutz, Konto), Werkzeug-Raster 4×2.
- **Ausstieg:** Inventar-Datei + Matrix mit null „unbekannt".

### Phase 2 — Fundament (ohne Betreiber)

- [ ] `npm run check:all` — 0 rot (Stand 12.09.: 4.441/4.441).
- [ ] Wächter: markenkette, precache-imports, start-lock, sync-assets, schutz-echtheit, startgewicht, touch-ziele, fokusring, css-regelreste, modul-syntax.
- [ ] Live: alle Precache-Einträge HTTP 200 (`-m 180`, nicht 20), sha256 gegen lokalen Build.
- [ ] Routen NUR aus `public/config.js` (CLIENT_ROUTES.api), nie geraten.
- [ ] Modell-Kette je Zeile mit Kopfzeilen-Beweis (`x-smejj-model-backend`, `x-smejj-model-fallback`).
- [ ] Doppelt geladene Module live (`doppelte-module-live.mjs`) = 0.
- [ ] Ampeln: die fünf roten benennen und, wo es mich betrifft, heilen (AI-Act-Eintrag smejj-1, Modell-Katalog glm-4.5-flash, Codeberg). Zeabur-Schlüssel und Betriebswache: Betreiber.
- **Ausstieg:** Suite grün, Live-Dateien 200, jede Modellzeile antwortet mit fallback false.

### Phase 3 — Web-Matrix (ohne Betreiber, nicht angemeldet)

Werkzeug: `scripts/diagnose/rundgang.mjs` (19 Ansichten) + `messe_responsive.mjs` + `measure_touch_targets_app.mjs`.

| Achse | Werte |
|---|---|
| Browser | Chrome (Browser-Pane + headless), Safari (Mac), Firefox, Edge |
| Breiten | 320, 360, 375, 390, 412, 430, 600, 768, 820, 1024, 1280, 1440, 1920 |
| Format | hoch + quer je Mobil/Tablet |
| Zoom | 100, 125, 150, 200 % (Betreiber braucht große Schrift) |
| Thema | hell + dunkel + System |
| Schrift-Richtung | de, en, ar (RTL) |
| Tastatur | `visualViewport`-Höhe simuliert 40 % kleiner (Bildschirmtastatur) |
| Netz | normal + 3G-Profil (500 ms, 400 kbit) |

Prüfregel je Zelle: kein Querscroll, kein Element außerhalb `innerWidth × innerHeight`, `elementFromPoint` auf die Mitte jedes Knopfes trifft den Knopf (nicht Rechteck-Vergleich), Eingabefeld sitzt an der Unterkante, kein Textüberlauf (`scrollWidth > clientWidth`), keine Layoutverschiebung nach Laden (CLS), Hinweisstreifen verdeckt nichts.

- **Ausstieg:** Matrix-Tabelle mit grün je Zelle oder Fehlernummer.

### Phase 4 — PWA (ohne Betreiber)

- [ ] Installiert (standalone) in Chrome Mac: Start, Reload, Deep-Link per Hash, Zurück-Knopf.
- [ ] Offline: `pwa-offline.mjs` — Landeseite, Verlauf, Chat-Eingabe gepuffert, Wiederverbindung holt nach.
- [ ] SW-Update: v867 → nächste Marke, `skipWaiting`, keine leeren Caches (Falle: doppelte Zeilen in addAll).
- [ ] `check:platform`, `willkommen-offline`, `sw-schmaler-eingang`.
- **Ausstieg:** offline-Rundgang grün, Update in einem Ladevorgang sichtbar.

### Phase 5 — iOS (Simulator; angemeldete Teile mit Safari des Betreibers)

- [ ] iPhone 17 Pro + iPad: Safari und Web-Clip (Home-Bildschirm) getrennt — der Web-Clip teilt keine Cookies.
- [ ] Safe-Areas (Statusleiste, Dynamic Island, Home-Balken) — nur in der installierten App messbar; `viewport-fit=cover` + `env()` (Wächter `mobil-safe-area`).
- [ ] Vollbild ohne schwarzen Balken (V12 gemessen 13.09., Regressionsprüfung).
- [ ] Hell/Dunkel, hoch/quer, Tastatur auf/zu (Feld bleibt sichtbar), Zoom.
- [ ] Sprachwelle: Ohr-Solo-Pfad (iOS hat kein RecognitionCtor), Vorlesen, Stumm.
- [ ] Texteingabe per `simctl pbcopy` + Einsetzen (Hardware-Tastatur löst Akzent-Popups aus).
- [ ] Bekannte Umgebungs-Fehler: `captureFailed` direkt nach Boot, Simulator fährt nach Aufnahmen herunter → dokumentieren, nicht als App-Fehler zählen.
- **Ausstieg:** Chat, Code, Start, Verlauf, Sprachmodus je Gerät hoch+quer, beide Themen.

### Phase 6 — Android (Emulator; erst heilen)

- [ ] Emulator-Absturz 12297 klären: Emulator-Version, `-gpu host`/`swiftshader_indirect`, AVD neu anlegen, `-no-snapshot`. Kein blindes Neustarten.
- [ ] Installierte TWA `com.smejj.app` starten (`am start -n com.smejj.app/.LauncherActivity`), display-mode standalone.
- [ ] `rundgang.mjs --fern http://localhost:9222` (adb forward) — dieselbe Regel wie am Schreibtisch; Frist 7 s, nicht 1,8.
- [ ] `registration.update()` VOR der Messung (Gerät misst sonst die App von vorgestern).
- [ ] AVD-Größen: 360×780 (klein), 412×915 (Pixel 7), 1280×800 und 2560×1600 (Tablet), quer je Gerät; Dichten 2.0/2.6/3.5.
- [ ] Status-/Navigationsleiste (63 px Pixel 7, 48 px Tablet) verdeckt nichts; Gestennavigation und 3-Tasten-Navigation.
- [ ] Zurück-Taste: schließt Menü/Modal, nicht die App.
- [ ] Herstellerspezifisch (Samsung One UI, Samsung Internet, Xiaomi MIUI): NUR mit echtem Gerät — Betreiber-Frage.
- **Ausstieg:** 19/19 Ansichten grün auf Telefon hoch+quer und Tablet, je 2 Runden.

### Phase 7 — Angemeldet (braucht einmal den Betreiber)

Voraussetzung: Betreiber meldet sich einmal im Prüf-Browser an (Browser-Pane oder Chrome mit Erweiterung). Ich tippe keine Zugangsdaten.

**Chat A bis Z, je Modellzeile (Auto, Schnell, Gründlich, smejj 1, BYOK):**
- [ ] neuer Chat, bestehender Chat, Text, 8.000-Zeichen-Nachricht, 5 Nachrichten in 3 s, Einfügen, Code, Markdown (Tabellen, Listen, Links), Bild einfügen, Datei hochladen (PDF, Bild, txt), Download, Abbrechen während Streaming, Neu generieren, Fork, Ab hier löschen, umbenennen, Papierkorb + Wiederherstellen, Scrollposition nach Reload, Titel-Automatik, Quellen, Vorlesen, ohne Formatierung.
- [ ] Doppelaktionen: Senden 2× in 200 ms = EINE Anfrage (Netzwerk-Log zählen), Modellwechsel während Streaming, Reload während Streaming.
- [ ] Verlauf: 225 Chats, `nurAbgleich=1`/`nurListe=1` unter 7 s auf 3G; Suche; Themen.
- [ ] Zwei Tabs gleicher Chat: Sync ohne Doppel-Datensatz, Konflikt sichtbar, Restore.
- [ ] Sitzung: Ausweis läuft ab (10 min) → stiller Refresh, kein Klopfen; 180-Tage-Sitzung; Abmelden löscht lokal; Anmelden Magic-Link/GitHub/Passkey.
- [ ] Lokales Modell: Kurzprompt lokal (Nano) vs. „genauer:" Serverweg — beide sichtbar unterschieden.

**Coding-Bereich (gegen Claude Code / Cursor / Codex gemessen):**
- [ ] Projekt öffnen, Datei lesen/erstellen/ändern, mehrere Dateien, Suche, Terminal (terminalPolicy), Befehl, Build, Tests, Logs, Diff, Rollback, Browser-Prüfung des Ergebnisses.
- [ ] Der Agent zeigt je Schritt „behauptet → geprüft" mit Beweis (Testausgabe, Screenshot) — `verification.mjs`, `browser-verification.mjs`.
- [ ] Abbruch mitten im Lauf, Fortsetzen, Schrittgrenze, Kostenanzeige.

**Maus / Browsersteuerung (beide Wege):**
- [ ] Chrome-Brücke UND ferner Browser: öffnen, neuer Tab, Tab-Wechsel, zurück/vor, scrollen, klicken per Nummer `n`, doppelklicken, markieren, kopieren, einfügen, Formular, Dropdown, Checkbox, Upload, Download, Dialog, Fehlermeldung.
- [ ] Ada-Lovelace-Aufgabe (de.wikipedia) 5× je Weg — Ziel: 5/5 Abschluss unter 120 s, kein `selector_ohne_treffer`.
- [ ] Nur EIN Zeiger sichtbar; Klick trifft die Mitte des Ziels; nach Fehlschlag neue Beobachtung statt gleicher Klick.
- [ ] Maus-Ausweis-Ablauf nach 10 min (Fix v827) — Regressionsprüfung.

**Sprachwelle (gegen ChatGPT Voice / Gemini Live gemessen):**
- [ ] Künstliches Mikrofon (`--use-fake-device-for-media-stream`): Start/Stop zuverlässig 10×, Pegel sichtbar, Zustände „hört / denkt / spricht" unterscheidbar.
- [ ] Zeit bis erstes Wort (Ziel < 1,5 s Schnellspur), bis erster Ton (Ziel < 2 s).
- [ ] Barge-in: unterbricht genau einmal, nicht in Stille; Antwort danach nicht doppelt, nicht abgeschnitten; keine Tonüberlagerung; Text und Ton synchron.
- [ ] Realtime-Relay angemeldet (401 ohne Anmeldung ist richtig): Verbindung, Unterbrechung, Wiederverbindung.
- [ ] Berechtigung verweigert → ehrliche Meldung + Tipp-Weg; Audio-Ausgabewechsel (Kopfhörer/Bluetooth nur echtes Gerät); Hintergrund/Vordergrund; Bildschirm sperren (nur echtes Gerät); Netzwechsel (nur echtes Gerät).
- [ ] Kamera-/Auge-Modus im Sprachoverlay, Datei im Sprachoverlay.

**Weitere Werkzeuge:** Bild erstellen, Video, Websuche (Region, Schlüssel, Quellen), Netz/Browser-Kachel, Dateien, Projektwissen/RAG.

- **Ausstieg:** jede Zeile der Inventar-Matrix „ausgeführt + geprüft", Netzwerk-Log ohne Doppelanfragen, Konsole ohne Fehler.

### Phase 8 — Backend und Daten

- [ ] e2: Lesen/Schreiben/Listen-Latenz (LIST hinkt bis 60 s — Frisch-Puffer greift), Zeitgrenze 30 s im Signer bewusst, Retry.
- [ ] Race: zwei Schreibvorgänge auf einen Chat; Doppel-Datensätze = 0.
- [ ] Ausgabentor, Ratenbegrenzer, Groq-Minutenlimit, GLM-Kontingent leer → sichtbarer, ehrlicher Rückfall (kein „Verstanden. Ich kann daraus…"-Text bei grüner Ampel).
- [ ] Sessions, Refresh, Rechte (Admin ohne Anmeldung = 401, Regression vom Fund „Adminbereich war sichtbar").
- [ ] Adminbereich 8 Menüs + Nummern-Schutz + drei Konsolen-Kopien synchron (`check:admin-console-sync`).
- [ ] Mail-Zustellung (Magic-Link), DSGVO-Anfrage, Impersonation nur mit Freigabe, Audit-Log.
- [ ] Öffentliche API-Schlüssel: anlegen, Limit, Verbrauch, sperren.
- [ ] Hausmodell: Neubau leert Cache (2,5 GB, ~200 s) — Readiness ohne Blockade.
- **Ausstieg:** `check:users`, `check:sync`, `check:abuse`, `check:gatekeeper` grün + Live-Proben.

### Phase 9 — Performance (immer mit 3G-Profil)

- [ ] `measure_web_vitals.mjs`: LCP, CLS, INP je Ansicht; `check:startgewicht` (Ratsche); `measure_first_token.mjs` je Modellzeile.
- [ ] Streaming ohne Stillstand (`strom-stillstand.test`), Scroll mit 500 Nachrichten, Animationen 60 fps (Sprachwelle, Menüs).
- [ ] 1-Stunden-Sitzung: Heap-Verlauf, Listener-Zahl, offene Verbindungen.
- [ ] Netzwerk: Anfragen je Aktion zählen; doppelte Modul-Ladungen 0; Bilder-Cache.
- **Ausstieg:** Zahlen in einer Tabelle, jede über Ziel = Fehlernummer.

### Phase 10 — Sicherheit

- [ ] `check:security`, `check:abuse`, `check:gatekeeper`, `check:cve` (drei Python-CVEs: accelerate, pipecat-ai, transformers — Bauumgebung nötig), `check:paths`, Secret-Scan über Repo + Klon + Backups.
- [ ] CSP live (Bilder-Fund 08.09.), XSS im Markdown-Renderer mit Angriffs-Korpus, Upload-Typen, Pfad-Politik im Worker, Prompt-Injection aus der Web-Ernte.
- [ ] Rate-Limits je Route, Fehlerausgaben ohne Stacktrace, Logs ohne Ausweise/Schlüssel.
- [ ] Erlaubnisliste statt Verbotsliste bei Endpunkten (Regel im Gedächtnis).
- **Ausstieg:** 0 kritisch, jede Warnung entweder behoben oder mit Grund notiert.

### Phase 11 — Bedienbarkeit und Zugänglichkeit

- [ ] Tastatur-Rundgang ohne Maus durch alle Ansichten, sichtbarer Fokusring (Wächter), Escape schließt Menüs, Enter/Shift+Enter im Feld.
- [ ] VoiceOver (macOS/Simulator): Ansichtstitel angesagt, Knöpfe benannt, Live-Region beim Streaming.
- [ ] Kontrast beide Themen, Touch-Ziele ≥ 44 px, 200 % Schrift, `prefers-reduced-motion`.
- [ ] Leere Zustände, Offline-Zustände, Ladeindikatoren, Fehlermeldungen in Nutzersprache.
- **Ausstieg:** `a11y-structure`, `fokusring-kontrast`, `touch-ziele-waechter` grün + Tastatur-Protokoll.

### Phase 12 — Wiederholung und Doppelaktionen

- [ ] Kernflüsse 3× am Stück: Chat senden, Modellwechsel, Upload, Sprachwelle, Maus, Coding-Lauf, Login-Refresh, Reload, Navigation.
- [ ] Schnellfolgen: Doppelklick, Klick während Laden, Klick nach Seitenwechsel, Menü öffnen/schließen 20×.
- **Ausstieg:** dreimal grün, kein Unterschied zwischen Lauf 1 und 3.

### Phase 13 — Fehlerschleife (für jeden Fund, sofort)

Reproduzieren → Ursache (nicht Symptom) → Fix im Arbeitszweig → Test/Wächter ergänzen → Suite → Deploy per Kaskade (Bauzweig, Klon, Stempel) → Live-Nachmessung (SW-Marke, Precache 200, `nach-auslieferung`, `schutz-echtheit`) → angrenzende Funktionen erneut → Eintrag in `docs/qa/befunde-live.md`.

Regeln dabei: keine Einfügung nach Zeilennummer, Werkstatt-Tor beachten (große Dateien teilen), Klon-Quelle zuerst lesen (`git log origin/main`), Wurzel- und `assets/`-Kopie beide nachziehen.

### Phase 14 — Abschlussprüfung von vorn

Phase 2 bis 12 komplett neu, nichts aus der ersten Runde gilt weiter. Bericht `docs/qa/abschluss-a-bis-z-2026-09-XX.md` + Kapsel unter `docs/task-capsules/`.

### Phase 15 — Testversionen

**Android (jetzt möglich):**
1. Wenn nur Web geändert: installierte TWA aus dem internen Testkanal öffnen (Play-Link), Smoke-Test auf der tatsächlich installierten Version, SW-Marke prüfen.
2. Wenn Manifest/assetlinks/Hülle geändert: AAB per PWABuilder (Cloud), Paketname `com.smejj.app`, Versionscode +1, Upload in den internen Testkanal (Play Console im angemeldeten Browser des Betreibers), Uploadstatus, Installation auf Emulator, Smoke-Test.
3. Produktion NICHT anfassen, solange die Prüfung vom 09.09. läuft.

**iOS (blockiert bis Apple freigibt):**
1. Vorbereiten: iOS-Hülle (PWABuilder iOS = WKWebView-Projekt) im Repo, Bundle-ID, Icons, Splash, Berechtigungstexte (Mikrofon, Kamera).
2. Bauen in Xcode Cloud (kostenlos bis 25 h/Monat, Mac bleibt frei) — Alternative: lokaler Xcode-Bau nur mit Freigabe des Betreibers (Mac-Last).
3. Nach Apple-Freigabe: 99 USD (Betreiber), App Store Connect, TestFlight-Upload, interne Tester, Smoke-Test der installierten TestFlight-Version.

### Phase 16 — Schutz des freigegebenen Stands

- [ ] Tag `release-2026-09-XX-testversion` auf drei Repos; Stempel-Kaskade; `check:schutz-echtheit` grün.
- [ ] Backup an drei Orten (Repo, Codeberg, IDrive) + e2-Präfix-Export.
- [ ] Konfiguration dokumentiert (Variablen-Namen, Sperren, Versionen, SW-Marke, Play-Versionscode).
- [ ] GitHub-Schutz prüfen: kein Force-Push auf `main` im Klon und auf den Bauzweig; PR-Pflicht dort, wo GitHub es kostenlos erlaubt.
- [ ] Neue Arbeit nur auf neuem Zweig; der Release-Stand wird ohne schriftliche Freigabe nicht verändert.

---

## 3. Was nur der Betreiber kann (vorab einplanen)

1. Einmal anmelden im Prüf-Browser (Chat, Maus, Sprachwelle angemeldet, Coding).
2. Zeabur-Schlüssel erneuern (Betriebswache 401 seit 13.09.).
3. Keystore aus `~/Downloads/smejj.com - Google Play package.zip` an einen sicheren Ort.
4. Apple: auf die Freigabe von X29W6DM972 warten, dann 99 USD.
5. Codeberg-Zugang bei GitHub eintragen (Spiegel überfällig).
6. Entscheidung: iOS-Hülle über Xcode Cloud (Empfehlung) oder lokal.
7. Falls vorhanden: ein echtes Samsung-/Android-Gerät für Hersteller-Tests, Bluetooth-Kopfhörer für die Sprachwelle.

---

## 4. Messregeln (unsere eigenen Fallen — Pflichtlektüre vor jeder Messung)

1. Schwankende Größen bei `curl` = Abbruch, nicht Schaden (`-m 180`).
2. Routen aus `config.js`, nie geraten (`/api/usage` gibt es nicht).
3. `/api/chats` ohne Parameter hängt bei 225 Chats — kein Fehler, Alt-Weg.
4. „ready" heißt nicht „antwortet" — Kopfzeile `x-smejj-model-fallback: false` entscheidet.
5. GET statt POST lässt einen gesunden Dienst tot aussehen (Brücke nimmt POST).
6. WebSocket-Route antwortet auf GET mit 404 — richtig, nicht kaputt.
7. Nichts passiert ≠ darf nicht: Attrappen-Knopf, Barge-in ohne Mikrofon.
8. Gerät misst die App von vorgestern → `registration.update()` zuerst.
9. Frist am guten Fall bemessen: Emulator 6,6 s statt 1,8 s.
10. Am Dokument lauschen, nicht am Element (Sendeknopf wird neu gezeichnet).
11. `elementFromPoint` auf die Mitte, nicht Rechteck-Vergleich.
12. Kurzprompts antwortet Gemini Nano lokal — Serverweg nur mit „genauer:".
13. Schein-angemeldet: erst `auth/me` messen, dann Chat testen.
14. Testpins auf Cache-Marken (`?v=`) machen Dauer-Rot und blind.
15. `grep -q` + `pipefail` = Falschrot; in Datei schreiben, dann prüfen.
16. Simulator-`captureFailed` und Emulator-12297 sind Umgebung, nicht App.
17. Dialoge im Übersetzungsdienst brauchen 10–17 s — Screenshot statt DOM.
18. Performance nur mit 3G-Profil; ohne Profil ist jede Zahl geschönt.
19. Der „flakige" Test holte echte Schlüssel des Macs — Test-Server erbt Geheimnisse.
20. Ein gemeldeter Wert, den niemand liest, schützt nichts (`--hinweis-hoehe`).

---

## 5. Besser als ChatGPT, Claude, Gemini — was wir anders und besser machen

Nicht kopieren, sondern dort gewinnen, wo unsere Architektur etwas hat, das die drei nicht haben — und dort nachziehen, wo ihre Mechanik den Nutzer wirklich entlastet.

### 5.1 Unsere Trümpfe, sichtbar machen (haben wir, zeigt keiner der drei)

1. **Ehrlichkeit als Merkmal.** Wir wissen je Antwort, welches Modell wirklich geantwortet hat und ob ein Ersatz einsprang (`x-smejj-model-backend`, `x-smejj-model-fallback`). Als kleiner Chip an jeder Antwort: „smejj 1 · kein Ersatz" / „GLM sprang ein". ChatGPT, Claude, Gemini sagen das nie.
2. **Kosten je Antwort.** Der Token-Messer existiert. Anzeige „0,3 Cent" neben dem Chip, und im Kostenschutz der Spur der Tagesstand gegen die 100-EUR-Grenze. Kein Wettbewerber zeigt dem Nutzer, was er kostet.
3. **Offline zuerst.** Landeseite, Verlauf, gepufferte Eingabe, lokales Modell (Nano) für Kurzes. Die drei sind ohne Netz tot. Ziel: „geht ohne Netz weiter, holt nach" als sichtbares Versprechen mit Offline-Streifen.
4. **Maus im eigenen Browser.** Die Chrome-Brücke arbeitet in der Sitzung des Nutzers — mit seinen Logins, ohne Cloud-Browser. Claude/ChatGPT nutzen fremde Browser. Dazu die Nummern-Wahl `n`: das Modell kann nur klicken, was es wirklich sieht.
5. **Eigenes Modell auf eigenem Server, BYOK, kein Cloudflare, e2-Speicher, DSGVO-Anfragen im Admin, EU-AI-Act-Kennzeichnung.** Datensouveränität als Produkt, nicht als Fußnote.
6. **Die App überwacht sich selbst.** Nutzerreise-Wächter alle 15 min, Ampeln, Systemzustand im Profil-Menü. Ausbau: je Werkzeug-Kachel ein grüner/roter Punkt aus der echten Ampel — „Sprachwelle: läuft", „Bild: Kontingent leer".
7. **Agent mit Beweis.** Der Coding-Worker hat `verification.mjs` und `browser-verification.mjs`. Jeder Schritt zeigt „behauptet → geprüft" mit Testausgabe oder Screenshot. Die Konkurrenz sagt „erledigt".
8. **Sprachwelle auf iOS ohne Spracherkennung des Systems** (Ohr-Solo) — läuft, wo Safari-Web-Apps sonst schweigen.

### 5.2 Was die drei haben und wir prüfen müssen (fehlt es, bauen wir es passend)

Jeder Punkt wird in Phase 1 im Inventar geprüft; „fehlt" wird erst nach der Prüfung behauptet.

| Mechanik | Bei wem | Passt zu uns? |
|---|---|---|
| Eigene Nachricht bearbeiten und erneut senden | ChatGPT, Claude, Gemini | Ja — wir haben Fork/Ab hier löschen, das Bearbeiten fehlt vermutlich. |
| „Weiter schreiben" nach abgeschnittener Antwort | ChatGPT | Ja, Strom-Stillstand-Erkennung existiert schon. |
| Abbrechen-Knopf sichtbar während Streaming | alle drei | Prüfen (Sendeknopf-Zustand). |
| Tastenkürzel (neuer Chat, Fokus ins Feld, Modell) | ChatGPT, Claude | Ja, kostet nichts, hilft am Schreibtisch. |
| Temporärer Chat ohne Verlauf | ChatGPT, Gemini | Ja — Datenschutz-Argument passt zu uns. |
| Chat per Link teilen (nur lesen) | ChatGPT, Claude, Gemini | Prüfen, ob „Datei teilen" das schon abdeckt. |
| Projekte/Ordner mit eigenem Wissen | ChatGPT, Claude | Wir haben Projektwissen/RAG — Ordner im Verlauf prüfen. |
| Vorschau neben dem Chat (Canvas/Artefakt) | ChatGPT, Claude | Wir haben Browser-Pane + Code-Ansicht — als Antwort-Vorschau (HTML/SVG) prüfen. |
| Bild einfügen per Strg+V und Drag&Drop | alle drei | Prüfen (chat-medien). |
| Stimme wählen, Sprechtempo | ChatGPT, Gemini | Prüfen; Vorlesen existiert. |
| Geplante Aufgaben für Nutzer | ChatGPT | Wir haben Autopiloten — Nutzer-Sicht prüfen. |
| Gedächtnis über Chats hinweg, vom Nutzer einsehbar/löschbar | ChatGPT, Gemini | Wir haben Gedächtnis in der Brücke — Einsicht/Löschen im Konto prüfen. |
| Mobile: Wischen öffnet Spur, langer Druck auf Nachricht = Menü | ChatGPT, Claude (Apps) | Prüfen, Web-App-tauglich. |
| Suche im Verlauf | alle drei | Existiert (Verlauf-Themen) — Geschwindigkeit bei 225 Chats messen. |

### 5.3 Wo wir sie schlagen wollen (Zielwerte, messbar)

| Maß | ChatGPT/Claude/Gemini (typisch) | Unser Ziel |
|---|---|---|
| Start bis Eingabe möglich, 3G | 3–6 s | < 1,5 s (defer-Kette 678 ms gemessen) |
| Erstes Wort, Schnellspur | 0,8–2 s | < 1 s (Groq) |
| Sprachwelle: erster Ton | 1–2 s | < 2 s, Barge-in < 300 ms |
| Maus-Aufgabe (Wikipedia-Fakt) | 60–180 s, oft ohne Abschluss | 5/5 unter 120 s |
| Offline | nichts | Landeseite, Verlauf, Puffer, lokales Modell |
| Ehrlichkeit je Antwort | kein Hinweis auf Modell/Ersatz/Kosten | Chip mit Modell, Ersatz, Cent |
| Datenhoheit | US-Cloud, kein BYOK (Gemini/ChatGPT) | eigener Server, BYOK, e2, DSGVO-Knopf |

---

## 6. Umfang und Zeit

- Phasen 0–6 und 8–12 laufen ohne Betreiber, in einer Sitzung, ca. 2–3 Arbeitstage netto inkl. Fehlerschleife.
- Phase 7 braucht eine einmalige Anmeldung, danach ca. 1 Tag.
- Phase 15 Android sofort nach Abschluss; iOS wartet auf Apple.
- Jeder Fund wird sofort behoben und live nachgemessen — es gibt keine „Liste offener Fehler" am Ende, nur „Umgebung blockiert" oder „Betreiber-Handgriff".

---

## 7. Master-Prompt eingearbeitet (Nachtrag 14.09., zweite Nachricht des Betreibers)

Der Master-Prompt (Autonomie-Charta, Ship-Loop, Last- und Performance-Ziele, Schutz-Locks) gilt für die
gesamte Durchführung. Was sich dadurch am Plan ändert:

**Angemeldete Tests brauchen den Betreiber nicht mehr.** Die Portale sind im Browser geöffnet und
eingeloggt (Chrome mit Erweiterung, Play Console, Zeabur, GitHub). Phase 7 läuft über die eingeloggte
Chrome-Sitzung. Ich tippe weiterhin keine Zugangsdaten und rotiere keine Schlüssel (Zugangs-Lock).

**Der Ship-Loop ersetzt Phase 13 wörtlich:** Rollback-Punkt → Umsetzen → Pflicht-Checks (Build, Typecheck,
Lint, Tests, Sicherheit) → Deploy → e2 aktualisieren → live → Live-Klickpfad → Fehler sofort → maximal
5 Runden → Kapsel + Memory_Bank.md + Beleg. Pflicht-Checks je Änderung: `check:guidelines` (800 Zeilen,
Schreibweise smejj.com), bei Frontend `check:frontend`, `check:start-lock`, `check:favicon-lock`; vor
Release `check:all`.

**Die Performance-Budgets sind Abnahmekriterien der Phasen 3, 4, 9 und 14** — gemessen p75/p95, mit
3G-Referenz, bei jedem Live-Gang, als Benchmark in der Kapsel; eine Verschlechterung gegenüber dem letzten
Benchmark ist ein Fehler:

| Budget | Ziel | Werkzeug |
|---|---|---|
| TTFB | < 200 ms (p95) | `measure_web_vitals.mjs` |
| LCP | < 1,5 s (p75) | `measure_web_vitals.mjs` |
| INP | < 200 ms (p75) | `measure_web_vitals.mjs` |
| CLS | < 0,1 | `measure_web_vitals.mjs` |
| API p95 / p99 | < 300 ms / < 800 ms | Live-Proben je Route aus `config.js` |
| Erstes Token | < 1,0 s | `measure_first_token.mjs` |
| Startseite interaktiv, 3G | < 2,0 s | Rundgang mit Netzprofil |
| Startgewicht komprimiert | < 300 KB | `check:startgewicht` |
| 5xx-Rate | < 0,1 % | Netzwerk-Log über die gesamte Matrix |

**Rote Liste, wie sie diese Prüfung berührt:**
- Keine Daten auf e2 löschen oder überschreiben — Tests schreiben nur in eigene Prüf-Präfixe/Prüf-Chats und räumen die nur dort auf.
- Design-Lock: Startseite und Eingabefeld. Design V12 ist seit 13.09. freigegeben und gestempelt. Reine Fehlerbehebung, die V12 unverändert lässt (z. B. verdeckter Knopf, falsche Safe-Area), läuft über die Stempel-Kaskade; jede sichtbare Designänderung wird vorher schriftlich vorgelegt.
- Favicon-Lock: unangetastet.
- Kein Merge nach main, kein Force-Push, keine Branch-Löschung. Arbeit auf `feature/design-start-chat-2026-09-13`; Deploy über Bauzweig und Klon wie bisher.
- Keine neuen Kosten: kein Salad-Start, kein neuer Anbieter. Xcode Cloud nur im kostenlosen Rahmen, und erst nach schriftlichem Ja (neuer Anbieter im Sinne der Charta). Apple 99 USD: Betreiber.
- Kein Rückbau verifizierter Funktionen; keine Modelle entfernen.

**Architektur-Regeln als Prüfpunkte (neu in Phase 8/9):** Control-Server nie im Pfad des normalen Seitenaufrufs (Startseite lädt bei totem `api.smejj.com` lesbar — Graceful Degradation messen), kein Sitzungs-/Zählstand im Serverspeicher (zwei Instanzen sehen dieselben Daten — per Code-Prüfung), Rate-Limit fail-closed an jedem öffentlichen Endpunkt, unveränderliche Asset-Namen mit Cache-Marke, keine externen Fonts/CDNs, kein Render-Blocker.

**Trainingsdaten-Policy:** Capture bleibt aus. Nichts aus dieser Prüfung wird Trainingsmaterial.

**Berichtsregel:** eine Meldung am Ende mit Live-URL, Testergebnis, Screenshot, Kapsel-Pfad, Memory_Bank-Eintrag. Zwischenstände nur bei echten Blockern (Rote Liste, Umgebung tot).
