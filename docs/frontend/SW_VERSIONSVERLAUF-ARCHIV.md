# Service-Worker: Versionsverlauf — Archiv (v182 und aelter)

Fortsetzung von [SW_VERSIONSVERLAUF.md](SW_VERSIONSVERLAUF.md) nach unten,
also rueckwaerts in der Zeit. Geteilt am 2026-08-08, weil die Hauptdatei mit
806 Zeilen die 800-Zeilen-Regel aus AI_Guidelines.md riss.

Die Eintraege sind **unveraendert** uebernommen. Die Regeln und die Einordnung
stehen weiterhin oben in der Hauptdatei — wer hier liest, sollte sie kennen.

---

## v181 -> v182 (2026-07-28): Reasoning-Aufwand wird echt wirksam. Der Wert aus

Einstellungen -> Modelle war bisher nur ein Satz im Prompt; fuer Kimi K3 steuert
er jetzt den API-Parameter reasoning_effort (Mittel->low, Hoch->high,
Maximal->max). Der Standard wechselt von high auf medium, damit das
gemessene Tempo erhalten bleibt (8,6 s statt 13,9 s bis zum ersten Zeichen) —
wer mehr Tiefe will, stellt sie ausdruecklich ein. Nur settings-runtime.js
geaendert; Startseite, Eingabefeld und Design unveraendert.

## v180 -> v181 (2026-07-28): Reihenfolge im Modell-Menue nach Vorgabe des

Betreibers: smejj 1.0, Kimi K3, GLM-5.2, Cline, Kimi K2.7. Nur die Abfolge der
Menueeintraege in index.html; Beschriftungen, Zuordnung und Design unveraendert.
Die Namen bleiben ausdruecklich lang ("Kimi K3", "Kimi K2.7") — kuerzere Labels
wuerden gespeicherte Nutzerwahlen entwerten (MODEL_MODES-Schluessel).

## v179 -> v180 (2026-07-28): Kimi K3 im Modell-Menue. Der Picker im Eingabefeld

ist eine fest verdrahtete Liste (index.html + MODEL_MODES in app.js) — die
Server-Registry kannte K3 laengst, der Nutzer kam ueber die Oberflaeche aber
nicht heran. Ein Menueeintrag, eine Zeile Zuordnung, sonst nichts: Startseite,
Eingabefeld und Design bleiben unveraendert. Freigabe des Betreibers lag vor.

## v178 -> v179 (2026-07-28): Spurwahl und Zeitbudget. Gemessen gegen die

Live-Bridge: Schnellspur 0,49-1,01 s bis zum ersten Byte, Tiefspur 4,9-7,8 s —
bei einem gemeinsamen Limit von 6,5 s in fetch-retry.js. Deshalb endeten
ausgerechnet Fragen MIT Web-Adresse oft in "Verbindung zum Server
unterbrochen". browser-context.js waehlt die Tiefspur jetzt nur noch, wenn die
Seite NICHT geladen werden konnte (sonst steht ihr Inhalt schon in der Frage
und die Schnellspur liest ihn mit); fetch-retry.js gibt der Tiefspur ein
eigenes Budget. Beide Dateien liegen cache-first im Precache.

## v177 -> v178 (2026-07-28): Ehrlichere Beschriftung der Quellenliste.

Gegroundet wird die FRAGE. Scheitert der Antwortstrom danach (live erlebt:
"Verbindung zum Server unterbrochen"), waere "Quellen dieser Antwort" eine
Behauptung, die nicht stimmt. Jetzt "1 Seite fuer diese Frage geladen".

## v176 -> v177 (2026-07-28): "Quellen anzeigen" pro Antwort. browser-context.js

merkt sich jetzt, WELCHE Seite es geladen hat (vorher wurde die Herkunft nach
dem Einweben in die Frage verworfen); chat-actions.js ordnet sie ueber die
Frage davor zu und zeigt sie auf Wunsch unter der Antwort. Der Menuepunkt
erscheint nur bei echtem Grounding. browser-context.js, chat-actions.js,
chat-actions-menu.js, chat-messages.js, chat-store.js und start-styles.css
liegen cache-first im Precache — ohne Versionssprung erreicht die Aenderung
Bestandsnutzer nicht.

