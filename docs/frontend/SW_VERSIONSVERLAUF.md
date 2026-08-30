# Service-Worker: Versionsverlauf

**Fortsetzung ab v213:** [SW_VERSIONSVERLAUF_2026-08.md](SW_VERSIONSVERLAUF_2026-08.md)
— am 2026-08-07 ausgelagert, weil der Block in `public/sw.js` erneut auf 646
von 863 Zeilen gewachsen war. Eine eigene Datei, weil die 800-Zeilen-Regel
auch fuer `.md` gilt.

Der Aenderungsverlauf von `public/sw.js` (CACHE_NAME `smejj-shell-vNNN`).
Bis 2026-08-05 stand dieser Text als Kommentarblock in der Datei selbst und
machte dort 586 der 800 Zeilen aus — 73 % einer Datei, deren echte Logik rund
214 Zeilen umfasst. Damit riss `public/sw.js` die 800-Zeilen-Regel aus
AI_Guidelines.md praktisch bei jedem Eintrag erneut.

Der Text ist unveraendert uebernommen; nur die Kommentarzeichen sind fort und
die Versionszeilen sind Ueberschriften geworden.

## Warum dieser Verlauf zaehlt

Die Eintraege sind kein Protokoll, sondern eine Fallensammlung. Wiederkehrende
Lehren: `caches.match` laeuft mit `ignoreSearch` (ein `?v=`-Sprung allein wirkt
NICHT), ein fehlender Precache-Eintrag laesst den Rueckfall `/` (HTML) statt
JavaScript liefern und bricht das ganze Modul ab, und geschachtelte
Modul-Queries muessen von OBEN gebumpt werden.

## Regeln, die weiterhin gelten

- **Precache-Datei geaendert = CACHE_NAME hochzaehlen.** Seit v160 ist der
  Precache cache-first; ohne Sprung erreicht eine Aenderung Bestandsnutzer nie.
- **Neues importiertes Modul = Eintrag in SHELL.** `npm run check:precache-imports`
  verfolgt den Importgraph und meldet Luecken fail-closed.
- **Jeder Eintrag muss vor dem Deploy aufloesbar sein.** Ein 404 laesst
  `cache.addAll` scheitern und zerlegt den Cache ALLER Besucher.

---
## v224 -> v225 (2026-08-05): Arbeitssignal — der Klient zeigt ab 1200 ms Stille

"Anfrage laeuft" mit Sekundenzaehler; der erste Server-Schritt kommt gemessen
erst nach 5750 ms (ai/chat-stream.js). Davor v224: Zeitbudget nach der ROUTE
statt am Modellnamen, /api/agent 15 s. Beide Freigaben Betreiber 2026-08-05.

## v218 -> v219 (2026-08-04): Eine abgelaufene Anmeldung zeigt sich jetzt.

Befund im angemeldeten Browser des Betreibers: sein Token lag im Speicher,
der Server lehnte es ab (/api/auth/me -> authenticated=false). auth-gate.js
prueft nur das VORHANDENSEIN — die App liess ihn herein, der Server kannte
ihn nicht. Sichtbar wurde das erst, als die Bruecke eine Anmeldung verlangte:
jede Frage kam als "Bitte anmelden" zurueck. verifyStoredSession() prueft das
Token jetzt nebenher und meldet NUR bei einer eindeutigen Absage ab; ein
Netzaussetzer meldet niemanden ab. auth-gate.js und auth-page.js liegen
cache-first im Precache.

## v217 -> v218 (2026-08-04): Klartext statt Maschinen-Kennung. Beim ersten

Live-Durchlauf der Anmeldepflicht stand im Chat nackt "authentication_required".
readableError nimmt jetzt `hinweis` vor `error` — der Server schickt den
Klartext ohnehin mit. ai/chat-stream.js liegt cache-first im Precache.

## v216 -> v217 (2026-08-04): Anmeldepflicht an der Chat-Bruecke.

Gemessen: ein curl mit dem Kopf "Origin: https://smejj.com" bekam die volle
Antwort — der Origin-Kopf wirkt nur im Browser. Das Frontend schickt jetzt
den Sitzungs-Token mit (ai/chat-stream.js, voice-landing.js), die Bruecke
verlangt ihn (Bridge v114). Beide Dateien liegen cache-first im Precache;
ohne diesen Sprung schickten Bestandsnutzer keinen Token und saehen 401.
Freigabe Wof Kadavanich, 2026-08-04: "Anmeldepflicht jetzt live stellen
(Frontend und Bridge in einer Welle)".

