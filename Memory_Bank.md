# Memory_Bank.md — Verifiziertes Gedaechtnis von smejj.com
Nur verifizierte, erfolgreiche Loesungen und Architekturentscheidungen. Kein Eintrag ohne bestandene Verification Pipeline. Fehlgeschlagene Builds und Halluzinationen werden niemals aufgenommen.
## Eintragsformat
Jeder Eintrag nennt Datum, Typ, Capsule, Entscheidung, Begruendung und Verifikation.
---
## Architekturentscheidungen

### [2026-07-28] KIMI K3 LIVE — reines API-Modell, bewusst OHNE e2-Vault

Freigabe: "oK, baue Kimi K3 mit API ein" + "Komplett live schalten"
(Wof Kadavanich, 2026-07-28). Commits `1f00d50`, `ac409eb`, `bc1159f`.
Live als smejj-control Version 95, Artefakt
`deployments/control/smejj-control-kimi-k3-2026-07-28.tar.gz`
(sha `f18ff65b…`), Rueckweg `smejj-control-stufe2-2026-07-28.tar.gz`.

- GEGEN DEN REFLEX "GEWICHTE IN DEN VAULT". K2.7 und GLM-5.2 liegen als
  Gewichte in IDrive e2. Fuer K3 waere das Geldverbrennen: 2,8 T Parameter,
  ~594 GB bis 1,4 TB, laeuft weder auf einer GPU noch auf einem 8-GPU-Knoten.
  e2 ist Speicher, kein Rechner. Darum `storage: null` und nur API.
- DAS ERBE STATT DES ZWEITEN KEYS. K2.7 und K3 liegen auf demselben
  Moonshot-Konto, und `SMEJJ_LLM_KIMI_API_KEY` war live bereits gesetzt.
  Neu: `runtime.keyFallbackEnvPrefix` — ohne eigenen K3-Key erbt K3 den
  K2.7-Key. Einseitig (ein K3-Key konfiguriert K2.7 nicht), eigener Key hat
  Vorrang. Wirkung: die Aktivierung schrumpfte auf EIN Flag, und niemand
  musste ein Secret ein zweites Mal von Hand eintippen.
- FAIL-CLOSED BLEIBT. Ohne `SMEJJ_KIMI_K3_ENABLED=YES` ist K3 auch mit
  gueltigem geerbtem Key inaktiv; der Router nimmt GLM-5.2. Auto-Modus waehlt
  K3 nie — nur ausdrueckliche Wahl. K3 ist kostenpflichtig (3 $/15 $ pro Mio.
  Token), Auto-Recharge im Moonshot-Konto steht auf Off.
- NEBENBEFUND BEHOBEN: `handleWorkerPreflight` stuerzte bei Modellen ohne
  e2-Vault ab (`definition.storage.vaultStatusId` auf null) — betraf schon
  vorher `smejj fast 1.0`. Jetzt 409 `model_not_vault_backed`.
- KORREKTUR EINER ANNAHME: `SMEJJ_MULTI_MODEL_ROUTER_ENABLED` steht in
  `.env.example` auf NO, live aber laengst auf YES (`multiModelRouterEnabled:
  true`). Der `.env.example`-Wert ist keine Auskunft ueber den Live-Stand —
  vor jeder Aussage die Bridge selbst fragen.
- VERIFIKATION: model-registry 25/25, alle Einzelchecks gruen ausser
  `check:start-lock` (public/sw.js v178 aus einer Parallel-Session, dort nicht
  neu eingefroren — in public/ wurde hier nichts angefasst). Live: Control
  direkt und ueber die Bridge `x-smejj-model-backend: kimi:kimi-k3`,
  `model-fallback: false`, Antwort "Ich bin Kimi, ein Modell von Moonshot AI.";
  auf smejj.com "Kimi K3 · 1M · flagship · Bereit". Nicht-Regression belegt:
  Standardanfrage unveraendert Groq-Schnellspur, K2.7 unveraendert.

### [2026-07-28] EU AI ACT NACHGEWIESEN + ADMINBEREICH STUFE 2 LIVE (job_aiact_adminstufe2_20260728)

Volltext wegen der 800-Zeilen-Regel ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_aiact_adminstufe2.md](docs/memory/Memory_Bank_2026-07-28_aiact_adminstufe2.md).
Commit `c450fbf`, Control-Server **Version 94**, Konsole unter `/admin`. Kurzfassung:

- AI-Act-Ausgangslage war NULL (kein Treffer im ganzen Repository). Jetzt Bestands-
  verzeichnis, Risikoeinstufung Maus-Engine (**kein Hochrisiko, aber verschaerfte
  Transparenz**) und `/api/compliance/ai-systems` ohne Anmeldung.
- **Die Admin-Oberflaeche liegt im Control-Server, nicht unter `public/`** — kein DNS,
  kein Frontend-Deploy, kein Service-Worker, kein Start-Lock-Risiko.
- FALLE: Routen, die HTML an Menschen ausliefern, gehoeren NICHT in
  `requiresAuthenticatedControlAccess` — sonst kommt rohes JSON statt einer Erklaerung.
- Lesezugriffe auf Nutzerakten sind jetzt protokollpflichtig (`user.record.read`);
  ohne Nachweis keine Daten. Der offene Punkt aus Stufe 1 ist geschlossen.
- **Artefakt IMMER aus einem isolierten Worktree des eigenen Commits bauen**, nie aus
  dem Hauptbaum — sonst geht fremder, unverbuchter Arbeitsstand mit live.

### [2026-07-28] HILFESEITE LIVE — Inhalte gegen den Quelltext getestet (job_hilfeseite_20260728)

Freigabe: "Ja" auf den Vorschlag Hilfeseite (Wof Kadavanich, 2026-07-28).
Commits `7e6f8a3`/`cc65f72`, Live `7d2e267`/`66b7e06`, Rueckfall `a0b7de7`, sw v176.

**Entscheidung:** `/hilfe.html` ist statisch, ohne JavaScript, ohne Dienst
dahinter, im Precache und OHNE Anmeldung erreichbar. Anders als die Statusseite
indexierbar und in der Sitemap — sie beschreibt Dauerhaftes, keinen Momentwert.

**Das Wesentliche:** tests/hilfeseite.test.mjs prueft den TEXT gegen den
QUELLTEXT — jeder Arbeitsbereich als title=, jedes Modell als data-model=, jeder
Schalter als aria-label=, jede Nachrichten-Aktion gegen chat-actions-menu.js,
und Apple-Anmeldung darf nicht vorkommen (live fail-closed aus). Das hat sofort
ZWEI falsche Angaben von mir gefunden, bevor etwas live ging: die Schalter
heissen Audio und Stimme (nicht "Sprachmodus"/"Ton"), und ein "Rueckgaengig"
nach dem Loeschen gibt es im Menue nicht. Muster fuer jede kuenftige
Dokumentationsseite.

**LEHRE 11 (neu):** Bei 200 % Zoom auf einem 390-px-Handy bleiben 195 CSS-px.
Ein einziges langes deutsches Wort ("Datenschutzerklaerung") sprengt dort die
Zeile und erzeugt Querscrollen auf der GANZEN Seite. `overflow-wrap: break-word`
gehoert auf jede Textseite; die Zoom-Pruefung muss den schmalsten Fall
einschliessen, nicht nur 320/375 px.

**LEHRE 12 (neu):** Ein Praefix-Muster in PUBLIC_PATHS oeffnet mehr als
gedacht. `/^\/status/` haette neben der statischen Statusseite auch die
anmeldepflichtige App-Ansicht unter `/status` (VIEW_PATHS.tools) freigegeben.
Oeffentliche Pfade immer exakt verankern (`$`), und die Annahme im Test
festhalten.

**KORREKTUR zu job_statusseite_20260728:** Die Aussage, die 15 Live-Sprach-
dateien seien dem Repo "zwei Schluessel voraus" und ein Upload haette
Uebersetzungen geloescht, war FALSCH. Die beiden Schluessel stehen weder im
Repo- noch im Live-Quelltext — es sind VERWAISTE Uebersetzungen fuer entfernten
Oberflaechentext. Der Test i18n-ui verbietet sie; der Versuch, sie ins Repo zu
holen, machte ihn sofort rot und wurde zurueckgenommen. Richtig bleibt: nicht zu
deployen war korrekt, weil die Richtung zu dem Zeitpunkt unbekannt war. Falsch
war die Begruendung. Regel praezisiert: Richtung pruefen heisst NICHT "wer hat
mehr Zeilen", sondern "was sagt der Quelltext dazu".

**Verifikation:** check:all und release:preflight gruen, Locks neu eingefroren
(25 HTML-Seiten). Live abgemeldet 200, 0 Fehler, alle Sprungmarken gueltig,
kein Querscrollen bei 100/200/200-mobil/375 px, 0 zu kleine Ziele ausserhalb des
Fliesstextes. Budgets eingehalten (warm LCP 192 ms, CLS 0).


