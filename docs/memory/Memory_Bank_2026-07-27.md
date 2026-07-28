# Memory_Bank Archiv — Tages-Eintraege 2026-07-27

Ausgelagert am 2026-07-28 aus Memory_Bank.md, weil die Hauptdatei die
800-Zeilen-Regel (AI_Guidelines.md, scripts/check-guidelines.mjs) erreicht hatte.

NICHTS wurde geloescht oder geaendert — die Eintraege stehen unten wortgleich.
Die Architekturentscheidungen und alle Eintraege ab dem 2026-07-28 sind
bewusst in Memory_Bank.md geblieben; ausgelagert wurden nur die aeltesten
Tages-Eintraege, die jeweils ihre Task Capsule referenzieren.

## 2026-07-27 — Startseite antwortet im Faden (job_startseite_inline_20260727)
- Ein Auftrag im Startfeld wechselt NIE mehr die Ansicht. `routeAutonomousRequest`
  in `public/autonomous-intent.js` liefert immer `false`; der Chat-/Agent-Pfad in
  `app.js` antwortet im Gespraechsfaden. Der frueher erste Schritt
  `goToView("automation")` ist entfernt — das war die Ursache des Betreiber-Befunds
  "geh browser iMild.com teste ob alles fehlerfrei ist?" → Sprung auf /automation.
- Werkzeuge sind jetzt Karten im Faden: erkannte Web-Ziele oeffnen die eingebettete
  Browser-Leiste rechts (`smejj:browser-request`), der autonome Lauf erscheint als
  Angebotskarte `[data-run-offer]` und startet erst auf Klick. Reihenfolge im
  Klick-Handler bleibt zwingend: erst `goToView("automation")`, dann
  `smejj:autonomous-request` — sonst fuellt die Automatik ein unsichtbares Formular.
- URL-Erkennung akzeptiert jetzt Adressen ohne Schema (`iMild.com` →
  `https://imild.com/`), fail-closed ueber eine TLD-Allowlist. Damit bleiben
  Dateinamen (`app.js`), Versionen (`smejj 1.0`) und Satzreste (`morgen.Danach`)
  ausgeschlossen. Regressionsschutz: `tests/autonomous-intent.test.mjs` (8 Faelle),
  verdrahtet in `check:frontend`.
- WICHTIG — Frontend-Deploy geht doch per CLI: die macOS-Keychain
  (`credential.helper = osxkeychain`) hat SCHREIBRECHT auf
  `https://github.com/SmejjCom/smejj-app-frontend`. Klonen, Datei kopieren,
  committen, `git push origin main` — fertig. Der SSH-Deploy-Key
  (`~/.ssh/smejjcom_github_ed25519`) kann das NICHT (nur smejj.com-app). Der
  Web-Editor-Umweg mit Cmd+A/insertText ist damit ueberfluessig. Beim Deploy
  zusaetzlich `CACHE_NAME` in `sw.js` erhoehen (jetzt `smejj-shell-v147`), sonst
  liefert der Service Worker Bestandsnutzern die alte Datei.
- Live verifiziert: Eingabe bleibt auf `https://smejj.com/`, imild.com rendert in
  der rechten Leiste, Modell antwortet im Faden, keine Konsolenfehler.
  Rollback: Tag `rollback/startseite-inline-2026-07-27`, live `71c4e99`.
- OFFEN: (a) TTFB live 0,36–1,38 s gegen Budget 200 ms — Bestandsbefund, nicht
  durch diese Aenderung verursacht. (b) Stufe 2 (Automatik als echtes Werkzeug im
  Tool-Calling statt Regex-Vorfilter) beruehrt `app.js` und braucht eine
  Start-Lock-Freigabe. (c) Das Modell weiss noch nichts vom Inhalt der
  Browser-Leiste und antwortet daher "Ich kann keine Webseiten aufrufen" —
  ebenfalls Stufe 2.

