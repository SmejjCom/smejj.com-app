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