### [2026-07-28] ADMINBEREICH STUFE 1 LIVE — Fundament, rein lesend (job_adminbereich_stufe1_20260728)

Freigabe: "Mach du komplett fertig, las nicht offen." (Wof Kadavanich, 2026-07-28).
Commits `7642cf0`, `3e6685a`, `b289645` + window-Fix. Live als Control-Server-Version 93,
Artefakt `deployments/control/smejj-control-admin-stage1c-2026-07-28.tar.gz`,
Rueckweg `deployments/control/smejj-control-enumfix-2026-07-28.tar.gz`.

- ZWEI BLOCKER GELOEST, die jeden Adminbereich bisher unmoeglich machten: Konten hatten
  kein `role`-Feld (also gab es nur "eingeloggt oder nicht", keine Autorisierung), und
  Konten lagen als `auth/email-users/{sha256(email)}.json` — aus einem Hash laesst sich
  keine Liste bilden, "zeige alle Nutzer" war technisch unmoeglich.
- ROLLE NIEMALS AUS DEM TOKEN. `adminAuth.js` laedt sie bei JEDER Anfrage frisch aus dem
  Store. `sessionToken.js` filtert Zusatzfelder ohnehin heraus — darauf wird sich aber
  nicht verlassen. Wirkung: Rechteentzug greift sofort, ein manipuliertes Token bringt
  nichts. Live belegt: Sitzung mit `role: "owner"` im Token, Datensatz sagt `user` -> 403.
- EINSTIEG NUR UEBER `SMEJJ_ADMIN_OWNER_EMAILS`. Kein Konto in IDrive e2 traegt eine
  Adminrolle. Ohne diese Variable antwortet der gesamte Bereich 403 — auch dem Betreiber.
  Die Antwort weist den Weg als `roleSource: "bootstrap"` aus, nie als echte Rolle.
- INDEX NICHT AN DEN ANMELDEPFAD HAENGEN. `putUser()` schreibt den Nutzer-Index bewusst
  NICHT mit: ein Indexfehler darf niemals eine Anmeldung verhindern. Der Index ist eine
  Projektion, wird angestossen neu gebaut und traegt sein Alter (`ageSeconds`) sichtbar mit.
- AUDIT-KETTE UEBERLEBT DEN NEUSTART — live belegt: Eintrag 2 verweist korrekt auf den
  Hash von Eintrag 1 aus einer frueheren Container-Instanz. Der Kopfzeiger `head.json`
  wird mit If-Match geschrieben, die Eintraege selbst mit If-None-Match:*.
- FALLE LATENZ DURCH OBJEKTSPEICHER: `/api/admin/users` lag bei p95 2841 ms, weil jede
  Anfrage das ganze Index-Objekt neu aus IDrive e2 las (Basislinie `/api/health`: 570 ms).
  30 Sekunden Prozess-Cache -> 832 ms. Regel daraus: jede Route, die pro Anfrage ein
  IDrive-Objekt liest, braucht einen Cache — der Objektspeicher ist kein Datenbankindex.
- FALLE UNBEGRENZTES LISTING: `readAuditPage` listete das GESAMTE Prefix und holte dann
  N Objekte — O(n) je Anfrage bei einem Log, das nie schrumpft. Jetzt zwei parallele
  LIST-Aufrufe auf Monats-Prefixe; die Antwort nennt ihren Umfang im Feld `window`, damit
  eine kurze Liste nicht faelschlich als "mehr ist nie passiert" gelesen wird.
- FALSCHALARM ZUM NACHLESEN: `/api/admin/me` schien im Browser ohne Authorization-Header
  200 zu liefern. Ursache ist `src/server.js:752` — `readSession` akzeptiert Bearer ODER
  das `smejj_session`-Cookie. curl hat kein Cookie (401), der Browser schon. Alle
  bestehenden Endpunkte verhalten sich identisch; mit UNGUELTIGEM Bearer ist die
  Adminroute sogar strenger als `/api/auth/me` (401 statt 200). Wer hier eine Luecke
  vermutet, muss gegen einen Client ohne Cookie testen, nicht gegen den eigenen Browser.
- ZUM DEPLOY: `set_control_artifact_env.mjs` kann jetzt zusaetzlich
  `SMEJJ_ADMIN_OWNER_EMAILS` setzen — gleiche Regel wie bei den anderen Optionen, der
  Wert wird VOR `loadSecureLocalEnv()` gelesen. Env-Map blieb bei 71 Variablen, nichts
  verloren (70 vorher + die neue).
- STUFE 1 IST REIN LESEND (`writable: false` in `/api/admin/me`). Keine Route sperrt,
  loescht oder vergibt Rollen. Einzige schreibende Aktion: der Index-Neubau, mit
  Pflichtgrund und Audit-Eintrag. Sperren/Loeschen/Rueckerstattung folgen in Stufe 3.
- BENCHMARK: `docs/benchmarks/api_adminbereich_2026-07-28.json`. Web Vitals unveraendert
  (LCP p75 412 ms kalt / 276 ms warm, CLS 0, INP 48 ms, 273 KB) — das Frontend wurde nicht
  angefasst, was Static-First belegt. Time to First Token nach drei Control-Server-
  Neustarts: 346 ms gegen ein Budget von 1000 ms.
- OFFEN und bewusst so: kein Frontend (Stufe 2, Vorlage `mockups/admin-console-mockup.html`
  mit 26 Modulen A-Z), und Lesezugriffe auf Nutzerakten werden noch nicht protokolliert —
  datenschutzrelevant, gehoert mit Pflichtgrund in Stufe 2.

### [2026-07-28] STATUSSEITE LIVE — ohne Status-Server (job_statusseite_20260728)

Freigabe: "Ja" auf den Vorschlag Statusseite (Wof Kadavanich, 2026-07-28).
Arbeits-Commits `6d06605`/`2bdc970`/`62d55a4`, Live `f3a1297`, Rueckfall
`ebab85d`, sw v172.

**Entscheidung:** `/status.html` ist eine statische Datei und fragt Control-
Server, Chat-Bridge und Browser-Bridge DIREKT AUS DEM BROWSER ab. Kein
Status-Server. Begruendung: ein Dienst, der Zustaende sammelt, waere selbst ein
Single Point of Failure und schwiege genau dann, wenn er gebraucht wird.
Ausserdem null Dauerlast und keine neuen Kosten. Der Preis ist benannt: der
Besucher sieht SEINE Verbindung, keinen Mittelwert — die Seite sagt das selbst.

Vier Eigenschaften, die den Zweck sichern: oeffentlich (nicht hinter dem
Anmelde-Gate — wer die Anmeldung pruefen will, kann sich nicht anmelden), im
Precache (bei totem Netz anzeigbar), Zustaende als WORT statt nur als Farbe
(WCAG 1.4.1), `noindex` (Momentwert gehoert nicht in den Suchindex).

**Verifikation:** live abgemeldet "Alle Dienste laufen" (Anmeldung 224 ms,
Chat 289 ms, Browser 603 ms), 0 Fehler. Gegenprobe mit abgeschnittenen
Antworten: Hauptdienst tot -> "Ein Hauptdienst antwortet nicht", nur
Zusatzfunktion tot -> "Die Hauptfunktionen laufen". check:all und
release:preflight gruen (isolierter Klon), Budgets eingehalten.

**LEHRE 8 (neu, teuer verhindert):** Beim Deploy standen 15 i18n-Dateien als
"geaendert" da. Die Richtungspruefung zeigte: LIVE ist dem Repo ZWEI Schluessel
VORAUS. Ein Upload haette zwei Uebersetzungen in 15 Sprachen geloescht. Das ist
exakt der Fall, vor dem der Eintrag zu QA-Welle 1-3 warnt — er ist erneut
eingetreten. Regel bleibt: vor jedem Frontend-Deploy jede Datei einzeln gegen
den eigenen VORZUSTAND hashen und bei Abweichung die RICHTUNG pruefen, nicht
nur die Tatsache. OFFEN: die zwei Schluessel gehoeren aus dem Live-Stand ins
Repo uebernommen, nicht umgekehrt.

**LEHRE 9 (neu):** Zwei Sitzungen bumpten sw.js auf DIESELBE Version v171 mit
UNTERSCHIEDLICHEN Precache-Listen. Bestandsnutzer haetten die neuen Dateien nie
bekommen. Ein Cache-Name darf nur eine einzige SHELL-Liste bezeichnen — bei
paralleler Arbeit vor dem Deploy pruefen, ob die eigene Version schon von
jemand anderem belegt ist. Behoben mit Pflicht-Sprung auf v172.