## 2026-07-27 — Seiteninhalt im Modellkontext (job_stufe2_browserkontext_20260727)
- Nennt eine Aufgabe eine Webadresse, laedt `public/browser-context.js` die Seite
  ueber den BESTEHENDEN Proxy `/api/browser/fetch` und setzt Titel, HTTP-Status und
  Textauszug (max 4000 Zeichen) als Kontextblock VOR die Aufgabe. Damit ist der
  Satz "Ich kann keine Webseiten aufrufen" verschwunden; live liefert das Modell
  jetzt einen echten Pruefbericht (HTTP 200, Titel, Navigation, Marken, Footer)
  UND benennt von sich aus, was es aus reinem Seiteninhalt nicht pruefen kann
  (JavaScript-Fehler, CSS-Rendering, Link-Ziele, Ladezeit).
- Fail-closed: ohne Proxy-Urteil bleibt die Aufgabe unveraendert. Ein echter
  Fehlerstatus (404/500) wird dagegen weitergereicht — genau das braucht "teste ob
  alles fehlerfrei ist". Ergebnis wird je Aufgabe gemerkt, damit die zwei
  Sendewege (Client-Chat, dann Server-Stream) nur EINMAL laden.
- RATCHET-REGEL BEACHTET: `public/app.js` waechst nur um +1 Zeile (Import). Die
  zwei Aufrufstellen wurden nur erweitert (`task` -> `await groundTask(task)`).
  Baseline in `scripts/check-guidelines.mjs` 1404 -> 1405, mit Freigabe-Wortlaut
  dokumentiert. Muster fuer kuenftige app.js-Arbeiten: Logik IMMER in ein eigenes
  Modul, app.js bekommt hoechstens den Import.
- `firstSafeUrl` ist jetzt aus `autonomous-intent.js` exportiert — eine
  URL-Erkennung fuer Browser-Leiste UND Modellkontext, keine zweite Regel.
- sw.js v146 -> v148 (v147 war der reine Live-Stand aus Stufe 1, hier nachgezogen);
  `browser-context.js` im Precache. Start-Lock nach den Aenderungen neu eingefroren
  (31 Dateien, 2026-07-27T23:16:58.536Z), Backup unter backups/start-design-lock/.
- MESSWERTE (erste vollstaendige Messung, Vergleichsbasis): TTFB 3-136 ms, CLS 0,
  INP 112 ms, Startseite 60 KB gzip — alle im Budget. LCP 3304 ms VERFEHLT das
  1,5-s-Budget; Verdacht: spaet gerenderter Chat-Verlauf, nicht diese Aenderung.
- KORREKTUR zur Capsule job_startseite_inline_20260727: der dort als "verfehlt"
  gemeldete TTFB (0,36-1,38 s) stammte aus `curl` gegen den Ursprungsserver OHNE
  Service Worker. Echte Nutzer erleben 3-136 ms. Fehlbefund zurueckgezogen.
  MESSREGEL daraus: Web-Vitals immer im echten Browser messen, nie per curl.
- MESSGRENZE: In einem ferngesteuerten Chrome-Tab zeichnet Chrome FCP/LCP oft NICHT
  auf (Werte bleiben leer, weil der Tab nie sichtbar gerendert wurde). Fuer
  belastbare LCP-Zahlen einen echten Vordergrund-Ladevorgang oder Lighthouse nutzen.
- OFFEN: (a) LCP sauber nachmessen und Ursache pruefen. (b) Echtes Tool-Calling
  (Modell waehlt Werkzeuge selbst, `tool_calls` im Stream) beruehrt den
  Control-Server/die Chat-Bridge auf Zeabur und ist freigabepflichtig.

## 2026-07-27 — Web-Vitals-Messwerkzeug (job_webvitals_messung_20260727)
- `npm run measure:vitals` misst LCP, TTFB, CLS, INP und Seitengewicht in echtem
  Chrome headless ueber das DevTools-Protokoll. NULL neue Pakete: Chrome ist
  installiert, Node 22+ bringt WebSocket mit (`scripts/testing/cdp-client.mjs`,
  121 Zeilen). Puppeteer/Playwright wurden bewusst NICHT genommen — je ~150 MB
  Chromium in node_modules, unvereinbar mit der Kilobyte-Regel und dem
  empfindlichen Google-Drive-Git-Index.
- DER ALARMWERT LCP 3304 ms WAR EIN ARTEFAKT. Kein Nachlauf reproduziert ihn.
  Entstanden in einem ferngesteuerten Tab mit wiederhergestelltem Chat-Verlauf.
