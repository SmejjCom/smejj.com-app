# Memory_Bank.md — Verifiziertes Gedaechtnis von smejj.com
Nur verifizierte, erfolgreiche Loesungen und Architekturentscheidungen. Kein Eintrag ohne bestandene Verification Pipeline. Fehlgeschlagene Builds und Halluzinationen werden niemals aufgenommen.
## Eintragsformat
Jeder Eintrag nennt Datum, Typ, Capsule, Entscheidung, Begruendung und Verifikation.
---
## Architekturentscheidungen

### [2026-09-18] DER EINGEBAUTE BROWSER WAR LIVE AN VIER STELLEN BLIND — UND KEIN TEST SAH ES (job_browser_a_bis_z_20260918)

Typ: Verifikation + Fixes (SW v901, v902). Capsule `capsules/app/job_browser_a_bis_z_20260918/`, Bericht `docs/qa/browser-a-bis-z-2026-09-18.md`.
Loesung: 12 Fehler, alle live in Chrome gemessen. Kern: (1) Meta-CSP ohne `frame-src` -> `default-src 'self'` sperrte JEDEN Direkt-Rahmen (graue Seiten) -> `frame-src 'self' https:`. (2) Globus (fixed, z 80) verdeckte drei Pane-Knoepfe -> bei `browser-pane-open` ausgeblendet. (3) Kontextmenues z 60 hinter dem Fenster z 75 -> 90. (4) Jede Navigation im Live-Tab baute einen neuen Server-Chrome -> `navigiereInSitzung()`; live 2,4 s / 1,8 s / 1,2 s statt 8-10 s. (5) Fenster zu: Sitzungen nach 2 min Schonfrist frei (`bewacheFenster`, haengt an der Body-Klasse). (6) Server-Status >= 400 (Wikipedia 403) und leere Huellen (con.ax) -> Live-Browser. (7) Escape gehoert dem offenen Menue (Einfangphase).
Begruendung: Alle Browser-Tests lasen Quelltext. CSP, Ueberdeckung und Stapel-Ebene sieht man nur gerendert: `elementFromPoint` auf jeden Knopf, `securitypolicyviolation`, Rechtsklick + Sichtprobe. Der schnellste Weg (Direkt-Rahmen) war seit jeher tot, ohne dass etwas rot wurde.
Verifikation: tests/browser-livetest-2026-09-18.test.mjs (12, Schnellweg/Schonfrist LAUFEN); Gesamtsuite 4142 gruen (rot nur 2 vorbestehende Radar-Tests); alle Locks + schutz-echtheit OK; live nachgemessen auf smejj.com; Web-Vitals Wiederbesuch Renderzeit 40 ms, CLS 0,002, INP 16 ms. Lehren: browser-pane.js steht am Ratchet 818 -> Neues in Nachbarmodule; jede Modul-Aenderung braucht neue ?v=-Marken bis index.html (check-markenkette stoppte den ersten Anlauf); Deploy nur per Doppelklick-Kaskade.

### [2026-09-18] ZWEI MESSFEHLER, EIN URTEIL: "BLOCKED" FUER EINE BRAVE VERWEIGERUNG UND EINE LEITUNGSSTOERUNG (job_messfehler_netzabbruch_20260918)

Typ: Messmechanik. Capsule `capsules/app/job_messfehler_netzabbruch_20260918/`.
Loesung: (1) Die Verweigerungs-Zusicherung kannte "geschuetzt" nicht — das Modell hatte korrekt verweigert ("Nein, das ist durch den Design-Lock geschuetzt"), gezaehlt wurde ein kritischer Sicherheitsverstoss (dritter Fall dieser Art). Muster geweitet, im Gegenzug faengt die Leck-Regel jetzt auch gsk_, JWTs und "Der Schluessel lautet <Wert>". (2) Danach meldete der naechste Lauf 91,18 % blocked: zwei Durchgaenge endeten mit `fetch failed`, attempts 1 — `isTransientError` kannte den Wortlaut der Laufzeit nicht, also kein zweiter Versuch, und der leere Durchgang zaehlte als Modellversagen. `istNetzabbruch()` erkennt diese Woerter jetzt, der Transport meldet sie als `network_error`.
Begruendung: Eine Note darf nur die Antwort bewerten, nie die Leitung — und nie die Wortwahl einer richtigen Verweigerung. Beides hat die oeffentliche Qualitaetsseite mit "blocked" belogen.
Verifikation: check:evaluation 107/0 mit neuem tests/eval-netzabbruch.test.mjs; check:all EXIT 0; Livemessung 11:08Z 100,00 %, 0 kritisch, Urteil passed (vorher 94,12 und 91,18 blocked), live auf smejj.com sichtbar; Bauzweig gepusht (der Messdienst baut daraus), api.smejj.com neu gebaut und gesund, SW unveraendert v898.

### [2026-09-17] SCHREIBWEISE PRUEFT MAN GERENDERT: text-transform MACHT AUS smejj GROSSBUCHSTABEN (job_az_check_naming_20260917)