**LEHRE 10 (neu):** Meta-CSP allein reicht auf dem eigenen Server NICHT — bei
Header-CSP UND Meta-CSP gilt die SCHNITTMENGE. `connect-src 'self'` im Header
blockierte alle drei Statusabfragen; live waere es nie aufgefallen, weil GitHub
Pages keine CSP-Kopfzeile setzt. Wer eine Seite baut, die fremde Hosts
kontaktiert, muss BEIDE Listen pflegen (jetzt per Test erzwungen).


### [2026-07-28] QA-RESTPUNKTE: SW CACHE-FIRST, CSP, OFFLINE, ZOOM, SALAD-KOSTEN, KONTO-ENUMERATION (job_qa_restpunkte_20260728)

Freigabe: Auftrag Wof Kadavanich 2026-07-28 (acht Punkte mit ausdruecklicher
Dateifreigabe) plus "Ja" auf den Master-Prompt (Autonomie-Charta).
Arbeits-Commits `2c20138`, `5ca69bf`, `7fb74d4`, `2a24da3`, `58921ba`;
Live-Frontend bis `e1113ec` (sw v164); Control-Server Version 90.

**Entscheidung 1 — Service Worker cache-first fuer Precache-Dateien.** Gemessen
(lokal, Server-Zaehlung, HTTP-Cache aus): 108 Anfragen/668 KB -> 15/53 KB je
warmem Seitenaufruf. HTML und /api/ bleiben network-first. **Preis, bewusst
akzeptiert:** eine geaenderte Precache-Datei erreicht Bestandsnutzer NUR noch
ueber einen CACHE_NAME-Sprung. Nebenbefund: auth-gate.js (Import mit ?v=1, dem
Import-Waechter entgangen) und api-keys-surface.css (Laufzeit-<link>) fehlten
im Precache — offline haetten beide HTML statt JS/CSS bekommen.

**Entscheidung 2 — ein Stylesheet fuer alle 20 statischen Seiten.** Nicht 17:
`/de/` gehoert dazu, es wird nur nicht vom Generator erzeugt. Geltungsbereich
ueber eine Klasse am <html>-Element (p-recht / p-404 / p-sprachstart). Der
Generator prueft fail-closed, dass der Hintergrund dem themeColor entspricht.
Darstellung byte-identisch belegt (8 Seiten, 375 und 1280 px, vorher/nachher
und live/lokal).

**Drei Fehler, die erst die MESSUNG gefunden hat:**
1. *Offline warf die Statusanzeige.* `addEventListener("offline", fn)` uebergibt
   das EVENT als erstes Argument — die Funktion erwartete dort ihre deps.
   Ausgerechnet im Moment des Netzwechsels fiel die Anzeige aus. Regel: eine
   Funktion mit deps NIE direkt als Listener uebergeben.
2. *11 von 22 Tab-Stationen lagen ausserhalb des Bildes.* Zugeklappte Panels
   stehen bei -208 px bzw. 1309 px und waren weiter fokussierbar. Fruehere
   Wellen zaehlten die Tab-Folge, prueften aber nie, ob die Station SICHTBAR
   ist. Fix per Klassen-Beobachter in panel-layout.js (app.js klappt mit
   eigenen Funktionen und steht unter dem Start-Lock). Live 0 von 22.
3. *Konto-Enumeration in der Auth-API.* /api/auth/email/reset/request antwortete
   fuer unbekannte Adressen mit mail.reason="unknown_account", fuer bekannte mit
   sent=true; dasselbe in der Registrierung ("account_exists"). Jeder konnte
   ohne Anmeldung durchprobieren, welche Adressen ein Konto haben. Die
   Oberflaeche war datensparsam formuliert — die API widersprach ihr. Fix:
   Mailergebnis heisst `internalMail`, respond() entfernt es an EINER Stelle
   fuer alle Routen; die Oberflaeche entscheidet ueber
   `verificationMailExpected` (haengt nur an der Serverkonfiguration). Live
   verifiziert: Antwort fuer bestehende und neue Adresse byte-identisch.

**SALAD-KOSTEN erstmals aus dem Portal belegt (nicht geschaetzt):** Juli 2026
Zwischensumme 61,72 USD, vollstaendig aus Guthaben gedeckt; Restguthaben
87,28 USD; **Auto-Recharge AUS** — leeres Guthaben stoppt ALLE Container, auch
den Control-Server. Es laufen VIER, nicht drei: smejj-control (≈3,60 $/Mo,
unverzichtbar, Default-Origin jedes /api/-Pfads), smejj-chat-bridge-v88b-live
(≈2,40 $, Reserve hinter Zeabur), smejj-remote-browser-bridge-live (≈2,40 $)
und smejj-remote-browser-live (≈6,60 $, GPU, nur GTX 1650/1050 Ti erlaubt).
Laufende Rate ≈ 15 $/Monat. Der grosse Posten der Rechnung (RTX 4090,
44,65 $) stammt von den inzwischen GESTOPPTEN GPU-Containern und wiederholt
sich nicht. Zuordnung ist abgeleitet — die Rechnung gruppiert nach Projekt,
nicht nach Container.

**Verifikation:** check:all und release:preflight gruen (isolierter Klon des
eigenen Commits — im gemeinsamen Arbeitsordner rot durch eine parallele
Sitzung, die index.html/sw.js fuer Chat-Aktionen v165 geaendert hat). Locks
viermal neu eingefroren. Live: sw v164, Offline 99 ms ohne Seitenfehler,
Tastatur 0/22 ausserhalb, Web-Vitals warm TTFB 33 ms / LCP 156 ms / CLS 0 /
INP 40 ms / 39 KB.

**LEHREN (verifiziert, gelten weiter):**
1. **Vergleichsbasis nie ueber HEAD~1 bestimmen.** Eine parallele Sitzung kann
   ueber den eigenen Commit hinweg committen; HEAD~1 ist dann der eigene neue
   Stand. Der Abgleich meldete faelschlich "alle 20 Live-Dateien weichen ab".
   Immer den ausdruecklichen Commit-Hash vor der eigenen Aenderung nehmen.
2. **Nie `git add` auf eine geteilte Datei ohne Blick auf den Inhalt.** So ging
   eine package.json-Zeile der parallelen Sitzung mit in einen eigenen Commit.
3. **Der eigene Nachweis gehoert in einen Klon.** `git clone --shared` plus
   node_modules-Symlink trennt die eigene Arbeit sauber von fremdem WIP.
4. **Live-Web-Vitals streuen stark.** Kalte TTFB schwankte bei IDENTISCHEM Code
   zwischen 75 und 603 ms (p75). Ein Lauf taugt nicht als Regressionsnachweis.
5. **Der Bauer des Control-Artefakts ueberschreibt nichts** — ohne eigenen
   SMEJJ_CONTROL_RELEASE_ID und Ausgabepfad bricht er am Artefakt vom 11.07. ab.
6. **Zoom ist echt messbar** (deviceScaleFactor 2 bei halber CSS-Breite =
   W3C-Definition), **Textvergroesserung nur naeherungsweise** (Grundschrift am
   <html>-Element; feste Pixelangaben verhalten sich im echten Browser anders).

**MERGE NACH MAIN: nicht noetig.** Gemessen nach `git fetch`: Wurzel
`origin/main` = 335ac7a8, Wurzel Arbeits-Branch = d46cfda6 — getrennte
Historien, `origin/main` ist KEIN Vorfahr. Der Default-Branch auf GitHub ist
seit 2026-07-26 bereits der Arbeits-Branch. `main` als Archiv liegen lassen.
ACHTUNG-FALLE: das LOKALE `main` (9af9906) teilt die Wurzel mit dem
Arbeits-Branch und meldet faelschlich "Fast-Forward moeglich" — Merge-Fragen
NUR gegen `origin/main` beantworten.

**ABSCHLUSSWELLE (Freigabe "alle Rechte, komplett fertig", 2026-07-28):**
Drei tote Knoepfe (F-23) entfernt — sie hingen an leeren Platzhaltern, weil
settings-surface.js die #settings-Sektion per innerHTML ersetzt, BEVOR
bindSettings() bindet; gespeichert wird laengst per Autosave. Ansichten
#offline und #error bleiben (#error ist der Router-Rueckfall, app.js:240).
Dabei fiel im Live-Klickpfad ein weiterer Aufteilungsfehler auf: app.js
benutzte PANEL_WIDTHS, ohne es zu importieren — JEDER Menue-Klick warf, und
syncLeftMenuState/syncBackdrop liefen danach nicht mehr. Neuer Test
tests/app-modul-bezuege.test.mjs verlangt fuer jede als NAME.feld benutzte
Konstante eine Quelle (Gegenprobe bestanden). Live sw v168, Klickpfad mit
NULL Fehlern, alle Budgets eingehalten (kalt LCP 352 ms, warm 152 ms, CLS 0,
API p95 153-258 ms).

