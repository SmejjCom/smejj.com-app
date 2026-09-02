# smejj.com — Nacht-Autopilot 2026-09-03: Prüfung, Reparatur, Marktstart-Vorbereitung

Du arbeitest ab jetzt vollständig autonom an smejj.com. Der Betreiber (Wof Kadavanich, kein Programmierer, Zeitzone USA/Pazifik) schläft; der Mac bleibt an. Arbeite kontinuierlich, bis die Sitzung endet. Ziel ist nicht „viele Änderungen", sondern: professionell, stabil, einfach, schnell, mobil, sicher, marktreif — in den wichtigsten Abläufen besser als ChatGPT, Gemini, Claude, Kimi, ohne deren Design oder Inhalte zu kopieren.

## 0. Zuerst lesen (5 Minuten, Pflicht)

1. `docs/architecture/UI_UX_PROGRAMM_2026-09-02.md` — Stand aller UI/UX-Punkte 1–15 und des Kompakt-Programms, jede Zeile mit Live-Beweis.
2. `Memory_Bank.md`, Abschnitte ab „2026-09-02" (Nachträge 1–16) — die Fallen, die diese Woche gefunden wurden.
3. `task-capsules/2026/09/job_a_bis_z_20260902/capsule.json` (Feld `nachtragUiUx`) — Commit-Nummern und Zeiten.
4. `PROMPT_A_BIS_Z_LIVE_TEST_2026-09-02.md` — der A-bis-Z-Prüfauftrag mit Anbieter-Landkarte und Design-Prinzip.

## 1. Betreiber-Regeln (gelten immer)

- Jede Antwort beginnt mit EINER fetten Statuszeile: **FERTIG / LAEUFT / FRAGE / PROBLEM — max. 8 Wörter**, danach höchstens 5 kurze Zeilen. Deutsch, große Schrift, kurz.
- Nachts KEINE Rückfragen: entscheiden, dokumentieren, weiterarbeiten. Karten (AskUserQuestion) erst wieder am Morgen im Abschlussbericht.
- Design: viereckig (border-radius 0), wenig Farbe, Ruhe wie ChatGPT, ZCode als Vorbild für den Code-Bereich. Schrift bleibt groß, Touch-Ziele 44 px. „Komplexität im Hintergrund, Einfachheit im Vordergrund."
- Schreibweise immer „smejj.com". Keine Modelle aus dem Menü entfernen. Stand 2026-08-16 ist geschützt.
- Rote Liste (nur mit schriftlicher Freigabe, nachts also gar nicht): Daten/Konten/Backups löschen oder überschreiben, Secrets rotieren oder eintippen, neue Kosten oder Anbieter, Force-Push, Merge nach main, Rückbau fertiger Funktionen, echte Zahlungen.
- Secrets nie im Code, nie im Chat. Training Capture bleibt fail-closed; Fremdmodell-Ausgaben sind für Training gesperrt.

## 2. Werkzeug- und Deploy-Wahrheiten (aus der Praxis dieser Woche)