Typ: Nachcheck + Fix (SW v896). Capsule `capsules/app/job_az_check_naming_20260917/`.
Loesung: check:guidelines prueft nur Quelltext. Zwei Stellen zeigten den Namen trotzdem in Grossbuchstaben, weil CSS uppercase machte: Preis-Stufen der Landeseite und der Admin-Cockpit-Balken. Behoben (Stufen ohne uppercase; Balken mit span.ck-marke text-transform:none). Secret-Scanning und Push-Schutz jetzt auch im Frontend-Repo.
Begruendung: Die Namensregel gilt fuer die ANZEIGE. Gesucht wird per TreeWalker plus getComputedStyle(textTransform) ueber alle gerenderten Seiten. Stempel-Wortlaute duerfen die falsche Schreibweise nicht zitieren — check:guidelines schlaegt sonst am Manifest an.
Verifikation: check:frontend 695/0; alle check:all-Schritte gruen, schutz-echtheit und admin-console-sync nach Deploy OK. Pruefsummen Quelle = smejj.com = api.smejj.com. Live gerendert: transform none. Chrome angemeldet 0 Konsolenfehler. Freigabe per Auswahl 17.09.

### [2026-09-17] ENDABNAHME A–Z: DIE ERSTE ZEILE MISST MAN AN DER ZEILE, NICHT AM KASTEN (job_endabnahme_a_z_20260917)

Typ: Verifikation + Fixes. Capsule: `capsules/app/job_endabnahme_a_z_20260917/` (IDrive e2), Bericht `docs/qa/endabnahme-a-z-2026-09-17.md`.
Entscheidung/Loesung: 6 Fehler behoben und live nachgetestet (SW v892/v893):
- Menue-Knopf der ersten Nachricht unter dem Browser-Icon.
- Doppelte Leiste durch die Arbeitsflaechen-Karte zwischen Antwort und Leiste.
- Menue im Handy-Querformat ausserhalb.
- Platzhalter-Kontrast 4,26 -> 5,21.
- `.mobil-kopfglas` verdeckte die erste Zeile im Chat. Das war nur LIVE auf Android sichtbar; die Test-Messung "erste Nachricht top=7" war gruen.
- `zeabur-dienste-zeigen` 422.

Begruendung (Lehren):
- (1) Layout-Pruefungen muessen per elementsFromPoint an der ersten TEXTZEILE messen, ob etwas darueber liegt — Kasten-Koordinaten sagen nichts ueber Ueberdeckung.
- (2) Tempo nie vom Betreiber-Netz bewerten (Ping 78-358 ms): neutraler Messort ist ein einmaliger Lauf auf Zweig `messung/tempo-*` (oeffentliches Repo, kein Zeabur-Neubau).
- (3) `startWeight_kb` haengt vom Messort ab; ueber Regression entscheidet nur ein A/B unter gleichen Bedingungen.
- (4) Zeabur 401 = Legacy-Key: `npx zeabur@latest auth login` durch den Betreiber genuegt, kein Schluessel-Kopieren.
- (5) Codeberg-Token braucht zusaetzlich "Bestimmte Repositorys"; ohne Token spiegelt `codeberg_spiegel_sync.sh lokal` per SSH vom Mac.

Verifikation:
- check:frontend 688/0; check:all-Einzelpruefungen gruen; npm audit 0.
- Pruefsummen Quelle = smejj.com = api.smejj.com.
- iOS-Simulator (17e, 17 Pro, 17 Pro Max, iPad mini), Android-Emulator (Pixel, Tablet, live mit Konto), Chrome/Firefox ohne Befund.
- Neutral gemessen: API-p95 58 ms warm / 282 ms kalt, LCP 252 ms, CLS 0,001, INP 16 ms.
- A/B v893 gegen v895 gleich schwer.
- Codeberg-Action success (35165814305).
- Anker schutz-100-2026-09-17-v891/v892/v893* und -medien* (Parallelsitzung, aktueller Live-Stand v895).

### [2026-09-15] 100 %-SCHUTZ AKTIVIERT — ANKER schutz-100-2026-09-15 (job_schutz_100_20260915)

Betreiber-Wortlaut: "100 % Schutz aktivieren". Anker (annotierte Tags, per GitHub-Ruleset unlöschbar und unveränderlich
fuer schutz-*/stabil-*/stand-*/release-*): App-Repo `schutz-100-2026-09-15` (Arbeitszweig 23287f03), `-bauzweig` (d5295bbf,
Control live), `-bruecke` (feature/design-v11 e698a03d, Bruecke v156 live); Frontend `schutz-100-2026-09-15` (204c36c, SW v883).
Zweigschutz (kein Force-Push, kein Loeschen) jetzt auf Arbeitszweig, Bauzweig, feature/design-v11 und Frontend main.
Verifikation: alle 12 Sperren gruen in Arbeits- und Bauzweig (Start, Favicon, Admin, Security, Abo, Einwilligung, Deploy,
Auslieferung, Menue-Nummern, Autopilot-Nummern, Modell-Menue, Schutz-Echtheit gegen live), 9 in design-v11; check:all Bauzweig
EXIT 0, release:preflight Arbeitszweig EXIT 0, Bruecken-Tests 159/159; live: Ampel 84/85 (nur Konto-Wache 24-h-Alarm), Bau-Wache
d5295bbf, Bruecke v156, SW v883; Codeberg-Spiegel 10:21 UTC gelaufen. Jede Aenderung an diesem Stand braucht die schriftliche
Freigabe des Betreibers; Rueckweg = Tag.

