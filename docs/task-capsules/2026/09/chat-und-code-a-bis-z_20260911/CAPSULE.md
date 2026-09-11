# Task Capsule — chat-und-code-a-bis-z_20260911

Datum: 2026-09-11
Auftrag: Betreiber (Wof Kadavanich) — A-bis-Z-Ueberarbeitung in 20 Punkten.
Diese Kapsel deckt **Punkt 3 (Chatbereich A-Z)** und **Punkt 4 (Codebereich)**,
dazu Punkt 14 (Fehlerbehebung an der Ursache) und Punkt 19 (funktionierenden
Stand schuetzen).
Status: 14 Fehler behoben, **alle live auf smejj.com bewiesen** (SW v841 bis
v850), 653/653 Frontend-Proben gruen, neun Sperren neu gestempelt und gruen.

## Die Methode: messen statt ansehen

Jeder Knopf wurde nicht angeschaut, sondern gemessen — laedt sein Modul, aendert
sich der Speicher, wird etwas SICHTBAR? Diese Methode hatte am 10.09. den
Attrappen-Kamera-Knopf gefunden. Sie hat heute elf echte Fehler gefunden, von
denen keiner beim Hinsehen aufgefallen waere.

## Die Krankheit dieses Tages: zwei Quellen fuer eine Wahl

Zehn der vierzehn Fehler sind derselbe Bauplan. Irgendwo steht eine zweite
Fassung derselben Wahrheit — eine alte Tabelle, ein zweites Menue, ein
Nachbau — und beide Seiten driften auseinander. Der Nutzer sieht dann eine
Anzeige, die etwas anderes behauptet als der Zustand, in dem er wirklich
arbeitet.

## Chatbereich (Punkt 3)

| # | Fehler | Ursache | Beweis |
|---|--------|---------|--------|
| 1 | Wahl "smejj 1.0" → Chip zeigte "smejj 1.1" | app.js beschriftete aus der Stufe statt aus der Wahl; das Ereignis traegt die Stufe mit, app.js warf sie weg | SW v842, alle vier Zeilen stimmig |
| 2 | "Auto" + Nachdenken → Automatik STILL weg | Die Pille klickte in das alte, nie geoeffnete Menue; dieser Weg zwingt die Wahl auf "smejj 1.0" | SW v842, Auto ueberlebt |
| 3 | Pille zeigte nach Modellwahl den falschen Zustand | zeichnete nur bei eigenem Klick neu | SW v842 |
| 4 | "Neu generieren" loeschte den Verlauf VOR dem Ersatz | `nodesFrom(frage)` entfernt sofort; scheitert das Senden, ist alles weg | SW v844, versteckt statt geloescht |
| 5 | Rueckfrage liess eine leere Blase mit Aktionsleiste | die Karte steht HINTER dem Antwortknoten, der leer blieb | SW v845 |
| 6 | Nach dem Stoppen dachte die App ewig weiter | ein Abbruch ist weder Ereignis noch Fehler — er geht an beiden Aufraeumwegen vorbei | SW v846 |
| 7 | Eigene Nachricht landete unter der Bedienzone | `scrollIntoView` richtet am FENSTER aus, nicht am Verlauf | SW v848, vier Breiten gruen |

**Geprueft und in Ordnung:** Senden, Streaming (985 → 8006 Zeichen), Stopp-Knopf
beschriftet sich korrekt, Teilantwort bleibt beim Stoppen, Bearbeiten mit
Abbrechen, Aktionen-Menue (6 Eintraege), Kopieren (meldet ehrlich, wenn der
Browser es verbietet), Vorlesen, Bewertung mit gegenseitigem Ausschluss,
"Erneut versuchen" nach Netzfehler. Markdown live gerendert plus 31 gruene
Proben fuer Tabellen, Listen, Code und XSS.

## Codebereich (Punkt 4)

