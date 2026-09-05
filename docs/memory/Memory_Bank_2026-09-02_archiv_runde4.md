# Memory_Bank-Archiv Runde 4 (ausgelagert 2026-09-02)

Volltexte der Eintraege 2026-08-19 bis 2026-08-23 aus dem Abschnitt „Aeltere Eintraege“ der Memory_Bank.md. Unveraendert uebernommen.

## 2026-08-19 — LIVE-BEFUND: `zeichne is not defined` in code-flaeche.js

**Gemessen im Chrome des Betreibers gegen den ausgelieferten Stand
(`code-flaeche.js?v=41`, sw v582):** Beim Oeffnen der Code-Seite wirft
`initCodeFlaeche` dreimal `ReferenceError: zeichne is not defined`
(Zeilen 788/792/793 und 761).

**Ursache — dasselbe Muster wie die vier stillen Abstuerze vom 17.08.:**
Beim Auslagern des Modell-Menues nach `public/code-modell-menue.js`
(Commit bb675cd) wanderte `zeichne()` mit; die AUFRUFE blieben in
`code-flaeche.js` zurueck. Dort ist die Funktion weder definiert noch
importiert, und das Modul exportiert sie nicht.

**Konkrete Folge (live nachgemessen, nicht vermutet):**
- Die Kernfunktion LAEUFT: Senden, Log-Adoption und Antwort sind bewiesen
  ("Bereit" kam zurueck). Die Bindungen davor stehen.
- Kaputt ist der SCHWANZ von `initCodeFlaeche` nach dem ersten Wurf:
  der Gruss zieht den Profilnamen nicht mehr nach, und die Chips
  (Modell, Stufe, Projekt) aktualisieren sich nicht mehr bei Klicks.

**Warum hier NICHT behoben:** `code-flaeche.js` ist die aktive Baustelle
einer Parallelsitzung (Commit von eben). Ein Eingriff waere eine Kollision
mit laufender fremder Arbeit. Der Fix selbst ist klein: `zeichne` wieder
definieren oder aus dem Modul exportieren und importieren.

**Merkregel (jetzt viermal bestaetigt):** Nach JEDER Auslagerung eines
Moduls einmal `grep -n "<symbol>" alte-datei.js` gegen Definition UND
Import halten — und die Seite im Browser oeffnen. Kein Test faellt darauf,
weil die Tests den Quelltext lesen statt den Pfad auszufuehren.

## 2026-08-20 — Verlauf schlank, und ein toter Geraete-Sync kam ans Licht (job_verlauf_schlank_20260820)

Capsule: `task-capsules/2026/08/job_verlauf_schlank_20260820/capsule.json`, Volltext
wortgleich: `task-capsules/2026/08/job_verlauf_schlank_20260820/capsule.md`
(Object Brain: `s3://smejj-model-files/capsules/app/job_verlauf_schlank_20260820/`).
Tag `stand-2026-08-20-verlauf-schlank` auf `bb7c8e1`, Frontend live `44f35a5`.

Kern: `/api/chats?nurAbgleich=1` liefert nur id/updatedAt/ownerId; ein Chat wird
per `?id=` einzeln nachgeholt, und nur wenn er wirklich neuer ist. Der alte
Vertrag (GET ohne Parameter) bleibt fuer aeltere Clients. Gemessen: Seitengewicht
4.054 -> 1.174 KB, Chat-Verkehr 2.500 -> 15 KB, Einzelabrufe 14-24 -> 0,
Listen-Abruf 12.100 -> 2.330 ms; 100 Chats unversehrt, 31/31 Tests gruen.

DER EIGENTLICHE FUND, nicht behoben und entscheidungspflichtig: Server und Client
rechnen die Kontokennung verschieden (Server SHA-256 seit 15.08.,
`user_158c1e60…`; Client nach der alten Adressregel, `user_smejjcom_gmail_com`).
`gehoertNutzer` haelt die eigenen Chats fuer fremd, `importChat` gibt `false` —
der Geraete-Sync importiert nichts. Angleichen ist Rote Liste: `MAX_CHATS = 100`
wuerde `pruneOld()` ausloesen. LEHRE: Der Fehler war vorher genauso da, nur
unsichtbar; erst die schlanke Liste machte jeden Leerabruf einzeln sichtbar.