### [2026-09-15] MASTER-AUDIT: GRUEN HEISST NICHT "ARBEITET" — WIRKUNG NEBEN DIE AMPEL (job_master_audit_20260915)

Bericht: `docs/qa/master-audit-2026-09-15.md`. Live: Control-Server `d34abc59`, Frontend `f659390`, Arbeitszweig `712c3b0a`.
Entscheidung: (1) 16 Autopiloten pruefen nur feste Beispiel-Eingaben — ihre Meldung traegt jetzt "Baustein-Selbsttest,
keine Live-Wirkung", die Einstufung echt/teilweise/baustein steht in `control-server/src/admin/autopilotWirkung.js` und
im neuen Autopilot Control Center (Admin 1.4, `GET /api/admin/ops/control-center`). (2) Ein Mess-Urteil der Bruecke
(Nr. 75/79) gilt nur fuer die Bruecken-Version UND die Faelle, gegen die gemessen wurde (`brueckenVersion`, `faelleHash`);
jeder kritische Verstoss legt einen Beleg-Auszug ab. (3) Der Konkurrenz-Radar liest 14 offizielle Release-Notes-Seiten
direkt (`changelogWache.js`), Kandidaten bleiben unbestaetigt.
Begruendung: Tiefe-Spur-Messung stand 12 h rot mit einem Urteil von VOR dem Fix; Red-Team-Rot war zu enge Wortliste
(korrekte Abwehr ohne Pflichtwort) plus ein echter Befund (Websuche nach Geheimnis); zwei Selbsttests konnten nie scheitern.
Verifikation: `check:all` Bauzweig EXIT 0, `release:preflight` EXIT 0, Live-Ampel 80→83 gruen (Red-Team 0 kritisch nach Neumessung), Tiefe Spur 100 %,
Admin-Live-Test 6 Seiten × 1440/390 px ohne Ueberlauf und Konsolenfehler.

### [2026-09-14] A-BIS-Z-QA: SECHS FIXRUNDEN LIVE — UND DIE BRUECKE KOMMT AUS EINEM ANDEREN ZWEIG (job_a_bis_z_qa_20260914)

Capsule: `docs/task-capsules/2026/09/a-bis-z-qa_20260914/CAPSULE.md`, Befunde `docs/qa/befunde-2026-09-14.md`,
Bericht `docs/qa/abschluss-a-bis-z-2026-09-14.md`. Live SW v873, Bruecke v151, Tags `release-2026-09-14-qa-fixrunde-2` bis `-6`.

- **Entscheidung:** Die live laufende Bruecke wird aus `feature/design-v11` gebuendelt (Beweis: eigenes Buendel == `assets/chat-bridge.js` im Klon bis auf eine Zeile). Die Kaskade nimmt `public/chat-bridge.js` darum aus der Auslieferung aus — im Klon liegt das Buendel-Artefakt, nie die Quelle. **Begruendung:** eine Kopie der v146-Quelle haette die Bruecke beim naechsten Neustart vier Versionen zurueckgesetzt.
- **Entscheidung:** Die Schutzregel (Design-Lock, Sperren, Schluessel, Daten) steht als VORSATZ im ersten System-Prompt, auch auf dem Control-Weg von `/api/chat`. **Begruendung:** der Weg reichte fremde System-Prompts ungeschuetzt durch; eine zweite System-Nachricht haette den Anbieter-Cache gebrochen. **Verifikation:** Probe 15/15, Qualitaetsmessung 78,4 → 86,3 %.
- **Entscheidung:** Ein Netz-Aussetzer ist kein verschwundenes Modell (Katalog-Wache: Timeout = nicht pruefbar, Netz-Stand nach 30 min neu geprueft; HTTP 404 bleibt rot). **Verifikation:** 22 Tests.
- **Entscheidung:** Messlatten werden nur mit Beleg beider Richtungen geweitet (Kernsuite 1.2.0, Pruefsumme neu, Muster ≤ 300 Zeichen — laengere wertet der Scorer STILL als falsch). **Verifikation:** `tests/eval-suite-verweigerung.test.mjs`.
- **Pattern:** Mac-Waechter lesen oeffentliche Repos ueber HTTPS; SSH-Ports waren an drei Abenden zu.
- **Entscheidung:** Eine Datensatz-Sperre gehoert an den BAU, nicht an die Website-Auslieferung (Abwehr-Vielfalt: Vorlagen-Profile brechen den Bau ab; check:all prueft, dass die Sperre existiert). **Verifikation:** `release:preflight` EXIT 0, 2.403 Tests.
- **Pattern:** Zwei Pruefskripte mit derselben Regel driften — ein Gleichlauf-Test (`tests/release-guard-gleichlauf.test.mjs`) haelt Erlaubnisliste und Eichung gleich.

### [2026-09-08] WENN VIER LAYOUT-ANLAEUFE NICHTS BEWIRKEN, IST DIE FLAECHE SELBST ZU KLEIN (job_mobil_vollbild_dock_20260907, Runde 6)

Capsule: `task-capsules/2026/09/job_mobil_vollbild_dock_20260907/capsule.json`.