## v175 -> v176 (2026-07-28): static-pages.css — Wortumbruch fuer lange Woerter.

Bei 200 %% Zoom auf einem 390-px-Handy (195 CSS-px) sprengte
"Datenschutzerklaerung" die Zeile und erzeugte Querscrollen auf der ganzen Seite.

## v174 -> v175 (2026-07-28): static-pages.css — Logo-Link der statischen Seiten

auf 24 px Mindesthoehe (Restbefund QA-Welle 1, F-21: er mass 30x23).

## v173 -> v174 (2026-07-28): Die Entscheidungen der Nachrichten-Aktionen

(Loeschen, Rueckgaengig, Bearbeiten, Neu generieren, Menue-Tastatur,
Versionswechsel) liegen jetzt als pruefbare Funktionen in chat-messages.js;
chat-actions.js wendet sie nur noch an. Kein Verhaltenswechsel ausser einem
dabei gefundenen Randfall: Pfeil-auf ohne fokussierten Menuepunkt landete auf
dem VORLETZTEN statt dem letzten Punkt. Beide Dateien liegen cache-first im
Precache — ohne Versionssprung erreicht die Aenderung Bestandsnutzer nicht.

## v172 -> v173 (2026-07-28): Hilfeseite. /hilfe.html neu im Precache und

static-pages.css um den p-hilfe-Teil erweitert. Die Seite muss auch ohne Netz
lesbar sein — gerade wer nicht weiterkommt, braucht sie.

## v171 -> v172 (2026-07-28): Pflicht-Sprung. Die Statusseite (status.html,

status.js) kam in denselben v171 wie die Chat-Fassungen einer parallelen
Sitzung — zwei verschiedene Precache-Listen unter EINEM Cache-Namen. Wer v171
schon installiert hatte, haette die Statusseite nie in den Cache bekommen.
Genau dafuer ist die Regel da: geaenderter Precache = neue Version.

## v170 -> v171 (2026-07-28): Antwort-Fassungen ueberleben ein Neuladen.

chat-store.js speichert versions + active je Nachricht (Obergrenze acht) und
gibt sie beim Wiederherstellen zurueck; vorher war "Version 2 von 3" nach
einem Reload verschwunden, weil die Fassungen nur im Arbeitsspeicher lagen.
chat-store.js und chat-messages.js liegen cache-first im Precache — ohne
Versionssprung erreicht die Aenderung Bestandsnutzer nicht.

## v169 -> v170 (2026-07-28): Statusseite. /status.html und status.js neu im

Precache — die Seite muss gerade dann noch laden, wenn Dienste ausgefallen
sind, also auch aus dem Cache. static-pages.css traegt neu den p-status-Teil
und braucht denselben Sprung, sonst bleibt die Seite bei Bestandsnutzern
unformatiert. auth-gate.js ebenfalls (neuer oeffentlicher Pfad /status).

## v168 -> v169 (2026-07-28): Nachbesserung am Ueberlaufmenue der

Nachrichten-Aktionen (Live-Befund). Das Menue lag in der Aktionsleiste und
damit in #startLog, das overflow: auto hat — bei der ersten Antwort passte es
weder darunter noch darueber und wurde an der Kante abgeschnitten; bei kurzem
Verlauf konnte das Log auch nicht dorthin scrollen. Es haengt jetzt am body
und wird am Viewport ausgerichtet. chat-actions.js und start-styles.css
liegen cache-first im Precache — ohne Versionssprung erreicht der Fix
Bestandsnutzer nicht.

## v167 -> v168 (2026-07-28): Live-Fehler behoben — app.js benutzte PANEL_WIDTHS,

ohne es zu kennen. Bei der Aufteilung wanderte die Konstante nach
panel-layout.js, wurde dort aber nicht exportiert. Folge: JEDES Auf- und
Zuklappen der Seitenleiste warf "PANEL_WIDTHS is not defined", und
syncLeftMenuState/syncBackdrop liefen danach nicht mehr. Beide Dateien
liegen im Precache und brauchen den Versionssprung.

