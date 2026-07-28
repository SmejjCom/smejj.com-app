# job_qa_restpunkte_20260728 — Service Worker, CSP, Offline, Zoom, Salad-Kosten, Anmeldewege

**Freigabe:** Auftrag Wof Kadavanich 2026-07-28 (acht Punkte, ausdrückliche
Dateifreigabe) plus „Ja" auf den Master-Prompt (Autonomie-Charta, Grüne Liste).

**Arbeits-Commits:** `2c20138`, `5ca69bf`, `7fb74d4`, `2a24da3`, `58921ba`
in `SmejjCom/smejj.com-app`, Branch `feature/auth-redesign-github-magiclink`
**Live-Commits (Frontend):** `c484d90`, `557f6b6`, `d79e57f`, `e1113ec`
in `SmejjCom/smejj-app-frontend`
**Live-Rückfall Frontend:** `7a612d0` (Stand vor dieser Welle)
**Control-Server:** Version 90, Artefakt
`deployments/control/smejj-control-enumfix-2026-07-28.tar.gz`
(SHA-256 `8ac457c2…f0dd7`), **Rückfall auf**
`deployments/control/smejj-control-aufteilung-20260728.tar.gz`
**Start-Lock-Backups:** `backups/start-design-lock/2026-07-28T06-14-31-711Z/`,
`…T06-27-31-021Z/`, `…T07-11-34-350Z/`, `…T07-21-38-319Z/`

---

## 1. Service Worker: cache-first für Precache-Dateien (QA-Welle 1, F-24)

Bis `v159` war **alles** network-first (`fetch(request).catch(...)`). Die rund
95 vorab gespeicherten Dateien wurden online bei jedem Aufruf erneut geholt;
der Cache half nur offline. Jetzt: Precache-Pfade cache-first, HTML
(Navigationen, `.html`, `/`) und `/api/` weiterhin network-first.

### Messung

Zwei Verfahren, weil sie Verschiedenes zeigen:

| Verfahren | vorher | nachher |
|---|---|---|
| Lokal, Server-Zählung, HTTP-Cache **aus** (isoliert den SW-Effekt) | 108 Anfragen / 668 KB | 15 Anfragen / 53 KB |
| Live, Chromium-NetLog, warmer Wiederbesuch | 97 echte Netzanfragen | 2 |

Die belastbare Zahl für den Effekt der Änderung **allein** ist die lokale:
dort war der HTTP-Cache abgeschaltet, es wirkt nur der Service Worker. Die
Live-Zahl ist echt, aber schmeichelhaft — dort fängt der Browser-Cache
zusätzlich ab.

Übrig bleiben: 13 API-Aufrufe, `sw.js` selbst, die Seite.

### Risiko, ausdrücklich benannt

Eine geänderte Precache-Datei erreicht Bestandsnutzer **nur noch** über einen
Versionssprung in `CACHE_NAME`. Vorher war das die dokumentierte Pflicht, jetzt
ist es zwingend. Der Hinweis steht im Kopf von `public/sw.js`.

### Nebenbefund aus der Messung

`auth-gate.js` (Import mit `?v=1` — dem Import-Wächter dadurch entgangen) und
`api-keys-surface.css` (zur Laufzeit als `<link>` eingehängt) fehlten im
Precache. Offline hätte der Rückfall für beide `/` (HTML) geliefert und das
Modul bzw. den Stil zerstört. Beide aufgenommen.

## 2. Inline-Stile abgelöst (CSP-Härtung)

Neu: `public/static-pages.css`, geladen per `<link>`. Der Geltungsbereich hängt
an einer Klasse am `<html>`-Element: `p-recht`, `p-404`, `p-sprachstart`.

Betroffen sind **20** Seiten, nicht 17 wie im Auftrag genannt: die vier
Rechtsseiten (`impressum`, `datenschutz`, `en/legal-notice`, `en/privacy`),
`404.html` und **alle 15** Sprach-Startseiten — `/de/` gehört dazu, es wird nur
nicht vom Generator erzeugt.

`scripts/i18n/generate-language-pages.mjs` erzeugt den Link und bricht
fail-closed ab, wenn der Hintergrund im Stylesheet nicht mehr dem `themeColor`
aus `locales.json` entspricht.

**Darstellung nachweislich unverändert:** Bildschirmfotos von acht Seiten bei
375 und 1280 px, vorher gegen nachher **byte-identisch**; danach live gegen
lokal ebenfalls byte-identisch. Eine Datei (`/ar/` bei 375 px) wich zunächst ab
— die Wiederholungsmessung zeigte, dass das Rendern dort nicht deterministisch
ist (dieselbe Datei zweimal fotografiert ergibt zwei Dateigrößen).

