# Service-Worker: Versionsverlauf ab v213 (August 2026)

Fortsetzung von [SW_VERSIONSVERLAUF.md](SW_VERSIONSVERLAUF.md). Der Text stand
bis zum 2026-08-07 als Kommentarblock in `public/sw.js` und machte dort **646
von 863 Zeilen** aus — 76 % einer Datei, deren ausfuehrbarer Teil 217 Zeilen
umfasst.

Das ist bereits die ZWEITE Auslagerung: am 2026-08-05 wanderten 586 Zeilen in
die Vorgaengerdatei, danach wuchs der Block innerhalb von zwei Tagen erneut auf
646 Zeilen. **Jede neue Cache-Version bringt ihre Begruendung mit, und die
bleibt fuer immer stehen.** Wer hier anbaut, legt den naechsten Eintrag bitte
gleich in dieses Dokument und nicht in den Code.

Warum eine EIGENE Datei statt eines Anhangs an die Vorgaengerdatei: die
800-Zeilen-Regel gilt auch fuer `.md` (`CHECK_EXTENSIONS` in
`scripts/check-guidelines.mjs`). 411 + 646 Zeilen waeren 1.057 gewesen — das
Problem waere nur umgezogen.

Der Text ist unveraendert uebernommen; nur die Kommentarzeichen `//` sind fort.

---

Der am 2026-08-07 aus `public/sw.js` uebernommene Bestand (v148 bis v227)
steht seit dem 2026-08-09 in
[SW_VERSIONSVERLAUF_2026-08-ARCHIV.md](SW_VERSIONSVERLAUF_2026-08-ARCHIV.md).
Grund: diese Datei war auf 1.050 Zeilen gewachsen und riss die
800-Zeilen-Regel. Neue Eintraege gehoeren weiterhin HIER ans Ende.

---

Der danach direkt hier geschriebene Bestand (v216 bis v252) steht seit dem
2026-08-10 in
[SW_VERSIONSVERLAUF_2026-08-ARCHIV-B.md](SW_VERSIONSVERLAUF_2026-08-ARCHIV-B.md) —
ausgelagert, bevor die 800-Zeilen-Regel erneut riss. Neue Eintraege gehoeren
weiterhin HIER ans Ende.

---

## Zwei Sitzungen, ein Nummernraum (2026-08-09)

An diesem Tag liefen zwei Sitzungen parallel und haben unabhaengig voneinander
Cache-Versionen vergeben. Live ausgeliefert wurde jeweils die Nummer, die beim
Deploy frei war — deshalb tauchen unten Nummern doppelt auf, und keine der
beiden Reihen ist fuer sich vollstaendig. Beide Bloecke bleiben unveraendert
stehen; sie nachtraeglich umzunummerieren wuerde die Verweise in Commits,
Freigaben und Messprotokollen entwerten.

**Block A — Touch-Ziele** (unten zuerst): Startseite und alle 16 Ansichten auf
44 px, ausgeliefert als v254, v255, v256, v257, v259, v260, v262, v263.

**Block B — Verlauf, Auth, Recht** (danach): ausgeliefert als v253, v258, v261.

Der zuletzt live ausgelieferte Stand ist v263.

---


v252 -> v253 (2026-08-09): von einer parallelen Sitzung belegt (Trefferzahl
waehrend der Suche sichtbar, Frontend-Commit 67f84da) — der Eintrag kommt aus
deren Branch. Hier nur vermerkt, damit die Nummer keine Luecke ist.

v253 -> v254 (2026-08-09): Die Aktionsknoepfe unter jeder Chat-Nachricht waren
auf dem Handy 42x42 px — knapp unter den 44 px, die Apple (HIG) und Google
(Material, 48 dp) als Untergrenze fuer Touch-Ziele nennen. Live nachgemessen
bei 375 px mit echter Geraete-Emulation (pointer coarse, nicht nur ein
schmales Fenster): Kopieren, Bearbeiten und Menue an der Frage sowie
Kopieren, Daumen hoch, Daumen runter, Neu generieren und Menue an der Antwort
lagen alle bei 42x42. Angehoben auf 44x44, aber nur unterhalb 600 px; der
Desktop bleibt bei seinen kompakten 28 px. Zwei Fallen bestimmten den
Selektor: app-surfaces.css setzt mobil `.premium-view button { width: 100% }`
(Spezifitaet 0,1,1), gegen das eine blosse Klassenregel (0,1,0) verliert —
daher ID-Anker `#startLog .msg-act` plus doppelt gewichtete Variante
`.msg-actions .msg-act.msg-act` fuer Leisten ausserhalb des Start-Logs; und
ein schmales Fenster AM RECHNER hat pointer: fine, weshalb der Maus-Fall
darunter ausdruecklich wiederhergestellt wird, sonst haette die neue Regel den
Desktop mitgezogen. Vor dem Deploy gegen die ECHTE Seite geprueft, indem die
neuen Regeln ans Ende des Buendels start-styles.css eingesetzt wurden (die
Kaskadenposition nach dem Deploy): 8 von 8 Aktionsknoepfen 44x44, kein
Ueberlauf, die Leiste der Antwort bricht wie vorgesehen auf zwei Zeilen um (80
px hoch). Die Versionspfeile bleiben bewusst bei 34 px — sie waren nicht Teil
des Auftrags. Der Waechter `npm run measure:touch` fordert jetzt 44 statt 42.