## v166 -> v167 (2026-07-28): Nachbesserung am Ueberlaufmenue der

Nachrichten-Aktionen (Live-Befund): es klappte auch dann nach oben, wenn dort
gar kein Platz war, und wurde am oberen Rand des Chat-Logs abgeschnitten.
Jetzt werden beide Seiten gemessen. chat-actions.js liegt cache-first im
Precache — ohne Versionssprung erreicht der Fix Bestandsnutzer nicht.

## v165 -> v166 (2026-07-28): QA-Welle 1, Befund F-23 — die drei toten Knoepfe

#saveSettings, #showOfflinePage und #showErrorPage sind entfernt (Freigabe
Betreiber "mach es bitte komplett fertig"). Betroffen sind index.html,
app.js und settings-surface.js; alle drei liegen im Precache und brauchen
den Versionssprung, sonst sehen Bestandsnutzer die Knoepfe weiter.

## v164 -> v165 (2026-07-28): Aktionen pro Chat-Nachricht (Kopieren, Bearbeiten,

Neu generieren, Bewerten, Vorlesen, Abzweigen, "Ab hier loeschen" mit
Rueckgaengig, Versionswahl). PFLICHT im Precache, keine Kosmetik: index.html
laedt chat-actions.js, das chat-messages.js und chat-actions-menu.js
importiert — ohne Precache findet der Import offline nichts, der Fetch-Handler
liefert als Rueckfall "/" (HTML) und der Browser bricht das Modul ab.
chat-store.js importiert seit dieser Aenderung ebenfalls chat-messages.js
(Rohtext und Zeitstempel im gespeicherten Verlauf), es haengt also auch der
Chat-Verlauf daran. start-styles.css enthaelt neu chat-actions.css und
braucht den Versionssprung, sonst bleibt die Leiste bei Bestandsnutzern
unformatiert.

## v163 -> v164 (2026-07-28): Barrierefreiheit — zugeklappte Panels sind nicht

mehr per Tastatur erreichbar (panel-layout.js). Gemessen bei der Zoom-
pruefung: 11 von 22 Tab-Stationen lagen ausserhalb des Bildes (zugeklappte
Seitenleiste bei -208 px, Browser-Panel bei 1309 px). Jetzt 0 von 22.
panel-layout.js liegt im Precache und braucht den Versionssprung.

## v162 -> v163 (2026-07-28): Offline-Fix in local-workspace-surface.js. Erste

echte Offline-MESSUNG (Netz per DevTools-Protokoll abgeschaltet) zeigte:
die Shell laedt in 99 ms aus dem Cache, aber die online/offline-Listener
bekamen die Statusfunktion direkt uebergeben — der Browser reicht dann das
Event als deps herein und die Anzeige warf beim Netzwechsel. Die Datei liegt
im Precache und braucht den Versionssprung, sonst erreicht der Fix
Bestandsnutzer nicht.

## v161 -> v162 (2026-07-28): Feldmessung — field-vitals.js schreibt LCP, INP,

CLS und TTFB echter Besuche NUR LOKAL mit (kein Netzverkehr, keine Last fuer
den Control Server). PFLICHT im Precache: usage-meter.js importiert das Modul.

## v160 -> v161 (2026-07-28): CSP-Haertung — static-pages.css neu im Precache.

Die 20 statischen Seiten (Rechtstexte, 404, Sprach-Startseiten) laden ihren
Stil jetzt per <link> aus /assets/static-pages.css statt als <style>-Block;
der eigene Node-Server sendet style-src 'self' und blockierte Inline-Stil.
Ohne Precache waeren diese Seiten offline unformatiert.

## v159 -> v160 (2026-07-28): QA-Welle 1, Befund F-24 — cache-first fuer die