### Zwei Rückschritte, die der Generator sonst verursacht hätte

1. `hreflang="de"` zeigte auf `/` statt `/de/` — das ist Befund **F-06** aus
   Welle 1, der bisher nur in den *erzeugten* Dateien korrigiert war, nicht in
   der Quelle. Beim ersten Neulauf hätte er alle 14 Seiten zurückgedreht.
2. Der Generator hätte `/de/` aus der Sitemap gelöscht und der Wurzel einen
   hreflang-Cluster gegeben.

Beides jetzt im Generator selbst richtig; `sitemap.xml` ist byte-identisch zum
vorherigen Stand.

## 3. Offline- und Langsam-Netz-Verhalten — erstmals gemessen

Netz per DevTools-Protokoll hart abgeschaltet, echtes Chromium.

| Prüfung | Ergebnis |
|---|---|
| Shell offline laden | **99 ms**, vollständig sichtbar, Module geladen |
| Chat offline senden | „Verbindung zum Server unterbrochen — bitte gleich erneut versuchen." |
| Kalter Erstbesuch, 3G-Referenz (400 kbit/s, 400 ms Latenz) | DOM interaktiv 739 ms, erste Anzeige 2 756 ms, vollständig 7 446 ms, bedienbar |
| Kalter Erstbesuch, 4G (4 Mbit/s, 150 ms) | DOM interaktiv 244 ms, erste Anzeige 556 ms, vollständig 1 509 ms |

**Gefundener Fehler (behoben):** Beim Netzwechsel warf die Statusanzeige
`TypeError: Cannot read properties of undefined (reading 'status')`. Ursache:
`window.addEventListener("offline", refreshLocalWorkspaceStatus)` übergibt der
Funktion das **Event**; sie erwartet dort ihre Abhängigkeiten, `deps.workspace`
war undefined. Genau der Moment, in dem die Anzeige gebraucht wird, war der
einzige, in dem sie ausfiel. Test `tests/offline-verhalten.test.mjs`,
Gegenprobe gemacht.

**Offen zur Entscheidung, nicht behoben:** die erste Anzeige auf der
3G-Referenz liegt bei 2,8 s. Das Performance-Budget nennt „vollständig
interaktiv unter 2,0 s" — nach `domInteractive` (0,74 s) ist es eingehalten,
nach dem, was ein Mensch sieht, nicht. Größter Hebel wäre das
render-blockierende `start-styles.css` (13,7 KB gzip).

## 4. 200-%-Zoom und Textvergrößerung

| Fall | Querscrollen | Ziele < 24 px | Textüberlauf |
|---|---|---|---|
| 100 %, 1280 px (Vergleich) | nein | 0 | 0 |
| 200 %, 1280 px | nein | 0 | 0 |
| 200 %, 1920 px | nein | 0 | 0 |
| 200 %, mobil 390 px | nein | 0 | 0 |
| Grundschrift 24 px, 1280 px | nein | 0 | 0 |
| Grundschrift 32 px, 1280 px | nein | 0 | 0 |
| Grundschrift 24 px, mobil | nein | 0 | 0 |

**Was echte Messung ist:** der Zoom. Playwright setzt
`deviceScaleFactor: 2` bei halbierter CSS-Breite — das ist die W3C-Definition
von 200 % Seitenzoom, keine Näherung.

**Was Näherung ist:** die Textvergrößerung. Der Schalter „Schriftgröße" des
Browsers ist per Protokoll nicht setzbar; nachgebildet wurde er über eine
erhöhte Grundschriftgröße am `<html>`-Element (24 px und 32 px statt 16 px).
Das trifft alle Größen in `rem`/`em`, aber **nicht** feste Pixelangaben — ein
echter Browser-Schalter könnte dort abweichen.

### Gefundener Fehler (behoben): Fokus verschwand ins Nichts

Von 22 Tab-Stationen lagen **11 außerhalb des sichtbaren Bereichs**: die
zugeklappte Seitenleiste steht bei `left: -208px`, das zugeklappte
Browser-Panel bei `1309px` — beide waren weiter fokussierbar. Wer mit der
Tastatur bedient, verliert den Fokus und muss blind weitertabben; Vorleser
lasen die Einträge mit. Frühere Wellen hatten die Tab-Folge gezählt, aber nie
geprüft, ob die Station im Bild liegt.

