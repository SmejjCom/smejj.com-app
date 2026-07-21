# smejj.com — Vollständiger E2E-Testbericht & Verbesserungsplan (2026-07-21)

Getestet live auf https://smejj.com (eingeloggt als Alan Best) über den echten Chrome-Browser, plus vollständige Code-Prüfung im Repo („smejj.com App"-Ordner). Gemäß Change-Lock wurden **keinerlei Änderungen, Deployments oder kostenpflichtige Aktionen** durchgeführt — nur Analyse, Tests und dieser Bericht.

---

## 0. Ergebnis zuerst (Kurzfassung)

smejj.com hat ein solides Fundament (Streaming-Chat funktioniert, saubere Locks, fail-closed Kostenpolitik, Jobs-/Diff-Backend existiert). Aber **vier Ketten sind live gebrochen**, und genau sie erklären deine Beobachtungen:

1. **Es gibt keinen Chat-Verlauf.** Die Verlauf-Ansicht ist ein leerer Platzhalter, Unterhaltungen werden nirgends gespeichert. Jeder Reload, jeder Klick auf das Logo löscht alles ohne Warnung.
2. **Browser-Befehle im Chat erreichen nie das Modell.** Sie werden in ein Automatisierungs-Formular umgeleitet, dessen Anmeldung live mit `session_handoff_not_found` scheitert (Ursache im Code nachgewiesen: In-Memory-Speicher + 2 Server-Replicas).
3. **Der interaktive Remote-Browser ist live tot.** Der Salad-Container lädt seinen Code von einem falschen Pfad (`/assets/…` existiert nicht) und liefert stattdessen die Startseite aus. Klicken/Tippen auf Amazon/Google & Co. ist damit unmöglich.
4. **Die Modell-Auswahl ist wirkungslos.** GLM-5.2, Kimi K2.7 und smejj 1.0 landen alle beim selben fest konfigurierten Modell (Bridge ignoriert die Auswahl; Multi-Model-Router ist ausgeschaltet). Gemessene Antwortzeit: ~4,1–4,5 s selbst für „Sag nur: OK" — Ziel laut deinem eigenen Velocity-v4-Konzept: unter 0,8 s.

Alle vier sind ohne Neubau reparierbar. Der Umsetzungsplan steht in Abschnitt 7 — **ich warte auf deine schriftliche Freigabe, bevor irgendetwas geändert wird.**