## 2026-08-20 — Startgewicht: die Code-Flaeche laedt erst beim Oeffnen (job_startgewicht_20260820)

Capsule: `task-capsules/2026/08/job_startgewicht_20260820/capsule.json`, Volltext
wortgleich: `task-capsules/2026/08/job_startgewicht_20260820/capsule.md`
(Object Brain: `s3://smejj-model-files/capsules/app/job_startgewicht_20260820/`).
Tag `stand-2026-08-20-startgewicht`, ausgeliefert mit `smejj-shell-v636`.

Kern: `code-nachladen.js` (1,79 KB) holt die Code-Flaeche erst, wenn `#code`
aufgeht — MutationObserver auf `#code.is-active`, NICHT IntersectionObserver.
Gewandert sind `code-flaeche.js` und `code-modell-menue.js`, netto 17,9 KB gzip
(sofort geladen 383 -> 365 KB). `app.js` blieb byte-identisch, weil die Funktion
sich selbst einhaengt. Noch offen: rund 128 KB gzip (Browser-Panel 59,9, Verlauf
38,2, Maus 10,8, Konto 7,6, Kamera 7,1, Sprache 4,3) — jede Verschiebung braucht
eine eigene Freigabe.

MESSFALLE ZUERST GEKLAERT: Der Service Worker liefert aus dem Vorrat, dann meldet
`performance.getEntriesByType` die ROHE Groesse und `transferSize: 0`
(chat-store.js: 40.711 B gemeldet, 13.048 B uebertragen). Gegen das 300-KB-Budget
zaehlen uebertragene Bytes, per gzip von aussen gemessen.

---

## 2026-08-23 — V11 komplett, Medien-Fix, und vier Pruefer, die nichts prueften

Volltext, wortgleich: [docs/memory/Memory_Bank_2026-08-23_v11_pruefer_medien.md](docs/memory/Memory_Bank_2026-08-23_v11_pruefer_medien.md).
Medien-Fix im Detail: `task-capsules/2026/08/job_chats_zu_gross_20260823/capsule.json`.
Benchmark: `docs/benchmarks/webvitals_2026-08-23_medien-fix-v651.json`.

Kern: 20 von 20 Bereichen im neuen Design, live (sw v645 -> v652). Der Bruch
zwischen Startseite und Rest war eine ueberfluessige SCHICHT
(design-cyan-views.css), keine schlechte Regel — geheilt durch Abraeumen.
Teuerster Befund: VIER Pruefer behaupteten etwas, ohne es zu messen
(assets/-Kopie pflegte kein Skript, alle sieben Sperren bewachten die QUELLEN
statt der Auslieferung, der Fokusring war nur gepinnt statt gerechnet — 1.86
gegen 3.0 gefordert, der Digest-Test prueft nur DASS ein Pin existiert). Daraus
`check:assets`, `check:auslieferung-lock` und `tests/fokusring-kontrast.test.mjs`.
Medien-Fix: zehn von 113 Gespraechen wurden NIE gesichert — readEntries()
speichert dasselbe Medium DREIFACH, und die Auslagerung sah nur den DOM;
Markdown-Bilder (`![Bild](data:…)`) sind kein Element. 141 von 141 Ressourcen
kamen aus dem Vorrat, 0 ueber Netz (Static-First-Beweis). Am Tagesende 8 von 8
Sperren gruen, 591 Tests. MERKREGEL: `check:favicon-lock` gehoert in JEDEN
Ship-Loop mit Frontend-Anteil — er fand einen Fehler, der acht Tage lang auf der
Landeseite stand.

## 2026-08-23 — Autopiloten-Seite: Grau ist zweierlei (job_autopiloten_seite_20260823)

- Umgesetzt auf dem BAU-BRANCH feature/auth-redesign-github-magiclink (dort liegt der Live-Code),
  nicht hier. LIVE: "3 melden sich nicht" im Register "Braucht dich"; Betriebswache = Nr. 42;
  Akten 01/02/05 ohne smejj-autopilot-jobs; Vorfälle mit aktuellem Namen.