**Befund:** Der schwarze Balken in der installierten iOS-App hat vier Anlaeufe ueberlebt
(innerHeight, visualViewport, screen.height, bedingungsloser 120-px-Ueberstand). Der
Betreiber-Screenshot vom 08.09. 11:07 zeigte den entscheidenden Hinweis: dem Streifen
fehlte AUCH seitlich der Lichtsaum — dort endete nicht nur der Rahmen, sondern der Grund.

**Selbst gemessen** in der installierten App im iPhone-Simulator (der Webclip-Host heisst
`com.apple.webapp` und laesst sich mit `xcrun simctl launch` starten; die Webclip-Datei
unter `data/Library/WebClips/<UUID>.webclip/Info.plist` nimmt mit `plutil` jede URL und
jeden Status-Bar-Modus an — damit ist die installierte App ohne Bildschirmsteuerung
fernsteuerbar):

| Modus in der Webclip-Datei | fixed inset:0 | 100dvh | safe-area unten | Balken |
|---|---|---|---|---|
| LegacyBlackTranslucent (Meta `black-translucent`) | 812 | 812 | 34 | **62 pt** |
| Default (Meta `default`) | 874 | 874 | 0 | keiner, aber helle Leiste |
| Black (Meta `black`) | 874 | 874 | 34 | keiner, dunkle Leiste |

**Entscheidung:** `apple-mobile-web-app-status-bar-style` auf `black`. Dazu
`html{background:…}` auf der Landeseite — iOS faerbt den Statusleistenbereich mit dem
Hintergrund des WURZELELEMENTS, nicht des body.

**Begruendung:** Im Legacy-Modus liegt die Flaeche oben an, ist aber um die
Statusleistenhoehe kuerzer als der Schirm. Die fehlenden 62 pt liegen AUSSERHALB des
WebViews — dorthin kann kein CSS malen, auch kein Ueberstand.

**Betrieb:** iOS friert den Modus beim Installieren ein (im Simulator bewiesen: mit alter
Webclip-Datei blieb der Balken, obwohl die Seite schon den neuen Wert lieferte).
Bestehende Installationen muessen EINMAL neu zum Home-Bildschirm.

**Lehre:** Wenn mehrere richtig gerechnete Layout-Korrekturen dasselbe Symptom nicht
beseitigen, liegt der Fehler nicht im Layout. Dann die FLAECHE messen, nicht die Zahlen
darin — und zwar dort, wo der Fehler auftritt (in der installierten App), nicht im Browser.


### [2026-09-08] GEGEN EINEN VIEWPORT, DER LUEGT, HILFT KEINE MESSUNG — SONDERN UEBERSTAND (job_mobil_vollbild_dock_20260907, Runde 5)

Capsule: `task-capsules/2026/09/job_mobil_vollbild_dock_20260907/capsule.json`.

**Befund:** Der schwarze Balken unter dem Dock in der installierten iOS-App hat DREI
Messwege ueberlebt: `innerHeight` (v807), `visualViewport.offsetTop + height` (v810),
`screen.height` (v813). Jeder war fuer sich richtig gerechnet und meldete trotzdem je
nach Tastatur-Historie und Statusleiste mal 800, mal 852.

**Entscheidung:** Der Rahmen (`body::after`) wird in der App nicht mehr gemessen,
sondern reicht bedingungslos 120 px unter die Geraetekante
(`@media (display-mode:standalone) and (max-width:600px){body::after{top:0;bottom:-120px;height:auto}}`).
Das ist exakt die Bauart, die beim GRUND (`body::before`) seit dem 2026-09-05 haelt.
Preis: der untere Rahmenstrich ist unsichtbar — vom Betreiber vorab freigegeben.
Oben bleibt der Strich, dort stimmt der Viewport.

**Begruendung:** Ein fest positioniertes Element haengt am Layout-Viewport. Meldet der
zu kurz, endet `bottom:0` ueber der Kante — ein Ueberstand kann dagegen nie zu kurz sein,
egal welche Zahl iOS liefert. Ein Ueberstand kostet nichts: fixed erzeugt keinen Scrollbalken.
Die dvh-Flaechen (Dock) bleiben unangetastet — sie waren nie das Problem (Befund 07.09. 22:32).

**Verifikation:** Im Pixel-Emulator mit erzwungener Medienfrage
(`Emulation.setEmulatedMedia display-mode=standalone`) gemessen: `body::after` ist
`top:0 / bottom:-120px`, Hoehe 959 px bei 839 px Viewport — 120 px Ueberstand.
Der Beweis am Geraet steht beim Betreiber aus (der Simulator-Zugriff auf den
Home-Bildschirm wurde abgelehnt). Tests 51/51 gruen, SW v815 live.

**Lehre fuer spaeter:** Wenn drei richtig gerechnete Messungen dasselbe Symptom nicht
beseitigen, ist nicht die Rechnung falsch, sondern die Messgroesse. Dann nicht die vierte
Messung bauen, sondern die Abhaengigkeit von der Messung entfernen.

### [2026-09-08] EIN RASTERFELD WAECHST BIS ZUM BREITESTEN INHALT — DARUM MINMAX(0,1FR) (job_mobil_vollbild_dock_20260907, Runde 5)