v254 -> v255 (2026-08-09): Die beiden Versionspfeile ("vorherige/naechste
Fassung") waren als einzige Knoepfe der Aktionsleiste noch 34x34 px — sie
standen bei v254 bewusst aussen vor, weil nur die fuenf Aktionen beauftragt
waren. Auf Nachfrage des Betreibers gehen sie jetzt mit: sie stehen in
derselben Leiste und werden mit demselben Daumen getroffen. Auf schmalen
Schirmen also 44x44 wie alles andere; mit Maus bleiben sie bei ihren 22 px.
Dafuer braucht die Maus-Regel einen DOPPELTEN Klassenanker
(`#startLog .msg-version-step.msg-version-step`, 1,2,0): der ID-Anker der
Aktionsregel (`#startLog .msg-act`, 1,1,0) haette eine blosse Klassenregel
sonst geschlagen, obwohl sie spaeter steht — spaeter hilft nur bei gleicher
Spezifitaet. `npm run measure:touch` fordert jetzt auch fuer die Pfeile 44
statt 34.

v255 -> v256 (2026-08-09): Nach den Chat-Aktionsknoepfen die ganze Startseite
bei 375 px durchgemessen (echte Geraete-Emulation, drei Zustaende): 23 von 30
bedienbaren Elementen lagen unter 44 px. Nichts unter 24 px — WCAG 2.5.8 AA
war eingehalten, es ging um die strengere Empfehlung von Apple und Google.
Behoben sind die neun kleinsten: die vier Icons der Kopfleiste (28x28 —
Menue, Logo, Browser, Maus-Wiedergabe) und die fuenf Knoepfe der Eingabezeile
(30x38 bzw. 34x38 — Aktionen, Mikrofon, Audio, Stimme, Senden). Der
Modell-Chip in derselben Reihe waere sonst als einziger 38 px hoch geblieben
und geht in der Hoehe mit (88x44).

Drei Dinge mussten dafuer mitwandern:
1. Der Maus-Knopf stand mit `style="right: 36px"` IM HTML. Inline schlaegt
   jede Media-Query — die Handy-Regel haette ihn nie verschieben koennen, und
   bei 44 px haetten sich Maus- und Browser-Knopf ueberlappt. Die Position
   steht jetzt in styles.css, wo sie ueberschreibbar ist.
2. Das Logo sass 36 px vom linken Rand, direkt hinter dem 28 px breiten
   Menue-Knopf. Bei 44 px endet der erst bei 44; das Logo rueckt auf 48.
3. Mit 44er Knoepfen brauchte die Eingabezeile 382 px bei 375 px Fenster —
   und wurde dabei NICHT gequetscht, sondern zog die ganze Spalte hinaus:
   `.home-feed` ist ein Grid-Item und hat damit min-width: auto, waechst also
   mit seinem breitesten Kind. Dieselbe Ursache wie bei der Chip-Leiste des
   Verlaufs (v252). Statt am Container zu drehen wurde der Platz beschafft:
   gap 4 px, Polster 6 px statt 8-10 px. Danach 375 px, kein Ueberlauf.

Vorab an der ECHTEN Seite geprueft, indem das Live-Buendel start-styles.css
im DOM durch die lokale Fassung ersetzt wurde (gleiche Kaskadenposition):
alle neun Ziele 44x44, Kopf-Icons ohne Ueberlappung (Menue 0-44, Logo 48-92,
Maus 287-331, Browser 331-375), und eine Rasterprobe ueber die volle Breite
zeigt, dass die groesseren Flaechen KEIN anderes Bedienelement verdecken.

Offen bleiben die 11 Eintraege des linken Menues (178x36) und der
Profil-Chip (93x42) — breit genug zum Treffen, es fehlt nur Hoehe.

v256 -> v257 (2026-08-09): Nachtrag zu v256, im Live-Audit gefunden. Bei
OFFENEM linken Menue zeigt das Logo die Wortmarke statt des Symbols und wird
dabei von `body[data-left-menu-state="expanded"] .app-brand-logo` auf
`--app-brand-expanded-height` (28 px) gesetzt — eine Regel mit hoeherer
Spezifitaet als die neue Handy-Regel. Gemessen: 76x28, als einziges
Kopf-Element wieder unter dem Touch-Ziel. Die Breite bleibt der Wortmarke
ueberlassen, die Hoehe nicht: jetzt 76x44 bei offenem und 44x44 bei
geschlossenem Menue, in beiden Faellen ohne Ueberlappung mit dem Menue-Knopf
(0-44 / 48-92 bzw. 48-124).

Merkregel daraus: eine Groessenaenderung muss in JEDEM Zustand des Elements
nachgemessen werden. Der erste Audit-Durchlauf sah das Logo nur geschlossen.

v258 -> v259 (2026-08-09): Die letzten 13 Touch-Ziele der Startseite. Alle
waren breit genug und zu flach: die sechs Eintraege des linken Menues und die
fuenf des Browser-Panels 178x36 bzw. 179x36, der Profil-Chip 93x42, das
Zahnrad 34x36 (dem fehlte auch Breite — es traegt nur ein Symbol und wuchs
deshalb nicht mit), und die Eintraege des Nachrichten-Menues 209x42, zwei
Pixel unter dem Ziel. Alle auf min-height 44; beim Zahnrad zusaetzlich
min-width.

Die eigentliche Gefahr lag nicht bei den Knoepfen, sondern in der Spalte: die
Seitenleiste ist genau fensterhoch und hat overflow-y: hidden. Sechs Eintraege
um 8 px zu erhoehen kann unten etwas abschneiden — und unten sitzt der
Profil-Knopf, der dann unerreichbar waere. Deshalb vorab mitgemessen: die
Leiste bleibt bei scrollHeight 812 zu 812 px Hoehe (nichts abgeschnitten) und
der Profil-Dock endet bei 792 von 812 px, also vollstaendig sichtbar. Bei
offenem UND geschlossenem Menue kein Element mehr unter 44 px.

Damit ist die Startseite bei 375 px vollstaendig auf 44 px: 30 bedienbare
Elemente, null Verstoesse.

(Hinweis: v257 -> v258 ist von einer parallelen Sitzung belegt — "bei vielen
Chats wurde die ganze Liste auf einmal gezeichnet", Frontend-Commit f549210.
Der Eintrag kommt aus deren Branch. Zum zweiten Mal an diesem Tag: vor jedem
Deploy die LIVE ausgelieferte Cache-Version pruefen, nicht die lokale.)

v259 -> v260 (2026-08-09): Nach der Startseite alle 15 App-Ansichten bei
375 px durchgemessen — 107 Touch-Ziele unter 44 px, aber nur vier Ursachen:

1. Zurueck und Schliessen der Ansichts-Leiste waren 32x32 und kamen in JEDER
   Ansicht vor — die kleinsten Ziele der App. Ihre Regel setzt width/height
   mit !important (um die Knopf-Grundregeln der Ansichten zu schlagen);
   dagegen kommt eine normale Deklaration nicht an, die Handy-Regel braucht
   deshalb ebenfalls !important. Das Symbol bleibt 20 px, nur die Flaeche
   waechst. Weil die Leiste absolut ueber dem Inhalt liegt, geht der obere
   Innenabstand der Ansicht von 46 auf 58 px mit — sonst deckt der Knopf die
   Ueberschrift.
2. Die Aktionsknoepfe der Ansichten waren 40 px hoch (325x40, 351x40, 311x40),
   die Formularfelder 42. Beide haengen an `.premium-view` in
   app-surfaces.css. Die Reiter von Einstellungen und Konto brauchten keine
   eigene Regel — sie sind `.premium-view button` und holen ihre Hoehe von
   dort.
3. Die Ansicht Automatisierung faellt aus diesem Muster: sie ist eine
   klassische `.view` mit eigenen Knopf- und Feldregeln (40 bzw. 42 px) und
   blieb nach dem ersten Durchlauf als einzige mit 12 Verstoessen stehen.
   Eigene Media-Query in autonomous-coding.css.
4. Kein Fehler war `#profilePictureInput` (30x44): ein per CSS verborgener
   File-Input, bedient wird der sichtbare Knopf daneben. Der ist gross genug.
   Nebenbefund fuer spaeter: die Versteck-Regel (`width: 1px; clip`) scheint
   nicht anzukommen, sonst waere er 1x1 — unangetastet gelassen.

Vorab an der echten Seite geprueft, indem alle DREI betroffenen Stylesheets im
DOM durch die lokalen Fassungen ersetzt wurden (jeweils an ihrer eigenen
Kaskadenposition): 15 von 15 Ansichten ohne Verstoss, keine Ueberschrift
verdeckt, keine Ansicht laeuft ueber den Rand.

(ohne Versionssprung, 2026-08-09): Waechter fuer Touch-Ziele erweitert. Der
bisherige `npm run measure:touch` misst genau die Chat-Aktionsleiste — und war
gruen, waehrend daneben 130 Ziele unter 44 px lagen (23 auf der Startseite,
107 in den Ansichten). Neu ist `npm run measure:touch:app`: es misst jedes
sichtbare bedienbare Element, die Startseite in DREI Zustaenden (ruhend,
Nachrichten-Menue offen, linkes Menue offen) und alle 16 Ansichten einzeln,
prueft zusaetzlich auf seitlichen Ueberlauf und bricht ab, wenn die
Zeiger-Emulation nicht greift (sonst waere die Messung still falsch-gruen).
Gegenprobe eingebaut: `measure:touch:app:selbsttest` nimmt die 600-px-Regeln
zur Laufzeit heraus und ERWARTET Verstoesse — gemessen 29 entfernte
Eigenschaften, 201 erkannte Verstoesse.

tests/touch-ziele-waechter.test.mjs haelt das ohne Browser fest, was
schiefgehen kann: beide Waechter fordern 44 (nicht mehr 42), jede Route aus
view-routes.js ist abgedeckt, jede Ausnahme traegt eine Begruendung. Der Test
hat sich sofort bezahlt gemacht — er fand, dass die Ansicht /smejj-claw in der
ersten Fassung des Waechters fehlte.

v261 -> v262 (2026-08-09): Nachgang zum Touch-Audit. Der Waechter meldete
`#profilePictureInput` mit 30x44 px — kein Bedienfehler (der Input ist
verborgen, bedient wird der Knopf daneben, 167x44, und ein elementFromPoint an
seiner Stelle findet nichts), aber die Ursache ist lehrreich und die Loesung
war fragil:

- `min-height` schlaegt `height`, egal wie spezifisch die height-Regel ist.
  `#profile #profilePictureInput` setzt height: 1px, doch
  `.premium-view input { min-height: 50px }` gewann — deshalb 44 px hoch.
  Jetzt steht dort ausdruecklich min-height: 1px.
- Verborgen war das Feld allein durch `clip` — eine veraltete Eigenschaft, die
  nur bei position: absolute wirkt. Faellt eine der beiden weg, stuende ein
  natives Datei-Widget mitten in der Konto-Ansicht. `clip-path: inset(50%)`
  sichert es jetzt doppelt ab.

Gemessen nach der Aenderung: min-height 1px greift, clip-path aktiv, das Feld
faellt von 44 auf 28 px Hoehe. Kleiner geht es nicht — Chrome gibt dem nativen
Datei-Widget eine Mindestgroesse von rund 30x28, die `width/height: 1px` nicht
unterschreitet. Sichtbar ist es in keinem Fall, und der Knopf bleibt ein Label
und damit funktionsfaehig.

(Hinweis: v260 -> v261 ist von einer parallelen Sitzung belegt — Themen-
Zuordnung im Verlauf, Frontend-Commit a0cfaef. Das dritte Mal an diesem Tag.)

v262 -> v263 (2026-08-09): Aufraeumen nach dem Touch-Audit, zwei Wachhunde
wieder gruen bekommen.

Diese Datei war auf 1.050 Zeilen gewachsen (Limit 800). Der am 2026-08-07 aus
sw.js uebernommene Bestand (v148 bis v227) steht jetzt in
SW_VERSIONSVERLAUF_2026-08-ARCHIV.md; hier bleiben 470 Zeilen, dort 604. Die
Trennlinie ist keine willkuerliche Zeilenzahl, sondern die vorhandene Naht:
der uebernommene Block ist absteigend sortiert, alles spaeter Angehaengte
aufsteigend.

Ausserdem hatte styles.css durch die Touch-Regeln der letzten Deploys die
Ratchet-Grenze gerissen (1.656 statt 1.589). Statt die Grenze anzuheben sind
die Bloecke dorthin gewandert, wo sie ohnehin besser sitzen: Kopfleiste,
Eingabezeile, linkes Menue und Browser-Panel stehen jetzt in view-chrome.css,
zusammen mit der Grundposition des Maus-Knopfs. Das ist die Groesse der
App-Chrome, nicht des Grundgeruests. Die Kaskade aendert sich nicht —
view-chrome.css liegt im selben Buendel NACH styles.css, und die Selektoren
tragen ihr Gewicht selbst. Nachgemessen: Startseite in beiden Menue-Zustaenden
ohne Verstoss, alle neun Ziele der Kopfleiste und Eingabezeile weiterhin
44x44.

Der damals offene Naming-Verstoss — ein woertliches Zitat gemessener
Modell-Ausgaben im Eintrag v244 -> v245 einer parallelen Sitzung — ist seit dem
2026-08-10 geloest: das Zitat steht unveraendert im
[Archiv B](SW_VERSIONSVERLAUF_2026-08-ARCHIV-B.md) und traegt dort den
NAMING_VIOLATION-Marker des Pruefers, den es fuer genau diesen Fall gibt.
Umschreiben haette die Messung verfaelscht.

---

### Block B

v252 -> v253 (2026-08-09): Waehrend einer Suche war die Trefferzahl
unsichtbar. Sie stand nur im Platzhalter des Suchfelds ("2 von 5") — und ein
Platzhalter ist genau dann verdeckt, wenn etwas eingetippt ist, also genau
dann, wenn man die Zahl braucht. Beim Live-Test "Suche" auf dem Handy im
Screenshot gesehen: "berlin" im Feld, zwei Karten in der Liste, und nirgends
stand, dass es zwei von fuenf sind. Jetzt eine eigene, dezente Zeile ueber
der Liste, die nur bei aktiver Suche ODER aktivem Themen-Filter erscheint.
Beim selben Test bestaetigt und unveraendert richtig: der Fokus bleibt bei
JEDEM Zeichen im Feld und der Cursor am Ende (die Liste wird bei jedem
Tastendruck neu gezeichnet — ohne diese Nachsorge waere die Suche auf dem
Handy unbenutzbar); Gross- und Kleinschreibung sowie Umlaute stimmen
("MUeSLUeM" findet "Mueslueim"); Treffer tief im Nachrichtentext liefern
einen Ausschnitt mit fuehrendem Auslassungszeichen ("…enkapital liegt die
Monatsrate bei rund 4.350 Euro"); waehrend einer Suche entfaellt die Gruppe
"Angeheftet", damit ein Treffer nicht versteckt wird; Themen-Filter und
Suche wirken zusammen (Immobilien + "wohnung" = 1 Treffer, Immobilien +
"wetter" = keiner); Feldbreite und Kopfhoehe bleiben beim Tippen konstant,
kein Layout-Sprung.
v253 -> v254 (2026-08-09): Zwei Handy-Befunde am Themen-Filter, beide beim
Live-Test gefunden. (1) Die Filter-Chips waren 34 px hoch statt 44 — das
min-height: 0, mit dem sie ".premium-view button" ueberstimmen muessen, hatte
ihnen auch die Touch-Groesse genommen; auf dem Handy jetzt wieder 44 px, am
Schreibtisch bleiben sie kompakt. (2) Die Chip-Leiste sprang beim Neuzeichnen
zurueck an den Anfang. Auf 375 px passen nur drei der acht Chips ins Bild —
wer nach rechts wischte und dort "Wissen" antippte, sah die Leiste
zurueckspringen und den gerade gewaehlten Chip nicht mehr; zum Abwaehlen
musste man erneut wischen. Die Wischposition wird jetzt uebernommen, analog
zum Fokus im Suchfeld. Beim selben Test bestaetigt und richtig: ein Chip
filtert, derselbe Chip erneut hebt den Filter auf, ein direkter Wechsel zu
einem anderen Chip funktioniert, "Alle" setzt zurueck; die Zeitgruppen zeigen
im Filter nur die tatsaechlich belegten; die Gruppe "Angeheftet" bleibt im
Filter erhalten; die Zaehlerzeile erscheint mit Filter und verschwindet ohne;
die Chips stehen nach Haeufigkeit sortiert.
v254 -> v255 (2026-08-09): Der Dateiname des Markdown-Exports war unschoen.
Beim Live-Test auf dem Handy mit einem Titel voller Sonderzeichen gemessen:
"Rate 25 % / Zins: 3,8 % Uebersicht" wurde zu "Rate 25   Zins 38
Uebersicht" — die verbotenen Zeichen fielen ERSATZLOS weg und hinterliessen
Mehrfach-Leerzeichen, und aus "3,8" wurde "38". Jetzt werden sie durch ein
Leerzeichen ersetzt und anschliessend zusammengefasst; das Komma bleibt
erlaubt, weil es Bedeutung traegt, der Punkt nicht (er gehoert der
Dateiendung). Ergebnis: "Rate 25 Zins 3,8 Uebersicht.md". Gegen Kantenfaelle
geprueft: "../../etc/passwd" wird zu "etc passwd" (kein Ausbruch aus dem
Zielordner), leere Titel und reine Emoji-Titel fallen auf "unterhaltung"
zurueck, nie laenger als 50 Zeichen, nie ein Zeichen aus /\:*?"<>|. Beim
selben Test bestaetigt: der Menuepunkt ist 44 px hoch und im Bild, der
Download laeuft ueber eine Blob-URL, der Inhalt traegt Titel, Datum und
Nachrichtenzahl als Kopf und danach Frage/Antwort im Wechsel — und zwar den
ROHTEXT samt Markdown-Auszeichnung, nicht die gerenderte Fassung. Nach dem
Klick bleibt kein Link im DOM zurueck.
v257 -> v258 (2026-08-09): Die Verlauf-Liste zeichnet nicht mehr alle Chats
auf einmal. Der erste Block umfasst 30 Karten, der Rest wird beim Scrollen
nachgeladen — ANGEHAENGT, nie neu gezeichnet, sonst verliert man die
Scrollposition. Gemessen bei 100 Chats: erster Aufbau 26 ms -> 10 ms,
Seitenhoehe 11.113 px -> 3.627 px, 750 DOM-Elemente -> rund 240. Angeheftete
stehen weiterhin vollstaendig da (es sind wenige und ausdruecklich als wichtig
markiert). Kein Fenster-Recycling mit fester Zeilenhoehe: die Karten sind je
nach Titel- und Vorschauzeilen 94 bis 116 px hoch, geschaetzte Hoehen liessen
die Liste beim Scrollen springen. Ausgeloest wird ueber das scroll-Ereignis
und NICHT ueber einen IntersectionObserver — der feuerte im eingebetteten
Browser ueberhaupt nicht, auch nicht in einem Kontrollversuch ausserhalb des
Moduls; wo er stillbleibt, waere die Liste bei 30 Karten abgeschnitten und
der Rest unerreichbar. Zusaetzlich prueft ein requestAnimationFrame direkt
nach dem Zeichnen nach: ist die Liste kuerzer als der Bildschirm, wird nie
gescrollt und der naechste Block muss von selbst kommen. Gegengemessen: alle
100 Karten kommen an (31 -> 61 -> 91 -> 100), keine doppelt (100 eindeutige
Kennungen), keine doppelten Gruppen-Ueberschriften, die Marke verschwindet am
Ende samt Scroll-Listener, und Suche wie Filter setzen den Block zurueck.

Nachtrag zur Nummer: geplant war v256. Beim Deploy zeigte sich, dass v256 UND
v257 live bereits vergeben sind — eine Parallelsitzung hat beide direkt ins
Frontend-Repo gestellt (Commits c376606 und ae9ec2f, 44-px-Touch-Ziele in
Kopfleiste und Startseite), ohne sie hier einzutragen. Der Code der Live-sw.js
war ausser Kommentaren und der Nummer identisch mit dem lokalen Stand; das
Deploy-Artefakt ist deshalb auf der LIVE-Datei aufgebaut, damit deren
Begruendungen nicht verlorengehen.

v260 -> v261 (2026-08-09): Themen-Zuordnung im Verlauf nachgeschaerft. Gemessen
an 49 realistischen Anfragen: vorher 43 % richtig, jetzt 49 von 49. Die
Zuordnung besteht aus vierzehn Mustern, die in FESTER Reihenfolge geprueft
werden — der erste Treffer gewinnt. Drei Ursachen:

1. Ein breites Wort in einem fruehen Muster legt ein spaeteres Thema still.
   "Finanzen" enthielt \beuro\b und stand vor "Einkauf" — damit landete
   "Standventilator unter 80 Euro zum Kaufen" unter Finanzen, und Einkauf kam
   bei keiner einzigen Anfrage je zum Zug. Behoben, indem Finanzen ZWEIMAL in
   der Tabelle steht: die eindeutigen Geldwoerter (Bank, Kredit, Steuer) vor
   Einkauf, das Breite (Euro, Rate, Rechnung) danach. So bleibt "Suche mir die
   guenstigste Bank" eine Geldfrage und "Wo bestelle ich Patronen" ein Einkauf.
2. Vier Muster hatten ein fuehrendes \b, das genau die haeufigste Schreibweise
   aussperrte: \brate\b traf "Monatsrate" nicht, \bvertrag "Handyvertrag" nicht,
   \barzt\b "Arzttermin" nicht, \bserver\b "Serverraum" nicht. Im Deutschen ist
   das zusammengesetzte Wort der Normalfall.
3. Umschriften ohne Umlaut trafen nichts. Getippt wird oft "uebersetze",
   "pruefe", "guenstig" — die Muster kannten nur "übersetze". [üu] deckt die
   Folge "ue" NICHT; ueberall steht jetzt (ü|ue).

Neu sind die Themen Recht, Reise und Gesundheit — vorher landeten solche Chats
samt DSGVO-, Visum- und Arztfragen unter "Allgemein". Zwei Reihenfolgen sind
bewusst gesetzt: Recht vor Websites ("Impressum fuer meine Webseite" ist eine
Rechtsfrage) und Technik vor Wissen ("was bedeutet non-fast-forward" ist keine
Frage der Allgemeinbildung). "temperatur" ist aus Wetter entfernt und an einen
Wetterbezug gebunden, weil es sonst "Die Temperatur im Serverraum" einfing.

Abgesichert durch tests/verlauf-themen.test.mjs (6 Tests, in check:frontend):
35 Beispielanfragen, 12 absichtlich gebaute Fallen mit einem Wort aus einem
frueheren Thema, die Wortgrenzen-Faelle, die Umlaut-Umschriften und die
Reihenfolge Finanzen-Einkauf-Finanzen.

v263 -> v264 (2026-08-10): Uebersetzungen nachgezogen. Commit 65781ea
(Zahlungs-Rechtstexte) hatte 20 neue deutsche Texte in die Oberflaeche
gebracht, ohne sie zu uebersetzen — in allen 13 Fremdsprachen erschienen sie
auf Deutsch. Aufgefallen ist es nicht, weil tests/i18n-ui.test.mjs nur die
Gegenrichtung prueft (kein verwaister Schluessel), nicht die fehlende
Uebersetzung.

Nachgezogen sind die 11 nicht-rechtlichen Meldungen in 14 Sprachen:
Anmeldelink (senden, gesendet, nicht erreichbar), GitHub-Login (startet,
fehlgeschlagen), Apple-Login-Hinweis und die fuenf Meldungen rund um die
Datenschutz-Einwilligung. Die deutschen Schluessel wurden dabei EXAKT aus dem
Quellcode gelesen statt abgetippt — ein falsches Sonderzeichen (…, —, „ ")
haette den Schluessel still verwaisen lassen.

Die 9 Rechtstexte bleiben bewusst unuebersetzt: AGB, Widerrufsbelehrung, der
Stripe-Weiterleitungshinweis, der Preis- und Laufzeithinweis, zwei
Kuendigungstexte und die zugehoerigen Link-Beschriftungen. Eine Uebersetzung
ist dort eine rechtliche Aussage und gehoert zur Anwaltspruefung, die fuer die
Zahlungstexte ohnehin aussteht (Betreiber-Entscheidung 2026-08-10).

Ausserdem entfernt: ein verwaister Schluessel aus derselben Aenderung — der
alte, zusammengesetzte Stripe-Satz, den 65781ea im Quellcode in mehrere
t()-Aufrufe aufgeteilt hatte. Er stand noch in allen 14 Sprachdateien und
wurde von nirgendwo mehr nachgeschlagen; check:frontend ist damit wieder gruen
(427/427).

Der Versionssprung ist noetig, weil i18n/ui.js im Precache liegt: die
Sprachdateien werden mit `?v=` geladen, und dieser Wert geht von 3 auf 4 —
ohne ihn wuerde der Browser-Cache die alten Fassungen weiterliefern.

v264 -> v265 (2026-08-10): Zweite Uebersetzungsluecke geschlossen — und sie
war die groessere. Beim Erstellen der Anwaltsvorlage fuer die Rechtstexte fiel
auf, dass die Schaltflaeche "Zahlungspflichtig abonnieren" in allen 14
Fremdsprachen deutsch beschriftet war. Das ist die Beschriftung nach § 312j
Abs. 3 BGB, an der die Zahlungspflicht erkennbar sein muss.

Der Grund, warum weder Menschen noch der neue Test es gesehen haben: die
Oberflaeche baut ihre Zeilen ueber Hilfsfunktionen —
`dataAction("Plus", "…", "id", "Zahlungspflichtig abonnieren")` —, und die
uebersetzen ihre Argumente erst im Rumpf. Im Code steht an dieser Stelle kein
`t("…")`, sondern `t(text)`. Der Waechter vom selben Tag suchte nach direkten
Texten und ging daran vorbei.

Der Test bekommt dafuer einen kleinen Parser statt einer Regex: Klammern und
Zeichenketten muessen mitgezaehlt werden, sonst trennt ein Komma IM Text die
Argumente an der falschen Stelle und die Zuordnung Parameter->Text kippt
lautlos. Er findet 11 uebersetzende Hilfsfunktionen und 142 Texte; faellt eine
davon unter 8 Funktionen oder 100 Texte, schlaegt der Test an, statt still
gruen zu melden. Gegenprobe gemacht: ein entfernter Schluessel wird erkannt.

Nachtraeglich uebersetzt sind drei nicht-rechtliche Texte, die dabei mit
auffielen: "Sprachminuten (Premium-Stimme)", der zugehoerige Zaehlhinweis und
die Beschreibung der Premium-Stimme. Die vier Zahlungstexte (§ 312j-Knopf und
die drei Tarifbeschreibungen mit Preis und USt) bleiben unuebersetzt und
stehen als begruendete Ausnahmen im Test — sie sind Teil der Anwaltsvorlage
[RECHTSTEXTE_SPRACHEN_ANWALTSVORLAGE_2026-08-10.md](../RECHTSTEXTE_SPRACHEN_ANWALTSVORLAGE_2026-08-10.md).
Ebenfalls ausgenommen, aus offensichtlichem Grund: GitHub, Google Drive und
Slack sind Eigennamen.

Wie bei v264 geht die Ladequery der Sprachdateien mit (?v=4 -> ?v=5), sonst
liefert der Browser-Cache die alten Fassungen; i18n/ui.js liegt im Precache,
daher der sw-Sprung.

v265 -> v266 (2026-08-10): Die Kuendigungs-E-Mail ist jetzt uebersetzbar
aufgebaut. Sie ist der § 312k-Notweg, solange kein Stripe-Kundenportal-Link
hinterlegt ist: der Knopf oeffnet eine vorformulierte Mail. Betreff und Text
waren fest im Code verdrahtet und liefen nicht durch die Uebersetzung — ein
Verbraucher mit tuerkischer oder japanischer Oberflaeche bekam eine DEUTSCHE
Kuendigungserklaerung zum Absenden vorgelegt.

Am sichtbaren Verhalten aendert sich heute nichts: die Erklaerung laeuft jetzt
durch t(), es gibt aber bis auf Weiteres nur die deutsche Fassung, und ohne
Uebersetzung faellt t() auf den deutschen Text zurueck. Der Zweck ist die
Vorbereitung — sobald die Kanzlei Wortlaute liefert, ist nur noch ein Eintrag
je Sprache noetig statt einer Codeaenderung. Beide Texte stehen als begruendete
Ausnahmen im i18n-Waechter und in der Anwaltsvorlage
[RECHTSTEXTE_SPRACHEN_ANWALTSVORLAGE_2026-08-10.md](../RECHTSTEXTE_SPRACHEN_ANWALTSVORLAGE_2026-08-10.md)
(dort Nr. 13 und 14).

Wirklich uebersetzt sind die drei FELDNAMEN der Mail (Konto-E-Mail, Name,
Datum) — Formularbezeichnungen, keine rechtliche Aussage. "Name" gab es
bereits, die anderen beiden sind neu in 14 Sprachen.

Ein Test haelt den Aufbau fest (`tests/i18n-ui.test.mjs`): Betreff und Erklaerung
muessen durch t() laufen, die Feldnamen zusaetzlich uebersetzt sein. Ohne ihn
faellt ein Rueckbau auf feste Strings niemandem auf — genau so war der Zustand
bis heute.

account-privacy.js liegt cache-first im Precache, die Ladequery der
Sprachdateien geht auf ?v=6.

v266 -> v267 (2026-08-10): chat-history-view.js aufgeteilt — reine
Umstrukturierung, kein Verhaltenswechsel. Die Datei war auf 1.091 Zeilen
gewachsen (Limit 800) und der letzte offene Frontend-Verstoss von
check:guidelines. Der Schnitt liegt an der Naht, die im Code schon markiert
war ("Titel, Vorschau, Thema — alles nur fuer die ANZEIGE"): alles, was aus
einem Chat-Objekt TEXT macht und keinen Ansichts-Zustand kennt, wohnt jetzt
in chat-history-text.js (Titel-, Vorschau- und Themen-Aufbereitung, die
THEMEN-Tabelle, Zeitgruppen, Suche mit Hervorhebung, Markdown-Export samt
Dateinamen) — 354 Zeilen mit genau 9 Exporten. Die Ansicht selbst (Zustand,
Zeichnen, Nachladen, Menue, Umbenennen) bleibt in chat-history-view.js, jetzt
771 Zeilen.

Das neue Modul steht NEU im SHELL-Precache: check:precache-imports haette die
Luecke NICHT gefunden, denn es verfolgt nur relative Importe — der Import
laeuft aber wie alle App-Importe absolut ueber /assets/. Ohne den Eintrag
waere die Verlauf-Ansicht offline kommentarlos tot gewesen.

Zwei Tests lasen die ausgelagerten Teile direkt aus der alten Datei
(verlauf-themen: THEMEN-Tabelle und NUR_BILD; chat-title-auto: dateiname) und
zeigen jetzt auf das Textmodul. Die Zusicherungen selbst sind unveraendert —
sie waren es, die den Umzug sofort gemeldet haben.

v267 -> v268 (2026-08-10): Rueckbau eines eigenen Fehlers, minutenschnell.
Der v267-Deploy des Verlauf-Refactorings hat per `git add -A` im Frontend-Repo
uncommittete Arbeitsstaende ANDERER Sitzungen mitgepusht: das Rechts-Paket
(agb.html, widerruf.html, datenschutz, impressum — laut Marktreife-Audit
ausdruecklich NICHT deployed, offener Blocker EU-Vertreter), eine halbfertige
parallele Aufteilung des Verlaufs (chat-history-format.js, -cards.js,
offline-banner.js) und Aenderungen an auth-gate, settings-runtime,
settings-surface und onboarding-welcome.

Der Revert (Frontend-Commit 6e5eb25) stellt alle fremden Pfade auf den Stand
davor zurueck; das geprueft deployte Refactoring bleibt. v268 statt still bei
v267 zu bleiben, weil Nutzer, die den Fehl-Stand in den Minuten dazwischen
installiert haben, die fremden Dateien sonst FUER IMMER im Cache behielten —
der SHELL-Inhalt aendert sich, also muss die Nummer springen. Die fremden
Arbeitsstaende sind unversehrt: als uncommittete Arbeitskopie im Frontend-Repo
wiederhergestellt, zusaetzlich in ~/smejj-frontend-sicherung-20260810 und in
der Historie (32fb5e6). Live nachgeprueft: agb.html antwortet wieder 404, die
Verlauf-Ansicht rendert mit Karten, Gruppen, Themen-Chips, Suche samt
Hervorhebung und Markdown-Export.

Merkregel, die schon im Projektgedaechtnis stand und trotzdem verletzt wurde:
im geteilten Frontend-Repo NIEMALS `git add -A` — immer gezielte Pfade. Der
Arbeitsbaum dort gehoert allen Sitzungen gleichzeitig.