| # | Fehler | Ursache | Beweis |
|---|--------|---------|--------|
| 8-10 | Chips zeigten eine andere Wahl als das Menue; smejj 1.3 unsichtbar UND unerreichbar | eigene, veraltete Stufentabelle in code-flaeche.js | SW v849, alle vier Stufen stimmig |
| 11 | Stufen-Chip klickte ins alte Menue | dieselbe Ursache wie Fehler 2, zweite Fundstelle | SW v849 |
| 12-14 | Oberflaeche sagte elfmal "Project" statt "Projekt" | deutsch-klartext.js kannte nur "Projects" (Plural) | SW v850 |

**Der staerkste Beweis:** Der Berechtigungs-Modus wirkt bis in die Antwort.
Modus *Plan* → die Antwort endete mit "Soll ich so umsetzen?" und enthielt
keinen Code. Dieselbe Frage im Modus *Auto-akzeptieren* → ein Codeblock mit
`def addiere(a, b): return a + b`. Keine Anzeige-Attrappe.

Ebenfalls echt: Plus-Menue (Dateien, Ordner, Slash, Konnektoren, Plugins),
Projekt-Menue, am Codeblock "Code kopieren", "Code einklappen" (96 → 36 px
gemessen), "Als Datei herunterladen".

## Neue Waechter

* `tests/modellchip-eine-wahrheit.test.mjs` (7) — an der SACHE, nicht an einer
  Zahl: ein Test, der die falsche Beschriftung eingefroren haette, haette den
  Fehler versiegelt.
* `tests/chat-neu-versuch.test.mjs` (7) — darunter die beiden Faelle, die im
  Live-Fehler zusammenkamen: eine LEERE neue Antwort zaehlt nicht als Ersatz,
  und ein zweiter Versuch laesst den ersten Stand nicht wieder auftauchen.
* `tests/chat-leere-blase.test.mjs` (5), `tests/chat-stopp-aufraeumen.test.mjs` (6),
  `tests/verlauf-neue-nachricht-unten.test.mjs` (4),
  `tests/codebereich-staffel-eine-quelle.test.mjs` (5),
  `tests/deutsch-projekt.test.mjs` (2).
* `scripts/diagnose/chat-scrollverhalten.mjs` — vier Breiten mit echter
  Geraete-Emulation und gefuelltem Verlauf. `messe_responsive.mjs` misst die
  LEERE App: 152 Messpunkte gruen, aber kein einziger mit Chatinhalt.

## Was ICH falsch gemacht habe (und was daraus folgt)

1. **Falsch positiv durch Existenz statt Sichtbarkeit.** Mein erster Befund
   "Menue geht auf" traf das verborgene alte Menue — `querySelector` findet
   auch, was niemand sieht. Sichtbarkeit misst man mit
   `offsetWidth||offsetHeight`.
2. **Die Messung pruefte ihren eigenen Nachbau.** Das Scroll-Skript rief selbst
   `scrollIntoView` mit dem Kommentar "derselbe Weg wie addEntry" — nach der
   Korrektur IN addEntry stimmte das nicht mehr.
3. **Ein Selbsttest, der schwankt, beweist nichts.** Er war mal rot, mal gruen
   (152 / 3 / 0 px), weil der Unterschied zeitabhaengig ist.
4. **Eine Messung, die nichts sieht, meldet gruen.** Der umgebaute Selbsttest
   blieb gruen, weil der Verlauf kuerzer war als sein Fenster und nie scrollte.
   Jetzt meldet er `MESSUNG UNGUELTIG` — dieselbe Lehre wie beim Modul-Waechter
   vom 10.09.
5. **Marke vergessen.** Mein erster Entwurf importierte `app-helfer.js` OHNE
   Marke — zwei Kennungen, zwei Instanzen. `check:module-queries` fing es
   sofort. Der Waechter von gestern hat heute gearbeitet.
6. **Zu dick aufgetragen.** Ich schrieb "die Nachricht bleibt verdeckt"; in
   Wahrheit 250 ms lang. Richtiggestellt in Code, Probe und Commit.