Precache-Dateien. Bisher war ALLES network-first: die ~95 vorab gespeicherten
Dateien wurden online bei jedem Aufruf erneut angefragt (gemessen: 104
Anfragen je Seitenaufruf, davon ~90 Precache-Assets). Jetzt beantwortet der
Cache Anfragen auf Precache-Pfade direkt; HTML (Navigationen und .html) und
/api/ bleiben network-first. WICHTIG dadurch: eine Aenderung an einer
Precache-Datei erreicht Bestandsnutzer NUR noch ueber einen Versionssprung
hier (CACHE_NAME) — das war schon immer die dokumentierte Pflicht (siehe
alle Eintraege unten), ist jetzt aber zwingend statt nur wichtig.
ignoreSearch beim Cache-Treffer: index.html laedt einige Module mit
?v=-Kennung, der Precache speichert ohne — beides ist nach einem
Versionssprung derselbe Stand.
Ausserdem (Messbefund derselben Pruefung): auth-gate.js (Import aus
profile-dock.js mit ?v=1 — dem Import-Waechter dadurch entgangen) und
api-keys-surface.css (zur Laufzeit als <link> eingehaengt) fehlten im
Precache. Offline haette der Rueckfall fuer beide "/" (HTML) geliefert und
das Modul bzw. den Stil zerstoert. Beide neu in SHELL.

## v156 -> v157 (2026-07-28): renderEmptyState fehlte in der zweiten Funktion

von local-workspace-surface.js. Jetzt jede Funktion einzeln gegengeprueft.

## v155 -> v156 (2026-07-28): Nachbesserung der Aufteilung — setText und

renderEmptyState wurden von local-workspace-surface.js benutzt, aber nicht
mitgereicht (Live-Befund: ReferenceError). Jetzt ausdruecklich in deps.

## v154 -> v155 (2026-07-28): app.js aufgeteilt (1411 -> 800 Zeilen, Ratchet-

Ausnahme entfernt). Die sieben neuen Module sind PFLICHT im Precache — app.js
importiert sie; ohne Precache waere die App offline tot.

## v153 -> v154 (2026-07-28): view-title.js neu im Shell-Cache. PFLICHT, keine

Kosmetik: app.js importiert das Modul (Seitentitel je Ansicht, QA-Welle 2
Befund W2-05). Ohne Precache findet der Import offline nichts, der
Fetch-Handler liefert als Fallback "/" und der Browser bricht app.js
komplett ab — die App waere offline tot (siehe v130-Hinweis).

## v147 -> v148 (2026-07-27): Stufe 2 — browser-context.js im Precache; Seiten-

inhalt einer im Auftrag genannten Adresse geht in den Modellkontext.

## v146 -> v147 (2026-07-27): Startseite antwortet im Gespraechsfaden statt auf

/automation zu springen (autonomous-intent.js). Nur live gesetzt, weil die
Datei damals unter dem Start-Lock stand; hier mit v148 nachgezogen.

## v145 -> v146 (2026-07-27): Salad-Abloesung abgeschlossen — Betreiber hat den

Groq-Key auf Zeabur hinterlegt (gemessen 0,3-0,8 s, schneller als Salad);
Chat/Agent primaer Zeabur, Salad nur noch Reserve.

## v144 -> v145 (2026-07-26): Tempo-Korrektur nach Live-Messung — Chat/Agent

zurueck auf Salad-primaer (Groq-Schnellspur 0,8 s; Zeabur ohne Groq-Key
2,2 s). Zeabur bleibt Reserve + Stimme; Wechsel auf Zeabur-primaer folgt,
sobald der Betreiber den Groq-Key dort hinterlegt.

## v143 -> v144 (2026-07-26): Salad-Abloesung Schritt 1 — Zeabur ist Haupt-

Endpunkt fuer Chat/Agent (config.js Tausch), Salad nur noch Reserve.

## v142 -> v143 (2026-07-26): Premium-Stimme auf Zeabur-CPU (Piper, Flat-Paket)

— config.js zeigt voiceStatus/voiceTts auf die Zeabur-Bridge;
voice-premium-tts.js meldet die Sprache beim Status-Check (Sprach-Gate).

## v141 -> v142 (2026-07-26): Stufe C Zwei-Wege-Betrieb — ai/fetch-retry.js

