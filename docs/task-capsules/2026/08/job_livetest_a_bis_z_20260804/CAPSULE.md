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