7. **Ein Umschalter braucht einen bekannten Ausgangszustand.** Ich klickte den
   Plus-Knopf zweimal und hielt das dadurch geschlossene Menue fuer tot.

## Grenzen dieser Runde — ehrlich notiert

* **Layout nicht im verborgenen Browser-Fenster messen.** `#startLog` meldete
  clientHeight 70 bei scrollHeight 240543, `html` und `body` meldeten 0.
* **Der Selbsttest des Scroll-Skripts ist auf Handy-Breiten unempfindlich** —
  Tablet und Laptop melden den verschobenen Verlauf, 320 und 375 nicht. Steht
  im Kopf der Datei.
* **Der Chat-Dienst hatte waehrend der Tests 502/503-Aussetzer.** Server-Seite,
  nicht Frontend; die Meldung "Verbindung zum Server unterbrochen" ist dafuer
  angemessen.
* **Der Hauptweg verlangt Anmeldung** (401 auf /api/agent). Die Antworten kamen
  ueber die Reserve (api.smejj.com). Ich habe mich nicht angemeldet.

## Stempel (Punkt 19)

Neun Sperren neu eingefroren und gruen: start-lock (32 Dateien),
modell-menue-lock (2), security-lock (11), favicon-lock, auslieferung-lock,
deploy-lock, abo-lock, einwilligung-lock, admin-lock. Der Wortlaut der
Bestaetigung steht in jedem Manifest.

Beim Security-Lock lagen zwei fremde, bereits committete Aenderungen
(`auth/auth.css` Safe-Area, `chat-bridge.js` nimmt "spezial" an). Beide vor dem
Stempel im Diff geprueft: sie beruehren weder Anmeldung noch Schluessel noch
Sicherheitsrichtlinien.

## Punkt 1 nachgereicht und LIVE (19:48 Uhr)

Der Backend-Cline ist entfernt und ausgerollt. **Vor** dem Entfernen
nachgewiesen, dass nichts Benutztes stirbt: `public/provider-settings.js` — die
einzige Oberflaeche zum Hinterlegen eines Schluessels — existierte nicht mehr,
ohne Schluessel endete jede Anfrage in "nicht konfiguriert", `check:cline` war
bereits rot. Ein toter Weg, kein Rueckbau.

Geloescht: `clineClient.js`, `providerRoutes.js` (war ganz Cline) samt Mount,
`clineProvider.js`, `providerRegistry.js`, der Worker-Sonderweg, die
Cline-Laufzeit an Jobs. Neutral gemacht, wo der NAME das Problem war:
`errors.js` erkennt Anbieterfehler am Merkmal statt am Namen "ClineApiError";
`providerContract.js` hat keinen Vorgabe-Anbieter mehr. Das
**Transparenzverzeichnis** fuehrte "cline-bridge" als offengelegte
Datenverarbeitung — dort stand die Regel schon woertlich vom Abschied von Ox
Alpha: ein Verzeichnis, das etwas fuehrt, das die Plattform nicht einsetzt, ist
nicht veraltet, sondern falsch.

Geblieben ist bewusst die Migration alter Nutzerwahlen — wer "Cline" noch im
Browserspeicher hat, wird still auf smejj gesetzt.

### Drei Messfallen beim Rollout

1. **Ein Statuscode beweist keine Route.** `/api/gibtesnichtxyz` antwortet
   ebenfalls 401 — eine vorgelagerte Anmeldepruefung kommt vor jeder Route.
2. **Ein gruener check-run kann zum VORHERIGEN Bau gehoeren** (abgeschlossen
   17:44:35, Push 17:50).
3. **`total_count: 0` heisst nicht "kein Bau"** — der zweite Push trug keinen
   check-run und wurde trotzdem ausgerollt.

Belastbar ist allein `gestartetAm`. Der erste Push loeste keinen Bau aus, ein
leerer zweiter Commit genuegte.

## Punkte 5, 7, 8, 10-13, 16, 17 nachgereicht (11./12.09.)

