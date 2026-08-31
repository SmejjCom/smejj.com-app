# Service-Worker: Versionsverlauf 2026-08 — Teil 2 (v485 bis v638)

Ausgelagert am 2026-08-31, damit die Hauptdatei die 800-Zeilen-Ratsche
nicht erneut reisst.

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

v531 -> v532 (2026-08-17, Betreiber: "teste Opus 5 beim Senden" — der
Test DECKTE EINEN ECHTEN FEHLER AUF): der Chat-Request an
/providers/cline/chat traegt KEIN model-Feld (Fetch-Spion: Body nur
"messages") — der Server nimmt sein gespeichertes selectedModel, die
Menue-Wahl wirkte beim Senden NIE (GPT-Test klappte nur, weil server-
seitig zufaellig gpt-5.6 stand; "Opus"-Antwort kam von GPT). Jetzt
ruft jede Cline-Wahl im Menue zusaetzlich POST /select — der Server
wechselt mit. code-flaeche.js v30.

v532 -> v535 (2026-08-17, Nutzertest Bilder): Mit gewaehltem
Cline-Katalogmodell lief "Generiere ein Bild von: …" ueber
/api/providers/cline/chat — ein reiner Text-Weg OHNE Medien-Spur; die
Antwort war ein ausformulierter "Bildprompt" statt eines Bildes. Neues
Modul medien-absicht.js (?v=1, TUEV-Test kaputt+gesund): erkennt Bild-
und Video-Auftraege im Client, app.js (b54) laesst dann den Cline-Weg aus
— Medien nehmen IMMER den Bruecken-Weg mit Maler/Video-Worker.

v532 -> v533 (2026-08-17, Betreiber-Screenshot: Knoepfe schwammen bei
mehrzeiligem Text MITTEN im Startfeld): Start-Composer jetzt wie der
Code-Bereich — Schreibfeld Zeile 1 (voll breit, waechst bis 40vh, alles
sichtbar), Werkzeuge feste Zeile 2 (+ | Spacer | Nachdenken Modell
Mikro Senden). Ein Wrap-Block am design-v11-DATEIENDE schlaegt die
Ein-Pillen-Regeln auf allen Breiten.

v533 -> v534 (2026-08-17): Startfeld waechst wirklich mit — die
Ein-Pillen-Regel setzte height:40px und schlug sogar den Inline-Stil
(gemessen: scrollHeight 120, sichtbar 44). Jetzt height:auto !important
+ field-sizing:content, dazu ein JS-Autogrow als Fallback (Deckel 40vh).
code-flaeche.js v31.

Bridge (2026-08-17, Nutzertest Bilder, zweiter Fund): Der Maler bekam den
GANZEN Auftragssatz ("Generiere ein Bild von: einem roten Leuchtturm") —
der Uebersetzer machte daraus einen Prompt, in dem das Motiv unterging
(geliefert wurde eine Sand-Nahaufnahme). Neu: motivAusAuftrag() schneidet
die Einleitung ab, uebrig bleibt das Motiv; TUEV-Test mit Wortgrenzen-Falle
("ein" frass die Silbe von "einen"). Fail-safe: bleibt zu wenig uebrig,
gilt der ganze Satz.

v535 -> v536 (2026-08-17, Betreiber-Screenshot Sprachmodus): Die Antwort
stand ROH im Overlay — "```js", "###", "**" als Zeichen, riesig und
zentriert, dadurch unlesbar. lesbarerSprechtext() nimmt die
Auszeichnungs-Zeichen heraus (Inhalt unversehrt, TUEV-Test), das Overlay
zeigt Text jetzt linksbuendig in 16px. Renderer und Vorlese-Offset
unangetastet.

v536 -> v537 (2026-08-17, Hinweis der Parallelsitzung): Der Einbau der
Bild-Weiche hatte app.js auf 804 Zeilen gebracht — 800-Zeilen-Regel
gerissen, zwei Waechter rot. Die Weiche wohnt jetzt KOMPLETT in
medien-absicht.js (chatOhneMedienauftrag ?v=2, laedt runClientChat selbst
per dynamischem Import); app.js ruft nur noch eine Funktion und ist zurueck
auf 800 Zeilen. Verhalten unveraendert, TUEV-Tests gruen.