Fix in `public/panel-layout.js`: zugeklappte Panels bekommen `inert` und
`aria-hidden`; der Fokus wird vorher herausgeholt. Gesteuert von einem
Beobachter der Klasse `.is-open` — denn `public/app.js` klappt mit eigenen
Funktionen auf und zu und steht unter dem Start-Lock. **Nachgemessen live:
0 von 22 außerhalb**, Aufklappen und Bedienung unverändert.

## 5. Anmeldewege

| Weg | Ergebnis |
|---|---|
| Konfiguration | `email`, `passkey`, `google`, `github`, `magicLink` aktiv; `apple` aus |
| Google | 303 auf `accounts.google.com`, korrekte `client_id`, `nonce`, `state` |
| GitHub | 303 auf `github.com/login/oauth/authorize`, `allow_signup=false` |
| Passkey | Login-Optionen 200, `rpId: smejj.com`, Challenge einmalig |
| Magic-Link anfordern | 200, uniform `{ok:true,sent:true}` — verrät nichts |
| Magic-Link, erfundener Token | 404 (sauber abgewiesen) |
| Passwort-Reset, erfundener Token | 400 `reset_invalid_or_expired` |
| Registrierung, zu kurzes Passwort | 400 `password_too_short` |
| `/api/auth/me` ohne Token | 200 mit `{authenticated:false,user:null}` — korrekt, kein Datenleck |

### Sicherheitsbefund (behoben, live): Konto-Enumeration