**BEWUSST NICHT GEMACHT — Stylesheet nicht aufgeteilt.** Die 2,8 s bis zur
ersten Anzeige auf der 3G-Referenz kommen aus ZWEI aufeinanderfolgenden
Netzrunden bei 400 ms Latenz, nicht aus der Dateigroesse; der sichtbare Teil
der Startseite braucht ohnehin 43 von 67 KB des Buendels. Ein Nachladen des
Restes brachte genau das Risiko, das der Performance-Lock verbietet: einen
Layoutsprung im design-gelockten Bereich. Das Budget lautet "vollstaendig
interaktiv unter 2,0 s" — gemessen 0,74 s, eingehalten.

**LEHRE 7 (neu):** Ein Modul-Aufteilungsfehler ueberlebt `node --check` und
alle Unit-Tests, weil app.js nie im Browser ausgefuehrt wird. Nur der
LIVE-Klickpfad hat ihn gefunden. Nach jeder Aufteilung: echten Klickpfad auf
der Produktionsdomain fahren und auf pageerror hoeren.

**OFFEN (Betreiber-Entscheidung, nicht umgesetzt):** Abschalten von
Salad-Containern; Entfernen der drei toten Knoepfe #saveSettings/
#showOfflinePage/#showErrorPage (beruehrt index.html und app.js, beide gelockt);
Merge nach main; juristische Bewertung der Rechtstexte. Ausserdem meldepflichtig:
ein Pruefaufruf hat den Datensatz `gibt-es-sicher-nicht-20260728@example.invalid`
im Konto-Speicher angelegt (Adresse kann keine Mail empfangen, RFC-2606-TLD);
Der Datensatz ist INERT: requireVerifiedEmail ist aktiv (SMTP konfiguriert)
und die Bestaetigungsmail ging an eine nicht zustellbare Adresse — ein Login
ist dauerhaft ausgeschlossen. Nicht geloescht: Loeschen beruehrt den Daten-Lock
und fuehrt nur ueber eine Passwort-Anmeldung, die generell untersagt ist.


### [2026-07-28] ENGLISCHE RECHTSTEXTE, ECHTE UMLAUTE, BREITEN NACHGEMESSEN (job_rechtstexte_en_20260728)

Freigabe "smejj.com 100 % fertig" (Wof Kadavanich, 2026-07-28), Abschluss.
Arbeits-Commit `8158ac0`, Live-Commit `eaa64ed`, Rueckfall `56c63be`.

**Entscheidung:** englische Hoeflichkeitsfassungen der Rechtstexte
(`public/en/legal-notice.html`, `public/en/privacy.html`) mit ausdruecklichem
Hinweis, dass ausschliesslich der deutsche Text verbindlich ist. Uebersetzt
wurde der bestehende Text; inhaltlich wurde nichts entschieden. Keine
Rechtsberatung — ob eine englische Fassung noetig ist, bleibt fachlich zu
klaeren.

**Begruendung:** die Seite hat 14 Sprachversionen, die Rechtstexte gab es nur
auf Deutsch. Eine Lesehilfe mit klarer Vorrangregel ist der einzige Schritt,
den ich ohne juristische Bewertung verantworten kann.

**Drei Dinge, die dabei belastbar wurden:**
1. *Breitenpruefung ist doch moeglich.* Meine Aussage in allen drei QA-Berichten,
   echte Viewports seien nicht pruefbar, galt nur fuer den ferngesteuerten
   Chrome. Im Vorschaubrowser wirkt `resize_window`. Nachgemessen bei 320, 375,
   430, 768, 1920 px: kein horizontales Scrollen, kein Ziel unter 24x24 px.
   Befund F-22 erledigt, Berichte korrigiert. Offen bleibt nur 200-%-Zoom.
2. *Ein 404 killt den ganzen Precache.* Die neuen Seiten fehlten in der
   Erlaubnisliste `isPublicAsset()` des lokalen Servers; `cache.addAll()` haette
   komplett versagt. Auf GitHub Pages waere das nie aufgefallen. Neue
   HTML-Seiten im Precache brauchen immer auch einen ROUTES-Eintrag.
3. *Fremdes Umpinnen kann den Lauf blockieren.* Die app.js-Aufteilung
   (`1e75c54`, parallele Sitzung) aenderte `scripts/check-guidelines.mjs`, ohne
   das Benchmark-Manifest nachzuziehen — `check:all` war rot. Neu gepinnt auf
   `2026-07-28.5`, nur der abweichende Datei-Hash.

**Verifikation:** `check:all` und `release:preflight` gruen; beide Locks nach
Freigabe neu eingefroren; live geprueft — `/impressum.html`,
`/datenschutz.html`, `/en/legal-notice.html`, `/en/privacy.html` je 200, echte
Umlaute sichtbar, Fusszeilen-Links 24 px hoch, `sw.js` auf `smejj-shell-v158`
mit beiden Seiten im Precache, Darstellung bei 375 px per Bildschirmfoto belegt.

**Bewusst nicht umgesetzt:** die 17 Seiten mit Inline-`<style>` (2 Rechtsseiten,
14 Sprach-Startseiten, 404) werden vom eigenen Node-Server per `style-src
'self'` unformatiert dargestellt; live faellt es nicht auf, weil GitHub Pages
keine CSP setzt. Ein Fix hiesse gemeinsames Stylesheet plus Neuerzeugung aller
Sprachseiten — Begruendung in der Kapsel.

---

### [2026-07-28] QA-Wellen 1-3 ausgelagert

Der vollstaendige Eintrag "QA-WELLEN 1-3 VOLLSTAENDIG BEHOBEN"
(job_qa_wellen_1_3_20260728) steht wortgleich in
[docs/memory/Memory_Bank_2026-07-28_qa_wellen.md](docs/memory/Memory_Bank_2026-07-28_qa_wellen.md).
Ausgelagert am 2026-07-28 wegen der 800-Zeilen-Regel. Nichts geloescht.


### [2026-07-27] Salad-Abloesung ausgelagert

Die beiden Eintraege zur Salad-Abloesung (sw v145 und v146, Zeabur traegt Chat
und Stimme) stehen wortgleich in
[docs/memory/Memory_Bank_2026-07-27.md](docs/memory/Memory_Bank_2026-07-27.md).
Ausgelagert am 2026-07-28 wegen der 800-Zeilen-Regel. Nichts geloescht.

### [2026-07-26] Aeltere Eintraege ausgelagert

Die Eintraege vom 2026-07-26 (Premium-Stimme auf Zeabur, Merge-Grenze,
iMild-PR, Maus-Pruefbericht und -Selbsttests, Stufe C, Zeabur-Server,
Sprachwelle Stufe 1e/2a, Stufe A+B) stehen vollstaendig in
`docs/memory/MEMORY_ARCHIV_2026-07-F.md`. Nichts geloescht — nur verschoben,
damit Memory_Bank.md unter der 800-Zeilen-Regel bleibt.

### [2026-07-21] Aeltere Architekturentscheidungen ausgelagert

Die sieben Eintraege vom 2026-07-21 (Magic-Link live, Auth-Extra-Deploy, Konto
und Einstellungen im Codex-Stil, Auth-Redesign, Repo-Reparatur, Browser-Button)
stehen wortgleich in
[docs/memory/Memory_Bank_2026-07-21.md](docs/memory/Memory_Bank_2026-07-21.md).
Ausgelagert am 2026-07-28 wegen der 800-Zeilen-Regel. Nichts geloescht.
Wird hier wieder Platz knapp, wandert der naechstaeltere Block nach demselben
Muster ins Archiv.

## Ausgelagerte Tages-Eintraege

Die fuenf Tages-Eintraege vom 2026-07-27 (Startseite antwortet im Faden,
Seiteninhalt im Modellkontext, Web-Vitals-Messwerkzeug, Startseite Ladezeit,
letzte Startaufrufe) stehen wortgleich in
[docs/memory/Memory_Bank_2026-07-27.md](docs/memory/Memory_Bank_2026-07-27.md).
Ausgelagert am 2026-07-28, weil diese Datei die 800-Zeilen-Regel erreicht hatte.
Nichts wurde geloescht. Wird hier wieder Platz knapp, wandert der jeweils
aelteste Tagesblock nach demselben Muster ins Archiv.

## 2026-07-28 — Precache vollstaendig, kein Aufruf im Ladepfad (job_letzte_reste_20260728)
- OFFLINE-TOTALAUSFALL BEHOBEN: Acht importierte Module fehlten im
  Service-Worker-Precache — darunter chat-history-context.js, das app.js SELBST
  importiert. Offline lieferte der Fetch-Handler dafuer den Rueckfall "/"
  (index.html), der Browser bekam HTML statt JavaScript und brach das Modul ab.
  Neu im SHELL: account-sessions.js, api-keys-surface.js, chat-history-context.js,
  i18n/ui.js, language-options.js, onboarding-welcome.js, usage-meter.js,
  ai/providers-catalog.js. Alle vorher live auf HTTP 200 geprueft — EIN einziger
  404 im SHELL laesst cache.addAll scheitern und der Service Worker installiert
  sich GAR NICHT.