- DREI MESSFEHLER, die man kennen muss (alle im Skript behoben): (a) mehrere
  Laeufe im selben Chrome-Profil sind ab Lauf 2 NICHT kalt — Cache, Service
  Worker und Cache Storage vorher leeren; (b) neu laden waehrend der Service
  Worker noch installiert laesst den Wiederbesuch langsamer aussehen als den
  Erstbesuch — auf `navigator.serviceWorker.controller` warten; (c) ein Klick auf
  feste Koordinaten trifft nichts — gezielt `#startMessage` anklicken, sonst
  bleibt INP leer.
- STABIL ueber alle Laeufe: CLS 0, INP 40-48 ms, 242 KB kalt / 39 KB warm,
  LCP-Element ist das H2 (Text, kein Bild). LCP/TTFB SCHWANKEN stark
  (LCP p75 488-1624 ms kalt, TTFB 48-775 ms) — ein einzelner Mac an einem Netz
  ist KEINE p75-Feldmessung. Aus diesen Zahlen laesst sich kein Budgetbruch
  belastbar ableiten. Benchmark: docs/benchmarks/webvitals_smejj_2026-07-27.json
- curl-Aufschluesselung: DNS 2 ms, TCP 37-134 ms, TLS 88-327 ms, reine Serverzeit
  60-110 ms, GitHub Pages liefert per Fastly-Edge mit x-cache HIT. Der Server ist
  schnell; die Zeit geht in den Verbindungsaufbau.
- HARTER BEFUND (reproduzierbar): 103 Anfragen beim Erstbesuch, davon 45 VOR dem
  ersten Bildaufbau; 16 Stylesheets (37 KB) und 37 JS-Module (54 KB). Die acht
  render-blockierenden Stylesheets starten bei ~822 ms und sind erst bei
  1452-1531 ms fertig. Nicht die Bytes bremsen, sondern die Dateianzahl.
- ARCHITEKTURVERSTOSS BELEGT: Beim Seitenstart laufen fuenf Control-Server-Aufrufe
  (/api/auth/me, /api/auth/config, /api/health, zwei Modell-Status), je 1,4-1,9 s.
  Die Regel "Control Server steht nie im Pfad des normalen Seitenaufrufs" ist
  damit verletzt; bei Lastspitzen trifft es den kleinen 2-vCPU-Server zuerst.
- OFFEN, beide freigabepflichtig (beruehren index.html/Design-Lock): Anfragen
  buendeln; Startaufrufe an den Control Server nach hinten verschieben.

## 2026-07-27 — Startseite Ladezeit (job_ladezeit_20260727)
- STYLESHEETS GEBUENDELT: `npm run build:start-styles` erzeugt public/start-styles.css
  aus den acht unveraenderten Quelldateien in exakt der bisherigen Reihenfolge
  (Reihenfolge IST die Kaskade). index.html laedt eine Datei statt acht. Sicher,
  weil keine der acht @import oder url() nutzt — das Skript prueft das und bricht
  sonst ab. `npm run check:start-styles` verifiziert das Buendel fail-closed gegen
  die Quellen. KEIN Bundler fuer JavaScript (vom Betreiber ausgeschlossen).
- CONTROL SERVER AUS DEM LADEPFAD: public/deferred-start.js wartet zwei
  Bildwechsel plus eine Leerlaufphase, dann laufen die fuenf Startaufrufe.
  BEWUSST FAIL-SAFE, NICHT FAIL-CLOSED: in einem unsichtbaren Tab gibt es keine
  Bildwechsel, dort greift ein Notausgang nach 3 s — sonst bliebe die
  Anmeldeanzeige im Hintergrund-Tab dauerhaft leer.
- MESSERGEBNIS vorher/nachher (je 7 Laeufe, p75): kalt LCP 1536 -> 368 ms,
  FCP 1536 -> 368 ms, Anfragen 102 -> 96; warm LCP 284 -> 168 ms. Kein Budget
  verletzt. Der LCP-Gewinn ist belastbar (sieben Runden weniger im kritischen
  Pfad); die TTFB-Differenz liegt im Netzrauschen und ist KEIN Verdienst der
  Aenderung — nicht als Erfolg verbuchen.
- BELEG fuer die Architekturregel: FCP kalt 592 ms, kein einziger der neun
  API-Aufrufe davor. Warm FCP 128 ms, die fuenf verschobenen starten bei 136 ms.