## Verifikation nach Fremd-Deploy (2026-08-17, 18:33Z)
Die Parallelsitzung ("Browser und Maus") hat den Control-Server neu
gebaut (deploy(gitRef) auf feature/auth-redesign-github-magiclink,
Commits cc4c46d + 7ffc5cd; gestartetAm 18:28:50 -> 18:33:13). Danach
aus der ANGEMELDETEN Betreiber-Sitzung geprueft — beides gruen:
- /api/providers/cline/status: 200, configured true, keyHint ••••8fc2,
  selectedModel anthropic/claude-opus-5, storage "encrypted"
- ECHT gesendet (frischer Chat): "Claude (Modellfamilie von Anthropic)"
  ueber /providers/cline/chat — die Kette laeuft, nicht nur gespeichert.
Frontend-Stand unveraendert v534 (Start-Lock byte-identisch).

ZWEI LEHREN, teuer bezahlt:
1. Ein Neustart-Zeitstempel allein beweist NICHT den eigenen Deploy —
   ich hielt 18:28:50 faelschlich fuer den fremden Rollout und meldete
   voreilig Entwarnung. Immer den Vorher-Wert der ANDEREN Seite erfragen.
2. Der Cline-Zugang haengt am NUTZER (subjectId aus authenticatedUserId),
   nicht am Server: eine Statusabfrage mit fremdem Token liefert
   zwangslaeufig configured:false und ist als Beweis wertlos. Solche
   Tests nur aus der Betreiber-Sitzung.

## Verifikation nach Fremd-Deploy #2 (2026-08-17, 21:33Z)
Zweiter Control-Neubau der Parallelsitzung (Bau-Branch 23cfab1:
Erlaubnisliste fuer sechs public/-Seiten, budgetVerdict.reasons-Fix,
Sicherheits-Kopfzeilen). gestartetAm 18:33:13 -> 21:33:27.
Aus der Betreiber-Sitzung geprueft — alles gruen:
- Cline unveraendert: configured true, keyHint ••••8fc2, Opus 5,
  storage "encrypted"; ECHT gesendet: "Claude von Anthropic."
- Kopfzeilen ohne Nebenwirkung: Startseite frisch geladen, KEINE
  Konsolenfehler, kein ERR_BLOCKED_BY_RESPONSE, keine CSP-Verstoesse.

DREI BEFUNDE ZUM MERKEN:
1. Die Kopfzeilen-Aenderung ist live gar nicht messbar: GitHub Pages
   setzt keine Header, die Seite traegt nur die Meta-CSP. SECURITY_HEADERS
   wirken ausschliesslich am lokalen Node-Server. Wer "live" prueft,
   misst zwangslaeufig die Meta-Angabe.
2. Die Einbettungs-Ausnahme ist sauber begrenzt (Set mit genau
   ROUTES.mausReplay); frame-guard.js laeuft NUR in index.html — waere er
   in maus-replay.html eingebunden, haette er das Panel selbst gesprengt.
3. Chrome-Auswahl: bei zwei verbundenen Instanzen passen die Anzeigenamen
   NICHT zu den deviceIds (Browser 2 wurde nach dem Wechsel als
   "Browser 1" gelistet). Nie nach Namen waehlen — am offenen
   smejj-Tab pruefen, ob es die Betreiber-Sitzung ist.

v534 -> v535 (2026-08-17, Betreiber: "Grok 4.5 auch testen" — der Test
DECKTE DEN NAECHSTEN ECHTEN FEHLER AUF): Das Modell hinkte jede Wahl
genau EINEN Schritt hinterher. Gemessen: Grok gewaehlt -> Antwort kam
von Kimi; Server danach manuell auf Grok gesetzt -> Antwort kam von
Qwen. Ursache: mein /select aus v532 war fire-and-forget (void fetch).
Der Datensatz liegt auf IDrive e2, das Schreiben dauert — der naechste
Chat-Request las den ALTEN Record. Jetzt wird /select ABGEWARTET
(await + Statuspruefung), der Menuepunkt zeigt solange "Name …", und
bei Fehlschlag bleibt der alte Name stehen PLUS Hinweis statt still
das falsche Modell zu benutzen. Zweiter Fund beim Bauen: die aktion
hatte keinen Zugriff auf ihren Knopf (k war ausserhalb des Scopes) —
zeile() reicht ihn jetzt durch, sonst haette es einen ReferenceError
gegeben. code-flaeche.js v32.