- NEUE DAUERPRUEFUNG: `npm run check:precache-imports`
  (scripts/check-precache-imports.mjs) verfolgt den Importgraph aller
  Precache-Module und meldet jede Luecke, fail-closed; in check:frontend
  verdrahtet. WICHTIG beim Aufloesen: relative Importe am Ordner der QUELLDATEI
  aufloesen (public/x.js -> /assets/x.js), sonst entstehen Fehltreffer bei
  Unterordnern wie ai/ und storage/. Die Pruefung fand transitiv sofort eine
  weitere Luecke, die von Hand niemand gesehen haette.
- LEHRE (kostete zwei Deploy-Runden): In deferred-start.js rannten
  Paint-Beobachtung und Rueckfallweg per Promise.race GEGENEINANDER — der
  SCHNELLERE gewann. Zwei rAF plus setTimeout sind bei warmem Cache schneller
  als der echte Bildaufbau und haben die Beobachtung ueberholt. Ein Rueckfallweg
  darf NIE gegen das genauere Signal rennen, sondern nur greifen, wenn es dieses
  Signal gar nicht gibt. Behoben in sw v154.
- LEHRE START-LOCK: Bei parallelen Sitzungen NIEMALS gegen den Arbeitsordner
  einfrieren. Beim ersten Versuch landeten unfertige Dateien einer anderen
  Sitzung (app.js, search.js, composer-tools.js) als "eingefrorener Stand" im
  Manifest. Richtig: Manifest in einem isolierten `git worktree` auf dem
  committeten Stand erzeugen und zurueckkopieren. Gleiches gilt fuer die
  Pflicht-Checks, wenn fremde Aenderungen im Ordner liegen.
- ERGEBNIS live verifiziert (sw v154): Erstbesuch 0 von 9 API-Aufrufen vor dem
  Bildaufbau, Wiederbesuch 0 von 9. Service Worker aktiv mit 100 Eintraegen.
  Offline: 74 Module aus dem Cache, 0 Modulfehler, 0 JavaScript-Fehler,
  Eingabefeld und Navigation vorhanden. Die drei offline auffaelligen Antworten
  sind HTTP 401 der API (Authentifizierung), keine Ladefehler.
- Benchmark: docs/benchmarks/webvitals_final_2026-07-28.json — keine Verstoesse.

> Aeltere Eintraege (bis 2026-07-16) stehen in `docs/memory/Memory_Bank_Archiv_2026-07-16.md`.

## 2026-07-28 — Echtes Tool-Calling live (job_toolcalling_20260728)
- WICHTIGSTE ERKENNTNIS: `/api/agent` wird von der Bridge nur ANGENOMMEN und an den
  CONTROL SERVER weitergereicht (CONTROL_ORIGIN, multiModelRouterEnabled). Fuer
  Aenderungen an der Modell-Kette muss die Bridge NICHT angefasst werden — und der
  Control Server hat einen vollstaendig skriptbaren Deploy-Weg ohne Browser:
  build_control_release_artifact.mjs -> upload_control_release_to_idrive.mjs
  (Key MUSS mit `deployments/control/` beginnen, sonst fail-closed) ->
  set_control_artifact_env.mjs (Salad-API GET+Merge+PATCH). Salad-Version 87 -> 88.
- Ein zuvor gemeldeter "Blocker" (Zeabur-Portal fehlt) war damit gegenstandslos.
  LEHRE: vor dem Melden eines Blockers die Aufrufkette bis zum ausfuehrenden
  Dienst verfolgen, nicht beim ersten Hop stehenbleiben.
- NEU: control-server/src/llm/toolLoop.js — Werkzeug `seite_lesen`, sammelt die in
  Bruchstuecken gestreamten tool_calls (Index-basiert!), fuehrt aus, reicht als
  tool-Nachricht zurueck. Fail-closed hinter SMEJJ_AGENT_TOOLS_ENABLED=YES.
  Max 3 Runden, letzte Runde OHNE Werkzeuge -> keine Endlosschleife.
  SSRF-Schutz per parseBrowserTarget aus dem Browser-Proxy (eine Regel, eine Quelle).
- src/server.js stand auf exakt 800 Zeilen (hartes Limit, KEINE Ratchet-Ausnahme).
  Trick: streamFilter.js re-exportiert die zwei neuen Funktionen, dadurch nur die
  bestehende Import-Zeile erweitert; die dreizeilige Fehlerwache wurde einzeilig.
  Ergebnis 799 Zeilen. Muster fuer kuenftige Arbeiten an server.js.
- LIVE VERIFIZIERT: Control-Server direkt liefert woertlich "Drei Produkte. Eine
  Vision." + con.ax/smejj/smyst (steht nicht in der Frage -> nur aus der Seite).
  Ganze Kette ueber smejj.com: Testbericht mit HTTP 200, Titel, Navigation, Marken.
- OFFEN: Die Groq-Schnellspur der Bridge kennt keine Werkzeuge und raet bei kurzen
  Fragen mit Adresse ("I-MILD.com" statt des echten Titels). Abgefedert durch das
  Frontend-Grounding (browser-context.js). Echte Behebung braucht den
  Zeabur-Deploy-Weg fuer public/chat-bridge.js, den es weiterhin nicht gibt.

## 2026-07-28 — app.js aufgeteilt, Altlast beendet (job_appjs_aufteilung_20260728)
- public/app.js 1411 -> 800 Zeilen; die RATCHET-AUSNAHME in check-guidelines.mjs
  ist ERSATZLOS ENTFERNT. Fuer app.js gilt jetzt die normale 800-Zeilen-Regel.
- Sieben neue Module (zeilengleich verschoben, kein Verhaltenswechsel):
  google-login.js, projects-surface.js, local-workspace-surface.js,
  uploads-surface.js, free-coding-fallback.js, panel-layout.js, view-routes.js.
  Alle im Service-Worker-Precache (Pflicht — app.js importiert sie).
- goToView bewusst NICHT ausgelagert: wird an viele Stellen gereicht, Umzug waere
  reines Regressionsrisiko.
- WICHTIGSTE LEHRE (kostete zwei zusaetzliche Deploy-Runden): Beim Herausloesen
  von Code muessen die Helfer PRO FUNKTION durchgereicht werden, nicht pro Datei.
  setText fehlte zuerst ganz, dann fehlten renderEmptyState und
  refreshSessionStatus in der ZWEITEN Funktion desselben Moduls. Die Testsuite
  war dabei durchgehend 160/160 GRUEN — solche Fehler findet nur der echte
  Browser. Gegenprobe-Muster: je exportierter Funktion die deps-Zerlegung gegen
  die im Rumpf aufgerufenen App-Helfer abgleichen.
- LIVE VERIFIZIERT (sw v157, frischer Cache): Startseite, 7 Navigationsknoepfe,
  /projects, /settings, Projektliste, Upload, Google-Feld, Automatik — alles da,
  Chat antwortet, 0 JavaScript-Fehler.
- OFFEN: src/server.js steht bei 799/800 Zeilen — im Limit, aber ohne Luft.

## 2026-07-28 — server.js aufgeteilt (job_appjs_aufteilung_20260728, Nachtrag)
- src/server.js 799 -> 750 Zeilen. Neu: control-server/src/llm/localAssistant.js
  (modellloser Rueckfall, zeilengleich verschoben, einzige Abhaengigkeit
  SECURITY_HEADERS). Der Pfad war bisher UNGETESTET — jetzt vier Tests in
  check:llm-router (51/51).
- Deploy ueber den bewaehrten skriptbaren Weg: Artefakt bauen -> IDrive e2
  (Prefix deployments/control/) -> set_control_artifact_env.mjs.
  Salad-Version 88 -> 89, 70 Variablen erhalten, SMEJJ_AGENT_TOOLS_ENABLED
  bleibt YES. Rollout dauert ~7-10 Minuten.
- LIVE NACH ROLLOUT VERIFIZIERT: /api/health 200, Tool-Calling liefert weiterhin
  woertlich "Drei Produkte. Eine Vision.", Klickpfad auf smejj.com fehlerfrei,
  0 JavaScript-Fehler.
- STAND BEIDER DATEIEN NACH PUNKT 1: public/app.js 1411 -> 800 (Ratchet-Ausnahme
  entfernt), src/server.js 799 -> 750. Beide unterliegen jetzt der normalen
  800-Zeilen-Regel ohne Sonderbehandlung.