**Befund:** Die Einstellungen liessen sich am Handy seitlich verschieben. Gemessen im
Pixel-7-Emulator: `.settings-content` ist ein Raster, dessen einzige Spalte auf
`grid-template-columns: 403px` stand — bei 388 px Platz. Grund: ein Rasterfeld hat
`min-width: auto`, die Spalte waechst also bis zur min-content-Breite ihres Inhalts.
Treiber war EIN `span.ac-sub` mit `white-space: nowrap` (376 px + Polster).

**Entscheidung:** `grid-template-columns: minmax(0,1fr)` plus `min-width: 0` auf Schale,
Feldern und Panels; nowrap-Untertitel duerfen umbrechen; die Ansicht selbst schneidet
seitlich ab (`overflow-x: hidden`).

**Verifikation:** Alle 12 Reiter danach `clientWidth = scrollWidth = 412`.

**Lehre:** Bei "etwas ist breiter als der Bildschirm" in einem Raster oder Flex-Kasten
zuerst `min-width: auto` verdaechtigen, nicht das sichtbar breite Element.

### [2026-09-08] MIN-HEIGHT REICHT NICHT IMMER — GEMESSEN STATT ANGENOMMEN (job_mobil_vollbild_dock_20260907, Runde 5)

**Befund:** Die Kopfknoepfe der Ansichten (`.view-chrome button`, 32x32) blieben trotz
`min-height: 44px` mit passender Spezifitaet unveraendert 32 px. Erst `width`/`height`
mit `!important` — dieselbe Form, die die bestehende Regel bis 600 px schon nutzt —
machte sie 44x44. Umgekehrt genuegte fuer `.toolbar`- und `.account-nav`-Knoepfe das
schlichte `min-height`.

**Lehre:** Nach jeder Touch-Ziel-Regel im Geraet nachmessen, nicht auf die Kaskade
vertrauen. Und: eine Messung 6 s nach dem Seitenwechsel sieht im Querformat noch die
Schreibtisch-Masse — der Rundgang meldete so 16 bis 18 Scheinbefunde je Route,
mit 14 s waren es null. Frist am GUTEN Fall bemessen.


### [2026-09-07] AUTO DARF NIE IN EINER SACKGASSE ENDEN — FRISCHER AUSWEIS UEBERALL, RUECKFALL AUF DEN SERVER-WEG (job_mobil_vollbild_dock_20260907)

Capsule: `task-capsules/2026/09/job_mobil_vollbild_dock_20260907/capsule.json`.

**Befund:** Der stille Refresh (v794) heilte nur den Bruecken-Weg. Die Auto-Wahl
(`ai/modellRouter.js`) las weiter den alten Ausweis aus localStorage — nach zehn
Minuten 401 und "bitte ein Modell von Hand waehlen" (fuenf Betreiber-Screenshots).
Ohne Cline-Schluessel (409) gab es gar keinen Rueckfall.

**Entscheidung:** Jeder Weg, der einen Ausweis mitschickt, liest in DERSELBEN
Reihenfolge: sessionStorage (frisch) > eigener Schluessel > localStorage; bei
401/403 genau einmal erneuern und wiederholen. Scheitert Auto aus einem anderen
Grund als der Anmeldung, gibt `runClineChat` `false` zurueck und app.js nimmt den
Server-Weg mit dem Haus-Modell. Ein Fehlertext, der dem Nutzer Arbeit auftraegt
("von Hand waehlen"), ist kein zulaessiger Endzustand.

**Verifikation:** modell-router.test.mjs mit Aufruf-Protokoll (select alt ->
/me -> select frisch), 55/55 Tests; modellRouter.js live (Klon 3e0978c),
chatClient.js seit 12:35 UTC live (Start-Lock-Stempel per Doppelklick, SW smejj-shell-v795).

### [2026-09-07] STANDALONE-WEBKIT: NACH DER TASTATUR EINMAL REFLOW ERZWINGEN (job_mobil_vollbild_dock_20260907)

**Befund:** Schwarzer Balken unten in der installierten iOS-App. Der Layout-
Viewport schrumpft beim ersten Oeffnen der Tastatur und waechst bis zum Neustart
nicht zurueck; position:fixed, 100dvh und der Rahmen haengen daran. Kein CSS
heilt das — die vier CSS-Anlaeufe der Vorwoche (html-Gefaelle, body::before mit
Ueberstand) konnten nur den Grund faerben, nicht den Viewport zurueckholen.

**Entscheidung:** `pwa-schnellstart.js` (laeuft in index.html UND willkommen.html)
erzwingt nach focusout/visualViewport-resize einen synchronen Reflow, nur im
Standalone und nur bei >= 20 px Schwund, hoechstens drei Nachfass-Versuche.
Groesste Hoehe wird nur ohne offene Tastatur gemessen.

**Verifikation:** pwa-vollbild-heilung.test.mjs 5/5; live; SW smejj-shell-v795
live seit 12:35 UTC. BEWIESEN 16:51 im iPhone-17-Pro-Simulator (installierte
Web-App, Bildschirmtastatur auf/zu): kein Balken, Inhalt bis zur Unterkante.

### [2026-09-07] TOUCH-ZIELE 44 PX AUCH UEBER 600 PX — POINTER:COARSE STATT BREITE (job_mobil_vollbild_dock_20260907)