## v214 -> v215 (2026-08-04): Seitengewicht — Modell-Bereiche laden erst bei

Bedarf. GEMESSEN, nicht geschaetzt: der Erstbesuch wog 311 KB gegen ein
Budget von 300 KB, und er wuchs (v209 noch 308 KB). Die Aufschluesselung
ueber 119 Ressourcen zeigte api-keys-surface.js (6,9 KB), provider-
settings.js (3,7 KB) und ihr selbst nachgeladenes CSS (3,2 KB) im Ladepfad
JEDES Seitenaufrufs — obwohl beide ausschliesslich in das Einstellungs-Panel
"models" rendern und der Startreiter "general" ist.
settings-surface.js (NICHT unter Start-Lock) importiert sie jetzt dynamisch,
ausgeloest von activate("models"). Beide bleiben im Precache: beim
Reiterwechsel kommen sie aus dem Cache, ohne Netz und ohne Wartezeit.
Vor dem Umbau geprueft: app.js (Start-Lock) bindet KEINE ihrer Kennungen
(ak*, apiKeysSurface, cline*), und applyValues() greift nicht darauf zu —
die Boot-Bindings koennen dadurch nichts verlieren. Aussehen und Bedienung
bleiben unveraendert; nur der Zeitpunkt des Ladens aendert sich.
Der Versionssprung ist noetig, weil settings-surface.js cache-first im
Precache liegt — ohne ihn behielten Bestandsnutzer die alte Fassung.
Freigabe Wof Kadavanich, 2026-08-04: "Du darfst das Gewicht des Erstbesuchs
von 311 KB unter das Budget von 300 KB bringen. ... Module später laden,
aufteilen, entbündeln. ... Aussehen und Bedienung der Startseite bleiben
unverändert. Keine Funktion darf wegfallen."

## v213 -> v214 (2026-08-04): Konto-Formulare im HELLEN Schema repariert.

Zwei eigene Fehler, beim Nachpruefen gefunden:
(1) Die Formularflaeche nutzte `var(--konto-panel, …)` — die Variable gibt es
  nicht, der weisse Rueckfallwert galt also immer. Jetzt --konto-glass,
  das BEIDE Schemata kennt.
(2) Der Fokusring hing an --konto-edge, im hellen Schema rgba(255,255,255,0.9)
  — ein weisser Ring auf hellem Grund ist kein Ring. Jetzt die Akzentfarbe.

## v211 -> v212 (2026-08-04): Nachbesserung am Konto-Loeschformular. Die

Beschriftung "Zur Bestätigung KONTO LÖSCHEN eingeben" brach in DREI Zeilen —
das Label ist eine Flex-Spalte, und das darin stehende <code>-Element wurde
eine eigene Zeile. Live im Browser gesehen. Beschriftung jetzt ein einziges
Textstueck, die nicht mehr gebrauchte code-Regel in account-privacy.css ist
raus. Beide Dateien liegen cache-first im Precache — ohne diesen Sprung
behalten Bestandsnutzer die umbrechende Fassung.

## v210 -> v211 (2026-08-04): Konto-Sicherheit ohne Browser-Dialoge.

account-sessions.js fragte Passwoerter mit window.prompt() ab — unmaskiert,
im Klartext auf dem Schirm, ohne Passwortverwaltung, ohne Wiederholfeld.
Passwortwechsel und Kontoloeschung laufen jetzt in Seitenformularen
(account-privacy.css ergaenzt). Beide Dateien liegen cache-first im
Precache — ohne diesen Versionssprung behalten Bestandsnutzer die alte
Fassung (caches.match ignoreSearch, ein ?v=-Sprung allein wirkt NICHT).
Freigabe des Betreibers vom 2026-08-04.

## v209 -> v210 (2026-08-04): Sprache wurde ungefragt auf Deutsch gestellt.

