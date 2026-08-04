# job_livetest_a_bis_z_20260804 — smejj.com von A bis Z live geprueft

## Ziel

Auftrag des Betreibers vom 2026-08-04: "Hast du alle Aenderungen hochgeladen,
die Datenbank gespeichert bzw. aktualisiert und das Deployment abgeschlossen?
Bitte oeffne smejj.com im Browser und teste die gesamte App von A bis Z. Wenn du
Fehler findest, behebe sie sofort, deploye erneut und teste live weiter, bis
alles stabil, sicher und zuverlaessig funktioniert. Danach alles 100% schuetzen."

## Ausgangslage geprueft

- Arbeits-Branch vollstaendig auf origin (nach `git fetch`; der erste Eindruck
  von 6 offenen Commits kam von einem veralteten Remote-Tracking-Ref).
- Frontend-Repo `232d0b3`, live sw v209 — Deploy war abgeschlossen.
- Alle 8 Start-Lock-relevanten Dateien lokal byte-identisch zum Live-Stand.

## Testumfang

**HTTP (23 Adressen):** alle 200, 404-Seite korrekt 404. Startseite 40 631 B,
TTFB 50-190 ms. CSP als Meta-Tag vorhanden (GitHub Pages kann keine Header
setzen), `default-src 'self'`, `object-src 'none'`, `script-src 'self'`.

**Backends (4):** Bridge Salad v112 (primaer), Bridge Zeabur v104 (Reserve),
Control Server, Remote-Browser-Bridge — alle `ok: true`, 0,37-0,83 s.

**Oeffentliche Seiten:** Anmeldung, Registrierung, Hilfe, Betriebsstatus,
Impressum, Datenschutz, Qualitaetsverlauf, 15 Sprachseiten. Je ein `h1`, keine
kaputten Bilder, keine leeren Links, keine Konsolenfehler. Die Statusseite misst
live und meldete alle vier Dienste als laufend.

**App-Ansichten (17 ueber den echten Router):** start, search, websites,
smejjClaw, automation, chatHistory, browser, code, projects, files, storageView,
memory, ai, cost, tools, settings, profile — alle gefunden, sichtbar, mit
Inhalt, keine JS-Fehler.

