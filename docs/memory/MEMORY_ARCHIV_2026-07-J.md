# MEMORY-ARCHIV 2026-07-J

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel (2026-07-28).
> Der Hauptindex traegt einen Zeiger hierher.

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