## Abnahme v535 (2026-08-17, 22:5xZ)
Der await-Fix wurde nach dem Livegang im ECHTEN Menue geprueft (nicht
nur simuliert): Klick auf "Kimi K3" -> Knopf, localStorage UND
Server-selectedModel stehen synchron auf moonshotai/kimi-k3
(code-flaeche v34 im Browser gemessen). Damit ist der Wechsel
nachweislich vollstaendig, bevor der naechste Auftrag laeuft.
Modell-Beweise gesamt: GPT 5.6, Opus 5, Kimi K3 (Selbstauskunft passt);
Grok 4.5 wechselt nachweislich mit, meldet sich aber selbst falsch
("Auto (agent router), Cursor") — Modell-Eigenart, kein Ketten-Fehler.
GLM 5.3 bleibt gesperrt (Cline-Pass-Abo noetig).

v544 -> v545 (2026-08-17, Betreiber: "Knopf-Flackern beheben"): waehrend
des Modellwechsels zeigte der Modell-Knopf noch den ALTEN Namen (live
gemessen: "Mimo V2.5", waehrend Speicher und Server schon gpt-5.6-sol
standen) — er zeigt jetzt denselben Wartezustand wie die Menuezeile
("Name …") und faellt bei Fehlschlag auf den alten Namen zurueck.
code-flaeche.js v36.