> Hinweis nebenbei: Die Geräte-Anmeldung der Claude-Desktop-App auf deinem Mac ist abgelaufen („session_stale_relogin", Banner in der App). Bitte einmal neu anmelden — steht auch als offener Punkt in deiner Memory Bank.

---

## 1. Testumfang und Methodik

**Gelesen (verbindliche Reihenfolge eingehalten):** AGENTS.md, Project_Goals.md, Memory_Bank.md (inkl. Einträge bis 21.07.), AI_Guidelines.md, README, VELOCITY_V4_STATUS, MARKTSTART-Berichte, CODEX_PARITAETSMATRIX, REMOTE_BROWSER_INTERAKTIV, MAUS-/Agent-Plattform-Dokumente. Change-Lock, Start-Design-Lock und Favicon-Lock wurden respektiert — nichts wurde verändert.

**Live getestet im echten Chrome:** Startseite, Chat-Senden (3 Nachrichten mit Latenzmessung, Kosten minimal gehalten), Menü/Sidebar, alle erreichbaren Views (Verlauf, Suche, Coding, Projekte, Dateien, Einstellungen, Automatisierung, Programmieren/Code, System/Status), Browser-Panel (Tabs, URL-Feld, Navigation, Tab-Wiederherstellung), Modell-Menü, Plus-Menü, Reload-Persistenz, Backend-Endpunkte (nur Read-only-GETs bzw. der normale Chat-Pfad).

**Code geprüft:** `public/` (Frontend inkl. app.js, autonomous-intent.js, autonomous-coding.js, browser-pane*.js, chat-bridge.js, remote-browser-bridge.js, remote-browser-worker.js, remote-browser-bootstrap.sh, config.js, ai/chatClient.js), `control-server/src` (sessionHandoff.js, sessionStore.js, jobStore.js, Routen), `src/server.js`, `workers/` (remote-browser, maus-engine, smejj-worker).

**Nicht ausgeführt (bewusst):** Job-Starts/Worker-Starts (kostenberührend, zudem durch Befund K2 blockiert), Datei-Upload-Roundtrip, Mikrofon/Voice (löst Berechtigungsdialoge aus), Login-/Logout-Aktionen, jegliche Schreibzugriffe. Chrome verweigerte den Fenster-Resize (Vollbild), daher Mobile-Layout nur per Code/Doku bewertet — echter Mobile-Test bleibt offen.

---

## 2. Befunde KRITISCH (verhindern autonome Aufgaben oder zerstören Daten)

### K1 — Chat-Verlauf existiert nicht (Platzhalter-View, keinerlei Persistenz)

- **Reproduktion:** (a) Nachricht senden, Antwort erhalten → Seite neu laden → Unterhaltung komplett weg. (b) Menü → „Verlauf" → nur der Text „Verlauf bereit.", keine Liste, kein Umbenennen/Löschen/Wiederöffnen.
- **Soll:** Wie Codex/ChatGPT: Chats werden automatisch gespeichert, benannt, sind nach Reload und Gerätewechsel wieder da, lassen sich umbenennen/löschen/fortsetzen.
- **Ist:** Unterhaltung lebt nur im DOM. Beweise: `localStorage` enthält keine Chat-Keys, IndexedDB nur `smejj-local-workspace`; Verlauf-View ist statisches HTML.
- **Ursache (Code):** `public/index.html` Z. 248–253 — die Sektion `#chatHistory` enthält nur `<div class="output">Verlauf bereit.</div>`. In `app.js` `boot()` existiert **kein** `bindChatHistory()`. Das „Gesprächsgedächtnis" (V80, `chat-history-context.js`) sammelt den Verlauf nur aus dem DOM der laufenden Seite für den Modell-Kontext — es speichert nichts. `STORAGE_KEYS.drafts` ist definiert, wird aber 0-mal verwendet (auch Entwürfe gehen verloren).
- **Betroffen:** `public/index.html`, `public/app.js`, `public/chat-history-context.js` (neu: z. B. `public/chat-store.js`, `public/chat-history-view.js`).
- **Empfohlene Lösung:** Clientseitiger Chat-Store (IndexedDB, Free-only-konform, kein Server nötig): jede Unterhaltung mit ID, Titel (aus erster Nachricht), Zeitstempel, Nachrichtenliste; automatisches Speichern bei jedem Ein-/Ausgang; Verlauf-View mit Liste, Öffnen, Umbenennen, Löschen; „Neu" beginnt eine neue Unterhaltung statt nur die View zu wechseln; Wiederherstellen nach Reload. Später optional Server-Sync über IDrive-e2-Presigned-URLs (Konzept liegt in `docs/` bereits vor).
- **Risiko:** gering (rein additiv; Verlauf-View ist nicht Teil des Start-Design-Locks — Lock-Manifest vor Umsetzung gegenprüfen). **Aufwand:** 1–2 Tage. **Test:** Senden → Reload → Verlauf da; Umbenennen/Löschen; 2 parallele Chats. **Rollback:** neue Dateien entfernen, index.html-Abschnitt zurücksetzen (Git-Commit-Punkt davor).

### K2 — Autonome Aufträge aus dem Chat enden in einer Sackgasse (Handoff-404)

- **Reproduktion:** Im Chat „Gehe in den Browser und prüfe die Webseite https://example.com" senden → App springt in „Automatisierung", füllt das Formular, meldet „Anmeldung erforderlich" → Klick „Anmelden" → Fehlertext **`session_handoff_not_found`**. Kein Modell-Aufruf, keine Ausführung, kein verständlicher Fehler.
- **Soll:** Ein eingeloggter Nutzer gibt einen Auftrag; die Plattform plant und führt aus (Codex-Verhalten), höchstens EINE Bestätigung.
- **Ist (live belegt):** `GET https://redbean…/api/auth/session-handoff/{id}` → **404**. Die Nachricht erreicht nie ein Modell (Netzwerk-Log leer bis auf den Handoff-Call).
- **Ursachen (Code + Infrastruktur):**
  1. `public/autonomous-intent.js` fängt jede Nachricht mit Ausführungs-Verb + Ziel („prüfe" + „Webseite/Browser") ab und leitet in das Formular um — gewollt, aber ohne funktionierenden Anschluss.
  2. `control-server/src/auth/sessionHandoff.js` ist ein **In-Memory-Store** (Map, TTL 2 min). Laut Memory Bank läuft `smejj-control` seit 17.07. mit **2 Replicas**. Create landet auf Replica A, Complete/Consume auf Replica B → 404. Dieselbe Architektur-Falle betrifft `agent/api/sessionStore.js` (Agent-Sessions), `jobs/jobStore.js` (SSE-Events/Queue-Zustand) und die Rate-Limiter — alles In-Memory pro Prozess.
  3. Zwei getrennte Token-Welten: Google-Login der App (localStorage-JWTs) vs. `sessionStorage smejj.apiToken.v1` für Jobs — der Nutzer ist „eingeloggt und trotzdem nicht angemeldet".
- **Betroffen:** `control-server/src/auth/sessionHandoff.js`, `agent/api/sessionStore.js`, `control-server/src/jobs/jobStore.js`, Salad-Konfiguration `smejj-control` (Replicas), `public/autonomous-coding.js` (Fehlertexte/UX).
- **Empfohlene Lösung (gestuft):** Sofort: Replicas 2→1 (der „Hochverfügbarkeits"-Gewinn ist derzeit ohnehin negativ, weil er alle Session-Flows bricht). Danach sauber: Handoff/Sessions/Job-Events replikafest machen (IDrive-e2-Objekte oder signierte, zustandsfreie Tokens statt Server-Map — passt zur „stateless"-Architekturvorgabe). Zusätzlich: vorhandenen App-Login direkt für die Jobs-API akzeptieren (eine Token-Welt), Fehlertexte in verständliches Deutsch.
- **Risiko:** Replica-Änderung gering (Konfig, sofort rückstellbar); Token-Vereinheitlichung mittel (Auth-Pfade testen). **Aufwand:** Stufe 1 Minuten, Stufe 2 1–3 Tage. **Test:** Anmelden-Klick → Token da; Job anlegen (Analyse-Modus) → Queue zeigt Job; SSE-Events kommen. **Rollback:** Replicas zurück; Code-Revert per Git.

### K3 — Interaktiver Remote-Browser live tot (falscher Bootstrap-Pfad, Container liefert Startseite)

- **Reproduktion:** `https://loganberry…salad.cloud/health` liefert die **smejj.com-Startseite (HTML)** statt Bridge-JSON; `POST /api/browser/session` und `GET /api/browser/remote` scheitern („Failed to fetch"). Im Produkt: Amazon/Google & Co. im smejj-Browser → nur Standbild-/„Extern öffnen"-Fallback; Klicken/Tippen unmöglich.
- **Soll:** Laut `docs/architecture/REMOTE_BROWSER_INTERAKTIV.md` (Phase 1–4, Code + 60 Tests fertig): Session öffnen, klicken, tippen, scrollen wie in Chrome.
- **Ursache (Code, nachweisbar):** `public/remote-browser-bootstrap.sh` — das Startskript des Salad-Containers — lädt den Worker mit
  `curl -fsSL https://smejj.com/assets/remote-browser-worker.js` .
  **Der Pfad `/assets/` existiert nicht** (die Datei liegt live unter `/remote-browser-worker.js`; ein `assets/`-Ordner ist in `public/` nicht vorhanden). `curl -f` + `set -eu` → Bootstrap bricht ab, der Worker startet nie. Zusätzlich läuft auf loganberry offenbar ein statischer Server mit dem Frontend (falsches Image/Command) statt `remote-browser-bridge.js` (deren `/health` müsste `BRIDGE_VERSION "live-browser-2026-07-15-1"` als JSON liefern). Außerdem lädt dieses Bootstrap nur den alten **Render-once-Worker** (nur `/render`) — die Session-Engine (`workers/remote-browser/session-engine.js`) wäre selbst bei korrektem Pfad nicht an Bord; laut Doku gehört auf loganberry das GHCR-Image mit Playwright + Session-Engine.
- **Betroffen:** `public/remote-browser-bootstrap.sh`, Salad-Gruppen `smejj-remote-browser-bridge-live` + `smejj-remote-browser-live` (Image/Command/ENV), `workers/remote-browser/*`.
- **Empfohlene Lösung:** (1) Bootstrap-URL korrigieren (eine Zeile) **oder** sauber auf das vorgesehene GHCR-Image (Dockerfile mit session-engine) zurückgehen — das ist der dokumentierte Livegang-Schritt A/B vom 15.07., der nie vollständig ausgeführt wurde. (2) Danach Bridge-`/health` (JSON + Version) als Deploy-Erfolgskriterium prüfen. (3) `/health`-Check in die Release-Pipeline aufnehmen, damit „Container liefert HTML statt API" nie wieder unbemerkt bleibt.
- **Risiko:** gering–mittel (reines Wiederherstellen des dokumentierten Zustands; Fallback-Kette bleibt). **Aufwand:** Stunden (Docker-Build am Mac + 2 Container-Restarts). **Kosten:** nur Neustart bestehender pay-per-use-Dienste — trotzdem Freigabe nötig. **Test:** `/health` = JSON; example.com-Session öffnen, Link klicken; amazon.de tippen/suchen (E2E-Plan aus der Architektur-Doku). **Rollback:** vorheriges Image/ENV zurücksetzen (dokumentierter Stand).

### K4 — Modell-Auswahl ist ein Placebo (Bridge ignoriert das gewählte Modell)

- **Reproduktion:** Modell „GLM-5.2" wählen → „Sag nur: OK" → 4,13 s; Modell „smejj 1.0" → 4,52 s. Identisches Backend-Verhalten, keinerlei Unterschied.
- **Soll:** Die Auswahl (smejj 1.0 / GLM-5.2 / Kimi K2.7 / Cline) bestimmt das tatsächlich antwortende Modell — oder die UI sagt ehrlich, was läuft.
- **Ursache (Code):** `public/chat-bridge.js` (läuft als Chat-Bridge auf starfruit): `streamModel()` sendet **immer** `model: LLM_MODEL` (ENV-Konstante) an den LLM-Endpunkt; das vom Nutzer gewählte Modell wird nur als Antwort-Header `x-smejj-requested-model` gespiegelt, `x-smejj-model-id` ist hart auf `"glm-5-2"` gesetzt, Kimi-Auswahl setzt lediglich `x-smejj-model-fallback:true`. Der Multi-Model-Router (`streamViaControl`) ist per `SMEJJ_MULTI_MODEL_ROUTER_ENABLED=NO` deaktiviert (deckt sich mit VELOCITY_V4-Statusbericht). Client-seitig greifen nur BYOK/Local-Browser-Modi (`ai/chatClient.js`), nicht die Standard-Modelle.
- **Betroffen:** `public/chat-bridge.js`, ENV der Bridge/Control (`SMEJJ_MULTI_MODEL_ROUTER_ENABLED`, Provider-Keys), `control-server/src/llm/modelRouter.js` (fertig, ungenutzt), `public/cline-model-menu.js`.
- **Empfohlene Lösung:** Router aktivieren und `requestedModel` bis zum Router durchreichen (Code dafür existiert bereits); bis dahin in der UI ehrlich kennzeichnen („aktuell antwortet: GLM-5.2"), statt eine Wahl vorzutäuschen. Vollausbau = Velocity-v4 Phase 1 (Groq Instant Lane) — **braucht deine Budget-Freigabe mit Dienst + Betrag** (liegt als fertiges Paket im VELOCITY_V4-Dokument).
- **Risiko:** Kennzeichnung minimal; Router-Aktivierung mittel (Budget-Gate ist fail-closed). **Aufwand:** Kennzeichnung < 1 h; Router-Livegang ~1 Tag inkl. Messung. **Test:** Header `x-smejj-model-backend`/`-id` pro Auswahl verschieden; TTFT-Vorher/Nachher. **Rollback:** ENV zurück, Header-Vergleich.

### K5 — Stiller Totalverlust beim Senden (einmal reproduziert, instrumentiert belegt)

- **Beobachtung:** Beim ersten Senden des Browser-Befehls navigierte die Seite hart auf „/" (instrumentiert: frischer JS-Kontext, `navigation.type=navigate`, kein API-Request) — Nachricht, Antwort-Thread und offenes Browser-Panel waren ersatzlos weg, ohne Fehlermeldung. Ein zweiter, identischer Durchlauf verhielt sich korrekt (Intent-Umleitung nach K2). 
- **Einordnung:** Nicht deterministisch; wahrscheinlichster Auslöser ist ein Klick, der nach der Panel-Layout-Verschiebung den **Logo-Link** traf — `<a href="/">` ist ein echter Link, der die SPA komplett neu lädt. Unabhängig vom Auslöser gilt: **Weil es K1 (keine Persistenz) gibt, führt jede versehentliche Navigation zum Totalverlust.** Es gibt keinen `beforeunload`-Schutz und keine Wiederherstellung.
- **Empfohlene Lösung:** (1) K1 umsetzen (Persistenz macht den Fehler harmlos). (2) Logo-Link per SPA-Routing abfangen (wie `profile-dock-menu.js` `goTo()` es bereits vormacht). (3) `beforeunload`-Warnung bei nicht gespeicherter Unterhaltung/laufender Aufgabe.
- **Betroffen:** `public/index.html` (Logo-Link), `public/app.js`. **Risiko:** gering. **Aufwand:** Stunden. **Test:** Logo-Klick während laufender Antwort → Nachfrage/kein Verlust. **Rollback:** trivial (Git).

---

## 3. Befunde HOCH (unzuverlässig, langsam oder irreführend)

### H1 — Erste Antwort dauert ~4,1–4,5 s selbst bei Trivialfragen
Messwerte (DOM-basiert, echte Nutzersicht): „Sag nur: OK" → 4 523 ms (smejj 1.0), 4 134 ms (GLM-5.2); Begrüßungssatz → < 5 s. Die Streaming-Kette selbst ist korrekt (SSE Ende-zu-Ende, Client rendert inkrementell) — die Zeit entsteht im Modell-Backend (ein festes Modell, Reasoning-Anlaufzeit, Router aus). Genau das beschreibt dein VELOCITY_V4-Dokument; die Lösung (Groq Instant Lane + Router + Reasoning-Gate) liegt fertig spezifiziert vor und wartet auf Budget-Freigabe. Ziel: TTFT < 0,8 s für Chat/einfache Fragen, GLM bleibt Deep Lane.

### H2 — Keine sichtbare Denk-/Ladeanzeige im Thread
Nach dem Senden passiert im Thread ~4,5 s lang sichtbar nichts (nur eine Mini-Indikator-Klasse am Rand). Codex/ChatGPT zeigen sofort eine Antwortblase mit Aktivitätsanzeige. Lösung: leere Assistenten-Blase sofort mit animiertem Indikator + Statustext („denkt nach…", „durchsucht das Web…") rendern; bei `x-smejj-*`-Headern zusätzlich das tatsächliche Backend anzeigen. Betroffen: `public/app.js` (`submitTask`/`addEntry`), CSS. Achtung: Composer/Startseite stehen unter Design-Lock → Freigabe-Wortlaut nötig, Umsetzung additiv im Thread-Bereich. Aufwand: Stunden.

### H3 — „Anmeldung erforderlich" trotz bestehendem Login + rohe Fehlercodes
Doppelte Token-Welten (K2.3) und Fehlertexte wie `session_handoff_not_found` / „Model backend is not configured" direkt im UI. Lösung: eine Session-Quelle, deutsche Klartext-Fehler mit nächstem Schritt („Anmeldung abgelaufen — neu anmelden", Button). Betroffen: `autonomous-coding.js`, Auth-Routen. Aufwand: mit K2 zusammen.

### H4 — Statusanzeigen widersprechen dem echten Zustand
`/status` zeigt „AI Mode: disabled" (während der Chat nachweislich antwortet) und „IDrive e2: presigned-sync-not-configured" (während `GET /api/storage/status` live `configured:true, bucket smejj-app` liefert). Nutzer und Agenten können dem Status nicht trauen. Lösung: Status-View auf dieselben Live-Endpunkte umstellen und Cache invalidieren. Betroffen: `public/app.js` (bindTools/refresh…), Status-Renderer. Aufwand: Stunden.

### H5 — Suche verspricht, was es nicht gibt
Globale Suche wirbt mit „Chats, Projekte, Dateien, Code, Quellen und **Verlauf**" — ohne Chat-Persistenz (K1) ist die Verlaufs-Suche leer. Nach K1-Umsetzung: Chat-Store als Suchquelle anbinden (`public/search.js`). Aufwand: mit K1.

### H6 — Automatisierung verlangt ein GitHub-Repository für simple Webseiten-Prüfungen
Das Formular (Default `SmejjCom/smejj-control`, Basis-Branch, Diff-Modus) passt für Code-Aufträge, aber „prüfe diese Webseite" braucht kein Repo. Folge: Übersprezifikation, Abbruch, Verwirrung. Lösung: Auftragstyp „Webseiten-Analyse" ohne Repo-Pflicht (Maus-Engine-/Browser-Worker-Pfad), Formular nur mit relevanten Feldern. Betroffen: `autonomous-coding.js`, `jobRoutes`. Aufwand: 1 Tag.

---

## 4. Befunde MITTEL (Bedienung, Konsistenz, Statusführung)

- **M1 — „Coding"-Menüpunkt führt auf eine Fast-Leer-View** (`smejjClaw`: zwei Buttons + „Coding bereit."), während die eigentliche Programmieren-View (`/code`: Dateibaum, Editor, Lesen/Speichern/Download) **nicht im Menü verlinkt ist**. Menü neu zuordnen oder Views zusammenführen. (`public/index.html`, Navigation)
- **M2 — Falsch verdrahteter Panel-Button:** Im Browser-Panel heißt der Button „GitHub", springt aber auf `data-jump="settings"` → Einstellungen (`index.html` Z. 109). Beschriftung oder Ziel korrigieren.
- **M3 — Menüs schließen einander nicht:** Modell-Menü und Plus-Menü können gleichzeitig offen stehen (Screenshot-Beleg). Kleiner Fokus-/Toggle-Fix in `cline-model-menu.js`/`composer-tools.js`.
- **M4 — „Neu" beginnt keinen neuen Chat**, sondern wechselt nur zur Start-View mit altem Thread. Nach K1: echtes „Neuer Chat" (alter Chat wird archiviert). 
- **M5 — Navigation inkonsistent:** 16 Routen (`/websites`, `/memory`, `/ai`, `/cost`, `/storage` …), aber nur 6 Menüpunkte; manche Views nur über Panel-Buttons oder direkte URL erreichbar. Informationsarchitektur einmal aufräumen.
- **M6 — Beobachtbarkeit:** Salad-Antworten ohne `Timing-Allow-Origin` → Browser kann Latenzphasen nicht auflösen; die vorhandenen `x-smejj-*`-Header werden im UI nirgends angezeigt. Für „blitzschnell belegbar" (Velocity Phase 0) TAO-Header + kleines Latenz-Badge ergänzen.
- **M7 — Mobile-Verifikation offen:** CSS-Breakpoints (560/680/920) und PWA sind vorhanden (frühere Tests grün), aber ein echter Touch-/Mobile-Durchlauf konnte in dieser Session nicht erzwungen werden (Chrome-Vollbild verweigert Resize). Als eigener Testpunkt einplanen.

---

## 5. Befunde NIEDRIG (Komfort)

- **N1** Sprachmix in Fehlertexten (EN/DE) und Technik-Codes im UI vereinheitlichen.
- **N2** Chat-Bubbles ohne Zeitstempel/Titel; nach K1 Titel automatisch erzeugen.
- **N3** `STORAGE_KEYS.drafts` ist toter Code — entweder Composer-Entwürfe implementieren (Text übersteht Reload) oder Key entfernen.
- **N4** Browser-Panel: Tab-Restaurierung stellt auch tote Login-Tabs (accounts.google.com) wieder her, die im Panel nie funktionieren können — beim Restore filtern.

---

## 6. Geschwindigkeitsanalyse (Messwerte dieser Session)

| Messpunkt | Wert | Zuordnung |
|---|---|---|
| TTFB Startseite (GitHub Pages) | 233 ms | Netz/Hosting — gut |
| DOMContentLoaded / Load | 2,69 s / 3,11 s (83 Requests) | Frontend (App-Shell-Größe; SW-Precache hilft ab 2. Besuch) |
| Zeit bis erster sichtbarer Reaktion nach Senden | ~4,5 s (keine Zwischenanzeige) | Frontend-UX (H2) + Modell (H1) |
| TTFT Chat „smejj 1.0" | **4 523 ms** | Modell/Bridge (Router aus, festes Modell) |
| TTFT Chat „GLM-5.2" | **4 134 ms** | identisch — Beleg für K4 |
| `/api/health` (Control, kalt) | 888 ms | Netzwerk-RTT + Server |
| `/api/models/status` | 969 ms | Control-Server |
| `/api/storage/status` | 621 ms | Control-Server |
| `/api/auth/me` | 710 ms | Control-Server |
| `/api/jobs` (unauth, 401) | 287 ms | reine RTT-Referenz (~250–300 ms Grundlatenz zum Salad-Standort) |
| `/api/browser/fetch` (Seiten-Proxy, example.com) | 893 ms | Browser-Panel-Ladepfad |
| Browser-Panel iframe-Anzeige example.com | < 2 s sichtbar | ok |
| Remote-Browser-Session / Screenshot-Latenz | **nicht messbar — Dienst tot (K3)** | Infrastruktur |
| Worker-Kaltstart / Agentenschritt-Latenz | nicht messbar (Jobs blockiert durch K2; Start wäre kostenberührend) | offen |

**Klartext:** Das Frontend und das Streaming sind nicht das Problem; GitHub Pages liefert schnell. Die 4–5 Sekunden entstehen serverseitig im Modellpfad, plus ~0,25–0,3 s Grundlatenz pro API-Call zum Salad-Standort. Die größten Hebel, in Reihenfolge des Nutzens: (1) Instant-Lane + Router (fertig vorbereitet, nur Konfig + Budget), (2) sofortige Statusanzeige (H2 — gefühlte Geschwindigkeit), (3) Reasoning-Gate für einfache Fragen, (4) Session-Wiederverwendung/Vorwärmen des Browser-Workers nach K3-Fix, (5) TAO-Header für belastbare Dauer-Messung. Kein Frontend-Umbau nötig — deckungsgleich mit deinem Velocity-v4-Befund.

---

## 7. Vergleich mit OpenAI Codex (Funktionslogik, keine Optik-Kopie)

| Fähigkeit | OpenAI Codex (Verhalten) | smejj.com heute (belegt) | Lücke → eigene Umsetzung |
|---|---|---|---|
| Auftrag → Planung → Ausführung | Ein Auftrag genügt; Plan + Schritte sichtbar | Chat antwortet nur; autonome Aufträge enden im Formular + Handoff-404 (K2) | Intent → direkt Job mit bestehender Session; Plan als erste Streaming-Ausgabe |
| Chat-/Task-Historie | Immer da, benennbar, fortsetzbar | Nicht vorhanden (K1) | IndexedDB-Store + Verlauf-View (Welle 1) |
| Fortschrittsanzeige | Live-Schritte, Logs, Status | Job-SSE existiert im Backend; UI erreicht ihn nicht; Chat ohne Denk-Anzeige (H2) | SSE an Thread koppeln; Schrittliste im Thread |
| Browsersteuerung | Klicken/Tippen/Screenshots zuverlässig | Architektur fertig (Session-Engine, 60 Tests), live tot (K3) | Deploy reparieren + `/health`-Gate in Pipeline |
| Codeänderungen + Diff + Freigabe | Diff, Review, Apply | Backend LIVE (SHA-gebundene Approvals, Replay, Cancel — Paritätsmatrix P1) | UI-Kette entstören (K2), sonst vorhanden — Vorsprung nutzbar |
| Modellwahl | Wirksam, transparent | Placebo (K4) | Router aktivieren, ehrliche Kennzeichnung |
| Fehlerbehandlung | Klartext + nächster Schritt | Rohe Codes (H3), stille Resets (K5) | Fehlertext-Standard + beforeunload + Persistenz |
| Abbruch/Fortsetzung | Stop/Resume pro Task | Backend: Cancel LIVE; UI nur im Automation-Formular | Stop/Weiter-Knopf im Thread |
| Kontextspeicherung | Projekt-/Sessionkontext | DOM-basiertes Kurzzeitgedächtnis (12 Nachrichten), Reload = Amnesie | Chat-Store als Kontextquelle |
| Bestätigung kritischer Aktionen | Vor Schreib-/teuren Aktionen | Vorbildlich (fail-closed, Budget-Gates) — **Stärke von smejj.com** | beibehalten |

Rechtlich sauber: Alles oben ist Verhaltens-Parität mit eigener Architektur (Task Capsules, IDrive e2, fail-closed) — keine Übernahme von Codex-Design oder -Code.

---

## 8. Umsetzungsplan (wartet auf deine schriftliche Freigabe)

**Vor jeder Welle:** Rollback-Punkt (`backups/` + Git-Referenz), danach `npm run check:all` + `check:guidelines` + Lock-Checks; Staging vor Prod gemäß DEPLOYMENT_PLAN; nach jeder Welle Live-Verifikation im Browser + Eintrag in Task Capsule/Memory Bank (nur Verifiziertes).

- **Welle 0 — Reparatur des Bestands (kein neues Feature, keine Lock-Dateien):**
  1. K3: Bootstrap-Pfad korrigieren bzw. dokumentiertes Worker-Image deployen; `/health`-JSON als Erfolgskriterium. *(Container-Restart = bestehende pay-per-use-Dienste; keine neuen Kosten. Freigabe nötig.)*
  2. K2 Stufe 1: `smejj-control` Replicas 2→1. *(Konfig, sofort rückstellbar.)*
  3. K4 minimal: ehrliche Modell-Kennzeichnung im UI; H3-Fehlertexte.
- **Welle 1 — Chat-Verlauf (K1, K5, M4, H5, N2/N3):** IndexedDB-Chat-Store, Verlauf-View mit Liste/Umbenennen/Löschen/Fortsetzen, „Neu"-Semantik, Logo-Link SPA-sicher, beforeunload-Schutz, Suche angebunden. *(0 €, rein Frontend, additiv.)*
- **Welle 2 — Tempo (H1, H2, M6):** Router + Groq Instant Lane aktivieren *(braucht von dir: Budget-Betrag + Groq-Key, wie im Velocity-Dok beschrieben — z. B. „10 USD/Monat für Groq freigegeben")*, Denk-Anzeige im Thread, TAO-Header, TTFT-Vorher/Nachher-Messung als Beleg.
- **Welle 3 — Autonome Kette (K2 Stufe 2, H6, M1/M2/M5):** Eine Token-Welt, replikafeste Session-/Handoff-Speicherung, Automation ohne Repo-Zwang für Web-Analysen, SSE-Fortschritt im Thread, Navigation aufgeräumt. Abschluss: kompletter E2E-Beweislauf („Öffne Webseite → prüfe → Fehler finden → Code ändern → im Browser verifizieren") mit Screenshots in der Task Capsule.

**Ausdrücklich NICHT ohne separate Freigabe:** Deployments, Salad-/ENV-Änderungen, Budget-/Key-Einrichtung, Änderungen an Start-Design-/Favicon-Lock-Dateien, Löschungen.

---

## 9. Testfall-Übersicht (Ist-Stand dieser Session)

| # | Element/Funktion | Soll | Ist | Ergebnis |
|---|---|---|---|---|
| T01 | Startseite laden | < 3 s, fehlerfrei | TTFB 233 ms, Load 3,1 s, keine Konsolenfehler | OK (Shell-Größe optimierbar) |
| T02 | Menü öffnen/schließen | Drawer mit allen Bereichen | Neu, Suche, Coding, Projekte, Dateien, Verlauf + Profil-Dock | OK |
| T03 | Chat senden (Text) | Antwort streamt | Antwort korrekt, aber TTFT ~4,5 s, keine Denk-Anzeige | TEILWEISE (H1/H2) |
| T04 | Chat-Verlauf nach Reload | bleibt erhalten | komplett verloren | **FEHLER (K1)** |
| T05 | Verlauf-View | Liste, Umbenennen, Löschen | Platzhalter „Verlauf bereit." | **FEHLER (K1)** |
| T06 | Neuer Chat | alter Chat archiviert | nur View-Wechsel, kein neuer Chat | FEHLER (M4) |
| T07 | Modell wechseln | anderes Modell antwortet | Auswahl wirkungslos (Header/Latenz identisch) | **FEHLER (K4)** |
| T08 | Browser-Panel öffnen | Panel mit Tabs | OK, stellt 7 alte Tabs wieder her | OK (N4) |
| T09 | URL-Feld + Navigation im Panel | Seite lädt | example.com lädt (< 2 s, iframe/Proxy) | OK |
| T10 | Neuer Tab / Tab schließen / Vor/Zurück | funktioniert | funktioniert (stichprobenartig) | OK |
| T11 | Nicht einbettbare Seite (Amazon/Google) bedienen | Remote-Session: klicken/tippen | nur Standbild/„Extern öffnen"; Session-API tot | **FEHLER (K3)** |
| T12 | Chat-Befehl „Gehe in den Browser und prüfe …" | führt aus + berichtet | Umleitung ins Formular, Handoff-404, keine Ausführung; 1× stiller Seiten-Reset | **FEHLER (K2/K5)** |
| T13 | Automatisierung „Anmelden" | Session übernimmt | `session_handoff_not_found` | **FEHLER (K2)** |
| T14 | Suche-View | durchsucht auch Verlauf | UI da; Verlaufsquelle existiert nicht | TEILWEISE (H5) |
| T15 | Projekte | anlegen/öffnen/speichern | Liste + Aktionen vorhanden (Local Workspace) | OK (Basis) |
| T16 | Dateien (Upload-Staging) | Upload/Download | UI vorhanden; Roundtrip nicht ausgeführt (bewusst) | OFFEN |
| T17 | Code-Editor (/code) | erreichbar, Datei lesen/speichern | vorhanden, aber nicht im Menü | TEILWEISE (M1) |
| T18 | Einstellungen | Kategorien, lokal gespeichert | 10 Kategorien, sauber | OK |
| T19 | Status-View | echter Systemzustand | widerspricht Live-APIs („AI disabled") | FEHLER (H4) |
| T20 | Fehlermeldungen | verständlich, deutsch | rohe Codes, EN/DE-Mix | FEHLER (H3/N1) |
| T21 | Responsive/Mobile | 320–920 px sauber | Breakpoints/PWA vorhanden; Live-Test ausstehend | OFFEN (M7) |
| T22 | Panel-Button „GitHub" | öffnet GitHub-Bezug | öffnet Einstellungen | FEHLER (M2) |
| T23 | Sicherheits-/Kosten-Gates | fail-closed | 401 auf Jobs, Budget blockiert, SSRF-Listen im Code | OK (Stärke) |

---

## 10. Erfolgskriterien-Abgleich (dein Auftrag)

Erfüllt in dieser Session: vollständige Analyse, Live-Browser-Test, Ursachen im Code (Datei + Zeile), kategorisierter Verbesserungsbericht, Rollback-/Testplan — ohne jede produktive Änderung. Noch offen (erst nach Freigabe): Umsetzung der Wellen, Wiederholungs-Messungen, Mobile-/Upload-/Job-E2E-Beweisläufe. Damit smejj.com die Codex-Erfolgskriterien erfüllt, sind die vier kritischen Ketten (K1–K4) die Pflicht — alles andere ist danach Feinschliff.

*Erstellt am 2026-07-21 (Live-Test 04:07–04:30 UTC). Alle Befunde doppelt belegt: Live-Verhalten im Browser + Code-Stelle im Repo. Keine Änderungen am Repo, keine Deployments, keine Kosten ausgelöst, keine Secrets berührt.*