`POST /api/auth/email/reset/request` antwortete für eine **unbekannte** Adresse
mit `{"ok":true,"requested":true,"mail":{"sent":false,"reason":"unknown_account"}}`
— für eine bekannte hätte dort `{"sent":true}` gestanden. Damit konnte jeder
ohne Anmeldung durchprobieren, welche E-Mail-Adressen ein Konto bei smejj.com
haben. Dieselbe Lücke in der Registrierung (`account_exists`). Die Oberfläche
war seit jeher datensparsam formuliert („Wenn ein Konto existiert …") — die API
widersprach ihr. Auch die Meldung an den Nutzer hing an `mail.sent` und fiel
für bestehende Konten anders aus.

Fix: Das Mailergebnis heißt jetzt `internalMail`; `respond()` in
`emailAuthRoutes.js` entfernt es an **einer** Stelle für alle Routen. Die
Oberfläche entscheidet über `verificationMailExpected`, das nur an der
Serverkonfiguration hängt und deshalb für neue und bestehende Adressen
identisch ist. Test `tests/auth-enumeration.test.mjs`, Gegenprobe gemacht.

### Was ich nicht getan habe und warum

Kein Wegwerf-Testkonto angelegt, kein Passwort eingetippt. Konten anlegen und
Passwörter eingeben ist mir generell untersagt — das ist keine Projektregel und
auch mit Freigabe nicht überschreibbar. Alles andere wurde bis genau an diese
Grenze durchgespielt. Was der Betreiber selbst tun müsste, steht im Bericht.

## 6. Salad-Container — Kosten und Notwendigkeit (F-19)

Es laufen **vier**, nicht drei. Der vierte (`smejj-remote-browser-live`) fehlte
in der Welle-1-Zählung, steht aber in der Memory_Bank.

Juli-Rechnung 2026 (1.–28.7., Portal, Entwurf): **Zwischensumme 61,72 USD**,
vollständig aus Guthaben gedeckt, offener Betrag 0,00 USD. Restguthaben
**87,28 USD**, Auto-Recharge **aus** („leeres Guthaben → Container werden
abgeschaltet").

Rechnungspositionen: vCPU 2 044,8 h à 0,004 = 8,18 · RAM 2 698,42 h à 0,001 =
2,70 · GTX 1650 177,94 h à 0,02 = 3,56 · GTX 1050 Ti 74,78 h à 0,02 = 1,50 ·
RTX 3060 0,15 · RTX 4070 0,95 · RTX 4060 Ti 0,03 · **RTX 4090 148,83 h à 0,30 =
44,65**.

Die Rechnung gruppiert nach Projekt, nicht nach Container. Die Zuordnung unten
ist deshalb **abgeleitet**: aus Hardwareklasse, Laufzeit und der Tatsache, dass
`smejj-remote-browser-live` laut Deployment-Details ausschließlich auf
**GTX 1650 und GTX 1050 Ti** eingeplant werden darf. Die 44,65 USD für die
RTX 4090 stammen damit **nicht** von einem der vier laufenden Container,
sondern von den inzwischen gestoppten GPU-Containern (`smejj-llm-qwen3`,
`smejj-voice-tts`) — dieser Posten wiederholt sich nicht.

| Container (config.js-Name) | Rolle | Hardware | Juli (abgeleitet) | Muss dauerhaft laufen? | Was passiert, wenn er aus ist |
|---|---|---|---|---|---|
| `smejj-control` (redbean-caesar) | Auth, Schlüssel, Abrechnung, Jobs — **Default-Origin für jeden `/api/*`-Pfad** | 1 vCPU / 2 GB, CPU | ≈ 3,60 USD | **Ja** | Anmeldung, Konto, Schlüssel, Jobs, Suche tot. Auch die Zeabur-Bridge ruft ihn zurück (`chat-bridge.js` → `/api/search/web`, Router-Weg). Kein Ersatz auf Zeabur. Die statische Seite lädt weiter. |
| `smejj-chat-bridge-v88b-live` (starfruit-thyme) | Chat-/Agent-**Reserve** hinter Zeabur | 1 vCPU / 1 GB, CPU | ≈ 2,40 USD | **Nein** | Im Normalbetrieb nichts — Zeabur ist Haupt-Endpunkt. Fällt Zeabur aus, gibt es keinen zweiten Endpunkt mehr: `bridge_unreachable`. Genau dieser Fall ist am 2026-07-26 schon eingetreten. |
| `smejj-remote-browser-bridge-live` (loganberry-fruit) | Bridge der Browser-Fernsteuerung | 1 vCPU / 1 GB, CPU | ≈ 2,40 USD | **Nein**, nur bei Nutzung | Das Browser-Panel fällt auf Einbetten/Standbild zurück (`ready() === false`, dokumentiertes Non-Regression-Verhalten). Kein Fehler, nur weniger Funktion. |
| `smejj-remote-browser-live` (cherry-wasabi) | Worker der Browser-Fernsteuerung (Playwright) | 1 vCPU / 2 GB + **GPU** | ≈ 6,60 USD | **Nein**, nur bei Nutzung | Wie oben — Bridge ohne Worker liefert nichts. Beide gehören zusammen. |

Laufende Rate bei unverändertem Zustand: **rund 15 USD/Monat**. Das Guthaben
reicht damit knapp sechs Monate.

**Empfehlung (Entscheidung liegt beim Betreiber, nichts wurde abgeschaltet):**
`smejj-control` muss bleiben. Bei den anderen dreien geht es um rund
11,40 USD/Monat. Das größte Verhältnis von Kosten zu Nutzen hat das
Browser-Paar (≈ 9 USD/Monat für eine Funktion, die nur greift, wenn das
Einbetten einer fremden Seite scheitert) — wenn irgendwo gespart wird, dann
dort, und dann **beide zusammen**. Die Chat-Reserve (2,40 USD/Monat) ist
gemessen an einem echten Ausfall vom 26.07. das billigste Stück
Ausfallsicherheit im ganzen System; sie zu streichen empfehle ich nicht.

Zwei Punkte davon unabhängig: `chatFallback` in `public/config.js` zeigt auf
den Reserve-Endpunkt, wird aber von keinem Modul gelesen (toter Eintrag), und
Auto-Recharge ist aus — läuft das Guthaben leer, stoppen **alle** Container,
auch der Control-Server.

## 7. Drei Knöpfe (F-23) — geklärt, Entscheidung offen

Jeden Knopf gibt es **zweimal**: sichtbar und beschriftet in `index.html`, und
als leeren, versteckten Platzhalter, den `settings-surface.js` zur Laufzeit
erzeugt. `premium-surfaces.js` ruft `initSettingsSurface()` auf, das
`view.innerHTML = markup()` setzt — die ganze `#settings`-Sektion aus
`index.html` wird überschrieben, **bevor** irgendein Handler bindet
(`enhancePremiumSurfaces()` steht in `app.js` vor `bindSettings()`).

Die sichtbaren Knöpfe werden also nie geklickt und nie gebunden; `app.js` hängt
seine Handler an die leeren Platzhalter. Die Platzhalter existieren
ausschließlich, damit `bindSettings()` nicht abstürzt — `$("#saveSettings")`
wäre sonst `null` und `boot()` bräche mitten drin ab.

- `#saveSettings` — **tot.** Das Speichern macht heute `settings-surface.js`
  selbst (Autosave, `#settingsSaveStatus`).
- `#showOfflinePage` — **tot.** Und mit ihm die Zielansicht `#offline`: sie hat
  keinen anderen Einstieg, weder `data-view` noch einen Eintrag in
  `view-routes.js`.
- `#showErrorPage` — **tot.** `#error` ist ebenfalls sonst unerreichbar.

Kein Test erwartet sie. CSS färbt nur `#saveSettings` (wirkungslos).

**Nicht entfernt** — das braucht Freigabe und berührt zwei gelockte Dateien
(`index.html`, `app.js`). Freigabetext im Bericht.

---

## Verifikation

| Prüfung | Ergebnis |
|---|---|
| `npm run check:all` (isolierter Klon meines Commits `58921ba`) | grün |
| `npm run release:preflight` (ebenda) | grün |
| `check:start-lock` | OK, 31 Dateien, viermal neu eingefroren |
| `check:favicon-lock` | OK, 6 Dateien, 23 HTML-Seiten |
| Live `sw.js` | `smejj-shell-v164` ausgeliefert |
| Live Offline | Shell 99 ms, **0 Seitenfehler** |
| Live Tastatur | 0 von 22 Stationen außerhalb des Bildes |
| Live Web-Vitals | TTFB 33 ms · LCP 156 ms · CLS 0 · INP 40 ms · 39 KB (warm); alle Budgets eingehalten |
| Control-Server | Version 90, Artefakt-Zeiger gesetzt, 70 Variablen erhalten |

### Warum `check:all` im gemeinsamen Arbeitsordner rot ist

Eine **parallele Sitzung** baut zeitgleich Chat-Aktionen (`v165`,
`chat-messages.js`, `chat-actions.js`, `chat-actions-menu.js`) und hat
`index.html` und `sw.js` im Arbeitsbaum geändert, ohne den Start-Lock neu
einzufrieren. Das ist deren Arbeit, nicht meine — ich habe sie nicht angefasst.
Auf meinem eigenen Commit, in einem isolierten Klon geprüft, sind `check:all`
und `release:preflight` grün.

## Eigene Fehler in diesem Lauf

1. **Falsche Vergleichsbasis vor dem Deploy.** Der Abgleich „Live gegen meinen
   Vorzustand" meldete, dass alle 20 Seiten abweichen — das hätte bedeutet,
   fremde Arbeit zu überschreiben. Ursache war mein Fehler: ich nahm `HEAD~1`
   als Basis, aber eine parallele Sitzung hatte über meinen Commit hinweg
   committet, sodass `HEAD~1` bereits mein eigener neuer Stand war. Gegen die
   richtige Basis (`2c20138`): null Abweichungen.
2. **Fremde `package.json`-Zeile mitcommittet.** Beim `git add package.json`
   ging eine Ergänzung der parallelen Sitzung mit in Commit `58921ba` — der
   `check`-Eintrag nennt dort Dateien, die noch nicht committet sind. Im
   gemeinsamen Arbeitsbaum fällt das nicht auf (die Dateien existieren), in
   einem frischen Klon des Commits schon. Löst sich, sobald jene Sitzung ihre
   Dateien committet. Kein Force-Push, keine fremde Arbeit angefasst.
3. **Erstes Prüfmuster im Offline-Test zu grob** — es brach am `()` der
   Pfeilfunktion ab und schlug falsch an. Korrigiert, danach Gegenprobe.

## Stolpersteine für die nächste Sitzung

- **`check:all` kann durch eine fremde Sitzung rot sein.** Vor dem
  Fehlersuchen prüfen, ob `git status` fremde Änderungen an gelockten Dateien
  zeigt. Der saubere Nachweis der eigenen Arbeit ist ein Klon des eigenen
  Commits (`git clone --shared`, `node_modules` als Symlink).
- **Vergleichsbasis nie über `HEAD~1` bestimmen**, sondern über den
  ausdrücklichen Commit-Hash vor der eigenen Änderung.
- **Der Bauer des Control-Artefakts überschreibt nichts.** Ohne eigenen
  `SMEJJ_CONTROL_RELEASE_ID` und eigenen Ausgabepfad bricht er fail-closed am
  Artefakt vom 11.07. ab.
- **Live-Messung von Web-Vitals streut stark.** Kalte TTFB schwankte bei
  identischem Code zwischen 75 und 603 ms (p75). Ein einzelner Lauf taugt nicht
  als Regressionsnachweis — mindestens dreimal messen.