Live gemessen im A-bis-Z-Test mit einem en-US-Browser: die Oberflaeche lief
korrekt englisch, die Sprachauswahl in den Einstellungen zeigte aber
"Deutsch". Ursache ist app.js (Start-Lock, bindSettings): sie belegt
#settingsLanguage NACH dem Render von settings-surface.js mit
`state.settings.language || "de"` — ohne gespeicherte Wahl also "de", waehrend
die Laufzeit die erkannte Browsersprache nutzt. Weil die Autospeicherung ALLE
Felder wegschreibt, hat schon ein Wechsel des Farbschemas dem Nutzer "de"
festgeschrieben; beim naechsten Besuch stand die ganze App auf Deutsch,
obwohl er nie eine Sprache gewaehlt hat. Betrifft jeden nicht-deutschen
Nutzer. Gefixt in settings-surface.js (Start-Lock unberuehrt): save() nimmt
die Sprache aus der Laufzeit statt aus dem Feld, eine echte Nutzerwahl geht
ueber sprachwahlVomNutzer, und zeigeAktiveSprache() holt die Anzeige nach dem
app.js-Boot zurueck. settings-surface.js liegt cache-first im Precache — ohne
diesen Versionssprung erreicht der Fix Bestandsnutzer nie (der Cache-Treffer
laeuft mit ignoreSearch, ein ?v=-Sprung allein wirkt daher NICHT).
Freigabe Wof Kadavanich, 2026-08-04: "Wenn du Fehler findest, behebe sie
sofort, deploye erneut und teste live weiter, bis alles stabil, sicher und
zuverlaessig funktioniert."

## v208 -> v209 (2026-08-04): Verlauf-Speicher heilt sich selbst — Auslieferung.

chat-store.js liegt cache-first im Precache; ohne Versionssprung behielten
wiederkehrende Nutzer die alte Datei fuer immer (caches.match ignoreSearch,
siehe unten). Der Fix selbst: fehlt der Objektspeicher `chats`, feuerte
onupgradeneeded NIE wieder, jede Transaktion warf NotFoundError, und weil
alle Aufrufer fail-safe abfangen, war der Verlauf in diesem Browser
dauerhaft und lautlos tot. v208 ging ohne diese Datei live (der Deploy
kopiert gezielt einzelne Dateien) — dieser Sprung holt sie nach.
Freigabe Wof Kadavanich, 2026-08-04: "Ja" + "Nach der Umsetzung bitte live
gehen, live testen und pruefen, ob alles richtig funktioniert."
NUR chat-store.js aendert sich — kein Eingriff in Startseite oder Design.

## v207 -> v208 (2026-08-04): Gespraechsgedaechtnis an drei Stellen repariert.

(1) Der Wartetext "smejj denkt nach..." ging als juengste Assistenten-Antwort
  in jede Anfrage mit, und die aktuelle Frage stand doppelt darin.
(2) Der Reserve-Server (v104, eingefroren) kennt `history` in /api/agent nicht
  und warf den Verlauf weg — die Reserve laeuft jetzt ueber /api/chat.
(3) Der Sprach-Modus schickte GAR KEINEN Verlauf mit (voice-conversation.js NEU).
Dazu: Projektwissen findet jetzt auch das Thema einer Anschlussfrage.

## v206 -> v207 (2026-08-03): Nacharbeit zum Split-View, beide Restpunkte aus

der Abschlussmeldung (Freigabe Wof Kadavanich, 2026-08-03: "Ja").
1) Wegklicken: Ist der Split-View offen UND zusaetzlich das linke Menue,
   schloss ein Klick neben das Menue beides. Jetzt entscheidet
   backdropCloseTarget() in panel-backdrop.js: im Split-View faellt nur das
   Menue zu, das Panel bleibt stehen. Ausserhalb des Split-Views bleibt es
   beim bisherigen "alles zu" (Non-Regression Sidebar-Fix 2026-07-18).
   Escape bleibt bewusst unveraendert — das ist eine ausdrueckliche
   Nutzeraktion und schliesst weiterhin beides.
2) Restzustand: Schliessen ueber Browser-Knopf/Backdrop/Navigation laeuft
   durch app.js und nicht durch closePane(); body.browser-pane-open,
   .is-browser-mode und --right-panel-width blieben stehen. Der Waechter
   raeumt diesen Rest jetzt ab (unsichtbar, aber der Zustand log).
