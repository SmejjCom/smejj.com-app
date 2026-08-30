# GESAMT-AUDIT A–Z: smejj.com Browser, Icons, Startseite, Maus, Free-Only (2026-08-26)

**Art:** Reines Lese-Audit (Change-Lock beachtet: keine Änderung an Code, Konfiguration, Deployment oder Policies).
**Umfang:** public/ (Startseite, alle Ansichten, Browser-Pane mit 21 Modulen, Maus-Module), src/, control-server/, workers/,
extensions/smejj-maus-bruecke, scripts/, docs/, .github/, Live-Seite https://smejj.com.
**Methodik:** 4 parallele Spezial-Audits (Browser-Pane · Maus-Engine · Icon-Inventar · Free-Only) + eigene Verifikationsläufe.
Jede Aussage mit Beleg `Datei:Zeile`. Pfade relativ zum Projektroot; Frontend-Pfade relativ zu `public/`.

---

## 1. So läuft ein professioneller A-bis-Z-Check (Methodik, angewendet)

1. **Automatisierte Richtlinien-Audits:** `check:start-lock`, `check:favicon-lock`, `check:branding`,
   `check:guidelines`, `check:frontend` (+ Precache-/Modul-Syntax-Prüfungen).
2. **Statische Analyse:** Duplikat-IDs, tote Links, fehlende Assets, Precache-Vollständigkeitsprüfung gegen das Dateisystem,
   aria-/Fokus-/Hover-CSS-Zählung, Shortcut-Inventar per grep.
3. **Live-Abgleich:** HTTP-Status aller Kern-URLs, Byte-Vergleich ausgelieferte Dateien ↔ Quelle.
4. **Feature-Audits:** Bedienelement-Inventarisierung (Symbol · Label · aria · Fundstelle · Funktion · Zustände),
   Tab-/Adressleisten-/Lesezeichen-/Sitzungslogik, Fehlerpfade, Race Conditions, A11y.
5. **Sicherheits-/Datenschutzreview:** Auth-Ketten, Origin-/Token-Prüfung, Ownership, SSRF/Allowlists, CSP.
6. **Free-Only-Compliance:** Provider-Grep über das ganze Repo, Altlast vs. aktive Config, Policy-Widersprüche.
7. **Priorisierter Maßnahmenplan** (P1/P2/P3) — Umsetzung jeweils nur nach schriftlicher Freigabe (Change-Lock).

---

## 2. Automatisierte Ergebnisse (heute selbst ausgeführt)

| Prüfung | Ergebnis |
|---|---|
| `check:start-lock` | ✅ OK — 34 Startseiten-Dateien byte-identisch zum Freeze 2026-08-26T00:58Z |
| `check:favicon-lock` | ✅ OK — 6 Dateien, 43 HTML-Seiten, Manifest, Generatorquellen unverändert |
| `check:branding` | ✅ OK — 12 Assets byte-identisch |
| `check:guidelines` | ✅ OK — 1992 Dateien (800-Zeilen-Regel, Naming) |
| `check:frontend` | ✅ **663/663 Tests grün** + Precache-Importe 172 Module OK + 236 Module Syntax OK |
| Live-URLs (/, sw.js, manifest, favicon.ico, willkommen.html) | ✅ alle HTTP 200 |
| `/assets/fehler-faenger.js` & Co. | ✅ live 200 und **byte-identisch** zur Quelle `public/fehler-faenger.js` (Verteilung in assets/ passiert erst im Deploy-Fluss `UPLOAD-ZU-GITHUB/1-nach-assets-ziehen`) |
| Duplikat-IDs über alle 14 HTML-Seiten | ❌ genau ein Fall: `homeOutput` doppelt in index.html:411+412 — **auch live bestätigt** (grep der Live-Antwort: 2 Treffer) |
| Interne Root-Links aller statischen Seiten | ✅ bis auf die drei oben genannten (die live existieren) keine toten Links |
| Web-Manifest-Icons | ✅ alle 4 Einträge vorhanden (pwa/maskable 192/512) |