faellt bei totem Salad-Endpunkt automatisch auf den Zeabur-Mietserver
(smejj-chat-bridge.zeabur.app) zurueck; config.js (Fallback-Routen), app.js
und voice-landing.js reichen die Endpunkt-Listen durch.

## v140 -> v141 (2026-07-26): Abo-Status (Schritt 3b) — account-privacy.js und

account-sessions.js zeigen den echten Abo-Plan vom Control-Server
(/api/billing/status) und haengen client_reference_id an die Stripe-
Zahlungslinks; beide Dateien liegen im Precache und brauchen den Sprung.

## v139 -> v140 (2026-07-26): Light-Mode Nachzug 2 — restliche Primaer-Knoepfe

(#projectCreate/#projectSave/#searchSubmit/#storageAgain) waren im hellen
Schema dunkelmodus-weiss und damit unlesbar; Fix jetzt zentral fuer alle
sechs Knoepfe in app-surfaces.css (liegt im Precache, braucht den Sprung).

## v138 -> v139 (2026-07-26): Light-Mode Nachzug — Primaer-Knoepfe #saveProfile/

#saveSettings wurden von app-surfaces.css (Lock) dunkelmodus-weiss gefaerbt
und waren im hellen Schema unlesbar; account-privacy.css und
settings-surface.css liegen im Precache.

## v137 -> v138 (2026-07-26): Konto-Light-Mode-Fix — account-privacy.css liegt

im Precache; im hellen Systemschema war die Konto-Ansicht dunkler Text auf
dunklem Glas (iPhone-PWA-Befund). Ohne Versionssprung erreicht der Fix
wiederkehrende Nutzer nicht.

## v136 -> v137 (2026-07-26): Stufe A2+B — ai/fetch-retry.js (automatischer

Neuversuch bei Salad-Replika-Ausfall) und voice-premium-tts.js (Server-TTS
ueber WebAudio) neu im Shell-Cache; Importe von app.js, composer-tools.js
und voice-landing.js — ohne Precache waere die App offline tot.

## v135 -> v136 (2026-07-26): Sprachwelle Stufe 2a — voice-endpoint.js neu im

Shell-Cache (Interim-Waechter: Sprech-Ende ~1 s frueher; Import von
composer-tools.js und voice-landing.js — ohne Precache offline tot) und
Zwei-Ebenen-VAD in voice-vad.js (Unterbrechen auf Handys ohne Echo-
unterdrueckung der System-TTS: Pausen empfindlich, TTS-Phasen robust).

## v134 -> v135 (2026-07-26): Sprachwelle Blitz-Paket (Stufe 1e) — Warm-up,

Sofort-Senden, fruehes Lossprechen, Mikrofonpegel-Unterbrechung. Neu im
Shell-Cache: voice-echo-filter.js, voice-vad.js, voice-warmup.js,
composer-plus-menu.js (Import-Abhaengigkeiten von composer-tools.js —
ohne Precache waere die App offline tot, siehe v130-Hinweis).

## v133 -> v134 (2026-07-25): Light-Mode-Kontrastfix — app-surfaces.css geaendert

(Menue-/Browser-Knopf waren im hellen Schema hell auf hell, Kontrast 1.03:1).
app-surfaces.css liegt im Precache und wird ohne Cache-Buster geladen; ohne
Versionssprung erreicht der Fix wiederkehrende Nutzer nicht.

## v132 -> v133 (2026-07-21): Sende-Icon der Sprachwellen (wie ChatGPT) —

voice-typed-send.js neu im Shell-Cache; composer-tools.js/.css, voice-landing.js,
app.js und index.html geaendert; Precache muss die neuen Versionen ausliefern.

## v131 -> v132 (2026-07-21): Chat-Verlauf (Welle 1) — chat-store.js + chat-history-view.js

neu im Shell-Cache; index.html laedt beide Module.

## v130 -> v131 (2026-07-20): TTS-Sanitizer — voice-speech-queue.js, composer-tools.js,

app.js und index.html geaendert; Precache muss die neuen Versionen ausliefern.

## v129 -> v130 (2026-07-18): shared/http-json.js neu im Shell-Cache.