- app.js blieb bei EXAKT 1405 Zeilen (elf Zeilen durch zehn ersetzt, Import als
  elfte). Ratchet-Baseline unangetastet — das Muster funktioniert.
- ERZEUGTE ARTEFAKTE von der 800-Zeilen-Regel ausnehmen: public/start-styles.css
  steht jetzt in IGNORED_PATHS von scripts/check-guidelines.mjs. Die acht Quellen
  bleiben einzeln geprueft.
- FALLE: Ein Build-Skript, das auf oberster Ebene schreibt, schreibt auch beim
  Import im Test. Ausfuehrung mit
  `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)`
  kapseln.
- OFFEN (neuer Befund, freigabepflichtig): VIER weitere Startaufrufe liegen noch
  im Ladepfad — ein zweiter /api/auth/me aus account-sessions.js (startet warm bei
  117 ms, also 11 ms VOR dem FCP), /api/keys aus api-keys-surface.js sowie
  /api/providers/cline/models und /status aus cline-model-menu.js. Letzteres steht
  unter dem Start-Lock. Bewusst nicht angefasst: Scope-Treue vor Vollstaendigkeit.

## 2026-07-27 — Letzte Startaufrufe aus dem Ladepfad (job_startaufrufe_rest_20260727)
- VERSCHOBEN ueber afterFirstPaint: /api/auth/me (account-privacy.js,
  hydrateAuthSession), /api/keys (api-keys-surface.js, refresh),
  /api/providers/cline/models+status (provider-settings.js, load). Die
  Oberflaechen werden weiterhin SOFORT aufgebaut, nur die Daten kommen danach —
  Deep-Links auf /settings und /konto bleiben nutzbar.
- KORREKTUR eines eigenen Befunds: Die Cline-Startaufrufe stammen NICHT aus
  cline-model-menu.js, sondern aus provider-settings.js Zeile 22.
  cline-model-menu.js laedt seinen Katalog schon immer erst beim Oeffnen des
  Untermenues. Vor einer Freigabe die Aufrufkette wirklich bis zum Ausloeser
  verfolgen, nicht beim erstbesten Treffer stehenbleiben.
- WICHTIGSTE LEHRE (Live-Befund, kostete einen zweiten Deploy):
  `requestAnimationFrame` laeuft VOR dem Malen seines Frames. Zwei rAF
  GARANTIEREN NICHT, dass gemalt wurde — im warmen Wiederbesuch starteten
  dadurch sechs Aufrufe bei 142-160 ms, waehrend der Bildaufbau erst bei 168 ms
  lag. Richtig ist: auf das Paint-Ereignis des Browsers warten
  (`PerformanceObserver`, `type: "paint"`, `buffered: true`); als Rueckfallweg
  zwei rAF PLUS `setTimeout(0)` — der laeuft garantiert nach dem Malen.
  Behoben in public/deferred-start.js, sw v152.
- ERGEBNIS: Erstbesuch 0 von 9 API-Aufrufen vor dem Bildaufbau. Wiederbesuch
  1 von 9. Warm LCP p75 168 -> 128-140 ms (stabil ueber drei Kontrollaeufe).
- MESSDISZIPLIN: Kalte LCP-Werte auf DEMSELBEN Build streuten 120/308/408 ms.
  Aus einer einzelnen Kaltmessung darf KEINE Verbesserung oder Verschlechterung
  abgeleitet werden — immer mehrere Kontrollaeufe, und den Warmwert als
  belastbaren Indikator nehmen.
- OFFEN, freigabepflichtig: Der letzte fruehe Aufruf ist /api/auth/me aus
  public/autonomous-coding.js Zeile 27 (refreshSession in
  initAutonomousCodingSurface), warm 11 ms vor dem Bildaufbau. Datei steht unter
  dem Start-Lock und war in keiner Freigabe genannt. Der Umweg ueber
  premium-surfaces.js waere moeglich, haette aber die ganze Oberflaechen-
  Erzeugung verzoegert (Deep-Link auf /automation kurz leer) — bewusst verworfen.
- NEBENBEFUND (aelter, nicht behoben): public/api-keys-surface.js liegt NICHT im
  Service-Worker-Precache, wird aber von settings-surface.js importiert (die im
  Precache liegt). Offline findet der Import nichts.

