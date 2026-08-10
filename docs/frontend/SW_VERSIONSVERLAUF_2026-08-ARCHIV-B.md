# Service-Worker: Versionsverlauf August 2026 — Archiv B (v216 bis v252)

Ausgelagert am 2026-08-10 aus
[SW_VERSIONSVERLAUF_2026-08.md](SW_VERSIONSVERLAUF_2026-08.md). Die Hauptdatei
waechst um rund 15 Zeilen je Eintrag und riss die 800-Zeilen-Regel binnen
Tagen erneut; ausgelagert ist der abgeschlossene Bestand VOR dem Abschnitt
"Zwei Sitzungen, ein Nummernraum" — ab dort haengen die Eintraege inhaltlich
zusammen und bleiben beieinander.

Abgrenzung zum [ersten Archiv](SW_VERSIONSVERLAUF_2026-08-ARCHIV.md): dort
liegt der am 2026-08-07 aus `public/sw.js` uebernommene Kommentarblock (v148
bis v227, absteigend). HIER liegen die danach direkt im Dokument
geschriebenen Eintraege v216 bis v252, aufsteigend wie in der Hauptdatei.
Die Nummernbereiche ueberlappen sich, die Eintraege nicht.

Die Eintraege sind unveraendert uebernommen — bis auf eine Ausnahme: im
Eintrag v244 -> v245 tragen zwei woertlich zitierte Modell-Ausgaben jetzt den
Marker des Guideline-Pruefers, weil das Zitat selbst gegen die Naming-Regel
verstoesst und Umschreiben die Messung verfaelschen wuerde.

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
Kalifornien", "Smejj Com Informationen" statt "Smejj Kommt Ins Gespraech" (NAMING_VIOLATION: woertliches Zitat).
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