| Punkt | Ergebnis |
|---|---|
| 5 Sprachwelle Realtime | Barge-in loest wirklich aus — mit KUENSTLICHEM Mikrofon gemessen (Chrome-Flag). 14 Module, Pegel 0,40, X 48x48. Der Relay lebt (401 per `--http1.1`); ob der Gemini-Schluessel gesetzt ist, sagt erst eine angemeldete Messung. |
| 7 Sprachwelle mit Video | `kamera.js` laedt, Videobild 640x480, Overlay sichtbar, **nichts verdeckt** — mit kuenstlicher Kamera bewiesen. Der Fund vom 11.09. ist damit auch von aussen bestaetigt behoben. |
| 8 Designsystem | Fuenf gemeldete Ausreisser, davon **vier Absicht** (eigene Klassen, gewachsene Hoehen, Betreiber-Regeln). 234 von 234 Elementen haben einen Fokusring. 474 Zeilen totes CSS entfernt und live 404. |
| 10-13 Rundgang | **Alle 19 Ansichten oeffnen sauber, in zwei Runden** — mit Selbsttest, der in jeder Ansicht drei Schaeden einstreut und verlangt, dass alle gemeldet werden. |
| 16 Performance | `pageWeight_kb` 309 -> **298**, alle Budgets eingehalten. Hebel: `chat-history-view.js` (35 KB) hing fest im index.html und lief auf der Startseite leer. |
| 17 Sicherheit | Die drei GitHub-Meldungen benannt (pipecat-ai, transformers, accelerate) und die Ursache der zwei gescheiterten Anlaeufe gefunden: beide hoben nie `diffusers`. |

### Neue Werkzeuge

`npm run diagnose:rundgang` (19 Ansichten, mehrere Runden, mit Selbsttest),
`diagnose:sprachwelle`, `diagnose:sprachwelle-video`, `diagnose:designsystem`,
`diagnose:chat-scrollen` — alle mit Selbsttest oder offengelegter Grenze.

### Was ich dabei selbst falsch gemacht habe

* **"Attrappe wie am 10.09."** gemeldet, weil 2,5 Sekunden Wartezeit nicht
  reichten — und im selben Atemzug ein Bild mit 640x480 gemessen. Der
  Widerspruch entlarvte die Messung, nicht die App.
* **Verdeckung mit RECHTECKEN** gemessen. Zwei Rechtecke, die sich schneiden,
  sagen nichts darueber, was obenauf liegt. Richtig ist `elementFromPoint`.
* **Den Deep-Link-Zweig an den Pfad gehaengt.** `/chat-history` ist die
  offizielle Route, aber Pages liefert dafuer die 404-Seite; der Zweig griff
  nie, und der Verlauf blieb leer. Jetzt haengt es an der Ansicht.
* **Eine Datei in den Klon kopiert, ohne vorher den Diff zu lesen** — es war
  nur ein Kommentar, aber die Regel gilt trotzdem.
* **In einem Template-String einen Regex mit Schraegstrichen** benutzt: aus
  `/\/kamera\.js/` wird `//kamera.js/` — ein Zeilenkommentar, der die naechste
  Zeile verschluckt.

## Offen

* **Der Zeabur-Schluessel ist abgelaufen** (`cli.yaml:token`, HTTP 401). Der
  manuelle Bauweg steht damit nicht zur Verfuegung; nur der Betreiber kann ihn
  erneuern. Diagnose in einer Zeile:
  `node scripts/diagnose/zeabur-schluessel-suchen.mjs`.
* `public/assets/chat-bridge.js` ist eine aeltere Abzweigung der Quelle
  (667 gegen 702 Zeilen). Nicht angefasst.
* Punkt 5 (Sprachwelle Realtime), Punkt 8 (Designsystem), Punkte 10-13
  (A-bis-Z-Rundgang, mehrfache Durchlaeufe), Punkt 17 (Sicherheit).