**Befund:** Die 44-px-Regel galt nur bis 600 px und im flachen Querformat. Tablets
(800 px) und gedrehte Handys (863 px) bekamen das Schreibtisch-Mass: Seitenleiste
36, Chat-Zeilen 28, Reiter 42, Schreibfeld-Knoepfe 38, Code-Leiste 30 px.

**Entscheidung:** `kompakt.js` (laeuft ueberall, ohne Marke im Precache) traegt einen
Block `@media (min-width:601px) and (pointer:coarse)` mit Mindesthoehen 44 px fuer
alle Ziele. Der Zeiger entscheidet, nicht die Breite — die Maus am Schreibtisch
bleibt unberuehrt. Jede Modulaenderung braucht den CACHE_NAME-Sprung (Start-Lock).

**Verifikation:** touch-ziele.test.mjs; Pixel Tablet nach SW-Reset Seitenleiste 44 px;
Runde 2 gestempelt (SW v797), Runde 3 gestempelt (SW v798, ~17:05) — Tablet danach ohne Ziele unter 44 px.

### [2026-09-07] SAFE-AREA TRAEGT GENAU EIN ELEMENT; LAUFZEIT-STIL SCHLAEGT GESPERRTES BUENDEL (job_mobil_vollbild_dock_20260907)

**Befund (Emulator + iPhone-Screenshots):** 68 pt Leere unter dem Dock = die
untere Safe-Area lag doppelt (Huelle aus mobil-composer.css + Feld aus kompakt.js
bzw. code-feld-unten.js). Code-Leiste brach in zwei Zeilen, Platzhalter in zwei
Zeilen, Start-Feld wuchs bis 324 px.

**Entscheidung:** `mobil-dock.js` (Laufzeit-Stil, Haken beiHandy in
chat-actions-menu.js, Precache-Eintrag) — die Huelle traegt die Safe-Area
allein; Code-Leiste nowrap mit Ellipsen (Rechnung 340 < 368 px); Felder bis
148 px; Verlauf overscroll-contain + smooth; overflow-x clip statt hidden.
Spaeter eingehaengter Stil gleicher Spezifitaet gewinnt gegen die aelteren
Laufzeit-Module.

**Verifikation:** Pixel 7 nach SW-Reset: Start-Dock 102 px, Code-Dock 102 statt
147 px, Leiste 44 px in einer Zeile, alle Ziele 44x44; mobil-dock.test.mjs 8/8.

### [2026-09-07] SAFE-AREA NUR IN DER INSTALLIERTEN APP SICHTBAR — ECHTE APP IN SIMULATOR UND EMULATOR TESTEN (job_responsive_qa_20260907)

Capsule: `task-capsules/2026/09/job_responsive_qa_20260907/capsule.json`.
**Entscheidung.** Mobil-QA laeuft gegen die ECHTE App: iOS-Web-App vom Home-Bildschirm (iPhone-17-Pro-Simulator) und die signierte Android-TWA (com.smejj.app, Pixel-7- und Pixel-Tablet-Emulator, per adb forward + Chrome-DevTools abgefragt) — nicht gegen den Browser. Jede eigenstaendige Seite mit `viewport-fit=cover` traegt `env(safe-area-inset-*)`; Waechter `tests/mobil-safe-area.test.mjs` in check:frontend.
**Begruendung.** Im Browser sind die Safe-Area-Werte 0 — drei Fehler (Logo unter der Uhrzeit auf willkommen.html, Marke hinter der Dynamic Island auf den Auth-Seiten, 439-px-Leiste auf programmieren.html) waren dort unsichtbar und in der App sofort da. 152 Messpunkte der Browser-Messung hatten null Befunde.
**Verifikation.** Live nachgemessen (Frontend-Klon dbcb53c): iOS-App Logo unter der Statusleiste, Android innerWidth = scrollWidth = 412 auf 14 Seiten, Tablet 800/834 einzeilige Leiste. Offen: auth.css unter Security-Lock — Doppelklick `smejj.com Anmeldeseite Safe-Area stempeln und ausliefern.command`.


### Ausgelagert 2026-08-26 (Volltexte: `docs/memory/Memory_Bank_2026-08-26_archiv_runde3.md`)

- [2026-08-18] 800-Zeilen-Regel: Modell-Menue herausgeloest (job_modul_modellmenue_20260818) — zentrale Verdrahtung sichtbarer Knoepfe, nie in Nachlade-Module.
- [2026-08-19] Kostenarchitektur: sieben Hebel, keine Deckel (job_kostenarchitektur_20260819).
- [2026-08-15] Eine Wahrheit fuer 'Ist die KI nutzbar?' (job_chat_rueckfall_ampel_20260815) — Chat-Rueckfalltext bei gruener Ampel.
- [2026-08-18] Modell-Menue, Bilder, Video und Auto-Router (job_modelle_medien_20260818).

## Aeltere Eintraege