---

## 3. Gesamturteil

Die Kernoberfläche ist ungewöhnlich sauber gebaut: zentrale Stroke-Icon-Registrierung ohne hartcodierte Farben,
**alle 144 Buttons des statischen Markups haben zugängliche Namen**, konsequente Delegation statt Inline-Handler
(0× onclick), fail-closed-Design durchgängig (Maus plant nur, Engine führt deterministisch aus), starke Datenschutzgrundlagen
im Browser-Pane (Omnibox rein lokal, Sandbox ohne allow-same-origin, Referrer aus).

Die Befunde ballen sich in vier Zonen:
1. **Ein sichtbarer UI-Defekt** im Nachrichtenmenü (3 Icons fehlen),
2. **die Admin-Konsole** (tote Bedienlogik, CSP-Eigenbrüche, fehlender Tastaturzugang),
3. **vier konkrete Browser-Pane-Defekte** (A–D, siehe §7),
4. **Policy-Drift** (Actions-Cron, zweiter Server, Cloudflare-DoH-Rest, veraltetes Salad-Kapitel).

---

## 4. Icons & Bedienelemente — Inventar (Kern)

### 4.1 Architektur
- Genau **21 Stroke-SVGs** in `components.js:5–28` (viewBox 24×24, currentColor, kein fill/stroke hartcodiert);
  Injektion via `setButtonIcon` (`app.js:250–255`), Fallback-Glyph „•".
- index.html: **144 Buttons**, **48 SVGs (alle aria-hidden)**, 78 aria-label, 44 title, 0 inline styles, 0 onclick.
- Statische Seiten: reine Textbuttons/Links, 0 SVG, 0 title, 0 onclick.