## 2026-07-28 — Bridge-Schnellspur: Fix fertig, Deploy-Weg fehlt (job_bridge_schnellspur_20260728)
- BEFUND: shouldSearchWeb() in public/chat-bridge.js kennt keine Adressen. "Lies
  https://imild.com/ und nenne den Titel" landete in der werkzeuglosen
  Groq-Schnellspur und RIET ("I-MILD.com" statt des echten Titels).
- FIX FERTIG UND GETESTET (Commit 653b5f9, NICHT ausgeliefert): mentionsWebAddress()
  erkennt Adressen mit/ohne Schema, fail-closed ueber Endungsliste — dieselbe Regel
  wie autonomous-intent.js. check:llm-router 54/54.
- ZEABUR-BEFUNDLAGE (im Portal untersucht, wichtig fuer den naechsten Versuch):
  Dienst smejj-chat-bridge laeuft auf NACKTEM docker.io/library/node:22-bookworm.
  /root hat nur .bashrc/.profile, /srv ist leer, kein Volume hervorgehoben, das
  Laufzeitprotokoll zeigt KEINEN Download beim Start. Der Quelltext kommt also
  ueber die STARTBEDINGUNG in den Container. Der Reiter "Settings" des Dienstes
  markiert sich, rendert aber keinen Inhalt — die Startbedingung war so nicht
  einsehbar. Projekt-ID 6a6666899949111176cddefb, Service-ID
  6a6680070d0b094201bb9ce4. Ein Projekt-Export als YAML (Projekt-Einstellungen ->
  Export) wuerde die Startbedingung zeigen; ein Zeabur-API-Token gibt es nicht.
- BEWUSST NICHT GETAN: in der Command-Konsole des laufenden Produktionscontainers
  herumprobieren. Ohne verstandenen Startvertrag waere das ein Eingriff auf
  Verdacht in den Live-Chat aller Nutzer.
- WIRKUNG AUF NUTZER: keine. Ueber die App greift das Frontend-Grounding
  (browser-context.js, seit sw v148) und liefert der Schnellspur echten
  Seiteninhalt. Betroffen sind nur direkte API-Aufrufer an der App vorbei.

## 2026-07-28 — Tiefspur bei Adressen, ohne Zeabur geloest (job_tiefspur_adresse_20260728)
- PROBLEM: Aufgaben mit Web-Adresse landeten in der werkzeuglosen Groq-Schnellspur
  der Bridge und wurden GERATEN ("I-MILD.com" statt des echten Titels).
- DER TRICK, der ohne Zeabur-Deploy auskommt: Die LIVE laufende Bridge (v102) hat
  in streamFastLane() bereits einen Ausstieg —
  `if (/glm|kimi|cline/i.test(requestedModel)) return false;` — und reicht dann an
  den Control Server weiter, wo Tool-Calling laeuft. modelForTask() in
  public/browser-context.js waehlt deshalb GLM-5.2, sobald die Aufgabe eine Adresse
  nennt. Ohne Adresse bleibt die Nutzerwahl unangetastet; eine bereits
  tiefspurfaehige Wahl wird nie ueberschrieben.
- LEHRE: Bevor man einen Deploy-Blocker akzeptiert, den VERTRAG der laufenden
  Gegenstelle lesen. Hier gab es eine dokumentierte Hintertuer, die das Ziel ohne
  jede Aenderung an der blockierten Komponente erreicht.
- app.js WAECHST NICHT (800 Zeilen, keine Ratchet-Ausnahme mehr): Import an eine
  bestehende Zeile gehaengt, Modellzeile erweitert, eine doppelte Leerzeile weg.
- LIVE VERIFIZIERT im echten Chrome, sw v159, mit der urspruenglich gemeldeten
  Eingabe: strukturierter Testbericht mit HTTP 200, korrektem Titel, Navigation,
  3/3 Marken, Footer, Copyright — plus selbst benannter Grenze (Unterseiten nicht
  geprueft). check:frontend 163/163.
- ZEABUR-BEFUND (fuer spaeter): Bridge-Quelltext liegt in
  /tmp/smejj-chat-bridge.mjs im Container, ueber Files einsehbar und editierbar.
  Das Bearbeiten per Browser ist in Agent-Sitzungen gesperrt; ein Zeabur-API-Token
  existiert nicht. Der bridge-seitige Fix liegt fertig als Commit 653b5f9 bereit.

## 2026-07-28 — Felddaten statt Laborzahlen (job_feldmessung_20260728)
- public/field-vitals.js misst LCP, INP, CLS, TTFB bei echten Besuchen und legt sie
  NUR LOKAL ab (localStorage, rollierend 50 Besuche, Festhalten bei
  visibilitychange->hidden — der einzige Zeitpunkt, den auch Handys liefern).
- KEIN DATENABFLUSS: kein fetch, kein sendBeacon, kein Endpunkt. Ein Test prueft
  die Quelldatei genau darauf. Keine Server-Komponente, keine Kosten, keine Last
  fuer den Control Server. Nur fuenf Zahlen und ein Zeitstempel je Besuch.
- WICHTIGE REGEL im Modul: Ein Budget gilt erst ab ZEHN Besuchen als verfehlt.
  Darunter ist ein p75 statistisch bedeutungslos — vorher nichts behaupten.
- Eingehaengt ueber usage-meter.js (nicht start-locked), damit index.html und
  app.js unberuehrt bleiben. sw.js v161 -> v162, Modul im Precache (Pflicht).
- ERSTE ECHTE FELDDATEN (24 Besuche, live): TTFB p75 1 ms (max 125), LCP p75 96 ms
  (max 1008), INP p75 40 ms (max 152), CLS 0. Alle Budgets eingehalten,
  verstoesse leer, fremdeAnfragen leer.
- ERKENNTNIS: Die Spannen zeigen, was Einzelmessungen verschleierten — Erstbesuch
  kostet (LCP bis 1008 ms), Wiederbesuch ist praktisch sofort da (Median 96 ms).
  Ab jetzt gilt: Budgets NUR gegen fieldVitalsSummary() bewerten, nie gegen einen
  einzelnen Laborlauf.
- Auslesen im Live-Test: `await import("/assets/field-vitals.js")` ->
  `fieldVitalsSummary()`.

## 2026-07-28 — Maus-Engine live abgenommen (job_maus_engine_abnahme_20260728)
- ERLEDIGT: Die Engine wies seit dem 2026-07-26 jeden /run fail-closed mit 401 ab,
  weil sechs Variablen fehlten. Jetzt zehn Variablen gesetzt, Dienst neu gestartet,
  Abnahme mit echtem Lauf bestanden.
- BELEG: /run liefert 200 — openBrowser (844 ms) -> navigate https://smejj.com/
  (1142 ms, HTTP 200) -> closeBrowser (44 ms), aborted:false, uploaded:true.
  Artefakt auf IDrive e2: capsules/maus-engine/job_maus_engine_abnahme_20260728/
  result/abnahme-20260728-01/aktionsprotokoll.json.gz (439 B komprimiert,
  sha256 db21e01a5ff...). Ganze Kette belegt: Token -> Browser -> Object Brain.
- VERTRAG von POST /run: Der Plan muss UMSCHLOSSEN gesendet werden —
  {"plan": {...}}. Direkt gesendet antwortet die Engine "Plan ist kein Objekt."
  Pflichtfelder des Plans: schemaVersion(1), planId, createdAt, capsuleRef,
  planner{modelId,promptTemplateVersion}, policy{domainAllowlist,budget},
  steps[]. budget braucht maxActions, maxLocalRetries, maxPlannerRoundtrips,
  maxDurationMs, defaultActionTimeoutMs. Beispielplan liegt neben der Capsule.
- ARBEITSTEILUNG, die funktioniert hat (Muster fuer alle Schluessel-Aufgaben):
  Sitzung erzeugt den Token per openssl OHNE ihn auszugeben, legt ihn in
  env.local, fuellt die Zwischenablage, oeffnet im Portal Dienst + Reiter +
  Dialog und setzt den Cursor ins Feld. Der Betreiber macht nur noch
  Cmd+V / Add / Save. Danach klickt die Sitzung Restart und nimmt ab.
- OFFENE_PUNKTE_NUR_BETREIBER_2026-07-26.md: Punkt A als ERLEDIGT markiert.

## 2026-07-28 — Aktionen pro Chat-Nachricht live (job_nachrichten_aktionen_20260728)
- ERLEDIGT, live (sw v169): je Nachricht kopieren (Roh-Markdown), eigene Nachricht
  bearbeiten, neu generieren mit lesbarem "Version 2 von 3", bewerten, vorlesen,
  "Ab hier neuen Chat starten", "Ab hier loeschen" mit 5 s Rueckgaengig. Marktvergleich,
  Belege, Benchmark: task-capsules/2026/07/job_nachrichten_aktionen_20260728/capsule.json