PFLICHT, keine Kosmetik: app.js importiert shared/http-json.js. Ohne Precache
findet der Import offline nichts, der Fetch-Handler liefert als Fallback "/"
(index.html), und der Browser bricht app.js komplett ab - die App waere
offline tot. Non-Regression laut Change-Lock.

## v153 -> v154 (2026-07-28): Logikfehler in deferred-start.js behoben. Der

Rueckfallweg (zwei rAF + setTimeout) rannte per Promise.race GEGEN die
Paint-Beobachtung — und war beim warmen Wiederbesuch schneller als der echte
Bildaufbau: sechs Aufrufe bei 112 ms, Bildaufbau erst bei 140 ms. Der
Rueckfall gilt jetzt nur noch, wenn es PerformanceObserver gar nicht gibt.

## v152 -> v153 (2026-07-28): PFLICHT, keine Kosmetik. Sieben importierte Module

fehlten im Precache — darunter chat-history-context.js, das app.js SELBST
importiert. Offline lieferte der Fetch-Handler dafuer den Rueckfall "/"
(index.html), der Browser bekam HTML statt JavaScript und brach das Modul ab:
die App war offline tot. Neu aufgenommen: account-sessions.js,
api-keys-surface.js, chat-history-context.js, i18n/ui.js, language-options.js,
onboarding-welcome.js, usage-meter.js. Gegen Rueckfall abgesichert durch
scripts/check-precache-imports.mjs (verfolgt den Importgraph).
Ausserdem: der letzte fruehe Control-Server-Aufruf (/api/auth/me aus
autonomous-coding.js) laeuft jetzt nach dem ersten Bildaufbau.

## v151 -> v152 (2026-07-27): Korrektur an deferred-start.js. Zwei rAF allein

reichen nicht — rAF laeuft VOR dem Malen. Live gemessen starteten im warmen
Wiederbesuch sechs Aufrufe bei 142-160 ms, waehrend der Bildaufbau erst bei
168 ms lag. Jetzt wird das Paint-Ereignis des Browsers selbst abgewartet.

## v150 -> v151 (2026-07-27): Die letzten drei Control-Server-Startaufrufe

(/api/auth/me aus account-privacy.js, /api/keys aus api-keys-surface.js,
/api/providers/cline/models+status aus provider-settings.js) laufen erst nach
dem ersten Bildaufbau. Alle drei Dateien liegen im Precache und brauchen den
Versionssprung, sonst erreicht der Fix wiederkehrende Nutzer nicht.

## v149 -> v150 (2026-07-27): Ladezeit — start-styles.css buendelt die acht

render-blockierenden Stylesheets der Startseite (die acht Einzeldateien sind
dadurch aus dem Precache raus, sie werden von keiner Seite mehr geladen);
deferred-start.js schiebt die fuenf Control-Server-Startaufrufe hinter den
ersten Bildaufbau. PFLICHT im Precache: app.js und premium-surfaces.js
importieren deferred-start.js — ohne Precache waere die App offline tot.

## v148 -> v149 (2026-07-28): Klickjacking-Schutz — frame-guard.js neu im

Shell-Cache. PFLICHT, keine Kosmetik: index.html und beide Auth-Seiten laden
das Modul; ohne Precache findet der Import offline nichts. Zusammen mit der
Meta-CSP aus derselben Freigabe (QA-Welle 1, Befund F-04).

## v215 -> v216 (2026-08-04): Sichtbarer Arbeitsfortschritt im Chat

(ai/chat-stream.js + chat-markdown.css) und autonomer Lauf IM Faden
statt Ansichtswechsel (NEU autonomous-thread-run.js, dynamisch aus
autonomous-intent.js geladen — deshalb ein eigener Precache-Eintrag,
sonst waere er offline tot). Beide Dateien liegen cache-first im
Precache; ohne Versionssprung erreicht die Aenderung wiederkehrende
Nutzer nie (caches.match laeuft mit ignoreSearch).

## v219 -> v220 (2026-08-04): Qualitaetsseite sagt jetzt das Alter der Messdaten