- WURZEL: SMEJJ_AUTOPILOT_KEYS fehlt im Control-Server (503 autopilot_keys_missing) —
  nachziehen mit scripts/deploy/autopilot_schluessel_setzen.mjs (Bau-Branch) + control-neu-bauen.
- Capsule: docs/task-capsules/2026/08/job_autopiloten_seite_20260823/capsule.md (Bau-Branch).

## 2026-08-23 — Chat-Grenze 100 -> 500 + Index-Vollstaendigkeit (job_chat_grenze_500_20260823)

- LIVE: Server liefert 126/126 Chats (vorher 100), Frontend chat-store b60 / sw v659, Control 10:40:08Z.
- Index-Falle: nach Zeit "frisch", nach Inhalt unvollstaendig (121 von 126) — jetzt zaehlt auch die Menge.
- OFFEN (Rote Liste): 26 Chats mit ALTER Kontokennung bleiben abgewiesen; das pruneOld-Loeschrisiko
  dagegen ist mit 500 weg. Capsule: task-capsules/2026/08/job_chat_grenze_500_20260823/capsule.json

## 2026-08-23 — Kontokennung: Server-Alias, Geraete-Sync lebt wieder (job_kontokennung_alias_20260823)

- WURZEL seit 15.08.: Server stempelt SHA-Kennung, Client verglich Sitzungs-ID -> JEDER Server-Import fremd.
- LIVE: `konto` in GET /api/chats, Alias je Sitzung in chat-owner.js v3; Seitenleiste "Alle 126 Gespraeche".
- Messfalle: index.html 10 min aus HTTP-Cache -> alte Marken-Kette trotz neuem sw. Erst cache:'reload'.

## 2026-08-23 — Sync-Waechter (job_sync_waechter_20260823)

- LOKAL: `npm run check:sync-alias` (Stufe A Quellen, Stufe B live mit Probe-Token), in check:all.
- LIVE: Autopilot Nr. 43 "Sync-Waechter" (Bauzweig f992c61d), alle 30 min, prueft eigene API + AUSGELIEFERTE
  Client-Dateien; erste Ampel gruen 11:19:47Z. Ehrlichkeits-Waechter (Zaehler 35, MIT_ECHTER_MESSUNG) nachgezogen.

## 2026-08-23 — Nutzerreise als US-Neuling: 5 Stellen live verbessert (job_nutzerreise_usa_20260823)

- Registrieren/Anmelden ist kinderleicht (2 Felder, 5 Wege, Google 2 Klicks/6 s); verwirrend waren Sprache, Handy-Kopf, Magic-Link-Fehler.
- LIVE: en.js +155 Texte (Spur, Konto, Abo, API), Landingpage-Leiste 440->375 px, Magic-Link-Fehler 303 -> Anmeldeseite statt JSON.
- Messfalle: i18n-Cache — erster Lauf nach neuem en.js zeigt noch Deutsch, erst der ZWEITE Lauf ist uebersetzt.
- Freigabe per Karte: Wartetext bleibt im Cline-Pfad (chatClient v5, sw v662), live 12 ms bis 3,7 s gemessen.
- Rote Liste offen: Consent-Domain smejj-control.zeabur.app, Modell-Picker ohne Haekchen, Stopp-Viereck 11 px, Icon-Knoepfe ohne Text.
- Freigabe per Karte: eigene API-Domain api.smejj.com LIVE (CNAME bestand schon) — Google sagt jetzt "Weiter zu smejj.com";
  CSP additiv, Zeabur-Adresse bleibt Zweitzugang; OFFEN: GitHub-Rueckruf-URI traegt der Betreiber ein.
- Runde 2: Landeseite spricht die Sprache des Besuchers (willkommen-sprache.js, 82 Texte, fail-safe deutsch) — live en-US bewiesen.
- GEMESSEN: Auth-Gate (profile-dock.js, Skript 24/34) leitet Anonyme erst nach 3,7 s Desktop / 15 s iPhone um — Fruehstart-Gate in index.html braucht Start-Lock-Freigabe.
- Freigabe per Karte: fruehes Tor (auth-gate-frueh.js, erstes Skript im head) — Umleitung Anonymer 15 s -> 1,7 s iPhone, 3,7 s -> 0,13 s Desktop; Start-Lock neu eingefroren.