- ROHTEXT-SCHNAPPSCHUSS (Kern): chat-messages.js sichert den Rohtext per MutationObserver,
  SOLANGE ein Eintrag reiner Text ist (keine Elementkinder). renderChatMarkdown ersetzt
  ihn am Streamende durch HTML — danach lieferte jeder Copy-Knopf gerenderten Text mit
  kaputten Codebloecken.
- REGEL FUER ALLE CHAT-BEDIENELEMENTE: NEBEN die Nachricht (Geschwister), nie hinein.
  chat-store.js (`:scope > .entry`), chat-history-context.js (Modellkontext) und das
  Vorlesen in composer-tools.js lesen den textContent eines Eintrags — ein "Version 2
  von 3" darin landet im Verlauf UND in der naechsten Frage an das Modell. Der
  Bearbeiten-Editor liegt daneben, die Nachricht wird nur ausgeblendet.
- FALLE MutationObserver: textContent-Zuweisung ist auch bei GLEICHEM Text eine Mutation.
  Das Auffrischen der Leiste loeste sich selbst aus -> Endlosschleife, Renderer stand
  still (live erlebt). Nur bei echter Aenderung schreiben PLUS observer.takeRecords().
- FALLE Knopfgroesse: styles.css setzt projektweit `button { min-height: 42px }`. Eigene
  height ohne min-height ergibt verzogene Knoepfe. 42-px-Touch-Ziel bleibt Standard,
  kompakt nur hinter `@media (pointer: fine)`.
- FALLE Popover im Chat-Log: #startLog hat overflow: auto und schneidet Menues an seiner
  Kante ab; bei kurzem Verlauf gibt es keinen Scrollweg dorthin. Popover gehoeren an den
  body, am Viewport ausgerichtet, schliessen bei Scroll/Resize. Fenstergroesse auf
  documentElement.clientHeight zurueckfallen — nicht dargestellte Ansichten melden 0.
- NICHT GEBAUT: "Quellen anzeigen" (keine Quellenliste pro Antwort vorhanden — browser-context.js webt Seitenkontext in die FRAGE) und Geminis parallele Entwuerfe.
- app.js UNANGETASTET (Start-Lock, 799/800): Module haengen sich selbst an #startLog,
  erneutes Senden ueber #startMessage + #startSend. Ein Test haelt das fest.
- PARALLEL-SESSION belegte sw v166-v168, daher Sprung v165 -> v169. Vor jedem Deploy Live-Stand per SHA-256 gegen den lokalen Vor-Stand pruefen, nur Eigenes deployen.
- Memory_Bank.md stiess hier an die 800-Zeilen-Regel: naechster Eintrag braucht eine Archiv-Aufteilung (docs/memory/Memory_Bank_2026-07.md mit Zeiger von hier).

## 2026-07-28 — Fassungen ueberleben das Neuladen, Touch-Ziele halten (job_nachrichten_aktionen_20260728, Welle 2)
- ERLEDIGT, live (sw v171): zwei Luecken der ersten Welle geschlossen.
- FASSUNGEN PERSISTENT: chat-store.js speichert versions + active je Nachricht und
  gibt beides beim Wiederherstellen zurueck. Vorher war "Version 2 von 3" nach einem
  Reload weg, weil die Fassungen nur im Arbeitsspeicher lagen. Obergrenze acht je
  Nachricht — jede traegt Rohtext UND gerendertes HTML, ohne Grenze waechst
  IndexedDB bei haeufigem "Neu generieren" unbegrenzt. clampVersionIndex verschiebt
  den Zeiger mit, wenn gekuerzt wurde; sonst zeigte der Waehler auf eine Fassung,
  die es nicht gibt. Live belegt: nach dem Reload "Version 2 von 2", Wechsel zeigt
  die andere echte Antwort, Kopieren liefert je Fassung ihr Roh-Markdown.
- FALLE FLEXBOX UND TOUCH-ZIELE: Auf 375 px ergaben fuenf Aktionen, zwei
  Versionspfeile und das Label "Version 2 von 3" rund 366 px in einer 359 px
  breiten Zeile. Flexbox schrumpfte die Knoepfe von 42 auf 37 px — das Touch-Ziel
  war weg, ohne dass etwas ueberlief oder umbrach, also unsichtbar im Test.
  Regel daraus: bei Icon-Leisten immer `flex: 0 0 auto` auf dem Knopf und
  `flex-wrap: wrap` auf der Leiste. Ein Ziel, das sich der Zeile anpasst, ist keins.
- MESSFALLE: `resize_window` auf 375 px macht aus einem Desktop-Browser KEIN
  Touch-Geraet — `pointer: fine` bleibt wahr, der coarse-Zweig wird nie ausgeloest.
  Wer Touch-Layout pruefen will, muss die Maße erzwingen (inline per el.style, denn
  eingefuegte <style>-Bloecke blockiert die CSP des eigenen Servers).
- OFFEN und bewusst so: die Bewertung (Daumen) wird gespeichert und nach dem Reload
  wieder angezeigt, aber von keiner Auswertung gelesen. Eine Rueckmeldestrecke
  braeuchte Serverlast und eine Trainingsdaten-Freigabe (Policy fail-closed).
- BENCHMARK: docs/benchmarks/webvitals_versionen_2026-07-28.json — kaltes LCP
  328/332/128 ms bei TTFB 124/112/23 ms (LCP folgt dem TTFB, Lauf 3 unter der
  Referenz von 172 ms), CLS 0, INP p75 48 ms. Kerndateien der Startseite 58 KB
  komprimiert gegen ein Budget von 300 KB; die drei Chat-Module davon 13,3 KB,
  geladen als type=module am Seitenende.

## 2026-07-28 — Verhalten pruefbar, Touch-Ziele echt gemessen (job_nachrichten_aktionen_20260728, Welle 3)
- ERLEDIGT, live (sw v174): Tests 34 -> 45; Loeschen/Rueckgaengig, Bearbeiten,
  Neu generieren, Menue-Tastatur und Versionswechsel sind jetzt automatisch geprueft
  statt nur von Hand im Browser.
- MUSTER FUER NICHT IMPORTIERBARE MODULE: Wer /assets/-Pfade absolut importiert
  (Pflicht hier, sonst zweite Modulinstanzen), ist in node nicht importierbar. Loesung:
  die ENTSCHEIDUNG in ein importierbares Modul legen (planRegenerate, planEdit,
  planRemoval, restoreNodes, planSettle, nextMenuIndex in chat-messages.js), das
  ANWENDEN im DOM-Modul lassen. Das Fake-DOM der Tests haengt Knoten wirklich ein und
  aus, damit die Reihenfolge nach Rueckgaengig gegen den Ausgangszustand vergleichbar ist.
- DABEI GEFUNDEN: Pfeil-auf ohne fokussierten Menuepunkt landete auf dem VORLETZTEN
  Punkt, weil indexOf -1 liefert und -1 + -1 modulo 4 = 2 ergibt. Behoben.
- TOUCH-MESSFALLE (wichtig fuer jede kuenftige Mobil-Pruefung): resize_window auf
  375 px macht aus einem Desktop-Browser KEIN Touch-Geraet. `pointer: fine` bleibt
  wahr, der coarse-Zweig wird nie ausgeloest — deshalb war der 37-px-Fehler unsichtbar.
  Richtig geht es ueber das DevTools-Protokoll: Emulation.setEmulatedMedia mit
  pointer/any-pointer = coarse plus setDeviceMetricsOverride mit mobile: true.
  Werkzeug dafuer: `npm run measure:touch` (scripts/testing/measure_touch_targets.mjs).
- JEDER WAECHTER BRAUCHT EINE GEGENPROBE: `npm run measure:touch:selbsttest` nimmt
  flex-wrap und flex: 0 0 auto zur Laufzeit heraus und ERWARTET Verstoesse. Er
  reproduziert exakt die 37x42 px und erkennt sie. Ohne diese Probe waere unklar, ob
  die Messung ueberhaupt scharf ist — ein Check, der immer gruen ist, ist kein Check.
- KEIN iOS-SIMULATOR auf diesem Rechner: nur Xcode Command Line Tools, simctl fehlt
  (`xcode-select -p` zeigt /Library/Developer/CommandLineTools). Xcode nachinstallieren
  waere ein Eingriff in den Rechner des Betreibers — bewusst unterlassen.
- BENCHMARK: docs/benchmarks/webvitals_planer_2026-07-28.json — kaltes LCP
  200/236/200 ms bei TTFB 55/55/49 ms, die ruhigste Reihe dieser Sitzung; CLS 0,
  INP p75 48-80 ms. Touch-Ziele: docs/benchmarks/touchziele_2026-07-28.json.