Geaendert: panel-backdrop.js (?v=panel-backdrop-20260803 in app.js),
browser-pane-backdrop.js (?v=2 in index.html).

## v205 -> v206 (2026-08-03): Browser-Panel klappte beim Klick ins Schreibfeld

zu. Live in Chrome bewiesen: Im Split-View blieb das Abdunkel-Backdrop aus
panel-backdrop.js (#sidebarBackdrop, inset 0, z 65) ueber dem linken
Arbeitsbereich stehen — elementFromPoint auf dem Schreibfeld traf das
Backdrop, und dessen Wegklick-Handler schloss das Panel. NEU im SHELL:
browser-pane-backdrop.js (index.html laedt es mit ?v=1) unterdrueckt das
Backdrop im Split-View; das Panel schliesst nur noch manuell (X, Knopf,
Escape, Navigation). Ausnahme linkes Menue offen: Backdrop bleibt, damit
Abdunkeln/Wegklicken des Menues erhalten bleiben (Non-Regression).
Freigabe Wof Kadavanich, 2026-08-03: "soll immer an bleiben bis ich manuel
zu klappe".

## v203 -> v204 (2026-08-03): Groq-Ohr AKTIV — die Transkriptions-Route zeigt

auf die Salad-Bridge (v106, per GitHub-Pull + Container-Neustart deployt,
der historische Welle-2-Weg; der Zeabur-Weg haengt weiter am Betreiber-Token).
Live gemessen: say-erzeugtes Deutsch kam wortwoertlich inkl. Satzzeichen
zurueck. Nur config.js aendert sich — der Versionssprung bringt sie in den
Precache der wiederkehrenden Nutzer.

## v202 -> v203 (2026-08-03): Sprachwelle Stufe 4 — das Groq-Ohr. Waehrend die

Web-Speech-Erkennung zuhoert, nimmt ein MediaRecorder parallel auf; die
Bridge transkribiert ueber Groq Whisper (Welle-2-Zugang, 0-Euro-Deckel) und
das praezise Transkript ersetzt das oft verhoerte Web-Speech-Ergebnis —
fail-safe: ohne Bridge-Route/Schluessel bleibt alles wie bisher.
voice-ear.js NEU im SHELL (importiert von composer-tools.js und
voice-landing.js; ohne Precache-Eintrag liefert der Rueckfall offline "/"
(HTML) statt JavaScript und bricht die Module ab). config.js ergaenzt die
Route. Freigabe des Betreibers ("B / Ja" zur Entscheidungsvorlage
ENTSCHEIDUNG_SPRACHSERVER_KOSTEN_2026-08-03.md, Variante B) vom 2026-08-03.

## v201 -> v202 (2026-08-03): Sprachwelle Stufe 3 — Rueckfrage statt Blindantwort.

Befund aus dem ChatGPT-Live-Vergleich: auch dort wird Umgebung/Fremdsprache
als Text mitgehoert; die Rettung ist eine Rueckfrage statt einer Blindantwort.
voice-clarify.js NEU im SHELL (Rueckfrage-Regel, 15 Sprachzeilen, Doppel-
Sende-Schutz), voice-browser-tts.js NEU im SHELL (aus composer-tools.js
ausgelagert, 800-Zeilen-Regel) — beide werden von composer-tools.js und
voice-landing.js importiert; ohne Precache-Eintrag liefert der Rueckfall
offline "/" (HTML) statt JavaScript und bricht die Module ab.
Freigabe des Betreibers ("Freigabe Stufe 3") vom 2026-08-03.

## v200 -> v201 (2026-08-02): Sprachwelle Stufe 2 — Barge-in-Schwellen nach

Messung verschaerft. voice-echo-filter.js: BARGE_MIN_WORDS 2 -> 3 (das live
gemessene Selbst-Echo "smeeting nach" hatte genau zwei Woerter) und
Echo-Deckungsschwelle 0.6 -> 0.5 (der Fall hatte exakt 50 % und rutschte
durch). Wirkt auf Startseite UND 14 Sprachseiten ueber die geteilte Naht.
Nur der Precache-Sprung liegt in sw.js; die Logik liegt in der freien Datei.

## v199 -> v200 (2026-08-02): Sprachwelle brach sich selbst ab. Der Denk-

Platzhalter aus app.js ("smejj denkt nach ...") ist ein normaler
.entry.assistant und galt dem Sprachmodus als Antwort: Status nach 68 ms auf
"Ich spreche ...", Platzhalter vorgelesen, Mikrofon mitten in der Denkphase
offen, Erkennung hoerte den eigenen Lautsprecher und brach ab; dazu fehlten
die ersten ~20 Zeichen jeder Antwort und der Denk-Laut kam nie. Gefixt in
composer-tools.js (Selektor, Scharfschalten erst bei echtem Text, Schonfrist,
Mute sendet nicht mehr). voice-overlay-ui.js neu im SHELL — composer-tools.js
importiert es, ohne Precache-Eintrag liefert der Rueckfall offline "/" (HTML)
statt JavaScript und bricht das Modul ab. Freigabe des Betreibers ("Freigabe
Stufe 1") vom 2026-08-02.

## v198 -> v199 (2026-08-02): System-Ansicht zeigte Entwicklerwerte —

"Storage: true", "AI Mode: disabled", "Sync: local". Fuer Nutzer unlesbar.
Uebersetzung in system-status-text.js (eigene Datei, weil app.js bei 797 von
800 Zeilen stand). Die Datei MUSS in den SHELL: app.js importiert sie, und
ohne Precache-Eintrag liefert der Rueckfall offline "/" (HTML) statt
JavaScript und bricht app.js komplett ab. Freigabe des Betreibers vom
2026-08-02, beschraenkt auf die Texte der System-Ansicht.

## v197 -> v198 (2026-08-02): Jeder Endpunkt einmal, plus ein zweiter Anlauf.

Live gemessen: die Chat-Bruecke antwortete bei 2 von 6 Coding-Fragen mit
HTTP 503 ("Model backend is not configured" — ihre eigene Tiefspur ist nicht
konfiguriert, und wenn der Control-Router aussetzt, faellt sie ins Leere),
der Reserve-Endpunkt bei 1 von 3 mit 502. Beide Ausfaelle sind kurz und
unabhaengig. Mit genau einem Versuch je Endpunkt trafen beide schlechten
Wuerfe in rund 11 % der Faelle zusammen, und der Nutzer sah "Verbindung zum
Server unterbrochen", obwohl ein einziger weiterer Anlauf gereicht haette.
Ein 4xx (ausser 429) wird weiterhin NICHT wiederholt.

## v196 -> v197 (2026-08-02): "Verbindung zum Server unterbrochen" behoben.

Live im Browser reproduziert: Fragen mit einer Web-Adresse schlugen zweimal
fehl, erst der dritte Versuch kam durch. Ursache: fetch-retry.js entscheidet
das Zeitbudget am MODELLNAMEN im Anfragekoerper — welche Spur der Server
nimmt, haengt aber an der FRAGE. Steht dort "smejj 1.0", galten 6,5 s,
obwohl die Frage ueber den Control Server lief und dort gemessene ~15 s bis
zum ersten Byte braucht. Der Klient gab nach 2 x 6,5 s auf, obwohl der Server
eine Sekunde spaeter geantwortet haette. Jetzt bleibt der schnelle Wechsel auf
den Reserve-Endpunkt erhalten, aber der LETZTE Versuch wartet lange.
fetch-retry.js liegt cache-first im Precache — ohne Versionssprung erreicht
der Fix Bestandsnutzer nicht.

## v195 -> v196 (2026-08-02): Sprachwelle Stufe 3a jetzt auch auf der Startseite.

composer-tools.js reicht dem Waechter den erkannten TEXT statt eines Ja/Nein
(adaptive Wartezeit) und macht den Denk-Laut scharf. Damit importiert eine
Precache-Datei erstmals voice-thinking-cue.js — die Datei MUSS deshalb in den
SHELL, sonst liefert der Rueckfall offline "/" (HTML) statt JavaScript und
bricht composer-tools.js komplett ab. Genau davor warnt check:precache-imports;
die Pruefung hat die Luecke gemeldet, bevor sie live ging.

## v194 -> v195 (2026-08-02): Sprachwelle Stufe 3a. Zwei Aenderungen im

Precache: voice-endpoint.js (semantisches Sprech-Ende — die Wartezeit nach
dem letzten Wort richtet sich nach dem Gesagten statt starr 850 ms zu sein)
und voice-speech-queue.js (sayAhead: eine Ansage kann VOR der Antwort in
dieselbe Warteschlange, damit sie nicht hineinredet). Ohne diesen
Versionssprung bekaemen Bestandsnutzer beide Dateien weiter aus dem Cache —
cache-first seit v160. Der alte Aufrufweg von voice-endpoint.js bleibt
unveraendert, damit die eingefrorene composer-tools.js (Start-Lock) exakt ihr
heutiges Verhalten behaelt. NICHT im Precache: voice-thinking-cue.js
(Denk-Laut) — nur voice-landing.js importiert es, und voice-landing.js steht
selbst nicht im SHELL; beide kommen aus dem Netz, der Stand bleibt stimmig.

## v192 -> v193 (2026-07-29): EIN Modul, EINE Kennung. chat-actions.js

importierte voice-speech-queue.js?v=1, waehrend composer-tools.js und
voice-landing.js ?v=blitz-20260726 nutzen — live gemessen wurde die Datei
ZWEIMAL geladen (4,3 KB doppelt) und lag als zwei Modulinstanzen mit
getrenntem Zustand im Speicher. Kaputt war nichts: hier wird aus dem Modul
nur die reine Funktion sanitizeForSpeech benutzt. Die Warteschlange aus
derselben Datei haette es zerrissen — genau das ist in v184 und v185 zweimal
passiert. Dritter Fall derselben Ursache, deshalb gibt es jetzt
scripts/check-module-queries.mjs (laeuft in check:all).
chat-actions.js liegt cache-first im Precache; ohne Versionssprung erreicht
die Aenderung Bestandsnutzer nicht.

Im selben Zug, ausserhalb des Precache: public/de/index.html lud
voice-landing.js unter ?v=voice-send-20260721 — einer Kennung, die sechs
Aenderungen alt war, waehrend die 14 anderen Sprachseiten ?v=blitz-20260726
nutzten. Ausgerechnet die deutsche Seite lief damit auf altem Stand.

## v191 -> v192 (2026-07-29): Codeblock im Chat mit EINEM Klick kopieren. Neu im

Precache: chat-code-copy.js; start-styles.css enthaelt die zugehoerigen Regeln
aus chat-markdown.css. Die Aktionsleiste kopierte bisher nur die GANZE
Antwort — der haeufigste Fall ist aber ein einzelner Codeblock, und im
horizontal scrollenden <pre> reisst Markieren mit der Maus regelmaessig ab.
Der Knopf traegt bewusst keinen Textknoten (Beschriftung aus CSS): sonst waere
"Kopieren" ueber entry.textContent im gespeicherten Verlauf und im
Modellkontext gelandet.

## v189 -> v190 (2026-07-28): Das Aufraeumen der Maus-Tabs lief nie. Der

init()-Aufruf stand oberhalb der const-Deklarationen von maus-panel.js —
temporale Totzone, ReferenceError, vom catch fuer gesperrten localStorage
lautlos verschluckt. Alle Checks waren gruen; gefunden nur per Live-Messung.
Start jetzt am Dateiende, maus-panel.js auf ?v=3.

## v188 -> v189 (2026-07-28): Der v188-Fix kam im Browser nicht an. index.html

laedt browser-pane.js und maus-panel.js mit ?v=-Query — unter der ALTEN Query
behaelt der Browser seine alte Kopie, egal was am Pfad neu ist (dieselbe
Falle wie v184/v185). Jetzt browser-pane.js ?v=browser-pane-20260728-3 und
maus-panel.js ?v=2; maus-panel.js importiert exakt dieselbe Query, sonst
waeren es zwei Modul-Instanzen mit getrenntem state.

## v187 -> v188 (2026-07-28): Wurzelfix zur "Ungueltige URL."-Meldung. v187

raeumte nur localStorage — zu spaet, browser-pane.js hatte den alten
Maus-Tab da schon im Speicher. Jetzt werden wiederhergestellte Maus-Tabs in
BEIDEN Ablagen geleert, bevor das Panel oeffnet. browser-pane.js exportiert
dafuer sein state-Objekt (nur das Schluesselwort, 0 Netto-Zeilen). Beide
Dateien liegen im Precache.

## v186 -> v187 (2026-07-28): maus-panel.js leert beim Start eine gespeicherte

/maus-replay.html-Adresse. Beim Wiederherstellen verliert der Maus-Tab seinen
Modus, browser-pane.js schickte die relative Adresse dann durch den
Server-Proxy, und im Panel stand "Ungueltige URL." UEBER einer korrekt
laufenden Wiedergabe. maus-panel.js liegt im Precache — ohne Versionssprung
erreicht der Fix Bestandsnutzer nicht.

## v185 -> v186 (2026-07-28): maus-panel.js in den Precache. index.html laedt es

als Modul-Skript (Zeile 655), es fehlte aber in SHELL — offline brach der
Import ab und der Maus-Knopf war tot. check:precache-imports meldete trotzdem
OK, weil es nur Modul-IMPORTE ab den Precache-Eintraegen verfolgt und
<script src>-Tags in index.html gar nicht ansieht. Genau diese Luecke ist
jetzt geschlossen: der Pruefer liest die Skript-Tags mit.

## v184 -> v185 (2026-07-28): Dritter Anlauf, und diesmal an der Wurzel. Die

Cache-Query steckte nicht nur an settings-runtime.js, sondern eine Ebene
hoeher: premium-surfaces.js importierte settings-surface.js?v=3, und DAS zog
die alte Laufzeit mit. Im Live-Test sichtbar geworden ueber
performance.getEntriesByType — geladen waren beide Fassungen nebeneinander.
Lehre: Bei geschachtelten Modul-Queries muss die Kette von OBEN gebumpt
werden, sonst haelt der oberste Cache-Eintrag die ganze Kette alt.

## v183 -> v184 (2026-07-28): Der Fix aus v183 kam im Browser nicht an. Zwei

Ursachen, beide im Live-Test gefunden: settings-surface.js importierte
settings-runtime.js unter ZWEI Adressen (mit und ohne ?v=3) — in ES-Modulen
sind das zwei getrennte Instanzen. Und die alte Query ?v=3 liess Browser die
alte Datei behalten. Jetzt EIN Import mit ?v=4.

## v182 -> v183 (2026-07-28): Nachbesserung an v182. Der neue Standard fuer den

Reasoning-Aufwand erreichte Bestandsnutzer NICHT: die Oberflaeche schreibt alle
Voreinstellungen mit, also stand bei praktisch jedem "high" im Speicher, ohne
dass es je jemand gewaehlt hatte. Einmalige Umstellung auf settingsVersion 2 —
ein vor Version 2 gespeicherter Wert gilt nicht als bewusste Wahl. Ohne das
waere K3 fuer Bestandsnutzer von 8,6 s auf 13,9 s gefallen.

---

## Aeltere Eintraege (v182 und davor)

Der Verlauf ist am 2026-08-08 geteilt worden: die Datei war auf 806 Zeilen
gewachsen und riss damit dieselbe 800-Zeilen-Regel, wegen der sie ueberhaupt
erst aus `public/sw.js` herausgeloest wurde. Inhaltlich ist nichts geaendert
worden — nur der Schnitt ist neu.

Alles bis einschliesslich **v181 -> v182** steht in
[SW_VERSIONSVERLAUF-ARCHIV.md](SW_VERSIONSVERLAUF-ARCHIV.md).

## v230 -> v234 (2026-08-06, Konkurrenz-Radar Freigabe-Paket)

Vier freigegebene Punkte in Folge (v231 kam aus einer Parallelsitzung):
- v232 V4 Stufe 2: search.js findet PROJEKT-DATEIEN aus den Projekt-Manifesten
  (vorher nur state.uploads = fluechtige Sitzungs-Uploads). 20-s-Cache, weil
  findResults() bei jedem Tastendruck laeuft.
- v233 Ausbaustufe Messung: icon-nutzung.js NEU (anonyme Icon-Zaehlung, feste
  Positivliste, nur localStorage, KEIN fetch). Auswertung als Knopf in der
  Status-Ansicht. Zaehlstand geht in den Datenschutz-Export.
- v234 V5: quellen-panel.js NEU (Links aus den Antworten, Zaehler am
  Quellen-Knopf). Nichts gespeichert, immer frisch aus dem offenen Chat.
Beide neuen Module haengen an profile-dock.js statt an index.html — die
Startseite bleibt damit unter dem Start-Lock unangetastet (Muster auth-gate.js).
Dazu ohne sw-Bezug: Operations Console Stufe 10 (Konkurrenz-Radar) und
/radar/berichte.json.
Freigabe Betreiber 2026-08-06.

## v235 -> v236 (2026-08-09, Konkurrenz-Radar V3 Stufe 2): Modellwahl vereinfacht

Der Modellwahl-Chip zeigt normalen Nutzern "Schnell/Auto/Gruendlich" statt
Modellnamen. Modellnamen (GLM-5.2, Kimi K2.7, Cline, Kimi K3) bleiben unter
"Modelle (erweitert)" im selben Menue erreichbar — der bestehende BYOK-/
Vault-Pfad ist unveraendert (getestet: Wechsel zu einem BYOK-Modell und
zurueck, Cline-Untermenue unberuehrt). Eine gewaehlte Stufe wechselt zurueck
auf den Live-Pfad ("smejj 1.0") und geht als preferences.stufe an die Bruecke.

Bruecke v125 (public/chat-bridge.js) ist Voraussetzung: leseStufe() liest
body.stufe/body.preferences.stufe, streamFastLane() erzwingt bei "schnell"
immer die Groq-Schnellspur (auch bei Coding) und gibt sie bei "gruendlich"
immer ab. Unbekannte Werte und fehlende Angabe verhalten sich exakt wie vorher
(Fail-Safe). Live seit 2026-08-08 per Salad-Container-Neustart, mit curl gegen
/api/agent und /api/chat verifiziert (schnell/gruendlich/unbekannt je einmal
mit und ohne Coding-Aufgabe).

Freigabe des Betreibers 2026-08-06, Bedingung (c) explizit erfuellt: drei
`npm run eval:models --live`-Laeufe (08-08 Basis 100%, 08-09 100%, 08-09
Bestaetigung 99%), identisches Modell-Routing je Fall in allen drei Laeufen.
Die einzelne "Regression"-Meldung im zweiten Lauf war reine Kimi-
Latenzstreuung (im dritten Lauf lag p95 unter dem Ausgangswert) — Berichte in
docs/benchmarks/modeleval-smejj-chat-core-live-default-2026-08-08.json und
...-2026-08-09.json.


## v713 — 2026-08-30 — Mobil: Icons in EINER Zeile (Betreiber-Anweisung)
start-styles.css neu (Quelldateien chat-actions.css, mobil-composer.css,
chat-actions.js +1 title): Composer-Werkzeugzeile bricht nicht mehr in eine
dritte Zeile (Chip/Pille geklemmt, Ellipsis; unter 360 px Pillen-Wort weg);
Chat-Aktionsleiste behält den Versionswaehler in derselben Zeile (Label weg,
Nummer im title, waagrechtes Scrollen als Netz, Nutzerzeilen dann linksbündig).
Ursprung: Betreiber-Screenshot iPhone 2026-08-30 10:34 — Icons "rutschen
unten runter". 44-px-Touchziele unangetastet; Desktop unverändert.


## v714 — 2026-08-30 — Sprachwelle: präzise Mikrofon-Fehlermeldungen
voice-ohr-solo.js, composer-tools.js, app.js und index.html neu (Markenkette
?v=4 → werkzeuge-10 → b100). Eigener Stempel ist Pflicht: alle vier liegen im
Precache, und der Fetch-Handler matcht mit ignoreSearch — ?v=-Marker allein
erreichen Bestandsnutzer nicht (gemessen nach dem v713-Deploy: index frisch,
Assets blieben alt). Inhalt: Das eigene Ohr meldet eine gesperrte Mikrofon-
Freigabe (iOS-HomeScreen-PWA) mit klarem Weg — Einstellungen › Datenschutz ›
Mikrofon für smejj.com erlauben oder einmal in Safari öffnen — statt des
irreführenden Generikums; fehlendes Mikrofon ebenso. Antwort-Vorlesen (Tipp-
Fallback) bleibt. Rollback: Frontend revert auf 4bb4de4.