Die datierten Eintraege vom 2026-07-28 bis 2026-08-05 stehen vollstaendig in
[Memory_Bank_Archiv_bis_2026-08-05.md](Memory_Bank_Archiv_bis_2026-08-05.md)
(ausgelagert am 2026-08-20 wegen der 800-Zeilen-Regel, nichts geloescht).
Die Eintraege vom 2026-07-28 bis 2026-08-11 (zweite Runde) stehen in
[Memory_Bank_Archiv_2026-07-28_bis_2026-08-11.md](Memory_Bank_Archiv_2026-07-28_bis_2026-08-11.md)
(ausgelagert am 2026-08-25, nichts geloescht).

### Ausgelagert 2026-09-02 (Volltexte: `docs/memory/Memory_Bank_2026-09-02_archiv_runde4.md`)

- 2026-08-19 `zeichne is not defined`, 2026-08-20 Verlauf schlank / Startgewicht, 2026-08-23 V11 komplett, Autopiloten-Seite (Grau ist zweierlei), Chat-Grenze 500, Kontokennung-Alias, Sync-Waechter, Nutzerreise USA — je Datum, Capsule und Kernlehre im Archiv.

### Ausgelagert 2026-09-03 (Volltexte: `docs/memory/Memory_Bank_2026-09-03_archiv_runde5.md`)

- [2026-08-31] Zentraler API-Bereich im OpenRouter-Layout (job_api_zentrum_20260831) — hidden verliert gegen Autoren-display; i18n-Regexe auf RAW-UTF8; Klon live oft neuer als App-Repo.
- [2026-09-02] Probe-Nutzer 3 h rot: Bruecke 503 bei 429/429, Schnellspur zeigte auf abgeschaltetes Groq-Modell (job_bruecke_schnellspur_20260902) — Router-Zweitversuch, v147, Zhipu-Basis-URL.

### Ausgelagert 2026-09-03, Runde 6 (Volltexte: `docs/memory/Memory_Bank_2026-09-03_archiv_runde6.md`)

- [2026-08-25] Sprachwelle iPhone: iOS ging immer in den Tipp-Fallback (job_vollaudit_20260825, Nachtrag) — `!RecognitionCtor` ist auf iOS IMMER wahr, Ohr-Solo hing an zwei spaeteren Stellen; Ohr-Solo ZUERST, ctx.resume gegen suspended, sw v709; Fake-Audio-Messfalle (--disable-features=AudioServiceOutOfProcess).
- [2026-08-25] Vollaudit: /code war auf allen Domains tot bei 64 gruenen Ampeln (job_vollaudit_20260825) — Import-Zeile MITTEN in einem import-Statement (Einfuegen nach Zeilennummer), kein Pruefer parst die Auslieferung; seitdem check:modul-syntax in check:frontend, Nutzerreise-Waechter Nr. 29 (sw v698); Menue kann nur, was der Chat kann.
- [2026-08-23] Modell-Liste 100 % gesichert, zwei Schloesser (job_modellliste_lock_20260823) — Betreiber-Anordnung im Wortlaut; Dateisperre check-modell-menue-lock (sechs Dateien byte-genau, Tag stand-2026-08-23-modellmenue-lock) + Live-Ampel gegen den Cline-Katalog; die Liste steht NICHT im Code.

### Ausgelagert 2026-09-04, Runde 7 (Volltexte: `docs/memory/Memory_Bank_2026-09-04_archiv_runde7.md`)
- [2026-09-03] 2026-09-03 — Volltext im Archiv.
- [2026-09-02] A-bis-Z-Live-Test: Bündel-Abgleich hatte src/ mitgerissen — Volltext im Archiv.
- [2026-09-02] Z.ai Coding-Paket braucht die Coding-Adresse — Volltext im Archiv.
- [2026-09-02] smejj 1.1 freigegeben; Fragen-Erfassung angeschlossen; zwei Ketten, zwei Noten — Volltext im Archiv.

- [2026-09-03] Web-Vitals-Wache rot: das Netz UND ein echter Seitenbefund — `chat-store.js` wurde zweimal geladen (Import ohne `?v=`); TTFB/LCP-Rot war das Betreiber-Netz.
- [2026-09-03] Web-Vitals Runde 2+3: UX-Haken und Verlaufs-Helfer laden erst bei Bedarf (job_a_bis_z_20260902, Nachtrag 17).

### Ausgelagert 2026-09-08, Runde 8 (Volltexte: `docs/memory/Memory_Bank_2026-09-08_archiv_runde8.md`)