### 4.2 Wichtigste Elemente Startseite (index.html)
| Element | Funktion | Fundstelle |
|---|---|---|
| favicon-SVG Kopfzeile | Spur öffnen/schließen (aria-expanded) | index.html:127–129 |
| Logo | Link „/" (aria-label „smejj.com Startseite") | :130–133 |
| Globus | Browser-Panel-Toggle (aria-expanded) | :137–139 |
| Maus-Cursor | Maus-Replay-Ansicht (title „Maus") | :147–149 |
| 17 Sidebar-Nav-Buttons | goToView je Kernpunkt (Chat … Speicher, Kostenschutz) | :163–191 |
| Profil-Dock (Avatar+Name) + 9 Menüpunkte | Kontoseite/Einstellungen/Abmelden … (Freigabe 2026-07-17) | :192–219 |
| Composer: Plus, Modell-Chip, Uhr „Nachdenken", Mikrofon/Audio/Stimme/Senden, 8 Werkzeug-Chips | Design-Lock-Bereich (unverändert) | :247–392 |
| Vorschlags-Chips (3) | **Container hidden = stillgelegt** | :385–392 |

### 4.3 Chat-Aktionsleiste/Menü (chat-actions.js/.css, chat-actions-menu.js)
Leiste: Kopieren (Dual-Clipboard, is-done+Check 2 s), Vorlesen (SpeechSynthesis, 2. Klick=Stopp),
Hilfreich/Nicht hilfreich (aria-pressed), Aktionen ⋮ (Esc/Klick-außen schließt, Fokusrückgabe),
‹ › Versionen (disabled an Grenzen), Uhrzeit, Inline-Editor (Enter sendet, Esc bricht ab), Undo-Bar (role=status).
Menü: Quellen anzeigen · Ohne Formatierung kopieren · Ab hier neuen Chat starten · Ab hier löschen (rot, Trennlinie).

### 4.4 Browser-Pane (Details §7)
Vollständige Tabelle im Anhang-Abschnitt des Browser-Audits: Neuer-Tab `+`, Tableiste (role=tablist),
Tab-Schließen-Kreuz (nur Hover), Maus-Knopf (beauftragen/Not-Aus), Zurück/Vorwärts (Rechtsklick=Verlaufsmenü),
Neu laden/Stopp, Adressleiste+Sicherheitsknopf (Schloss/Warndreieck/Info, nur Anzeige), Zoom-Badge (Klick=Reset),
Lesezeichen-Stern (aria-pressed), Extern öffnen ↗, Panel-Menü ☰, Schließen ✕, Fortschritt, Hinweiszeile, Leerzustand;
Overlays: Vorschlagsliste (max. 6), Suchleiste ⌘F (‹ › ×, Zähler aria-live), Seiten-/Tab-Kontextmenü,
Verlaufsmenüs (je max. 10 Stationen), Live-Stage-Dialog (alertdialog), Fehlerseite „Erneut laden".

### 4.5 Maus (Details §8)
`#mausButton` (Replay-Ansicht), Chat-Chip „Browser" (setzt Auftragstext), Panel-Mausknopf (Beauftragen/Not-Aus,
geteilter Zustand mit Chat-Läufen), Replay-Formular + Player (Abspielen, ◀ ▶, Tempo 0.5/1/2×, Cursor-Animation,
Klick-Puls 650 ms, Tippen 45 ms/Zeichen gedeckelt 2500 ms), Brücken-Statuszeile, Erweiterungs-Popup
(„Für 30 Minuten erlauben", Selbstablauf der Freigaben).

### 4.6 Konto/Auth/API-Keys (Elementebene)
9 Konto-Tabs (ARIA-Tabs, roving tabindex), Plan-Buttons mit dynamischen Zuständen (disabled nach Buchung,
„Abo verwalten" nur bei aktivem Abo), Sitzungen mit „Beenden"/„Überall abmelden", Passwort minlength 10 + Submit-Sperre,
Kontolöschung zweistufig (Bestätigungswort exakt „KONTO LÖSCHEN"), API-Keys mit menuitemradio/aria-checked-Popovers,
Statuszeile aria-live, Busy-Sperren; Passkey-Buttons disabled ohne WebAuthn-Support.

### 4.7 Konsistenz-Befunde Icons
- Gleiches Symbol, verschiedene Funktionen: „Projects"-SVG für Projects **und** smejjCloud (index.html:172/:175);
  Häkchen als „Systemzustand"-Icon (components.js:21); Vorlesen-Glyph zweimal unterschiedlich gezeichnet
  (chat-actions.js:59 vs chat-actions-menu.js:148); zwei fast identische Uhr-SVGs (:324 vs :350).
- Konsistent positiv: Globus=Web/Browser überall, Mikrofon=Diktat/Sprechen, ✕=Schließen, Papierkorb=Müll.
- Sprachmix/Tooltips: `#appMenuButton` ohne title (:127), `#mausButton` ohne aria-expanded (:147),
  ASCII-Umlaute („oeffnen", „hoere", „Geraet/unterstuetzt"), „Start Chat"/„Projects" englisch, „Gestagte Uploads".
- **Light-Mode-Altbefund (2026-07-25) ist im Code widerlegt/behandelt**: Fix via `body:has(...)` in app-surfaces.css:679–693,
  SW-Cache altlast v133 beseitigt (jetzt v712). Restrisiko: Fix hängt allein an `:has()`; Konto-Oberflächen
  (account-privacy.css/api-keys-surface.css) haben keinerlei Hell-Overrides.

---

## 5. Tasten (Shortcuts) — Gesamtliste

**Global/App:** ⌘/Strg+K globale Suche (search.js:86, such-nachladen.js:36) · Escape schließt Overlays/Menüs in ≥10 Modulen
· ⌘/Strg+U Dateianhang im Code-Bereich (code-flaeche.js:669/:751) · Enter sendet im Composer.

**Browser-Pane** (nur bei offenem Pane, Capture-Phase, tasten.js:64–128):
⌘T neuer Tab · ⌘Shift+T zuletzt geschlossenes Tab (Stack max. 10, RAM) · ⌘W Tab schließen (Pinns immun)
· ⌘L Adressleiste · ⌘R Neu laden/Stopp · ⌘F Seitensuche · Strg+Tab±Shift Tabwechsel · ⌘1…9 nth/letztes Tab
· ⌘+/−/0 Zoom 50–200 % · Suchleiste: Enter/Shift+Enter/Esc · Vorschläge: ↑↓EnterEsc
· Im Live-Frame werden v/c/x/a/z bewusst an den Fern-Browser durchgereicht (stage.js:222–240).

---

## 6. Browser-Pane A–Z (Kurzfassung)

- **Tabs:** max. 7 (hartes Limit, Plus wird disabled+beschriftet), Anpinnen (40 px, Gruppenwand), Duplizieren,
  Andere/rechts schließen, Drag-Sortierung, pro Tab eigener Verlauf/Zoom/Scrollratio, Wiederöffnen-Stack.
- **Adressleiste:** Normalisierung → https bzw. DuckDuckGo-HTML (einzige Engine, keine Auswahl);
  Vorschläge NUR aus eigener Historie (max. 6, Datenschutz: keine Tastenanschläge an Suchmaschinen).
  Navigations-Entscheidungsbaum: Proxy-Fetch → Fehlerseiten → Amazon immer Live-Browser → Login/Captcha-Erkennung
  → sandboxed srcdoc-iframe → Live-Browser → direkter iframe als letzter Fallback.
- **Lesezeichen:** localStorage, max. 200, Stern-Toggle sauber — **aber keine Verwaltung** (Liste/öffnen/löschen fehlt;
  gespeicherte Lesezeichen sind unsichtbar, außer dieselbe URL ist offen).
- **Persistenz/Datenschutz:** Tabs (inkl. Verlauf max. 50, Zoom, Scroll, angepinnt) in localStorage; KEINE Favicons,
  KEINE sessionIds, Geschlossen-Stapel flüchtig; IDrive e2 im Pane nicht involviert (rein client-lokal).
  Token-Kette Cache→localStorage→sessionStorage→Cookie-Refresh.
- **Sicherheit:** Sicherheitsklassifikation sicher/unsicher/intern/leer mit Klartext-Warnung; srcdoc-Sandbox ohne
  allow-same-origin; referrerpolicy no-referrer; https-Pflicht überall; escapeHtml/textContent; Aktions-Queue Kappe 6;
  SSRF-Blocklist serverseitig. Lücken: postMessage-Ziele `"*"` und Empfänger prüfen nur event.source (nie event.origin);
  umgeschriebene Proxysite kann beliebige https-Navigation anstoßen (designimmanent).
- **Fernwege:** tryLiveBrowser (interaktive Playwright-Sitzung), tryRemoteBrowser (Standbild + Klick-Hotspots),
  echterBrowserWeg (Rückfallkarte Login/Captcha).

---

## 7. Bestätigte Defekte (konsolidiert, P1)

| # | Defekt | Beleg |
|---|---|---|
| D1 | **Doppelte ID `homeOutput`** — invalides HTML; zweites Element ist totes Markup; auch live | index.html:411+412; Live-grep: 2 Treffer |
| D2 | **Chat-Menü ohne 3 Icons**: `regen`/`copy`/`edit` fehlen in der ICONS-Map von chat-actions-menu.js → leere Icon-Spans; toter Menüeintrag `ITEMS.speak` | chat-actions-menu.js:145–151, :26; SVGs existieren nur in chat-actions.js:57/60/64 |
| D3 | **Admin-Konsole teils unbedienbar**: console.js bindet `#akteAktionen`/`[data-aktion]`, aber keine View erzeugt dieses Element; `adminStageCockpit`/`adminStage10` werden nie registriert; evolution/index.html lädt 6 nicht existierende Skripte (6×404/Aufruf) | console.js:312–316, :27–35; evolution/index.html:79–84 |
| D4 | **CSP-Eigenbrüche Admin**: Inline-Styles in 27+1 Suchboxen + Cockpit-Banner werden von der eigenen Meta-CSP still verworfen | abrechnung/index.html:48–52; views-cockpit.js:46–56; CSP index.html:23 (style-src 'self') |
| D5 | **Tab-Schließen-Wettlauf**: closeTab bricht weder AbortController noch laufende navigate ab → verwaistes unsichtbares iframe lädt weiter Drittanbieter-Inhalte (Datenschutz/Traffic) | browser-pane.js:445–457, :515, :646–677 |
| D6 | **Doppel-Navigation per Enter** (markierter Vorschlag + Keydown-Handler feuern beide) → doppelter Verlaufseintrag | vorschlaege.js:133–139 vs pane.js:300–304 |
| D7 | **browser-pane-persistenz.js ist tot UND kaputt** (importiert 6 nicht exportierte Namen) — wird aber von beiden Service Workern vorgecacht | persistenz.js:3; sw.js:231 |
| D8 | **Angepinnte Tabs gehen beim Neustart verloren**: persistTabs speichert `angepinnt` (mit Versprechenskommentar), restoreTabs liest es nicht | pane.js:769 vs :799–812 |
| D9 | **Maus: fehlende Ownership-Prüfung** — jeder angemeldete Nutzer kann per `GET /api/maus/run?runId=` fremde Lauf-Ergebnisse (inkl. extrahierter Daten) lesen; GET ohne Rate-Limit. Größtes gefundenes Datenschutzloch | control-server/src/routes/mausEngineRoutes.js:310–331, :472–479 |
| D10 | **Maus-Fristen defekt**: WORKER_TIMEOUT_MS (330 s) > Gateway-Hartgrenze (300 s) → eigener AbortController kann nie zuerst feuern; Health-/Planner-/httpRequest-Fetches ohne Timeout (3 Stellen); Tokenvergleich am Worker nicht konstantzeitig | mausEngineRoutes.js:53–54, :174; loop-runner.mjs:32–40; http-stage.mjs:49–54; worker.mjs:79 |
| D11 | **Hinweiszeile `.bp-hint` ohne aria-live/role** — Proxy-Ausfälle, Maus-Fortschritt, Zoom werden für Screenreader nie angesagt | render.js:325; pane.js:367, :576; maus.js:235 |
| D12 | **Policy-Widersprüche** (brauchen Betreiber-Entscheid, siehe §9): codeberg-spiegel-Cron vs. Regel A; zweiter gekaufter Server vs. Ausnahme 1 „NUR dieser eine Server"; cloudflare-dns-DoH-Fallback; veraltetes Salad-Kapitel in MAUS_ENGINE.md | .github/workflows/codeberg-spiegel.yml:22–39 vs docs/policy/GITHUB_KOSTENFREI.md:96–101; ZWEITER_SERVER_UMZUG.md:3–14 vs FREE_ONLY_MASTER_POLICY.md:165–175; verify_free_stack_live_dns.mjs:53–56; MAUS_ENGINE.md:12–14 |

---

## 8. Maus-Engine A–Z (Kurzfassung)

**Drei Wege, ein Server-Hirn:** (A) ferner Cloud-Browser: Plan→Validierung→Playwright-Worker auf Zeabur,
Ergebnisse+Screenshots nach IDrive e2, Replay/Live im Frontend; (B) eigener Chrome via MV3-Erweiterung
(6 Aktionstypen, Freigaben 30 min, keine Passwortfelder/eval, eigenes Maus-Tab); (C) Panel-eingebettet sichtbar
(hinsehen→entscheiden→handeln, max. 10 Schritte freier Modus). Vision/Koordinaten serverseitig HART gesperrt.
Bewegung: serverseitig keine Interpolation (Playwright-Sofortsprung); Glättung nur in der Anzeige
(CSS-Transition 60 % der Schrittzeit, Puls bei klick-artig, deterministische Pseudo-Positionen aus Selektor-Hash als Fallback).
Replay: auth-gated Presign → gzip → Player; Live-Poll 1,5 s mit Idle-Cutoff 180 s.
Positiva: fail-closed Pläne, 422-Lernschleife, Rate-Limit 6 Burst/1 je 20 s, Single-Run-Schloss, AI-Act-Kennzeichnung auf jeder Antwort.
Free-Only: GitHub Pages ✅ gratis; Zeabur-Worker = dokumentierte bezahlte Ausnahme (6 $/Monat, KEIN „free"-Tarif);
IDrive-e2-Überlauf kostet automatisch (0,006 $/GB·Monat, Quota-Guard fail-closed); Modellfragen über bestehende Keys ✅.

---

## 9. Free-Only-Compliance (Ampel)

| Status | Bereich |
|---|---|
| ✅ | Vercel/Netlify/Heroku/Railway/Render/Fly/Supabase/Firebase/PayPal: 0 Treffer · AWS nur Doku · OpenAI nur BYOK · Cloudflare-Hauptexit sauber (0 wrangler-Artefakte) · Salad live komplett gestoppt (2026-08-13) + Bridge auf Zeabur gegengeprüft · GitHub $0-Budgets mit Stop usage, kein Zahlungsmittel |
| ⚠️ | cloudflare-dns.com-DoH-Fallback (letzter aktiver CF-Verkehr, verify_free_stack_live_dns.mjs:55) · Salad-Restcode fail-closed (saladRoutes.js:67/96/106, saladClient.js:12) · tote salad.cloud-URLs in 3 .command-Helfern + UPLOAD-ZU-GITHUB-Stagingkopien · Stripe/Abo-Kette funktioniert (fail-closed-Webhook, abo-lock), fehlt aber als dokumentierte Ausnahme Nr. 4 in der Master-Policy · Premium-Stimme-Entscheidung B2 offen |
| ❌ | codeberg-spiegel.yml: täglicher Cron auf ubuntu-latest widerspricht Regel A von GITHUB_KOSTENFREI.md („kein workflows/-Ordner in diesem Repo") während die Master-Policy Actions in öffentlichen Repos erlaubt — Dokumentenkonflikt braucht Entscheidung |

**Fazit Free-Only:** Ja — policy-im Sinne zu 100 % free-only lauffähig (alle Kostenpositionen fest, eingeplant,
schriftlich freigegeben: Zeabur 6 $/Monat + IDrive-e2-Paket; $0-Budgets stoppen statt abzurechnen).
Streng 0,00 € ist der Betrieb NICHT — die zwei budgetierten Positionen sind explizite Policy-Ausnahmen.

---

## 10. Verbesserungsvorschläge (konsolidiert, priorisiert)

### P1 — Funktionsfehler/Sicherheit (nach Freigabe zuerst)
1. D1 doppeltes `homeOutput` entfernen (index.html:411/412).
2. D2 Chat-Menü-Icons ergänzen (`regen`/`copy`/`edit` in ICONS-Map, assets-Zwilling mitsynchronisieren), toten `speak`-Eintrag löschen.
3. D9 Run-Ownership: `rememberAsyncRun` um Besitzer erweitern + Prüfung in handleMausStatus; Presign-Leserecht auf eigene Capsules begrenzen.
4. D5 Tab-Schließen-Wettlauf fixen (abort + Generations-Token gegen späte navigate-Fertigstellung).
5. D6 Doppel-Navigation deduplizieren (stopPropagation im Vorschlagspfad).
6. D7 persistenz.js reparieren oder löschen (inkl. Precache-Eintrag beider sw.js).
7. D8 `angepinnt` in restoreTabs wiederherstellen.
8. D3/D4 Admin: `#akteAktionen`-Leiste liefern oder tote Bindungen entfernen; Stage10/Cockpit registrieren; 6 404-Skripte korrigieren; Inline-Styles in console.css verlagern.
9. D10 Maus-Fristen: Timeout < Gatewaygrenze (oder async-only), Fetch-Timeouts nachrüsten (3 Stellen), timingSafeEqual am Worker.
10. D11 `.bp-hint` aria-live geben.

### P2 — Robustheit/Zugänglichkeit/Transparenz
11. Verworfene Aktionen melden (Queue voll, session_busy) statt still droppen (session.js:241, :252–263).
12. Misserfolgserkennung Direkt-iframe (X-Frame-Verweigerung zeigt heute stumm weiß).
13. Lesezeichen-Verwaltung (Liste/öffnen/löschen) — Datenmodell existiert komplett.
14. Menü-Tastatursteuerung + echtes benanntes Tab-Schließen-Element; Hotspot-Links beschriften; combobox vollständig verkabeln (aria-controls/activedescendant).
15. Hellmodus ent-`:has()`-en (Theme-Attribut auf body) + Hell-Overrides für account-privacy.css/api-keys-surface.css; `[disabled]`-Stile dort ergänzen.
16. Benennungs-/Sprachhygiene (12 Stellen: 📁-Buttons, Vollkey-Copy nur title, ASCII-Umlaute, „Start Chat"/„Projects", appMenu-title, mausButton aria-expanded).
17. Icon-Mehrdeutigkeiten auflösen (Projects≠smejjCloud-Icon, Systemzustand≠Häkchen, Vorlesen-Glyph, Uhr-Duplikat).
18. Maus: Live-Modus ehrlich benennen (Diashow) oder CDP-Screencast wirklich verdrahten; Planner-Proxy rate-limiten; /health entinformation; Allowlist-IP-Normalisierung.
19. Fehlerdifferenzierung in session-post() (Netz vs. Auth vs. Sitzung) — verhindert falsche „Sitzung verloren"-Abbrüche.

### P3 — Politur/Hygiene
20. window.prompt() beim Panel-Mausknopf durch App-Modal ersetzen; echte Cursor-Koordinaten flächendeckend ins Protokoll schreiben; Tempo 4×, Restlaufzeit im Live-Modus.
21. Repo-Hygiene: tote app.js-Selektoren (profileDockAvatar/profileDockLabel :698–699, storage/status/tests :395–401, ai/costStatusChip :550–551), Manifest-Screenshotgröße 780x1688→780×1864, 4 divergente assets-chat-bridge-Kopien, unstyled Support-Button (hilfe.html:170), fehlendes visually-hidden in static-pages/entwickler-CSS, alert()→showToast (arbeitsflaeche.js:103), paste-chips :focus-visible, willkommen-Fokus-Chips aria-pressed, programmieren.html:114 Rolle.
22. Free-Only-Bereinigung (Reihenfolge nach Risiko): codeberg-spiegel-Entscheid → DoH-Fallback entfernen → Salad-Konto endgültig löschen + Restcode/Helfer aufräumen → Stripe/Abo als Ausnahme Nr. 4 dokumentieren + B2 entscheiden.

---

## 11. Nächster Schritt

Alle Punkte sind **Vorschläge**. Gemäß Change-Lock wird nichts umgesetzt ohne Ihre schriftliche Freigabe
(Wortlaut aufbewahren). Empfehlung: P1-Liste (§10.1) als ein freigegebenes Paket mit anschließender kompletter
Pipeline `npm run check:all` + `check:guidelines`; Rollback-Punkt vorher sichern. Die Locks (Startseite,
Favicon, Modellmenü) bleiben dabei unberührt — keiner der Fixes berührt gelockte Bereiche.
