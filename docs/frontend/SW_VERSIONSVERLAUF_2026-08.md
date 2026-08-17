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

v215 -> v216 (2026-08-04): Sichtbarer Arbeitsfortschritt im Chat
(ai/chat-stream.js + chat-markdown.css) und autonomer Lauf IM Faden
statt Ansichtswechsel (NEU autonomous-thread-run.js, dynamisch aus
autonomous-intent.js geladen — deshalb ein eigener Precache-Eintrag,
sonst waere er offline tot). Beide Dateien liegen cache-first im
Precache; ohne Versionssprung erreicht die Aenderung wiederkehrende
Nutzer nie (caches.match laeuft mit ignoreSearch).
v219 -> v220 (2026-08-04): Qualitaetsseite sagt jetzt das Alter der Messdaten
und nimmt das Sechs-Stunden-Versprechen zurueck (es gibt keinen Zeitplan).
Ausserdem frische Messwerte: 98,04 %, 0 kritische Verstoesse. verlauf.js
und verlauf-messwerte.json liegen cache-first im Precache — ohne
Versionssprung saehen wiederkehrende Nutzer weiter den alten Stand.
smejj-shell-v221 -> smejj-shell-v221 (2026-08-04): /verlauf-messwerte.json kommt jetzt
netz-zuerst statt cache-first (LIVE_DATEN_PFADE). Ohne das waere die
freigegebene automatische Qualitaetsmessung wirkungslos gewesen —
wiederkehrende Nutzer haetten ewig den alten Stand gesehen.
v221 -> v222 (2026-08-05, Freigabe A): Premium-Stimme repariert — config.js
schickt voiceStatus/voiceTts zur Salad-Bridge (Zeabur meldete "verfuegbar"
und lehnte dann ab), voice-premium-tts.js bekommt ein 3-s-Zeitbudget bis zum
ersten Ton plus Anmelde-Header. Beide Dateien liegen cache-first im
Precache — ohne Versionssprung erreicht der Fix wiederkehrende Nutzer nie.
v222 -> v223 (2026-08-05, Freigabe C): dauerhaft eingeloggt — /api/auth/me
liefert bei jeder Nutzung ein frisches Token (180 Tage), account-sessions.js
speichert es (nur bestehende localStorage-Tokens; Passkey bleibt
session-only). Import-Query auf ?v=6, damit auch der HTTP-Cache mitzieht.
v227 -> v228 (2026-08-06, Konkurrenz-Radar V1): Riesen-Einfuegung wird
Anhang-Chip — composer-paste-attach.js NEU im SHELL (importiert von app.js),
app.js verbindet Chips beim Senden, start-styles.css bekommt die Chip-Optik.
Alle drei liegen cache-first im Precache — ohne Versionssprung saehen
Bestandsnutzer den neuen Import nie und app.js braeche beim Laden ab.
v228 -> v229 (2026-08-06, Konkurrenz-Radar V4 Stufe 1): Verlauf anpinnen —
chat-store.js bekommt togglePinChat + Pins-zuerst-Sortierung (Pins sind von
der 100er-Aufraeumung ausgenommen), chat-history-view.js den Anpinnen-Knopf.
ALLE chat-store-Importeure (chat-actions, search, chat-history-view,
index.html) springen gemeinsam auf ?v=pin-20260806 — ein abweichender
Spezifizierer erzeugte eine ZWEITE Store-Instanz mit eigenem Zustand.
v229 -> v230 (2026-08-06, Konkurrenz-Radar V2): Live-Mitschrift im
Sprachmodus — die Antwort streamt als Text sichtbar unter der Welle mit
(#voiceModeReply in index.html, setVoiceModeReply in composer-tools.js,
Optik in start-styles.css). app.js zieht die composer-tools-Import-Query
auf ?v=voice-mitschrift-20260806 mit, damit auch der HTTP-Cache springt.
v231 -> v232 (2026-08-06, Konkurrenz-Radar V4 Stufe 2): Die Suche findet
jetzt auch PROJEKT-DATEIEN. Vorher durchsuchte search.js nur state.uploads
(die fluechtigen Uploads der laufenden Sitzung) — die Dateien in den
Projekt-Manifesten waren unauffindbar. Neue Gruppe "Projekt-Dateien" mit
20-s-Cache, weil findResults() bei jedem Tastendruck laeuft.
v232 -> v233 (2026-08-06, Konkurrenz-Radar Ausbaustufe 5): anonyme
Icon-Nutzungsmessung. icon-nutzung.js NEU im SHELL (importiert von
profile-dock.js, damit index.html unter dem Start-Lock bleibt). Zaehlt nur
Kennungen aus einer festen Positivliste, rein lokal in localStorage, kein
fetch/sendBeacon, keine Zeitstempel je Klick. Auswertung als Knopf
"Icon-Nutzung" in der Status-Ansicht (per JS eingehaengt).
v233 -> v234 (2026-08-06, Konkurrenz-Radar V5): Quellen-Panel.
quellen-panel.js NEU im SHELL (importiert von profile-dock.js). Sammelt die
Links aus den angezeigten Antworten, zeigt sie oben in der Datei-Ansicht
(dorthin fuehrt der Quellen-Knopf) und setzt einen Zaehler an den Knopf in
der rechten Panel-Leiste. Nichts wird gespeichert — die Liste wird bei jeder
Aenderung frisch aus dem angezeigten Chat gelesen.
v236 -> v237 (2026-08-08/09): Verlauf-Ansicht neu gestaltet. An den 34 echten
Chats des Betreibers gemessen: 19 von 34 Titeln endeten mitten im Wort,
einer war ein Dateipfad ("[Anhang: IMG_4911.jpeg] @/Users/..."), 8 Titel
waren doppelt und dadurch nicht unterscheidbar, ein Suchfeld gab es nicht,
und "Loeschen" stand direkt neben "Oeffnen". chat-history-view.js baut die
Liste jetzt aus Zeitgruppen (Angeheftet/Heute/Gestern/Diese Woche/30 Tage/
Aelter), zeigt je Karte einen aufbereiteten Titel plus Vorschau, filtert
ueber ein Suchfeld nach Titel UND Nachrichteninhalt (mit Trefferausschnitt)
und legt die Aktionen ins "⋯"-Menue — neu darin: als Markdown sichern.
Der GESPEICHERTE Titel bleibt unangetastet, aufbereitet wird nur die
Anzeige; von Hand vergebene Titel (titleEdited) bleiben wie sie sind.
KEIN eigenes ⌘K: das Kuerzel gehoert bereits der globalen Suche (search.js).
v237 -> v238 (2026-08-09): doppelte Ueberschriften. In sechs Ansichten stand
der Name zweimal untereinander — `<p class="eyebrow">Verlauf</p>` direkt
ueber `<h2>Verlauf</h2>`, ebenso bei Suche, Websites, Coding,
Automatisierung und Nutzer. Das Eyebrow ist als KATEGORIE ueber einem
abweichenden Titel gedacht ("Browser" ueber "Lokaler Browser"); wo beide
gleich lauteten, war es nur Dopplung. Genau diese sechs `<p>`-Zeilen sind
aus index.html entfernt, die zwoelf sinnvollen Paare bleiben unveraendert.
v238 -> v239 (2026-08-09): Themen im Verlauf berichtigt. Meldung des
Betreibers: "Themen stimmen nicht ganz, Bank-Chat gehoert zu Finanzen". Die
Regel "Bilder" stand an erster Stelle und traf auf das Anhang-Praefix — ein
Anhang ist aber ein TRANSPORTWEG, kein Thema. "Bilder" greift jetzt nur noch
als Rueckfall, wenn inhaltlich gar nichts erkennbar ist, und geprueft wird
auf dem um Anhang und Dateipfade bereinigten Text (sonst schlaegt
"@/Users/…/IMG_4911.HEIC" als Bild-Treffer an). Beim Nachmessen aller 35
Chats fiel ein zweiter Fall auf: die vier iMild.com-Pruefungen standen unter
"Tests", obwohl sie Website-Pruefungen sind. Neue Kategorie "Websites";
"Tests" bleibt den Modell-Prueflaeufen (Regressionstest, "antworte nur mit",
Hauptstadt-Fragen). `\.com` taugt dabei NICHT als Website-Merkmal — "Sag mir,
was smejj.com ist" ist eine Frage ueber das Projekt. Gemessen: genau 5 von 35
Chats wechseln, kein weiterer verrutscht.
v239 -> v240 (2026-08-09): drei Themen-Grenzfaelle entschieden (Betreiber:
"Entscheide du selber als Expert"). (1) "Nenne die Hauptstadt von Italien"
stand unter Tests. Ob eine harmlose Frage ein Prueflauf war, laesst sich
nicht zuverlaessig erkennen — und sie faelschlich als Test zu etikettieren
ist die anmassendere Annahme. Neue Kategorie "Wissen"; "Tests" verlangt jetzt
ein eindeutiges Signal (Regressionstest, "antworte nur mit", "Stufe X …
Test") und behaelt genau einen Chat. (2) "Such mir eine Spiegel" war
Recherche, ist aber eine PRODUKTSUCHE — neue Kategorie "Einkauf", die vor
Recherche greift. Recherche behaelt "such", sonst verliert "Kannst du
Internet nicht greifen …" seinen Bezug. (3) "Was ist 7 mal 8?" ist "Rechnen"
— die Regel verlangt eine echte Rechenform, damit die Bueroe-Finanzierung
bei Immobilien bleibt. Gemessen: alle 35 Chats zugeordnet, 12 Kategorien.
v240 -> v241 (2026-08-09): Handy-Ansicht des Verlaufs nachgemessen. Der
Weg dorthin ist selbst eine Merkregel: Chrome laesst sein Fenster nicht
unter 958 CSS-px, die 600-px-Media-Query greift dort also NIE; ein iframe
mit 375 px auf derselben Seite wird von frame-guard.js sofort entfernt.
Gemessen wurde darum mit echter Geraete-Emulation (375 px, Touch,
Mobile-UA) gegen die byte-identische Live-Datei (SHA-256 abgeglichen).
Vier Befunde: (1) "Donnerstag, 09:13 · 30 Nachrichten" passt nicht in eine
Zeile und brach mitten im Wort ab ("30 Nachrich") — auf schmalen Schirmen
steht jetzt "30 Nachr.". (2) Der Platzhalter "18 Unterhaltungen
durchsuchen…" wurde abgeschnitten, dort jetzt "Durchsuchen…". (3) Der
"⋯"-Knopf war 32x32 px und die Menue-Eintraege 35 px hoch — beides unter
der 44-px-Untergrenze von Apple und Google fuer Touch-Ziele; beide jetzt
44 px. (4) Die wischbare Chip-Leiste (13 Chips, 1254 px in 335 px) endete
optisch hart am Rand; ein weicher Rand zeigt jetzt, dass es weitergeht.
Die beiden Texte haengen am JavaScript, nicht an CSS — beim Drehen des
Geraets zeichnet ein resize-Listener sie darum neu, aber nur beim echten
Wechsel der Schwelle.
v241 -> v242 (2026-08-09): Auto-Titel aus der Bruecke. chat-title-auto.js NEU
im SHELL, importiert von chat-history-view.js (nicht aus index.html — die
bleibt so unter dem Start-Lock; gleiches Muster wie icon-nutzung.js in
profile-dock.js). Das Modul holt fuer Chats ohne eigenen Titel einen kurzen
aus /api/chat. Live gemessen: "[Anhang: IMG_4911.jpeg] @/Users/…/IMG_4911.HEIC
Geh chrome Browser Bank of America" -> "Bank of America Ueberweisung" (750 ms);
"geh browser iMild.com teste ob alles fehlerfrei ist?" -> "Test von iMild
Funktionen" (460 ms). Was die Bruecke NICHT loest: zwei verschiedene
Wetter-Chats bekamen beide "Wetter in Silicon Valley" — die Entdopplung in
chat-history-view.js bleibt deshalb aktiv. Ruecksicht auf das geteilte
Kontingent: seriell mit 1,2 s Pause, hoechstens acht je Runde, nur bei
offener Verlauf-Ansicht und sichtbarem Tab, 8 s Zeitbudget je Anfrage. Ein
neuer Test (tests/chat-title-auto.test.mjs, in check:frontend) haelt die
Bereinigung fest; er fand beim Schreiben sofort einen Fehler — ein
Wortfilter verwarf "Titel: Wetterabfrage Berlin" komplett, jetzt entscheidet
allein der Doppelpunkt am Zeilenende.
v242 -> v243 (2026-08-09): Auto-Titel an der Eroeffnungsfrage verankert. Am
Live-Lauf ueber die echten Chats aufgefallen: zwei von acht Titeln trafen ein
NEBENTHEMA. "Welche Bank fuer meine iMild LLC?" wurde zu "Banken in Silizium
Valley" (Nachricht 2 fragte nach Banken im Silicon Valley), und der Chat
"smeeting nach\"" zu "Fahrradfahren in der Stadt" (ab Nachricht 2 ging es
darum). Kein Halluzinieren, sondern falsche Gewichtung: das Modell nahm den
auffaelligsten Punkt aus dem mitgeschickten Verlauf. Jetzt vier statt sechs
Nachrichten je Anfrage, und der Auftrag lautet "Worum geht es hauptsaechlich?
Nimm im Zweifel das Thema der ERSTEN Frage." Gegengemessen: die beiden
Fehlfaelle werden zu "Bank fuer iMild LLC" und "Smeeting und Kommunikation",
die bereits guten Titel bleiben unveraendert.
v243 -> v244 (2026-08-09): persistActive() verliert keine Zustaende mehr.
Beim Aufraeumen nach dem Auto-Titel-Deploy aufgefallen: die Funktion baut ein
neues Chat-Objekt und ERSETZT damit das gespeicherte — was im Objektliteral
fehlt, ist danach weg. Es fehlten zwei Felder. `pinned` war ein BESTEHENDER
Fehler: wer einen angehefteten Chat oeffnete und weiterschrieb, verlor beim
naechsten Speichern die Anheftung. `titleAuto` haette denselben Weg genommen —
ein von der Bruecke geholter Titel waere beim Weiterschreiben wieder durch die
erste Frage ersetzt worden. Beide werden jetzt weitergetragen, und der Titel
bleibt stehen, sobald er von Hand ODER von der Bruecke kommt. Zwei Tests in
tests/chat-title-auto.test.mjs halten das fest.
v244 -> v245 (2026-08-09): Auto-Titel auf erste Frage + erste Antwort
verkuerzt. Beim Live-Test ueber alle 28 Chats war die Schaerfung aus v243
nicht genug: "Schreibe eine ESM-Funktion parseBudget(value)…" wurde zu
"Fahrradfahren und Code", weil Nachricht 2 danach fragte. Die Chats des
Betreibers wechseln das Thema oft schon ab Nachricht 2 — eine Bitte an das
Modell ("nimm im Zweifel die ERSTE Frage") reicht dagegen nicht. Mit nur zwei
Nachrichten KANN kein zweites Thema im Kontext stehen; der Fehler ist damit
strukturell ausgeschlossen. Gemessen: "Parse Budget Funktion" statt
"Fahrradfahren und Code", "Wetter in Sacramento" statt "Wetter in
Kalifornien", "Smejj Com Informationen" statt "Smejj Kommt Ins Gespraech" (woertliche Modell-Zitate; so heisst die Plattform niemals).
Preis: ein Titel wurde unschaerfer ("Bank of America Ueberweisung" ->
"Online Bankueberweisung vorbereiten"). Drei Gewinne gegen einen Verlust.
v245 -> v246 (2026-08-09): Auch die kurzen Chats bekommen einen Titel — mit
einem Sparfilter davor. MIN_NACHRICHTEN faellt von vier auf zwei (Frage und
Antwort genuegen; genau so viele gehen ohnehin an die Bruecke). An den
sieben verbliebenen Chats gemessen wurden sechs dadurch besser ("ich suche
eine buroe: 1 oder 2 Zimmer in Eine Neue…" -> "Buero in Silicon Valley",
"kannst du Internet nicht greifen und ueber…" -> "Berlin Akten
Informationen"). EINER wurde schlechter: "Was ist 7 mal 8?" -> "Mathematische
Multiplikationsergebnisse". Daraus die neue Regel: ist die erste Frage kurz
(<= 30 Zeichen) und ohne Ballast (kein Anhang-Praefix, kein Dateipfad), IST
sie bereits der beste Titel und bleibt stehen. Das verhindert die
Verschlimmbesserung und spart zugleich jeden zweiten Anfragezyklus.
v246 -> v247 (2026-08-09): Umbenennen war auf dem Handy nicht bedienbar. Beim
Nachmessen der Handy-Ansicht mit den neuen Titeln gefunden: Eingabefeld,
"Speichern" und "Abbrechen" standen in EINER Zeile (flex, nowrap) und
brauchen zusammen 426 px. Die Karte bietet bei 375 px Fensterbreite nur
265 px. Gemessen lag die rechte Kante des "Abbrechen"-Knopfes bei 463 px —
also weit ausserhalb von Karte UND Fenster; der Knopf war schlicht nicht
erreichbar. Ausserdem waren alle drei Elemente nur 35 px hoch. Jetzt bekommt
das Feld eine eigene Zeile, die beiden Knoepfe teilen sich die naechste, und
alle drei sind mindestens 44 px hoch. Desktop bleibt unveraendert (eine
Zeile, 35 px) — dort passen 426 px muehelos.
v247 -> v248 (2026-08-09): Die Knopf-Regeln des Verlaufs kamen live gar nicht
an. Erst der Test auf der ECHTEN Seite (integrierter Browser, 375 px,
Geraete-Emulation, UI-Schalter statt Anmeldung) zeigte es: app-surfaces.css
bringt ".premium-view button" mit — Spezifitaet (0,2,0). Eine blosse Klasse
wie ".ch-neu" (0,1,0) verliert dagegen, unabhaengig von der Reihenfolge der
Stylesheets. Gemessen war der Knopf "Neuer Chat" dadurch 249 px breit statt
74 (die Handy-Kurzform "＋ Neu" kam nie an), das Suchfeld daneben schrumpfte
auf 58 px und war unbenutzbar, und die Chips waren eckig (border-radius 8 px
statt 999). Alle Knopf-Regeln haengen jetzt an #chatHistory. WICHTIG fuer
kuenftige Tests: eine Teststrecke ohne die Stylesheets der App kann diesen
Fehler nicht zeigen — dort greift jede Regel. Zwei neue Tests halten den
Anker fest und verbieten Backticks im CSS-Block (ein Backtick im Kommentar
beendete das Template-Literal und machte die Datei ungueltig; node --check
hat es vor dem Deploy gefangen).
v248 -> v249 (2026-08-09): Der #chatHistory-Anker aus v248 reichte nicht. Die
Gegenprobe auf der echten Seite zeigte: app-surfaces.css setzt unterhalb von
760 px ".premium-view button { width: 100% }". Damit fuellt JEDER Knopf die
volle Zeilenbreite — "Neuer Chat" war weiterhin 249 px breit und drueckte das
Suchfeld auf 58 px, und jeder Themen-Chip stand als eigener Balken
untereinander statt in einer Reihe. Die Knopf-Regeln setzen jetzt
ausdruecklich width: auto. Merkregel: bei fremden Regeln reicht es nicht, die
Spezifitaet zu erhoehen — man muss auch wissen, WELCHE Eigenschaften sie
setzen. Erst das Auflisten aller passenden Regeln (element.matches gegen
document.styleSheets) hat width: 100% sichtbar gemacht.
v249 -> v250 (2026-08-09): Das "⋯"-Menue im Verlauf verschwand von selbst
wieder. Beim Live-Test "Chat oeffnen" auf dem Handy gefunden: nach dem
Oeffnen eines Chats und der Rueckkehr in den Verlauf war das gerade
angetippte Menue nach gut 100 ms weg. Ursache: das Menue haengt IN der Karte
und ueberlebt kein replaceChildren; eines der mehreren verzoegerten
Neuzeichnen (popstate-Handler, Auto-Titel-Anstoss, chats-changed nach dem
Speichern des geoeffneten Chats) lief hinein. Welcher genau trifft, ist ein
Rennen und wechselte zwischen den Messungen — behandelt wird darum die
Wirkung: zeichne() zeichnet nicht, solange ein Menue offen ist, merkt sich
den Auftrag und holt ihn beim Schliessen nach. Beim selben Test bestaetigt:
Oeffnen per Tap auf die Karte oder das Themen-Tag laedt alle Nachrichten in
der richtigen Reihenfolge und springt zur Startseite, ein Tap auf "⋯" oeffnet
den Chat NICHT, und die geoeffnete Karte bleibt im Verlauf markiert.
Randbefund in fremdem Code: die 16 Aktionsknoepfe unter den Chat-Nachrichten
sind 42x42 px und liegen damit knapp unter der 44-px-Empfehlung.
v250 -> v251 (2026-08-09): Der leere Verlauf war eine Sackgasse. Beim
Live-Test "Loeschen" auf dem Handy gefunden: Wer seinen letzten Chat
loescht, sah nur noch den Hinweistext — mit den Karten verschwand auch der
Kopf und damit der "Neuer Chat"-Knopf, der einzige Weg, der von dieser
Ansicht nach vorn fuehrt. Der Knopf steht jetzt auch im leeren Verlauf, mit
eigenem Baustein (bausteinNeuKnopf) an beiden Stellen; das Suchfeld bleibt
dort weg, weil es ohne Chats nichts zu suchen gibt. Auf dem Handy traegt er
im leeren Zustand die volle Beschriftung statt der Kurzform, weil dort Platz
ist. Beim selben Test bestaetigt und unveraendert richtig: der erste Tap auf
"Loeschen" fragt nur nach ("Wirklich loeschen?", 44 px hoch, rot), loescht
nichts; ohne Bestaetigung verfaellt die Frage nach vier Sekunden und der
Knopf steht wieder auf "Loeschen…"; der zweite Tap trifft genau die
angetippte Karte (mittlere von drei geloescht, die anderen blieben); Liste,
Themen-Chips und Zaehler stimmen sofort; ein Loeschen waehrend aktiver Suche
laesst den Suchbegriff stehen und zeigt korrekt "Nichts gefunden".
v251 -> v252 (2026-08-09): Die wischbare Chip-Leiste wischte live NIE. Beim
Live-Test "Anheften" auf dem Handy sichtbar geworden: sobald vier Chips nicht
mehr in die Zeile passten, zog die Leiste die GANZE Ansicht ueber den
Bildschirmrand statt zu scrollen — Karten, Kopf und Ueberschrift ragten
hinaus (Container 406 px bei 375 px Fenster, Karten bis x=401). Ursache: der
Container der Ansicht (.output) ist ein GRID-Item, und Grid-Items haben
min-width: auto; sie wachsen mit ihrem breitesten Kind. Die Leiste steht auf
nowrap und war 372 px breit. Mit min-width: 0 darf der Container schrumpfen,
dann greift overflow-x: gemessen faellt .output von 406 auf 351 px, die
Karten auf 317, und die Leiste ist mit 372 px Inhalt in 317 px Fenster
endlich wischbar. Der frueher gemessene "Erfolg" der Chip-Leiste stammte von
der Teststrecke, wo .output ein normaler Block ist und sich selbst begrenzt.
Beim selben Test bestaetigt: Anheften holt die Karte in die Gruppe
"Angeheftet" ganz nach oben, das Menue heisst danach "Nicht mehr anheften",
das Pin-Symbol steht im Titel — und `updatedAt` bleibt unveraendert, ein 40
Tage alter Chat behaelt in der Fusszeile korrekt sein Datum ("30. Juni 2026")
statt nach oben zu rutschen.

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

Der fruehere Naming-Befund in Zeile 196 ist aufgeloest (2026-08-10): das
woertliche Modell-Zitat "Smejj Com Informationen" (so heisst die Plattform niemals)
bleibt unveraendert erhalten und ist jetzt als Negativbeispiel gekennzeichnet;
die Messung ist damit unverfaelscht UND das Guideline-Tor gruen.

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

## v297 — Video-Erzeugung Stufe 3 (2026-08-12)

Chat rendert erzeugte Videos als HTML5-Player: chat-markdown.js (MD_VIDEO nur
data:video-base64 aus der eigenen Bruecke, playsinline fuer iOS) und die
.chat-video-Regeln aus chat-markdown.css (seit v296 im Buendel). Quelle ist die
neue Video-Spur der Bruecke (v132): eigener Video-Worker
(workers/smejj-video-worker) erzeugt echte MP4s — kenburns auf CPU ueber den
Bild-Maler, animatediff sobald ein GPU-Dienst freigegeben ist.

v474 -> v475 (2026-08-16): Drei Betreiber-Befunde vom Startseiten-Testlauf.
(1) "Neuer Auftrag" in der Code-Spur leerte nur das Eingabefeld und liess den
offenen Chat WEITERLAUFEN — die naechste Aufgabe landete im alten Gespraech
(Betreiber-Chat: "Warum schreibst du unter alte Chat?"); jetzt ruft der Punkt
newChat() (spur-start.js b34g). (2) Der fixe "Hilfe"-Knopf oben ist raus —
Platz von oben nach unten (topbar-krume.js b33f, entfernt auch Bestands-DOM).
(3) Die Drei-Punkte lagen auf Raendern: bei eigenen Nachrichten halb auf dem
Blasenrand, nach einer af-Karte auf dem Kartenrahmen. Jetzt sitzen sie in der
letzten Blasen-Zeile (padding-right schafft Platz) bzw. 2 px unter der Karte
(design-v11.css im Buendel).

v475 -> v476 (2026-08-16): Anhang- und Diktat-Knopf der Code-Leiste waren
unsichtbare Striche — ghost-button bringt padding 0 14px mit, im 30px-Knopf
blieben dem SVG 2px Innenbreite. #code .code-mini setzt jetzt padding:0 und
das SVG flex:none (design-v11.css im Buendel, Marke codemini-20260816).

v476 -> v477 (2026-08-16, "Chat wie ChatGPT" Schritt 1): Runter-Pfeil im
Gespraech — neues additives Modul chat-runter-pfeil.js (?v=1): wer
hochgescrollt hat, sieht mittig ueber dem Schreibfeld einen runden Pfeil,
Klick springt ans Ende; waehrend des Stroms zieht ein MutationObserver mit.
Kein Eingriff in Senden/Strom/Verlauf.

v477 -> v478 (2026-08-16, "Chat wie ChatGPT" Schritt 2): Stopp-Knopf.
ai/chat-stream.js fuehrt eine Registry aktiver Leser, exportiert
stoppeChatStrom() (cancel -> Schleife endet sauber ueber done, Markdown und
Notiz-Fallback laufen normal) und meldet "smejj:chat-strom" mit der Zahl
laufender Stroeme; try/finally deregistriert auch bei Netzabbruch. Neues
additives Modul chat-stopp.js (?v=1) legt waehrend des Stroms ein
Stopp-Quadrat UEBER den Senden-Pfeil der Startseite (Overlay, kein Eingriff
in dessen Handler; Code-Seite unberuehrt). Beide neuen Module im Precache.

v478 -> v479 (2026-08-16): Runter-Pfeil ohne requestAnimationFrame — rAF
feuert im versteckten Tab nie (Messregel 2026-08-09), und die Arbeit ist nur
ein hidden-Toggle. chat-runter-pfeil.js ?v=2.

v479 -> v480 (2026-08-16): Runter-Pfeil-Klick springt im versteckten Tab
direkt (behavior auto statt smooth — smooth haengt an rAF) und blendet den
Pfeil sofort aus. Fixture-Beweis: 26542/26542 px, Stopp-Overlay deckt den
Senden-Knopf exakt und geht mit dem Strom-Ereignis auf/zu. ?v=3.

v480 -> v481 (2026-08-16, "Codierung wie Claude"): Codebloecke im Chat wie
Claude. (1) Kopfleiste: pre.chat-code[data-language]::before zeigt den
Sprachnamen als Kopfstreifen (sticky gegen den horizontalen Ueberlauf), der
Kopieren-Knopf sitzt rechts darin; Bloecke ohne Sprache unveraendert.
(2) Syntax-Farben: neues additives Modul chat-code-farben.js (?v=1) faerbt
NACH dem Rendern (Kommentar/String/Zahl/Schluesselwort/Funktion, ein
Regex-Pass, Ausgabe erneut escaped); textContent bleibt ZEICHENGLEICH —
Verlauf, Modellkontext und Vorlesen unveraendert (Fixture-Beweis). Renderer
chat-markdown.js unangetastet.

v481 -> v482 (2026-08-16, "Codierung wie Claude"): Codeblock als Datei
herunterladen — neues additives Modul chat-code-download.js (?v=1), Knopf
neben Kopieren (right 46px; der Ordner-Speichern-Knopf rueckt auf 86px).
Dateiname code-N.<endung> aus data-language (25 Sprachen gemappt, sonst
txt). Haengt sich an fertige .chat-code-wrap-Huellen von chat-code-copy.js.
Fixture-Beweis: Klick erzeugte Blob 31B und Download "code-1.py".

v482 -> v483 (2026-08-16): Code-Spur-Punkt heisst wie bei Claude kurz "Neu"
— "Neuer Auftrag" wurde in der schmalen Spur abgeschnitten ("Neuer Auf…",
im Betreiber-Chrome gesehen). spur-start.js b34h.

v483 -> v484 (2026-08-16, Betreiber-Screenshots Claude vs. smejj): Beim
DIREKTEN Aufruf von /code zeigte die Spur die START-Punkte und markierte
"Start" — sie zeichnete vor dem Router, und #start traegt is-active
statisch im Markup. Zwei Griffe: (1) codeAktiv zaehlt auch
location.pathname === "/code"; (2) ein MutationObserver auf der
#code-Klasse zeichnet nach, sobald der Router wirklich umschaltet
(spur-start.js b34i). Dazu (3): der Code-Gruss zeigte beim Direktaufruf
keinen Namen — das Profil-Dock laedt sein Konto erst danach; ein
Beobachter auf #profileDockName zieht den Gruss nach (code-flaeche.js v8,
wie Claudes "Was steht als Naechstes an, AlanBest?").

v484 -> v485 (2026-08-16, Betreiber: "gesamte Flaeche nutzen, kompakt,
Text nicht sichtbar beim Tippen"): CODE-Seite randlos. #code.view wird eine
bildschirmhohe Flex-Spalte (padding 42/12/8 statt .view-30px-Rundum),
codeflaeche flex:1, Gruss-padding 2px, codeunten schliesst buendig; die
980px-Textmitte gilt im Code-Log nicht (max-width none). Schreibfeld
waechst elastisch nach oben (input-Listener in code-flaeche.js v9, Deckel
40vh dann innen scrollen; senden() setzt die Hoehe zurueck).
Fixture-Messung 1280x720: Gruss-Oberkante 42px, Luecke unten 8px, seitlich
12px, Feld 26->176->26px.

v485 -> v486 (2026-08-16): Code-Seite — Text beginnt GANZ oben (padding-top
4px statt 42px): Betreiber-Nachtrag "Text soll ueber Browser-Icon kommen";
das fixe Icon schwebt rechts ueber dem Inhalt.

v486 -> v487 (2026-08-16, Betreiber: "warum sehe ich aktuellen Chat links
nicht?"): das OFFENE Gespraech ist in beiden Spur-Listen markiert
(is-active am spur-chat-Eintrag, bestehende Optik) — wie bei Claude. Es
steht durch updatedAt ohnehin oben; die Spur zeichnet bei jedem
Speicher-Tick neu (smejj:chats-changed). spur-start.js b34j.

v487 -> v488 (2026-08-16, Claude-Icon-Abgleich): Code-Spur-Zeichen wie
Claude — "Mehr" traegt ein Chevron statt des falschen Haekchens, "Regeln"
Schieberegler statt der Sonne (eigene SPUR_ICONS in spur-start.js b34k,
die geteilte Icons-Bibliothek bleibt unangetastet). "Zuletzt
verwendet"-Eintraege tragen wie bei Claude eine kleine Markierung vor dem
Titel; das offene Gespraech fuellt sie cyan. Die Markierungen rendern
VIERECKIG — Betreiber-Designgesetz schlaegt Claudes Kreise.

v488 -> v489 (2026-08-16, Betreiber: "Code-Bereich abgleichen — statt
Claude die ZCode-App als Vorbild"): Codebloecke im Chat wie ZCode
(Anatomie 1:1 aus dem App-Bundle gelesen, streamdown-Baustein). Kopfzeile
an JEDEM Block: Sprachname klein/mono/gedaempft ohne eigenen Streifen;
Bloecke ohne Sprache bekommen "text" (chat-code-copy.js, nur data-Attribut
— nie textContent). Rechts drei reine Icon-Knoepfe wie ZCode: Kopieren
(zwei abgerundete Blaetter, Haekchen-Feedback 2 s), Download
(Ablageschale), NEU Ein-/Ausklappen (Chevron dreht, zu = nur Kopfzeile;
ZCodes "1 file changed"-Muster). Hover hellt nur die Farbe auf (ZCode:
muted -> foreground, kein Grundwechsel); Beschriftung "Kopieren" am
Codeblock entfaellt (aria-label bleibt). Syntax-Farben auf GitHub-Dark
(ZCodes Farbwelt): Kommentar #8b949e, String #a5d6ff, Zahl #79c0ff,
Schluesselwort #ff7b72, Funktion #d2a8ff. Aktionsleisten-Kopiersymbol
(chat-actions.js b26f) traegt dieselbe abgerundete Zeichnung.
Fixture-Beweis (Scratchpad, :8613): Kopieren-Feedback hin und zurueck,
Einklappen 198 -> 36 px -> 198 px, aria-expanded wechselt, "text"-Fallback
sichtbar. Clipboard-Verweigerung im unfokussierten MCP-Tab ist eine
Messfalle, kein Codefehler. CACHE_NAME v329.

v489 -> v490 (2026-08-16, Betreiber-Wahl "Aktionsleiste angleichen",
ZCode-Abgleich Runde 2): Antworten zeigen wie ZCode Kopieren + Daumen
hoch/runter direkt in einer EIGENEN Zeile darunter (linksbuendig), dann
das Drei-Punkte-Menue und die Uhrzeit der Antwort (msg-zeit, aus
meta.createdAt — Leiste ist Geschwister des Eintrags, textContent des
Verlaufs bleibt sauber; syncZeit heilt bei jedem ensureBar). Ersetzt
BEIDE Drei-Punkte-Entscheide vom selben Tag (nur-Menue-Leiste und
"dieselbe Zeile"): die waren fuer EINEN Punkte-Knopf gebaut, mit vier
Icons kollidierte die Ueberlagerung mit dem Text (Fixture-Beweis).
Eigene Nachrichten behalten die ruhige Drei-Punkte-Blasenzeile.
Daumen-Icons exakt ZCodes Lucide-Zeichnungen; Menuekopf der Antwort ohne
Doppelwege (nur noch Neu generieren + Rest). chat-actions.js b26g,
chat-actions-menu.js v3, CACHE_NAME v330. Fixture leiste.html: Daumen
an/aus/wechsel gemessen, Uhrzeit erscheint, keine Textkollision.

v490 -> v491 (2026-08-16, Betreiber: "Inline-Chips", dann "+ Icon im Code
wie Claude, 1:1" und "viereckiger Punkt im Schreibfeld wenn es
arbeitet"): DREI Stuecke. (1) Inline-Code als Chip exakt wie ZCodes
streamdown-inline-code: gefuellter Grund, kein Rahmen, 0.875em, padding
2x6 (Rundung nimmt eckig.css zurueck). (2) Das Plus im CODE-Feld oeffnet
ein Menue in Claudes 1:1-Optik (an claude.ai gemessen: Kasten
rgb(32,32,31), 302px, Zeilen 32px/14px, Kuerzel ⌘U rechts, Untermenue-
Pfeil, Trennlinie, oeffnet nach oben) — dahinter NUR echte Wege:
Dateien/Fotos (composerFileInput, auch per Cmd/Strg+U), Foto aufnehmen
(composerCaptureInput), Zum Projekt (codeProjektChip), Recherche
(Vorlage). Claudes Skills/Konnektoren/Plugins existieren hier nicht und
stehen NICHT drin (Blindgaenger-Verbot). (3) Arbeits-Punkt: 9px-Quadrat
in Cyan links in der codeleiste, pulsiert, haengt am echten Signal
smejj:chat-strom (chat-stream.js) — sichtbar nur solange ein Strom
laeuft; prefers-reduced-motion stellt die Animation ab.
code-flaeche.js v10, CACHE_NAME v331. Fixture code.html: Menue
auf/zu/Escape/Aussenklick, alle vier Wege, Punkt an/aus gemessen.

v491 -> v492 (2026-08-16, Betreiber: "Werkzeug-Karten" + Screenshot des
Claude-CODE-Plus-Menues "genau so zeigen und funktionieren"): VIER
Stuecke. (1) Datei-Karte wie ZCode: nach "In den Project-Ordner
speichern" bleibt am Codeblock eine Karte (Zeichenkasten, Dateiname,
"Im Project-Ordner gespeichert · N Zeilen") — ALLER Text aus
data-Attributen per CSS attr(), textContent bleibt sauber; chat-store
sichert innerHTML, die Karte uebersteht Neuladen. (2) Arbeitsschritte-
Falte im ZCode-Look: gedaempfte Zeile mit drehendem ›-Chevron statt
details-Dreieck, Schritte ruecken mit Haarstrich ein. (3) Plus-Menue
exakt nach Betreiber-Screenshot: Dateien/Fotos ⌘U, Ordner hinzufuegen
(verbindeOrdner am aktiven Code-Project; ohne Project erst Projektwahl),
Slash-Befehle, Konnektoren › (Einstellungen/Anbieter). Claudes "Plugins
hinzufuegen…" fehlt BEWUSST — kein Plugin-System, kein Blindgaenger.
(4) Slash-Befehle FUNKTIONIEREN: "/" am Feldanfang oeffnet die Palette
mit den neun ECHTEN Vorlagen (/recherche /code /tests /fehler /erklaere
/funktion /bild /video /text), Tippen filtert, Klick fuellt das Feld.
DAZU Regressions-Fix aus v491: die Inline-Chip-Regel faerbte auch
Codeblock-Zeilen (ID-Selektor schlug den Block-Reset; im Fixture
gemessen) — Block-Reset mit gleicher Staerke nachgezogen.
Fixture-Beweise: Palette auf/filter/Wahl/Escape, Aussenklick-Falle
behoben, Karte erscheint mit leerem textContent. code-flaeche.js v11,
chat-code-copy.js zcode2, CACHE_NAME v332.

v492 -> v493 (2026-08-16, Betreiber: "checke claude noch mal — was fehlt
noch"): die drei Luecken zum Claude-CODE-Menue geschlossen. (1) "Plugins
hinzufuegen …" als fuenfter Punkt — oeffnet die Werkzeuge-Uebersicht
(smejjs Plugin-Katalog; echtes Ziel statt Attrappe). (2) Konnektoren hat
ein ECHTES Untermenue wie Claudes Flyout (Betreiber-Screenshot): Zeile
"Projekt-Ordner" mit Schalter, der den realen Zustand zeigt und wirklich
verbindet/trennt (projekt-ordner.js); darunter "Konnektoren verwalten"
(Einstellungen) und "Konnektoren durchsuchen" (Werkzeuge). Schalter
zeichnet VIERECKIG (Designgesetz schlaegt Claudes Pille), AN in Cyan.
(3) Cmd/Strg+U oeffnet die Dateiauswahl — nur in der aktiven
CODE-Ansicht. Fixture-Beweise: 5 Menuepunkte, Flyout auf/zu, Schalter
34x20 eckig, trennen+verbinden beides gemessen; Menue-CSS galt nur fuer
role=menuitem und liess die Schalter-Zeile nackt (Riesen-Icon, gemessen)
— Selektoren sauber um menuitemcheckbox erweitert, span-flex-Falle mit
34px-Override geloest. code-flaeche.js v12, CACHE_NAME v333.

v493 -> v494 (2026-08-16, Betreiber: "Foto hinzufuegen hat nicht
geklappt — checke alle Funktionen"): Live-Sweep im echten Chrome —
Menue, Slash (9 Befehle), Cmd+U, Konnektoren-Flyout (zeigte den echten
Ordner AOHotel.com) alle in Ordnung; der Anhang-Weg war doppelt kaputt:
(1) bindAttachInput und bindBildAnhang griffen das Ziel-Feld EINMAL beim
Laden (immer #startMessage) — in der CODE-Ansicht landete der Verweis
unsichtbar im Start-Feld (live gemessen: startFeld "[Anhang: probe.txt]",
Code-Feld leer). Beide holen das Feld jetzt ZUR AENDERUNGSZEIT ueber
getInput(); composerInput() ist ansichts-bewusst (CODE aktiv ->
#codeAufgabe). Damit folgt auch das Diktat dem richtigen Feld.
(2) Ein FOTO ueber "Dateien oder Fotos hinzufuegen" war nur toter
Text-Verweis — Bilddateien laufen jetzt durch uebernehmeBildDatei
(Bild-Verstehen, erstes Bild traegt Inhalt, weitere als Referenz).
Markenkette: composer-plus-menu werkzeuge-2 -> composer-tools
werkzeuge-2 -> app.js b51 -> index.html; composer-bild-anhang bleibt
BEWUSST unversioniert (drei Importer ohne ?v — EINE Modulinstanz,
pending-Bild), Frische kommt vom CACHE_NAME v334.

v494 -> v495 (2026-08-16, Betreiber-Screenshot mit vier Punkten):
Schreibfeld der CODE-Seite aufgeraeumt. (1) Anhang-Verweise stehen NIE
mehr als Text im Feld — code-flaeche.js zieht "[Anhang/Bild …]"-Zeilen
bei jedem input in Chips (#codeAnhaenge) ueber dem Text; Entfernen-x
verwirft bei Bildern auch den Vision-Zwischenspeicher; beim Senden
reisen die Verweise unsichtbar mit (Anhang allein ist sendbar). (2) Die
Projekt-Zeile ueber dem Feld ist WEG — der Chip sitzt schlank unten in
der Leiste (Menue ankert jetzt am .codefeld wie das Modus-Menue), Platz
oben gehoert dem Text. (3) Feld schmaler: padding 13/14 -> 8/12, Leiste
margin 14 -> 6. (4) Leiste als Geister: Auto/Gruendlich/Projekt ohne
Pillen-Grund (aktiv = Cyan-FARBE statt Fuellung), +/Mikro ohne runden
Grund, Hover hellt auf. code-flaeche.js v13, CACHE_NAME v335.

v495 -> v496 (2026-08-16): Projekt-Chip kappte VORN ("ojekt: …") —
text-overflow greift nicht in inline-flex; der Chip ist jetzt
inline-block und kappt hinten mit Punkten. CACHE_NAME v336.

v496 -> v497 (2026-08-16, Betreiber: "bei Claude sieht man das nicht"):
der Projekt-Chip ist ganz unsichtbar — die Leiste zeigt wie Claude nur
Auto/Gruendlich/+/Mikro. Der Knopf bleibt im DOM fuer die
programmatischen Wege (Plus-Menue "Ordner hinzufuegen" ohne Project,
Projektwahl); Projekte weiter ueber die Spur ("Meine Projekte").
CACHE_NAME v337.

v497 -> v498 (2026-08-16, Betreiber: "woher weiss ich, welcher Ordner
verbunden ist?"): Ordner-Chip wie Claude — NUR wenn am aktiven
Code-Project ein Ordner verbunden ist, steht ueber dem Feld ein kleiner
Chip "📁 Name ×"; das × trennt (trenneOrdner) und der Chip verschwindet.
Ohne Ordner bleibt der Platz voellig frei. Kein CSS-Neubau (nutzt die
Anhang-Chip-Optik). code-flaeche.js v14, CACHE_NAME v338.

v498 -> v499 (2026-08-16, Betreiber: "sehr schmal, wie EINE Zeile,
Leiste trifft die Unterkante" — Variante A abgestimmt): Composer der
CODE-Seite ultra-flach. Ansicht unten 0 statt 8px (Leiste buendig an
der Kante), codeunten 4px, Feld-Polster 5/10/4, Chip-Zeile margin 3px,
Chips 12px, Leiste margin 2px, Chips 2/6px; Icon-Knoepfe und Senden bei
praezisem Zeigegeraet 28px (Touch behaelt 34/42). Schriftgroesse des
Schreibfelds UNVERAENDERT 16.5px — grosse Schrift ist Betreiber-Gesetz.
CACHE_NAME v339.

v499 -> v500 (2026-08-16, Betreiber-Screenshots): Modus-Menue 1:1 wie
Claude — Kopfzeile "Modus", Zeilen linksbuendig OHNE Trennstriche,
Beschreibung gedaempft darunter (eine Zeile, Punkte), rechts Haken
(cyan) + Ziffer; die Ziffern 1-4 SIND Kurztasten, solange das Menue
offen ist. Claudes "Berechtigungen umgehen"-Zeile fehlt BEWUSST (kein
solches System — Blindgaenger-Verbot). code-flaeche.js v15,
CACHE_NAME v340.

v500 -> v501 (2026-08-16, Betreiber: "keine Trennstriche"): die feinen
Linien zwischen den Modus-Zeilen kamen aus der generischen Knopf-Regel
(Lichtkante inset 0 1px + Grundton 0.055, live gemessen) — in beiden
Code-Menues mit ID-Gewicht abgeschaltet; Hover bleibt cyan.
CACHE_NAME v341.

v501 -> v502 (2026-08-16, Betreiber: "Randbeleuchtung stoert die Augen
beim Programmieren; Spur links leuchtet zu stark und soll kompakt wie
Claude"): (1) Leuchten ueberall gedaempft — --v11-cy-glow 0.22->0.10,
Lichtkante 0.13->0.07, Focus-Ringe der Schreibfelder von hartem
1px-Cyan+30px-Schein auf weiche Linie+12px. (2) Aktive Nav-Zeile der
Premium-Ansichten (design-cyan-views.css, gemessen: Rahmen 0.58 +
Glow 14px + Seitenbalken) jetzt wie Claude: ruhige helle Toenung
0.07, kein Rahmen, kein Schein. (3) Spur kompakt: Zeilen 28px statt
36, padding 3px, Schrift 13.5, gap 1px; Markierungspunkt 5px und
gedaempft (cyan 0.55 statt Vollton). CACHE_NAME v342.

v502 -> v503 (2026-08-16, Betreiber: "nach Kopieren soll Vorlesen
kommen; Rest unter drei Punkten; ohne Rahmen, sehr schmal, fast an der
Textkante; klein kompakt modern edel"): Leiste der Antwort =
Kopieren · Vorlesen · Daumen hoch/runter · drei Punkte · Uhrzeit.
Vorlesen aus dem Menue in die Leiste (Lucide volume-2); Menue nur noch
regen/copy-plain/fork/remove. Leiste rueckt auf -7px an die
Textunterkante, gap 0, Knoepfe am Desktop 26px, Icons 15px, Uhrzeit
11.5px. chat-actions.js b26h, chat-actions-menu v4, CACHE_NAME v343.

v503 -> v504 (2026-08-16, Betreiber: "Hintergrund mit Rahmen — soll
transparent ohne Hintergrund sein"): die Aktions-Icons unter
Nachrichten trugen im Code-Bereich den generischen Knopf-Kasten
(Grundton 0.055 + Lichtkante, live gemessen) — mit
Doppelklassen-Gewicht abgeschaltet, nur Hover toent noch leicht.
CACHE_NAME v344.

v504 -> v505 (2026-08-16, Betreiber: "Icons sollen die letzte Textzeile
treffen"): die Leiste hebt die gemessene Luecke exakt auf
(margin-top -13px = 7px Eintrag-Polster + Icon-Kopfraum) — die Icons
haengen unmittelbar an der Textunterkante. CACHE_NAME v345.

v505 -> v506 (2026-08-16, Betreiber: "zwischen Texten keine Trennlinie,
kompakt"): der Haarstrich zwischen Chat-Eintraegen ist weg, Polster
7->6px — die Nutzer-Blase trennt optisch genug. CACHE_NAME v346.

v506 -> v507 (2026-08-16, Betreiber: "einfügen ist das LETZTE WORT der
Zeile — Icons sollen danach in derselben Zeile stehen"): die Leiste
wird per Range ans gemessene Textende geschoben (marginLeft/-Top als
Inline-Style, Neuberechnung bei jedem ensureBar-Tick und bei resize);
reicht der Platz in der Zeile nicht, bleibt sie wie bisher darunter.
chat-actions.js b26i, CACHE_NAME v347.

v507 -> v508 (2026-08-16): Inline-Leiste griff nie — zwei Messfallen
(live): (1) Range auf Elementende liefert 0x0; jetzt Ende des LETZTEN
Textknotens (TreeWalker). (2) offsetWidth der Block-Leiste ist die
volle Breite (613px); Platzpruefung jetzt gegen die Inhaltsbreite
(erstes bis letztes Kind). chat-actions.js b26j, CACHE_NAME v348.

v508 -> v509 (2026-08-16): Inline-Position lief nur VOR fertigem Layout
(Messwerte live spaeter korrekt, Styles blieben leer). ensureBar
positioniert jetzt 60ms verzoegert (kein rAF — feuert im versteckten
Tab nie), plus Nachlauf nach document.fonts.ready. chat-actions.js
b26k, CACHE_NAME v349.

v509 -> v510 (2026-08-16): der automatische Anstoss fehlte weiter —
onLogChanged zieht die Inline-Position jetzt 250ms nach jeder
Log-Aenderung nach (der resize-Weg hatte die Logik live bewiesen:
ml 76px / mt -38px). chat-actions.js b26l, CACHE_NAME v350.

v488 -> v489 (2026-08-16, Nutzertest): Der Urfehler in zweiter Form — wer
/code frisch oeffnete (Gruss sichtbar) und sofort schrieb, haengte die
Aufgabe an das ZULETZT OFFENE Gespraech; beim Adoptieren tauchten dessen
alte Eintraege mit auf. senden() trennt jetzt zuerst (newChat), wenn die
Flaeche leer aussieht; ein sichtbar geoeffnetes Gespraech laeuft weiter
(code-flaeche.js v9).

v510 -> v511 (2026-08-16, Betreiber-Screenshot des Claude-Vierecks im
Schreibfeld): Arbeits-Viereck rechts oben im CODE-Schreibfeld — frei =
gedaempfter Umriss, arbeitet = in Logo-Cyan gefuellt mit leisem
Opacity-Puls (kein Leuchten, Augen-Regel; prefers-reduced-motion
schaltet den Puls ab). Signal ist dasselbe Strom-Ereignis
smejj:chat-strom, das den Stopp-Knopf steuert (detail.laufen > 0).
code-flaeche.js v16, CACHE_NAME v348.

v489/v510 -> v511 (2026-08-16 nachts): ZWEI Dinge in einem Zug. (1) Der
Urfehler-Fix v489 (leere Code-Seite trennt beim Senden) faehrt jetzt auf
dem v510-Stand der Parallelsitzung aus (code-flaeche.js ?v=16 — die
Fassung traegt beide Staende). (2) REPARATUR: das live ausgelieferte sw.js
trug CACHE_NAME v350 — ein veralteter Stand war beim v509/v510-Deploy
mitgekommen; Clients bekamen dadurch KEIN Precache-Update mehr. v511 liegt
ueber jeder je verteilten Nummer und setzt die Update-Kette wieder in Gang.

v511 -> v512 (2026-08-17, Release-Kollision aufgeloest): Die
Parallelsitzung deployte nach v511 weiter (Live-sw stand auf v511,
Arbeitskopie auf v350) — dabei gingen design-v11/start-styles MIT dem
Arbeits-Viereck-CSS nicht mit: das Viereck war live als Element da,
aber unsichtbar. Jetzt konsistent: CACHE_NAME v512 (nie rueckwaerts),
Styles-Marker arbeit2, alle vier Dateien in EINEM Push, Hash-verifiziert.
Merkregel bleibt: vor jedem Push Live-CACHE_NAME lesen.

v512 -> v513 (2026-08-17, Betreiber: "wenn nicht arbeitet, soll man
nicht sehen"): das Arbeits-Viereck ist im Ruhezustand UNSICHTBAR
(opacity 0 + visibility hidden, kein Umriss mehr) — es erscheint nur
cyan-pulsierend, solange ein Strom laeuft. CACHE_NAME v513.

v513 -> v514 (2026-08-17, Betreiber-Klarstellung: "wenn arbeitet muss
leuchten, wenn nicht arbeitet soll nicht leuchten"): das Viereck ist
im Ruhezustand wieder SICHTBAR als gedaempfter Umriss (wie Claudes
Kaestchen) — es leuchtet nur nicht; beim Arbeiten cyan + Puls. Der
v513-Zwischenstand (ganz unsichtbar) war ein Missverstaendnis.

v514 -> v515 (2026-08-17): Doppeltes Arbeitszeichen bereinigt — der
ALTE Arbeits-Punkt aus v491 (links in der Leiste, Klasse .code-arbeit
mit Dauer-Cyan) faerbte das neue Claude-Viereck dauerhaft mit (live
gemessen: bg cyan trotz an=false). Alte CSS-Regel + JS-Erzeugung
entfernt; es gibt nur noch DAS Viereck rechts oben: ruhig = Umriss,
arbeitet = cyan + Puls. code-flaeche.js v17.

v511 -> v512 (2026-08-17, Startseiten-Nutzertest): Warte-Reste-Waechter —
eingefrorene Zeilen abgebrochener Laeufe ("⏳ Anfrage laeuft … 3 s",
"smejj denkt nach …") standen als DAUERHAFTE Eintraege im gespeicherten
Verlauf, samt Aktionsleiste und Uhrzeit. Neues additives Modul
chat-warte-reste.js (?v=1) entfernt sie beim Anzeigen — doppelt gesichert:
istWarteRest erkennt NUR vollstaendige Wartesignal-Texte (TUEV-Test mit
kaputten und gesunden Proben), und der LETZTE Eintrag wird nie angefasst
(ein lebendes Wartesignal ist immer der letzte). Der Speicher-Beobachter
sichert danach die bereinigte Fassung.

v512 -> v516 (2026-08-17): Der Warte-Reste-Waechter fuhr als v516 aus —
die Parallelsitzung hatte inzwischen v513-v515 verteilt (Arbeits-Viereck);
v512 war nie live. Ausgeliefert wurde deren v515-Stand plus Waechter.

v515 -> v516 (2026-08-17, Betreiber: "warum kann ich bei Code nicht
Modelle waehlen? Ich will die aktuellsten — ueber unser Cline-Guthaben"):
Der Modellname unten rechts im Code-Bereich ist jetzt ein KNOPF (wie
Claudes "Fable 5") und oeffnet ein Modell-Menue im Modus-Menue-Stil:
oben smejj 1.0 (Hausmodell, folgt der Stufe), darunter der ECHTE
Cline-Katalog live vom Control (Empfohlen: claude-opus-5, grok-4.5,
gpt-5.6-sol, kimi-k3 · Cline Pass: glm-5.3 u.a. · Kostenlos).
Wunschliste-Abgleich: Opus 5, GPT-5.6, Kimi K3, GLM 5.3 verfuegbar;
Fable 5 und Gemini gibt es im Cline-Katalog NICHT (ehrlich keine
Eintraege erfunden). Auswahl nutzt die BESTEHENDEN Speicher/Wege des
Start-Pickers (smejj.model.selected.v2="Cline" + smejj.cline.model.v1,
Ereignisse smejj:cline-selected/model-selected) — der Chat-Weg mit
runClineChat-Weiche bleibt unangetastet. Ohne verbundenen Key zeigt
das Menue eine ehrliche Hinweis-Zeile mit Sprung in die Einstellungen.
code-flaeche.js v18.

v516 -> v517 (2026-08-17, Nutzertest Suchen+Verlauf): ZWEI Halb-Commits
der v502-v515-Welle repariert. (1) chat-history-view.js benutzte
confirmingProjektId ohne Deklaration — JEDER ⋯-Klick im Verlauf warf einen
ReferenceError, bevor das Menue erschien: Umbenennen/Anheften/Loeschen
waren unerreichbar (b47d). (2) account-privacy.js rief renderZugang auf,
die Funktion fehlte — die Abo-Anzeige der Kontoseite crashte beim Fuellen;
jetzt definiert, fail-safe ohne paidEmail (b46m; Markenkette
premium-surfaces b41b, app.js b52). Suchen und Verlauf sonst gruen
(Volltext-Treffer, Filter "1 von 62", Zeitgruppen, Treffer-Klick oeffnet).

v518 -> v519 (2026-08-17): Status IM rechten Panel — der Status-Reiter
zeigte bisher per data-jump die grosse Systemzustand-Ansicht und verliess
den Chat. Neues additives Modul panel-status.js (?v=1) faengt den Klick in
der Capture-Phase ab und ADOPTIERT die echte .status-grid (derselbe
Knoten, Live-Werte bleiben live) in den Panel-Halter; zweiter Klick,
anderer Reiter oder das Oeffnen der Systemzustand-Ansicht geben sie
zurueck. Fixture-Beweis: kein Sprung, Live-Wert-Update im Panel, saubere
Rueckgabe, andere Reiter springen normal.

v516 -> v517 (2026-08-17): Modell-Menue im Code-Bereich meldete "Key
verbinden" trotz verbundenem Key — die Status-Abfrage nutzte nur den
localStorage-apiToken (401). Jetzt dieselbe Anmeldung wie
provider-settings.js: Sitzungs-Token, dann Zugangs-Token, plus Cookies.
code-flaeche.js v19. AUSSERDEM heute serverseitig (Bau-Branch
feature/auth-redesign-github-magiclink, NICHT main — Zeabur baut von
dort): Cline-Verbindungstest nutzt gewaehltes/empfohlenes Modell statt
gesperrter Gratis-Modelle (403 product surfaces) und 64 statt 4
Test-Tokens (GPT-5.6-Minimum). Tresor-Geheimnis per
provider_tresor_scharfschalten.mjs gesetzt. BEWIESEN mit dem Key des
Betreibers: gpt-5.6-sol 201/getestet, claude-opus-5 getestet, kimi-k3
getestet; cline-pass/glm-5.3 = 403 "not subscribed" (braucht
Cline-Pass-Abo). Guthaben ~0.35 — fuer echtes Arbeiten aufladen.

v517 -> v518 (2026-08-17): Status-Feld heisst "configured", nicht
"hasKey" — das Menue zeigte trotz verbundenem Key die Hinweis-Zeile.
code-flaeche.js v20.

v518 -> v519 (2026-08-17): Modell-Menue gedeckelt (60vh, innen
scrollen) — der 20-Modelle-Katalog sprengte die Bildhoehe.

v519 -> v520 (2026-08-17, Betreiber: "nur Modellnamen, zweite Zeile
brauchen wir nicht"): Modell-Menue radikal flach — smejj 1.0, GLM 5.3,
Opus 5, GPT 5.6, Grok 4.5, Kimi K3 als nackte Kurznamen (Zuordnung
CLINE_KURZ -> echte Katalog-IDs; ein Eintrag erscheint nur, wenn seine
ID im Live-Katalog steht). Keine Gruppen, keine Beschreibungen. Fable 5
und Gemini stehen NICHT drin — gibt es im Cline-Katalog nicht.
code-flaeche.js v21.

v520 -> v521 (2026-08-17, Betreiber: "mach alle Modelle rein, aber nur
Namen, kompakt"): Modell-Menue zeigt jetzt den GANZEN Katalog — erst
die Wunschliste (GLM 5.3, Opus 5, GPT 5.6, Grok 4.5, Kimi K3), dann
alle uebrigen mit lesbar gemachten Kurznamen (kurzName(): qwen3.8-max
-> "Qwen 3.8 Max"); gleiche Namen nur einmal (kimi-k3 stand doppelt).
Zeilen enger (padding 3px statt 7px). code-flaeche.js v22.

v521 -> v522 (2026-08-17): Kurzname trennt nur noch nach
Buchstabengruppen >=2 ("deepseek-v4" -> "Deepseek V4" statt "V 4") —
damit greift auch der Namens-Dedupe (Kimi K3 stand doppelt). Zeilen
noch dichter (padding 2px, line-height 1.35). code-flaeche.js v23.

v522 -> v523 (2026-08-17, Betreiber: "Schriftgroesse wie Auto/Schnell,
edel, enger"): Modell-Menue-Schrift 13px/Gewicht 450 (wie die
Leisten-Chips), Zeilen-padding 1px, Kopf 11.5px, Menue 250px schmal.

v523 -> v524 (2026-08-17, Betreiber-Screenshot von Claudes Menue):
Modellnamen in Claude-Groesse 14.5px und NICHT fett (Gewicht 400);
das Menue oeffnet direkt UEBER dem Modellnamen rechts (left:auto,
right:10px) statt links am Feld.

v519 -> v527 (2026-08-17, Nutzertest smejjCloud): "Liste aktualisieren"
crashte bei JEDEM Klick — refreshProjectList stand DIREKT als
Klick-Handler, das Ereignis kam als deps an (workspace undefined), die
Projektliste blieb leer. Jetzt mit den echten Abhaengigkeiten gerufen
(projects-surface.js; Datei liegt im Precache, der sw-Bump liefert sie).

v524 -> v525 (2026-08-17, Betreiber: "Fenster direkt AUF dem
Modellnamen, und WIRKLICH kompakt"): (1) Das Menue ankert jetzt per
Messung am Knopf selbst (rechtsbuendig, 6px darueber) statt am Feld.
(2) Live gemessen: app-surfaces gab jedem premium-view-Knopf
min-height 40px + padding 0 14px und schlug die engen Zeilen — mit
ID-Gewicht erzwungen (min-height 0, padding 2px): Zeilenhoehe ~24px
statt 40. code-flaeche.js v24.

v525 -> v526 (2026-08-17, Betreiber: "Freiflaeche rausnehmen, Fenster
klein"): Modell-Menue auf Inhaltsbreite (width max-content statt
min-width 320) — der Haken sitzt direkt hinter dem laengsten Namen,
keine Leerflaeche rechts.

v526 -> v527 (2026-08-17): (1) Modellname in der Code-Leiste NICHT
fett, 13px wie Auto/Schnell; die Anzeige nutzt jetzt kurzName()
("Qwen 3.8 Max" statt roher ID). (2) Arbeits-Viereck-Umriss scharf
(0.55 statt 0.3) — blinkt weiterhin cyan solange gearbeitet wird,
danach stiller Umriss. code-flaeche.js v25.

v527 -> v528 (2026-08-17, Betreiber-Freigabe "Ja, genau so"):
Modell-Reihenfolge nach Staerke/Beliebtheit (smejj 1.0, Opus 5,
GPT 5.6, GLM 5.3, Grok 4.5, Kimi K3, dann Cline-Pass-Reihe);
Gratis-Gruppe fliegt raus (per API 403-gesperrt — tote Knoepfe:
Nemotron, Laguna), Deepseek Flash zeigt die nutzbare
Cline-Pass-Variante. code-flaeche.js v26.

v528 -> v529 (2026-08-17, Betreiber: "bei Startseite auch gleiches
Modell-Menue"): oeffneModellMenue ist kontextfaehig (menueId/chip/
halter) und haengt jetzt AUCH am #modelPickerButton der Startseite
(capture + stopImmediatePropagation — das alte Menue bleibt im DOM,
oeffnet nur nicht mehr). Gleiche Liste, gleiche Reihenfolge, gleicher
Anker ueber dem Knopf. Die engen Zeilen gelten per Doppelklassen-
Gewicht jetzt ueberall (nicht nur #code). code-flaeche.js v27.

v529 -> v530 (2026-08-17): Start-Modellmenue ragt nie mehr oben aus dem
Fenster (bottom wird gekappt, innen scrollen); der Start-Knopf zeigt
den kurzen Modellnamen ("Opus 5") statt "Cline · claude-opus-5" —
gesetzt NACH app.js (setTimeout 0 auf model-selected/cline-selected).
code-flaeche.js v28.

v527 -> v532 (2026-08-17, Nutzertest Dateien): "IDrive e2 pruefen" auf
der Dateien-Seite crashte bei JEDEM Klick still — showJson und
CLIENT_ROUTES leben in app.js, uploads-surface.js kannte beide nicht
(Auslagerungs-Rest von 2026-07-28). Jetzt lokal mit dynamischem
config-Import und lesbarer Fehlermeldung (uploads-surface b39u, app b53).
Upload-Pfad selbst war gesund (Testdatei erschien mit Klartext-Typ).

v530 -> v531 (2026-08-17): (1) Fenster-Kappe laeuft nach JEDEM
Katalog-Fuellen — die Zeilen kommen asynchron und das bottom-verankerte
Menue wuchs nach oben aus dem Schirm (top -112 gemessen). (2) Knopftext
per MutationObserver: app.js schreibt "Cline · id" auch spaeter — bei
Cline-Wahl haelt der Waechter den kurzen Namen. code-flaeche.js v29.