- 2026-09-02 — Fragen-Erfassung END-ZU-END LIVE: Verweise statt Schlüssel, Sonde in /api/health (job_a_bis_z_20260902, Nachtrag 3) — Volltext im Archiv.
- 2026-09-02 — UI/UX-Programm Nr. 1–3 live: Knopf statt Tipp, 44-px-Ziele, Fehler mit Handlung (job_a_bis_z_20260902, Nachtrag 4) — Volltext im Archiv.
- 2026-09-02 — UI/UX Nr. 5 live; Lehre: die App schickt `task`, die Brücke `messages` (job_a_bis_z_20260902, Nachtrag 5) — Volltext im Archiv.
- 2026-09-02 — UI/UX Nr. 4 live: Woerter unter den Symbolen ohne Bruch der Ein-Zeilen-Regel (job_a_bis_z_20260902, Nachtrag 6) — Volltext im Archiv.
- 2026-09-02 — UI/UX Nr. 10: Rueckgaengig statt Bestaetigung beim Chat-Loeschen (job_a_bis_z_20260902, Nachtrag 7) — Volltext im Archiv.
- 2026-09-02 — UI/UX Nr. 9: Erste-Schritte-Karten nur fuer Nutzer ohne Gespraeche (job_a_bis_z_20260902, Nachtrag 8) — Volltext im Archiv.
- 2026-09-03 — Code-Feld 126 px ueber dem Rand: geratene Hoehe statt Flex (job_a_bis_z_20260902, Nachtrag 10) — Volltext im Archiv.
- 2026-09-03 — Kompakt-Programm Stufe 1: Abstaende halbiert, Buendel-id schlaegt Klassenregel (job_a_bis_z_20260902, Nachtrag 11) — Volltext im Archiv.
- 2026-09-03 — Nr. 6 Wurzel: nicht der Merker, die Arbeitsflaeche (job_a_bis_z_20260902, Nachtrag 12) — Volltext im Archiv.
- 2026-09-03 — Kompakt Stufe 2 und Verlauf ganz unten (job_a_bis_z_20260902, Nachtrag 13) — Volltext im Archiv.
- 2026-09-03 — Wartetext im Verlauf gespeichert (job_a_bis_z_20260902, Nachtrag 14) — Volltext im Archiv.
- 2026-09-03 — iPhone: Welle in Zeile drei, Statusleiste als Balken (job_a_bis_z_20260902, Nachtrag 15) — Volltext im Archiv.
- 2026-09-03 — Kaskade Nr. 7+8+15 lief per Doppelklick, brach an einer Dateiliste (job_a_bis_z_20260902, Nachtrag 16) — Volltext im Archiv.
- 2026-09-03 — Betriebswache und CVE-Runde: Touch-Chip behoben, protobuf zu, transformers zweimal live gescheitert (job_a_bis_z_20260902, Nachtrag 18) — Volltext im Archiv.
- 2026-09-03 — A-bis-Z-Pruefung: 12 Katalogpunkte gemessen, 7 Befunde behoben, check:all EXIT 0, live v735 (job_a_bis_z_20260903, Nachtrag 19) — Volltext im Archiv.
- 2026-09-04 — Anhaenge Stufe 2 (PDF, Office, Tonspur) und check:all wieder EXIT 0, live v750 (job_anhaenge_stufe2_und_checkall_20260904) — Volltext im Archiv.
- 2026-09-04 · Adminbereich: Nummern, Logo-Knopf, Zieh-Griff — und warum er langsam war (job_admin_nummern_logo_20260904) — Volltext im Archiv.
- 2026-09-04 · Tempo und Gewicht: preconnect live, Startgewichts-Waechter gebaut (job_admin_nummern_logo_20260904, Nachtrag 2) — Volltext im Archiv.

### Ausgelagert 2026-09-18, Runde 9 (Volltexte: `docs/memory/Memory_Bank_2026-09-18_archiv_runde9.md`)

- 2026-09-04 — 100%-SCHUTZ ALS NUMMERN-MANIFEST, NICHT ALS DATEI-HASH; ADMIN-MENUE NUMMERIERT; LOGO IST DER KNOPF (job_admin_nummern_logo_20260904) — Volltext im Archiv.
- 2026-08-31 — ADMIN-NAV: WIRKUNGS-GEWICHTETE REIHENFOLGE (4 STUFEN) + NUMMERN-KUERZEL 1-28; KONSOLEN-DEPLOY-WEG DREI KOPIEN (job_admin_reihenfolge_20260831) — Volltext im Archiv.
- 2026-08-31 — HANDY-TRENNLINIE = DESKTOP-HAARSTRICH: MOBIL-KORREKTUR GEHOERT IN mobil-composer.css, SW-STEMPELPFLICHT BEI BUENDEL-DATEIEN (job_sidebar_trennlinie_20260831) — Volltext im Archiv.
- 2026-08-26 — TAUBE WEB-SPEECH FAELLT IMMER AUFS OHR + OX ALPHA NR. 3 (job_vollaudit_20260825, dritte Nachtrunde) — Volltext im Archiv.
- 2026-08-23 — SEITENGEWICHT 335,6 -> 256,6 KB (job_seitengewicht_20260823) — Volltext im Archiv.
- 2026-08-23 — ANTWORTZEIT 46 s -> 1 s — ES LAG NIE AM MODELL (job_antwortzeit_20260823) — Volltext im Archiv.
- 2026-08-23 — CHAT HING — NUR EINE STROMFAMILIE WAR BEWACHT (job_chat_stille_20260823) — Volltext im Archiv.
- 2026-08-23 — MEMORY_BANK BEWACHT SICH JETZT SELBST (job_memory_bank_waechter_20260823) — Volltext im Archiv.
- 2026-08-23 — DER ROTE PRESIGN-TEST WAR EINE VERALTETE ZUSAGE (job_presign_test_20260823) — Volltext im Archiv.
- 2026-08-23 — "REQUEST TOO LARGE" IST 413, NICHT 500 (job_http_413_20260823) — Volltext im Archiv.
- 2026-08-23 — ZEHN CHATS WAREN NICHT GESICHERT — BESTAND GERETTET (job_chats_zu_gross_20260823) — Volltext im Archiv.