- **Zwei Zweige ohne gemeinsame Wurzel:** `feature/design-v11` = Arbeitszweig/Frontend, `feature/auth-redesign-github-magiclink` = Bauzweig (Zeabur baut smejj-control NUR daraus). Serverarbeit (src/) gehört in den Bauzweig, sonst nie live.
- **Frontend live** = Repo smejj-app-frontend, Branch main (GitHub Pages), lokaler Klon `~/smejj-app-frontend`, jede Datei doppelt (Wurzel + `assets/`). Weg: Datei aus `public/` kopieren → Commit → Fast-Forward-Push. Danach mit `curl` live beweisen; GitHub Pages kann einen Bau still verwerfen (Statuses-API lesen, Heilung: leerer Commit).
- **Bündel-Abgleich in den Bauzweig** trägt NUR `public/` + Lock-Manifeste, nie `src/` (Regression 156a30a4).
- **Start-Lock** (34 Dateien, u. a. index.html, app.js, start-styles.css, sw.js, browser-pane.js, manifest): jede Änderung braucht einen Stempel, und der Auto-Modus blockiert jeden `--freeze`-Aufruf. Vorgehen: Wirkung zur Laufzeit liefern (eigenes Startmodul mit `<style id>` oder DOM-Text, Haken in `public/chat-actions-menu.js`), das Markup als Kaskade `scripts/einmal/*.sh` plus `.command`-Datei im App-Ordner für den Doppelklick des Betreibers vorbereiten. Dateilisten in Kaskaden vorher mit `ls` prüfen (set -e).
- **PWA/Precache:** Module mit `?v=` und die Startmodule liegen im Service-Worker-Precache. Wiederkehrende Besucher und die iPhone-PWA sehen neue Laufzeitmodule erst nach dem SW-Sprung (CACHE_NAME in sw.js, Start-Lock). Zum Beweis im Chrome immer `fetch(url, {cache:'reload'})`.
- **Chrome-Automat (Erweiterung):** Fenster nicht unter 606 px, Zoom-Tasten gesperrt, `resize_window` ändert innerWidth nicht, ein Prüf-iframe wird vom Klickjacking-Schutz gesprengt, JS-Klicks zählen nicht als Nutzereingabe (nutzerNah). Handy-Maße daher nur aus dem Quelltext rechnen (Fläche bei 375 px: 327 px) — echter Beweis nur per iPhone-Screenshot des Betreibers. Der In-App-Browser ist nicht angemeldet; Anmeldedaten nie eintippen.
- **Chat-Test:** Kurzprompts beantwortet Chrome lokal (Gemini Nano, Konsole „[lokal] geeignet"); Serverweg nur mit „genauer:". Die App sendet `body.task`, die Brücke `messages`.
- **Zeilenregel 800:** chat-store.js steht bei 800, chat-actions.js 799 — nur noch auslagern. `npm run check:guidelines`, `check:modul-syntax`, `check:start-lock` vor jedem Commit. Memory_Bank bei 785/800: früh archivieren (docs/memory/…archiv_runde6).
- **Zeabur:** API-Token abgelaufen (401); Variablen nur per Portal. Z.ai-Paket gilt nur unter `https://api.z.ai/api/coding/paas/v4`. Groq-Gratislimit 8.000 Tokens/min.
- Commit-Fußzeile: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## 3. Stand am 2026-09-03, 23:00 UTC (alles live und bewiesen)

- UI/UX-Programm Nr. 1–15 live: Knopf statt Tipp, 44-px-Ziele, Fehler mit Handlung, Kurzwörter unter den Symbolen (Handy), Datenschutz-Kachel, rechtes Panel nie von selbst (Wurzel: Arbeitsfläche), Deutsch durchgängig, Modell-Chips erklärt, Erste-Schritte-Karten, Rückgängig beim Chat-Löschen, Code-Feld auf der Kante, Verlauf scrollt ans Ende, kein gespeicherter Wartetext, Handy-Werkzeugzeile eine Zeile, PWA-Vollbild-Meta (SW v729 auf beiden Domains).
- Kompakt-Programm Stufe 1+2: Ansichten, Einstellungen, Verlauf, Chat-Feld — Abstände halbiert, Ziele und Schrift unverändert.
- Fragen-Erfassung fürs Training end-zu-end live (Einwilligung → capture 201), Trainingsplan smejj 1.1 freigegeben (Qwen3-4B-Basis, 10 USD/Monat, Salad hinter Budget-Gate; unter 3.000 Paaren kein Lauf).
- Letzte Commits: design-v11 f3bb510b, Klon b58dba8, Bauzweig 4dcf9b00.

## 4. Offen — Prioritäten dieser Nacht (in dieser Reihenfolge)

1. **Inventar** aller Funktionen (öffentliche Seiten, App-Ansichten, KI-Funktionen, Browser, Voice, Admin, Autopiloten, Abo) als `docs/architecture/INVENTAR_2026-09-03.md`. Erst danach große Änderungen.
2. **P0/P1 finden** und mit Live-Beweis markieren. Bekannte Kandidaten: Antworten, die nie ankamen (zwei Betreiber-Chats endeten mit „smejj denkt nach…" — Ursache in der Brücke/Router prüfen: 429/503, Schnellspur, `/api/fehler`); Chat-Verlauf nach Wiederherstellung; Stopp nach 5+ s; Verbindung unterbrochen.
3. **Voice (höchste Priorität):** Ablauf Mikrofon starten → sprechen → stoppen/pausieren → verarbeiten → antworten → fortsetzen als eindeutige Zustandsmaschine IDLE → LISTENING → PROCESSING → RESPONDING → IDLE mit Pause/Stop/Cancel/Retry/Error; UI zeigt immer, was gerade passiert. Fallen aus der Memory_Bank: iOS hat nie RecognitionCtor (Ohr-Solo zuerst), ctx.resume gegen suspended, zwei Stromfamilien beim Stopp. Tests automatisiert + im Chrome.
4. **Mobile:** alle Ansichten bei 375/390/430 px aus dem Quelltext rechnen (keine Überbreite, keine Ziele unter 44 px, keine Überlappung, safe-area oben/unten); Landscape; Tastatur (`interactive-widget=resizes-content` ist gesetzt).
5. **Registrierung/Onboarding/Profil:** neuer Nutzer in unter 60 s zum ersten Erfolg; Fehlermeldungen in Klartext; Login-Ziel Chat; Profil/Konto/Sicherheit/Abo/Rechnungen auffindbar in zwei Klicks.
6. **Startseite:** jedes Symbol sichtbar, verständlich, klickbar, mit Ladezustand und Fehlerrückmeldung; keine Blindgänger; Chip-Zeile am Handy (nur 2 von 8 Chips sichtbar? prüfen).
7. **Browser/Maus:** Laden, Links, Scrollen, Formulare, Tabs, Zurück/Vorwärts, Fehlerseiten; Agent-Aktionen mit Schutzlogik bei Zahlungen/Verträgen/Löschungen.
8. **Chat/KI:** Streaming, Stopp/Weiter/Neu, Fehlerpfade, Modellwechsel, Bild/Video/Websuche, Anhänge.
9. **Admin + 62 Autopiloten:** Übersicht, Überschneidungen, Lücken, Endlosschleifen, Kosten; Ampeln ehrlich.
10. **Sicherheit/Performance:** Auth, Sessions, Rate-Limits, XSS/CSRF, Secrets; Startseite < 300 KB, LCP < 1,5 s; mobile Netze.
11. **Rest-Punkte:** Nr. 10 auch für Schlüssel und Projekte (Rückgängig statt Dialog); „Erneut senden"-Knopf für eine unbeantwortete letzte Frage; Kompakt Stufe 3 (Konto, Anmeldung); Modell-Katalog-Wache.
12. **Marktreife-Checkliste** (Produkt, Mobile, Business, Performance, Sicherheit, Betrieb) mit Status je Punkt.

## 5. Arbeitsweise und Definition of Done

Finde → Verstehe → Plane → Sichere (git status, Commit) → Ändere → Teste (Unit, Browser) → Verifiziere live → Dokumentiere. Nichts gilt als fertig ohne Live-Beweis in der Zielumgebung. Nach jeder Reparatur: reproduzieren, Ursache, Lösung, Tests, Regression (`npm run check:all` oder mindestens check:guidelines, check:modul-syntax, betroffene tests/*.mjs), Doku. Nachträge in: UI_UX_PROGRAMM (oder neue Doku je Thema), Capsule `nachtragUiUx`, Memory_Bank (Kernlehre, kurz).

## 6. Abschlussbericht am Morgen

`docs/architecture/NACHTBERICHT_2026-09-04.md` und als Kopierseite: je Punkt PROBLEM / URSACHE / LÖSUNG / TEST / STATUS (bestanden, teilweise, fehlgeschlagen) / OFFEN. Dazu: was auf einen Betreiber-Klick wartet (Kaskaden mit `.command`-Datei), was einen iPhone-Screenshot braucht, welche Kosten entstanden sind (Ziel: keine neuen). Erste Zeile des Berichts ist die Statuszeile.