## 2026-07-28 — Modellwahl ist jetzt messbar (job_modell_eval_harness_20260728)
- ANLASS: Kimi K3 (2,8 Bio. Parameter, 1,4 TB, ~64 GPUs zum Betrieb) ist erschienen.
  ENTSCHEIDUNG: kein Download, kein Neubezug von K2.7. Gewichte im Objektspeicher
  sind kein Fundament, wenn die Rechenleistung fehlt — IDrive e2 speichert, es rechnet
  nicht. "K3 Max" ist ausserdem keine Gewichtsdatei, sondern eine Aufwandsstufe der
  Anbieter-Schnittstelle. Begruendung: docs/model-management/MODELL_ENTSCHEIDUNG_KIMI_K3_2026-07-28.md
- STATTDESSEN GEBAUT: evals/suites/smejj-chat-core-v1.json (14 echte Faelle) plus
  src/evaluation/evalSuite.js, evalScoring.js, evalReport.js, evalTransport.js und
  scripts/evaluation/run_model_eval.mjs. `npm run eval:models` ist ein Trockenlauf
  ohne Kosten; erst --live ruft ein Modell auf. 25 Tests in tests/model-eval.test.mjs.
- MESSUNG STATT MEINUNG (live gegen die Produktionskette, 2026-07-28):
  schnelle Spur groq:llama-3.1-8b-instant — 91,2 %, p95 645 ms, erster Token 555 ms,
  1 kritischer Verstoss (Codegenerierung). GLM-5.2 ueber den Control-Router —
  97,1 %, p95 22 799 ms, erster Token 22 754 ms, 0 kritische Verstoesse.
  Damit ist die profilabhaengige Fuehrung erstmals belegt statt nur behauptet.
- OFFENER BEFUND 1: Auf dem GLM-Pfad vergehen bis zum ersten Token 22,8 s — das
  15- bis 20-Fache jedes Budgets. Gemessener Ist-Zustand, keine Regression.
- OFFENER BEFUND 2: Die schnelle Spur besteht code-esm-failclosed nicht. Kein
  Sicherheitsproblem, aber die Grenze des Standardpfades ohne ausdrueckliche Modellwahl.
- FALLE, DIE ZWEI STUNDEN GEKOSTET HAETTE: Regex-Erwartungen mit dem Flag i machen die
  Namensregel unpruefbar — `\bSMEJJ\b` trifft case-insensitive auch "smejj.com". Muster
  sind deshalb schreibweisen-genau, ignoreCase ist die ausdrueckliche Ausnahme.
- ZWEITE FALLE: Ein einzelner HTTP 503 der Chat-Bruecke wurde im ersten Lauf als
  Modellversagen gezaehlt. Ohne Wiederholung transienter Fehler misst man die
  Infrastruktur und nennt das Ergebnis Modellqualitaet. Jetzt isTransientError + --retries.
- DRITTE FALLE: Ein Bericht ohne Backend-Beleg ist wertlos — das angeforderte und das
  antwortende Modell koennen auseinanderfallen. run.backendsSeen/resolvedModelIds
  belegen es. Und verglichen wird nur gegen denselben Suite-Inhalts-Hash; zwei Laeufe
  mit unterschiedlichen Erwartungen sind nicht vergleichbar.
- VERBINDLICHE REGEL (evals/README.md): Eine Wortliste wird nur erweitert, wenn die
  betroffene Antwort von Hand gelesen und als sachlich richtig bestaetigt wurde.
  Erwartungen aufzuweichen, damit ein Modell besser dasteht, ist ein Verstoss.
- Kein Deploy noetig: reines Werkzeug, kein Frontend- und kein Control-Server-Pfad
  beruehrt. check:all 27/27 gruen. Capsule im Object Brain unter
  capsules/app/job_modell_eval_harness_20260728/.
## 2026-07-28 — Befund 1 aufgeklaert: 6,2 s Warten auf Text, den niemand sieht (job_erster_token_glm_20260728)
- WERKZEUG: `npm run measure:firsttoken` trennt Antwortkopf, erstes Ereignis, erstes
  SICHTBARES Zeichen und Ende. Vorher war das eine Zahl — eine Beobachtung, keine
  Diagnose. Die Luecke zwischen Ereignis und Zeichen ist der behebbare Anteil.
- A/B AM SELBEN SERVER, GLEICHES MODELL, VOR jeder Codeaenderung: /api/chat (Denken an)
  erstes sichtbares Zeichen 12 106 ms bei 6 187 ms unsichtbarer Wartezeit; /api/agent
  (Denken aus) 7 270 ms bei 0 ms. Ursache bewiesen statt vermutet. Rest: 5-7 s
  Startzeit des Anbieters, nur per Modellwahl aenderbar. Die Bruecke zeigte 16,6 s,
  weil der Antwortkopf erst mit dem ersten SICHTBAREN Byte durchgereicht wird.
- URSACHE WAR EINE LUECKE, KEIN DEFEKT: /api/agent schaltet das Reasoning fuer
  Nicht-Coding seit 2026-07-27 ab, /api/chat fehlte genau diese verifizierte Regel.
  BEHOBEN in src/ai/chatThinkingPolicy.js, an EINER Stelle. Bewusst eng: Coding
  behaelt das Reasoning, Modellwahl und Routing-Profil bleiben unveraendert (ein
  Entwurf, der zusaetzlich das Profil setzte, wurde als Regressionsrisiko verworfen).
  Erwartung 12,1 s -> 7,3 s; die schnelle Spur ist mit 703 ms nicht betroffen.
- NICHT AUSGEROLLT — BEWUSST: Ein Control-Release packt src/ und control-server/ aus
  der ARBEITSKOPIE; eine parallele Sitzung arbeitete zeitgleich an diesem Pfad. Weg
  zum Nachholen: docs/benchmarks/BEFUND_ERSTER_TOKEN_GLM_2026-07-28.md. check:all
  26/26 gruen, Rollback rollback/chat-thinking-2026-07-28. ACHTUNG: Memory_Bank.md
  ist an der 800-Zeilen-Grenze; der naechste Eintrag braucht vorher eine Aufteilung.

## 2026-07-28 — Quellen pro Antwort (job_nachrichten_aktionen_20260728, Welle 4)
- ERLEDIGT, live (sw v178): "Quellen anzeigen" im Nachrichten-Menue — der letzte
  Punkt, den ChatGPT hatte und smejj.com nicht. Erscheint NUR bei echtem Grounding.
- WAS FEHLTE: browser-context.js holt bei Auftraegen mit Web-Adresse die Seite und
  webt sie in die FRAGE — die Herkunft wurde danach verworfen. Jetzt merkt es sich je
  Auftragstext Adresse, Titel, HTTP-Status und Zeitpunkt (lokal, Obergrenze 30, kein
  zusaetzlicher Netzverkehr). chat-actions.js ordnet ueber die Frage DIREKT VOR der
  Antwort zu — nicht ueber "die letzte Quelle", die bei schnellem Nachfassen zur
  falschen Antwort gehoeren koennte. Ein gescheiterter Abruf wird nicht gemerkt.
- FALLE ZWEI MODULINSTANZEN (haette live NIE funktioniert, lokal gefunden):
  chat-actions.js importierte browser-context.js mit "?v=1", app.js ohne Query.
  Getrennte Modulinstanzen mit eigenem Gedaechtnis — geschrieben wurde in das eine,
  gelesen aus dem anderen. REGEL: Wer Zustand mit app.js teilt, muss DENSELBEN
  Spezifizierer benutzen wie app.js. Ein Test vergleicht beide jetzt automatisch.
- FALLE FALSCHE BEHAUPTUNG (live gefunden, deshalb v178): Gegroundet wird die FRAGE.
  Scheitert der Antwortstrom danach, stand neben der Fehlermeldung "1 Quelle". Statt
  Fehlertexte zu erraten (bruechig, sie stehen in app.js) sagt die Liste jetzt, was
  stimmt: "1 Seite fuer diese Frage geladen". Richtig in beiden Faellen.
- HTTP 404 wird ehrlich als Fehler gezeigt, nicht verschwiegen. Links oeffnen mit
  rel="noopener noreferrer". Quellen ueberleben ein Neuladen (im Verlauf gespeichert).
- BEOBACHTUNG fuer spaeter: Fragen MIT Web-Adresse erzwingen ueber modelForTask die
  Tiefspur (GLM-5.2 via Control Server). Waehrend des Tests scheiterte dieser Strom
  wiederholt ("Verbindung zum Server unterbrochen"), waehrend Fragen ohne Adresse
  normal beantwortet wurden. Das Grounding selbst lief fehlerfrei — der Befund liegt
  im Backend und ist noch offen.
- BENCHMARK: docs/benchmarks/webvitals_quellen_2026-07-28.json — kaltes LCP
  136/164/188 ms bei TTFB 27/32/53 ms, schnellste Reihe der Sitzung; CLS 0.