v559 -> v560 (2026-08-18, Betreiber: "laeuft gerade, aber das
Viereck leuchtet nicht"): runClineChat und runProviderChat in
public/ai/chatClient.js feuerten NIE das Ereignis smejj:chat-strom —
nur chat-stream.js tat das. Damit blieben Arbeits-Viereck UND
Stopp-Knopf bei jedem Cline-/BYOK-Modell (also auch Opus 5) stumm,
obwohl die Antwort lief. Beide Wege melden jetzt { laufen: n } beim
Start und im finally beim Ende (Zaehler, damit parallele Laeufe sich
nicht gegenseitig ausschalten). chatClient.js ist im Precache — der
CACHE_NAME-Sprung reicht als Marke.

v566 -> v567 (2026-08-18, Betreiber: "ich sehe es im Browser
nicht"): das Arbeits-Viereck leuchtete zwar korrekt (per Screenshot
bestaetigt), war aber mit 11 px in der Ecke praktisch unsichtbar. Im
ARBEITSZUSTAND jetzt 15 px, mit Cyan-Schein und Groessenpuls
(1,15 s, scale 1 -> 0,72). Der Ruhezustand bleibt unveraendert der
stille Umriss — die Augen-Regel gilt weiter fuer Dauerzustaende.

v567 -> v568 (2026-08-18, Betreiber: "warum hast du das Viereck
rausgenommen? Es war gut, es soll NUR beleuchtet werden — mach
rueckgaengig"): meine Vergroesserung (15 px), die Verschiebung
(top 8/right 10) und der Cyan-Schein sind ZURUECKGEBAUT. Das Viereck
steht wieder exakt wie vorher (11 px, top 10 / right 12) und aendert
im Arbeitszustand ausschliesslich seine Beleuchtung (cyan + ruhiger
Opazitaets-Puls 1,6 s). LEHRE: "sichtbarer machen" heisst nicht
"umbauen" — Form und Platz eines abgenommenen Bauteils bleiben.

v568 -> v569 (2026-08-18, Betreiber-Abgleich mit Claude): das
Arbeits-Viereck sitzt jetzt auf HOEHE DER TEXTZEILE (top 31 statt 10) —
bei Claude steht es neben dem Eingabetext, bei uns klebte es am oberen
Feldrand und driftete 21 px weg, sobald der Ordner-Chip darueber lag.
Groesse (11 px), Form und Beleuchtung bleiben unveraendert.

v569 -> v570 (2026-08-18, Handy-Durchgang bei 375 px): der feste
CSS-Wert top:31px fuer das Arbeits-Viereck war FALSCH — am Telefon steht
die Textzeile weiter oben, das Viereck rutschte 23 px darunter (gemessen
im integrierten Browser mit Geraete-Emulation). Die Hoehe wird jetzt zur
LAUFZEIT an der Textzeile gemessen (--code-arbeit-top, neu berechnet bei
Chips, Tippen, Fensterbreite). Zweite Falle dabei: line-height steht auf
"normal", parseFloat gibt NaN — Ersatzmass ist Schriftgroesse x 1,2 plus
Polster. Ergebnis auf BEIDEN Breiten identisch (375 und 1280 px: 3 px
Restabweichung, optisch mittig). code-flaeche.js v37.

v570 -> v571 (2026-08-18, Betreiber-Freigabe "nur am Handy
vergroessern"): unter 600 px erfuellen die Bedienknoepfe der CODE-Leiste
jetzt das 44-px-Touch-Ziel des Projekts (gemessen vorher: Anhang/Diktat
30x30, Senden 32x32, Chips 19 px hoch). Am Desktop bleibt alles schmal
und edel — die Regel steht ausschliesslich in @media (max-width: 600px),
derselben Kante, die styles.css und start-glass.css schon benutzen.
375-px-Messung nach dem Umbau: alle sechs Knoepfe 44 px hoch,
Arbeits-Viereck 1 px genau auf der Textzeile.

v571 -> v572 (2026-08-18, Betreiber: "kannst du das fuer den
Chat-Bereich auch machen — sieht gut aus"): das Arbeits-Viereck gibt es
jetzt auch im Glas-Schreibfeld der Startseite (#startArbeit). Gleiches
Signal (smejj:chat-strom, ein Strom treibt beide Anzeigen), gleiche
Optik (11 px, stiller Umriss in Ruhe, cyan + Puls beim Arbeiten) und
dieselbe Laufzeit-Ausrichtung an der ersten Textzeile
(--start-arbeit-top) — ein fester Wert versagte im Code-Bereich am
Telefon, derselbe Fehler wird hier gar nicht erst gemacht.
code-flaeche.js v38.

v572 -> v573 (2026-08-18, Betreiber-Freigabe "ja, unten
festkleben"): das CHAT-Schreibfeld klebt jetzt am unteren Rand wie im
CODE-Bereich und bei Claude. Befund, der dahinter steckte: der Betreiber
sah das neue Arbeits-Viereck nicht — nicht weil es fehlte, sondern weil
das GANZE Schreibfeld bei langem Verlauf aus dem Bild scrollte (live
gemessen: Glas-Feld bei top 10938 px). Jetzt ist .home-feed im
Chat-Zustand eine bildschirmhohe Flex-Spalte, #startLog scrollt INNEN,
das Feld bleibt stehen. Der leere Willkommens-Bildschirm bleibt
unveraendert (Regel nur unter .has-start-chat).

v573 -> v574 (2026-08-18, Betreiber: "sobald was angefragt,
Denkzeit und Arbeitszeit immer so blenden"): die Arbeits-Anzeige leuchtet
jetzt AB DEM ABSENDEN, nicht erst ab dem ersten Zeichen der Antwort. Die
Sekunden davor (Verbindung, Denkzeit, Werkzeugrunden) blieben bisher
dunkel, obwohl laengst gearbeitet wurde.
Bauart: zwei Quellen, ODER-verknuepft — "vorlauf" (gesendet, Strom noch
nicht da) und "strom" (bisheriges Signal). Endet der Strom, faellt auch
der Vorlauf. Notbremse 90 s (dieselbe Grenze wie die Stille-Wache),
damit es nie ewig blinkt.
Zwei Fallen dabei: (1) der Hauptknopf ist bei LEEREM Feld der
Sprachknopf — gemeldet wird nur, wenn wirklich Text da ist; (2) andere
Handler an denselben Knoepfen rufen stopImmediatePropagation, darum
haengt die Meldung in der CAPTURE-Phase. Gilt fuer Chat UND Code.
code-flaeche.js v39.

v574 -> v575 (2026-08-18, Betreiber nimmt den Inline-Auftrag vom
16.08. zurueck): die Aktionsleiste (Kopieren, Vorlesen, Daumen, Menue,
Uhrzeit) steht wieder in einer EIGENEN ZEILE unter der Antwort —
linksbuendig, wie vor v507 (16.08. 22:42). Die Range-Messung, die sie
hinter das letzte Wort schob, ist entfernt; die Funktion bleibt nur noch
als Aufraeumer, damit aus dem Verlauf wiederhergestellte Leisten ihre
alten Inline-Abstaende verlieren. CSS blieb unveraendert (margin -7px).
chat-actions.js b26k.

v577 -> v578 (2026-08-18, Betreiber: "diese Icon deckt Logo,
kannst du rausnehmen"): das Code-Zeichen (<>) vor dem Gruss der
CODE-Seite ist entfernt. Seit die Seite randlos ist (padding-top 4px,
v486) sass es direkt neben dem fixen Logo oben links und verdeckte es.
Der Gruss selbst bleibt unveraendert. Die CSS-Regel
#code .codegruss-zeichen bleibt stehen (schadet nicht, greift ins
Leere) — entfernt wird nur das Markup.

v638 -> v639 (2026-08-22, Betreiber-Freigabe "wie im Code-Bereich"):
Touch-Ziele und Responsive-Fehler in einem Rutsch. Ein Sprung ist noetig,
weil app-surfaces.css und start-styles.css im Vorrat liegen — ohne neue
Nummer haetten bestehende Nutzer die alten Fassungen behalten.

Zwei Messungen stecken dahinter. Erstens der neue Waechter
`npm run measure:responsive`: 19 Ansichten x 8 Geraeteklassen (320 bis
1920 px) = 152 Messpunkte, mit echtem Inhalt gemessen (lange Adresse ohne
Leerzeichen, Code-Block, Tabelle). Er fand vier Fehler, drei davon aus
derselben Ursache — eine Medienabfrage sieht das FENSTER, nicht den Platz:
bei 768 px stehen links 200 px Schublade und rechts, sobald die Flaeche
angedockt ist, noch einmal 200 px, der Ansicht bleiben 368 px. Konto und
Einstellungen bekamen dort ein festes 250px-Raster und liefen um 78 bzw.
200 px ueber; jetzt umbrechende Flex-Zeilen. Die Modell-Liste scrollt
allein statt die ganze Ansicht mitzunehmen. Der Lichtschein der
Konto-Tafel sass 40 px ueber der Ecke und liess die Seite bei 320 px um
33 px seitlich wandern.

Zweitens `npm run measure:touch:app`: das V11-Design hatte 32 Ziele wieder
unter 44 px gedrueckt, weil design-v11.css als LETZTE Buendelquelle die
alten 600-px-Regeln mit den Mockup-Massen ueberschrieb (".fknopf: 38px").
Der neue Block steht darum am Ende von design-v11.css — eine Medienabfrage
erhoeht die Spezifitaet NICHT. Gehoben werden unter 600 px: Chat-Eingabe
38 -> 44, Startmenue 28 -> 44, Spur-Reiter und Einfuehrung 42 -> 44,
Code-Auftragsfeld 26 -> 44, Modus-Chip 40 breit -> 44. Am Bild aendert
sich nichts: die Icons haben seit dem 18.08. weder Flaeche noch Rahmen.

Der Waechter selbst misst jetzt mit echten Tippunkten (elementsFromPoint
an acht Randpunkten) statt mit getBoundingClientRect. Damit unterscheidet
er "zu klein" von "verdeckt" und von "sieht klein aus, ist aber gross zu
treffen" — der Stopp-Punkt (11 px sichtbar, 43 px fassbar) galt monatelang
zu Unrecht als Fehler.

Stand nach dem Deploy: measure:responsive 152/152, measure:touch:app 0
Verstoesse (eine begruendete Ausnahme: #codeArbeit), check:start-styles
aktuell, Start-Lock OK. v639 folgt auf v638 einer Parallelsitzung
(JS-Dialoge im Panel); vor dem Push wurde jede Live-Datei gegen den
eigenen Ausgangsstand geprueft — es wurde nichts Fremdes ueberschrieben.