**Chat:** Frage gesendet, korrekte deutsche Antwort. Anschlussfrage ("Und auf
welchen Servern laeuft das?") wurde als Anschluss verstanden — das
Gespraechsgedaechtnis aus v208 wirkt.

**Verlauf:** `smejj-chats v2` angelegt, 4 Nachrichten gespeichert, im
Verlaufs-Bildschirm mit Titel, Datum und Modell gelistet — die Selbstheilung aus
v209 wirkt.

**Offline:** 133 Precache-Eintraege, Stichproben (`/`, app.js, start-styles.css,
panel-backdrop.js, browser-pane-backdrop.js, i18n/ui.js, chat-store.js) alle mit
200 im Cache.

## Befund 1 (BEHOBEN, live) — Sprache wurde ungefragt auf Deutsch gestellt

Schwerwiegend, betrifft jeden nicht-deutschen Nutzer.

**Symptom:** Browser en-US, Oberflaeche korrekt englisch, Sprachauswahl zeigte
"Deutsch".

**Ursache:** `app.js:551` (Start-Lock, `bindSettings`) belegt `#settingsLanguage`
NACH dem Render von `settings-surface.js` mit `state.settings.language || "de"`.
Ohne gespeicherte Wahl ist das "de", waehrend `savedUiLanguage()` die erkannte
Browsersprache liefert. Der Feldwert log also.

**Auswirkung, live bewiesen:** `save()` schreibt bei JEDER Aenderung ALLE Felder
weg. Ein blosser Wechsel des Farbschemas schrieb `language: "de"` fest; nach dem
naechsten Laden stand die komplette App auf Deutsch, ohne dass der Nutzer je eine
Sprache gewaehlt hatte.

**Fix** (ohne Eingriff in den Start-Lock, alles in `settings-surface.js`):
- `save()` nimmt die Sprache aus `uiLanguage()` statt aus dem Feld.
- `sprachwahlVomNutzer` traegt die bewusste Wahl, in `handleChange` VOR `save()`
  gesetzt; Zuruecksetzen stellt wie bisher die Quellsprache her.
- `zeigeAktiveSprache()` holt die Anzeige nach dem synchronen app.js-Boot
  zurueck (beim Render und einmal per `queueMicrotask`).

`sw` v209 -> v210, weil `settings-surface.js` cache-first im Precache liegt und
der Cache-Treffer mit `ignoreSearch` laeuft — ein `?v=`-Sprung allein wirkt NICHT.

**Verifikation live (sw v210, Chrome en-US, Zustand eines wiederkehrenden
Nutzers mit i18n-Cache — genau dort trat der Fehler auf):**
1. Auswahl zeigt "en" statt "de".
2. Farbschema-Wechsel speichert `language: "en"`.
3. Nach dem Neuladen bleibt alles englisch.
4. Gegenprobe "Deutsch" -> "Einstellungen"; "Francais" -> "Parametres", beides
   korrekt gespeichert.
Keine Konsolenfehler.

**Merkregel:** Zwei Stellen mit demselben Standardwert driften auseinander,
sobald eine davon rechnet (Browsersprache) und die andere raet ("de"). Ein
Formularfeld ist keine Wahrheitsquelle, wenn ein zweites Modul es nachtraeglich
belegt.

## Befund 2 (BEHOBEN) — verwaister Uebersetzungsschluessel brach check:frontend

`check:frontend` war auf dem Hauptstand ROT (nicht durch diese Sitzung):
`"Neues Passwort für smejj.com (mindestens 10 Zeichen):"` stand in allen 14
Sprachdateien, im Quellcode aber nur noch die gekuerzte Fassung
(`account-sessions.js:130`) — ein Ueberbleibsel des Rollbacks `d46cfda`. Der
Schluessel wurde aus allen 14 Dateien entfernt; die Bereinigung ist mit dem
Commit `199449e` einer Parallel-Session eingegangen. Schluesselsaetze bleiben
identisch (251 je Sprache).

## Offene Befunde (Entscheidung des Betreibers, nicht eigenmaechtig geaendert)

**A. 16 von 19 Sitemap-Adressen leiten Abgemeldete zur Anmeldung.**
`sitemap.xml` bewirbt `/` und 15 Sprachseiten; `auth-gate.js` schickt Abgemeldete
auf `/auth/login/`, weil diese Pfade nicht in `PUBLIC_PATHS` stehen. Entweder
werden die Sprachseiten oeffentlich (Marketing) oder sie gehoeren nicht in die
Sitemap. Beides ist eine Produktentscheidung; die Anmeldepflicht steht unter
Change-Lock.

**B. Kontoansicht ist nur halb uebersetzt.** In der englischen Oberflaeche
bleiben ~37 Textstellen deutsch ("Sprache & Stimme", "Verbundene Apps", "Abo &
Zahlungen", ...), in den Einstellungen ~11. Der View-Container traegt `lang="en"`
— Screenreader sprechen den deutschen Text englisch aus. Die Behebung braucht
rund 45 neue Schluessel in 14 Sprachen; die Testsuite erzwingt identische
Schluesselsaetze, unverifizierte Uebersetzungen wurden bewusst NICHT ausgeliefert.

**C. Der Passwortwechsel-Dialog ist fuer alle Sprachen deutsch.**
`account-sessions.js` bindet die i18n-Runtime gar nicht ein; 4 von 5 Texten des
Ablaufs haben keine Uebersetzung.

**D. Der Qualitaetsverlauf steht seit dem 30.07. still** und zeigt 76,47 % mit
3 kritischen Fehlern. Die Messung wurde seither nicht wiederholt.

**E. Der Assistent kennt seine eigene Infrastruktur nicht.** Auf "Auf welchen
Servern laeuft das?" kam "auf eigenen Servern mit modernen Cloud-Technologien"
statt GitHub Pages / IDrive e2 / Zeabur / Salad. Bekannt und dokumentiert: das
Projektwissen (RAG) haengt nicht im Live-Chat-Pfad.

## Nachtrag 2026-08-04 — Befund B behoben, Befund A neu bewertet

Freigabe: "Ja" zur Empfehlung (Punkt 2 zuerst, Uebersetzungen von mir erstellt).

### Befund B BEHOBEN — Kontoansicht und Einstellungen vollstaendig uebersetzt

Der Code rief `t()` bereits an allen Stellen auf; es fehlten ausschliesslich die
Eintraege in den Sprachdateien. Deshalb **keine Code-Aenderung, nur Daten**:
63 neue Texte in allen 14 Sprachen (882 Uebersetzungen), Schluesselsatz je
Sprache jetzt 314 und in allen Dateien identisch. Rein additiv — in keiner Datei
wurde eine Zeile entfernt oder geaendert.

Markennamen (GitHub, Slack, Google Drive) bleiben bewusst ohne Eintrag: `t()`
faellt fail-safe auf den Quelltext zurueck, der in allen Sprachen gleich ist.
Beim Platzhalter fuer eigene Anweisungen ist das Beispiel je Sprache angepasst
("Antworte kurz und auf Deutsch" -> "Answer briefly and in English" usw.).

Kein sw-Sprung noetig: die Sprachdateien liegen NICHT im Precache, sie werden
dynamisch geladen (600-s-HTTP-Cache) und die i18n-Runtime frischt ihren
localStorage-Cache bei jedem Laden im Hintergrund auf.

**Verifikation live** (`0cbeb48`): Gegen die AUSGELIEFERTEN Dateien geprueft —
alle 217 uebersetzbaren Texte aus `account-privacy.js` und
`settings-surface.js` haben in en, ja und ar eine Uebersetzung, 0 Luecken
(vorher 48). Im Browser gegengelesen: 314 Schluessel je Sprache, Stichproben
korrekt ("Verbundene Apps" -> "Connected apps" / "連携アプリ" /
"التطبيقات المتصلة"). check:frontend 336/336 gruen.

**Offen:** Der Sicht-Test der gerenderten Kontoansicht fehlt — die
Chrome-Erweiterung war ab diesem Zeitpunkt nicht mehr erreichbar. Die
Auslieferung ist strukturell und im Browser belegt, ein Screenshot der Ansicht
steht aus.

**Einschraenkung, ausdruecklich:** Deutsch und Englisch verantworte ich; die
13 weiteren Sprachen sind von mir erstellt und NICHT von Muttersprachlern
gegengelesen. Fachbegriffe (Abo, Coding-Agent, Sprachminuten) wurden bewusst
nah am Original gehalten.

### Befund A NEU BEWERTET — die Sitemap ist das Problem, nicht das Gate

Bei der Detailpruefung kam ein Punkt dazu, der die urspruengliche Empfehlung
umdreht: Die 15 Sprachseiten sind **keine reinen Marketingseiten**.
`voice-landing.js` ruft `CLIENT_ROUTES.api.agent`, `api.chatFallback`,
`api.voiceTranscribe` und `api.voiceTts` auf — also den Modell-Router und die
Sprach-Server.

Sie oeffentlich zu schalten hiesse: jeder anonyme Besucher (und jeder Bot) kann
Modell- und Transkriptionsaufrufe ausloesen. Das ist eine Kosten- und
Missbrauchsfrage und damit Rote Liste. **Nicht eigenmaechtig geaendert.**

Damit bleiben drei Wege, alle mit Betreiber-Entscheidung:
1. **Sitemap ehrlich machen** — die 15 Sprachseiten austragen. Sicher und
   sofort machbar, aber die mehrsprachige SEO-Investition (hreflang, eigene
   Beschreibungen) faellt weg; es blieben 4 indexierbare Adressen.
2. **Oeffentliche Marketing-Huelle bauen** — Sprachseiten zeigen Inhalt und
   hreflang fuer alle, die Eingabe/Sprachbedienung fordert Anmeldung. Fachlich
   die richtige Loesung, aber echte Arbeit, kein Einzeiler.
3. **Sprachseiten oeffnen** — ein Eintrag in `PUBLIC_PATHS`. Schnell, aber
   oeffnet die kostenpflichtigen Routen fuer Anonyme. Nur mit Budget-Deckel und
   Rate-Limit vertretbar.

Empfehlung: Weg 2, notfalls Weg 1 als Zwischenschritt. Weg 3 nicht ohne
Drosselung.

## Nachtrag 2 (2026-08-04) — Befund A umgesetzt: Marketing-Huelle + Sitemap

Freigabe: "Nummer — 1, 2" (Sitemap in Einklang bringen UND oeffentliche
Marketing-Huelle bauen).

### Lage bei Arbeitsbeginn — es war dringender als gedacht

Eine Parallel-Session hatte die 15 Sprachseiten mit `f8d98c4` (sw v213) bereits
oeffentlich geschaltet — inhaltlich richtig. Die Interaktion war dabei aber
NICHT gesperrt: `voice-landing.js` kannte keine Sitzungspruefung.

**Live gemessen:** ein Aufruf an die Bridge OHNE jedes Token beantwortete
`POST /api/chat` mit HTTP 200 und einer vollstaendigen Modellantwort in 1,3 s.
Seit v213 lag damit auf 15 indexierten Seiten eine bedienbare, kostenpflichtige
Oberflaeche fuer jeden anonymen Besucher und jeden Bot.

### Umsetzung

NEU `public/voice-landing-signin.js` (eigenes Modul; `voice-landing.js` steht an
der 800-Zeilen-Grenze — dieselbe SRP-Loesung wie `browser-pane-backdrop.js`):

- `darfSprechen()` liest die Sitzung fail-closed ueber `hasSession()` aus dem
  Gate. Kein Storage, gesperrter Storage, halbes Sitzungsobjekt oder kaputtes
  JSON gelten als abgemeldet.
- `buildLoginCta()` setzt fuer Abgemeldete NUR einen `<a>` auf `/auth/login/` —
  kein Overlay, keine Verdrahtung, kein `warmUpAgentConnection()`. Beschriftung
  in allen 15 Sprachen, als Textknoten gesetzt (Sprachtexte sind Daten).
- `initVoiceLanding()` prueft VOR `buildUi()`. Angemeldete merken nichts.

Bewusst ein `<a>` statt `<button>`: Suchmaschinen und Screenreader sollen den
Weg in die App als Verweis sehen, Mittelklick und "in neuem Tab" funktionieren.

### Verifikation live auf https://smejj.com/de/

**Abgemeldet:** Seite rendert vollstaendig — Titel, H1 "smejj.com — dein KI- &
Code-Assistent", 813 Zeichen Inhalt, Funktionen und FAQ sichtbar. KEIN
Sprach-Knopf, KEIN Overlay; stattdessen "Anmelden und sprechen" ->
`/auth/login/` mit aria-label. **Netzwerkprotokoll: 20 Anfragen, ausschliesslich
statische Dateien derselben Domain — NULL Aufrufe an salad.cloud, zeabur.app
oder irgendeine /api/-Route.**

**Angemeldet (Gegenprobe):** Sprach-Knopf, Overlay und Eingabefeld unveraendert
vorhanden, kein Anmelde-Knopf. Non-Regression bestaetigt.

**Tests:** `tests/sprachseiten-interaktion.test.mjs` NEU (8 Faelle, darunter
fail-closed und "das Signin-Modul enthaelt im CODE keine bezahlte Route" —
Kommentare werden vor der Pruefung entfernt), `tests/auth-gate.test.mjs` auf die
neue Verdrahtung gehoben. Beide in `check:frontend`. 355/355 gruen.

### Punkt 1 (Sitemap) — durch Punkt 2 erledigt, nichts zu aendern

Nachgemessen: alle 19 Sitemap-Adressen liefern HTTP 200, 18 davon rendern fuer
Abgemeldete Inhalt. `/de/` traegt Canonical, 16 hreflang-Verweise und
`index,follow`; `x-default` zeigt auf das jetzt oeffentliche `/en/`. Der
Widerspruch "beworben, aber nicht lesbar" ist damit aufgeloest.

Bewusst NICHT geaendert: der Eintrag `/` ist laut Generator ausdruecklich die
App-Shell (dokumentierte Entscheidung F-06, eigener Eintrag ohne
hreflang-Cluster). Ihn auszutragen waere die Umkehr einer frueheren Entscheidung
ohne Not — die Marketing-Inhalte tragen jetzt die Sprachseiten.

### OFFEN und wichtig: die Bridge nimmt Anfragen ohne Anmeldung an

Die Sperre oben nimmt der Oberflaeche die Bedienbarkeit — sie macht den
Endpunkt aber nicht dicht. Wer die Bridge-Adresse kennt, kann sie weiterhin
per curl ohne Token benutzen (live belegt, HTTP 200). Das ist vorbestehend und
unabhaengig von den Sprachseiten, aber es bleibt eine offene Kosten- und
Missbrauchsflanke.

Richtige Loesung: Token-Pflicht plus Rate-Limit an der Bridge. Das ist ein
Server-Eingriff, der ohne sorgfaeltigen Umbau ALLE angemeldeten Nutzer
aussperren wuerde (das Frontend schickt heute kein Token an die Bridge) —
deshalb ein eigener Auftrag mit eigener Absicherung, nicht nebenbei.

## Benchmark (Messpflicht)

Kalt: Startseite TTFB 50-190 ms (Budget 200), 40 631 B (Budget 300 KB).
Warm mit Service Worker: FCP/LCP 84 ms (Budget 1,5 s), CLS 0 (Budget 0,1),
domInteractive 19 ms, load 133 ms, 118 Ressourcen.
`settings-surface.js` 16 817 B, `sw.js` 41 359 B.
Keine Budgetverletzung, keine Verschlechterung gegenueber dem letzten Benchmark.

## Absicherung

- Start-Lock neu eingefroren, 31/31 gruen, Backup
  `backups/start-design-lock/2026-08-04T01-09-27-956Z/`. Der Wortlaut im Manifest
  haelt fest, dass diese Sitzung NUR `public/sw.js` (Cache-Version + Kopf)
  angefasst hat.
- Favicon-Lock gruen, `check:guidelines` gruen (1286 Dateien),
  `check:frontend` 327/327 gruen.
- Nichts geloescht, keine Zugaenge beruehrt, keine neuen Kosten.

## Testumgebung (offen dokumentiert)

Das Chrome-Profil hatte keine smejj.com-Sitzung. Anmelden nimmt der Agent dem
Betreiber nicht ab; fuer die App-Ansichten wurde nur der lokale UI-Schalter
`smejj.session.v1` gesetzt (kein Serverzugang) und danach zusammen mit allen
Testresten wieder entfernt (Einstellungen, i18n-Cache, Browser-Tabs,
Test-Chat). Uebrig blieb nur `smejj.vitals.v1`, das jeder Seitenaufruf anlegt.
Nicht getestet, weil verboten oder freigabepflichtig: echte Anmeldung,
Formularabsendungen, Zahlungsvorgaenge.