und nimmt das Sechs-Stunden-Versprechen zurueck (es gibt keinen Zeitplan).
Ausserdem frische Messwerte: 98,04 %, 0 kritische Verstoesse. verlauf.js
und verlauf-messwerte.json liegen cache-first im Precache — ohne
Versionssprung saehen wiederkehrende Nutzer weiter den alten Stand.

## smejj-shell-v221 -> smejj-shell-v221 (2026-08-04): /verlauf-messwerte.json kommt jetzt

netz-zuerst statt cache-first (LIVE_DATEN_PFADE). Ohne das waere die
freigegebene automatische Qualitaetsmessung wirkungslos gewesen —
wiederkehrende Nutzer haetten ewig den alten Stand gesehen.

## v221 -> v222 (2026-08-05, Freigabe A): Premium-Stimme repariert — config.js

schickt voiceStatus/voiceTts zur Salad-Bridge (Zeabur meldete "verfuegbar"
und lehnte dann ab), voice-premium-tts.js bekommt ein 3-s-Zeitbudget bis zum
ersten Ton plus Anmelde-Header. Beide Dateien liegen cache-first im
Precache — ohne Versionssprung erreicht der Fix wiederkehrende Nutzer nie.

## v222 -> v223 (2026-08-05, Freigabe C): dauerhaft eingeloggt — /api/auth/me

liefert bei jeder Nutzung ein frisches Token (180 Tage), account-sessions.js
speichert es (nur bestehende localStorage-Tokens; Passkey bleibt
session-only). Import-Query auf ?v=6, damit auch der HTTP-Cache mitzieht.

## v227 -> v228 (2026-08-06, Konkurrenz-Radar V1): Riesen-Einfuegung wird Anhang-Chip

composer-paste-attach.js NEU im SHELL (Import in app.js): eingefuegter Text
ab 8000 Zeichen landet als Chip ueber der Eingabezeile statt in ihr; beim
Senden verbindet composePastedTask() Chips und getippten Text. start-styles.css
bekommt die Chip-Optik, index.html neue ?v=paste-attach-20260806-Queries.
Hinweis: v224-v227 wurden in Parallelsitzungen nur im Live-Repo dokumentiert;
dieser Eintrag setzt direkt auf v227 auf. Freigabe Betreiber 2026-08-06
(Radar-Bericht 01, V1 — gilt als Start-Lock-Freigabe).

## v228 -> v229 (2026-08-06, Konkurrenz-Radar V4 Stufe 1): Verlauf anpinnen

chat-store.js: togglePinChat() + Pins-zuerst-Sortierung, angepinnte Chats sind
von der 100er-Aufraeumung ausgenommen, updatedAt bleibt beim Pinnen unveraendert.
chat-history-view.js: Anpinnen/Loesen-Knopf, Pin-Markierung, is-pinned-Optik.
WICHTIG: Alle chat-store-Importeure (chat-actions.js, search.js,
chat-history-view.js, index.html) springen GEMEINSAM auf ?v=pin-20260806 —
ein abweichender Spezifizierer erzeugt eine zweite Store-Instanz (F-07).
Freigabe Betreiber 2026-08-06 (Radar-Bericht 01, V4; kein Start-Lock betroffen).

## v229 -> v230 (2026-08-06, Konkurrenz-Radar V2): Live-Mitschrift im Sprachmodus

Die Antwort streamt als Text sichtbar unter der Welle mit: #voiceModeReply in
index.html, setVoiceModeReply() in composer-tools.js (gespeist aus dem
vorhandenen MutationObserver in waitForAssistantReply), Optik in
start-styles.css (:empty blendet aus). Neue Frage und Schliessen raeumen die
Mitschrift. Rein additiv — Erkennungs-Loop, Vorlese-Queue und Barge-in
unveraendert. app.js zieht die composer-tools-Import-Query auf
?v=voice-mitschrift-20260806 mit (einziger Importeur, kein Doppel-Instanz-Risiko).
Freigabe Betreiber 2026-08-06 (Radar-Bericht 01, V2 — gilt als Start-Lock-Freigabe).
