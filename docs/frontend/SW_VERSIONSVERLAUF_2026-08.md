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
> Die Eintraege bis v644 liegen ausgelagert (800-Zeilen-Ratsche, 2026-08-31):
> - Teil 1: [SW_VERSIONSVERLAUF_2026-08-teil-1.md](SW_VERSIONSVERLAUF_2026-08-teil-1.md) (v215 bis v484)
> - Teil 2: [SW_VERSIONSVERLAUF_2026-08-teil-2.md](SW_VERSIONSVERLAUF_2026-08-teil-2.md) (v485 bis v638)

## v645 (2026-08-22) — V11 fuer Einstellungen und Konto, Fokusring repariert

Deploy der letzten zwei Bereiche, die noch eine eigene Farbwelt hatten.
Sieben Dateien: account-privacy.css/js, settings-surface.css/js,
account-auth-state.js, design-cyan-views.css, design-v11-views.css.

Inhaltlich:
- design-cyan-views.css ist LEER. Sie faerbte die Flaeche unter allen 19
  Nicht-Start-Ansichten kalt ein (#080d14 plus zwei cyane Radial-
  Verlaeufe). Die richtige, neutrale Fassung lag die ganze Zeit darunter
  in app-surfaces.css und war nur ueberdeckt. Gemessen: 0 -> 18 von 18
  Ansichten ohne eigene Flaeche.
- Der "Light-Leak" im Kontobereich ist raus (Leuchtrahmen plus zwei
  220-px-Leuchtkugeln je Tafel, im Ton --v11-marke). Beleg fuer die
  Entscheidung: Effekt vom 2026-08-11, Betreiber-Ansage "Leuchten
  gedaempft, Augen schonen" vom 2026-08-16 — fuenf Tage spaeter, diese
  Datei wurde dabei nie mitgezogen. Die Willkommens-Karte behaelt ihn.
- FOKUSRING repariert: er trug #2dd4bf und der Test behauptete
  "Akzentfarbe traegt in hell und dunkel". Nachgerechnet (WCAG non-text,
  Schwelle 3.0) war das nie wahr — 1.86 gegen den hellen Konto-Grund.
  Tastaturnutzer im hellen Schema hatten keinen sichtbaren Ring. Jetzt
  eigene Variable je Schema: dunkel var(--v11-cy) 13.84, hell #0c6b5e
  6.18.
- Die CSS-Marke wanderte aus der abo-gesperrten account-privacy.js nach
  account-auth-state.js (KONTO_STIL_MARKE). Sie musste bei jeder
  Stil-Aenderung steigen und brach dadurch jedes Mal die Zahlungs-Sperre.

BEWUSST NICHT im Deploy: chat-bridge.js (im Frontend-Repo das
gebuendelte Artefakt — die Quelle dorthin zu kopieren crasht den
Zeabur-Dienst mit ERR_MODULE_NOT_FOUND) und die uebrige Arbeit der
Parallelsitzung, die ihren eigenen Deploy-Rhythmus hat.

v645 folgt auf v644 einer Parallelsitzung. Live-Nummer vor dem Bump
gemessen; sw.js war inhaltlich identisch zum lokalen Stand, nur die
Nummer wich ab — es wurde nichts Fremdes ueberschrieben.

## v646 (2026-08-22) — Nachzug: elf Frontend-Dateien der Parallelsitzung

Zweiter Deploy des Tages. v645 brachte die V11-Arbeit an Einstellungen
und Konto; hier folgt, was im Frontend-Repo sonst noch aelter war als
der abgenommene Stand:

  404.html · browser-pane.css · browser-pane-nachrichten.js ·
  design-v11.css · index.html · status.html · verlauf.html
  NEU: browser-pane-chrome.css · danke-abo.html · programmieren.html ·
       willkommen.html

Der Bump ist noetig, weil v645 den Vorrat bereits mit den ALTEN Fassungen
dieser Dateien gefuellt hat — ohne neue Nummer liefert der Service Worker
sie weiter (cache-first mit ignoreSearch; ein ?v= in der URL hilft dort
nicht).

Abgestimmt mit der Parallelsitzung, die diese Dateien committet hat:
freigegeben, mit der Bitte um einen aktuellen Ausgangsstand. Geprueft vor
dem Kopieren — public/ war identisch mit dem neuesten Commit, und ihre
Dialog-Arbeit lag vollstaendig darin (browser-pane-render.js 6x bpDialog,
browser-stage.js 8x dialogOffen). Beide Dateien standen ohnehin nicht auf
der Liste.

WIEDER NICHT dabei: chat-bridge.js (gebuendeltes Artefakt) und
assets/sw.js (Leiche seit v302, wird nie registriert — massgeblich ist
die Wurzel-sw.js, siehe v645).

## v648 (2026-08-22) — Fokusring app-weit sichtbar, Markenkette geschlossen

Vierter und letzter Deploy des Tages. Gesammelt, statt fuer jeden
Einzelpunkt einen eigenen Cache-Sprung zu machen.

1. FOKUSRING (design-v11-views.css): Er war unsichtbar, sobald jemand
   das helle Schema nutzt — und das gilt fuer JEDE premium-view
   (app-surfaces.css:627), nicht nur fuer Einstellungen und Konto.
   Nachgerechnet (WCAG non-text, Schwelle 3.0):
     app-surfaces  rgba(255,255,255,0.09) auf #fdfdfb -> ~1.0
                   (weiss auf weiss, buchstaeblich unsichtbar)
     V11-Akzent    #32f6ea                auf #fdfdfb -> 1.33
   Jetzt --v11-fokus: dunkel var(--v11-cy) 13.84, hell #0c6b5e 6.29.
   app-surfaces.css blieb unberuehrt (Start-Lock), ueberschrieben wird
   in design-v11-views.css.

2. MARKENKETTE geschlossen (95 Module, jedes mit genau EINER Marke):
   - account-privacy.js b46m -> b47 (premium-surfaces.js)
   - browser-pane-render.js  20260820-3 -> 20260822-1
   - browser-pane-session.js 20260709-2 -> 20260822-1
   - browser-pane-fernwege.js 20260820-3 -> 20260822-1
   Die letzten drei gehoeren der Parallelsitzung, die sie heute geaendert
   hat; ihre Sitzung war beendet, die Marken blieben offen. Nur die
   Marken angefasst, kein inhaltlicher Eingriff. Dabei die Kettenregel
   bezahlt: fernwege.js zu aendern zwang seine EIGENE Marke hoch — "die
   Kette bricht oben".

Alle vier Punkte treffen ausschliesslich Besucher OHNE Service Worker;
wer einen hat, bekommt die Dateien durch diesen Bump ohnehin frisch.
Genau darum wurde gesammelt.

Nebenbei geprueft und in Ordnung: die vier Fokusringe im Browser-Panel
(11.38 bzw. 9.15) — sie tragen, weil das Panel zur Shell gehoert und
keine helle Fassung hat. Gegen den Tag, an dem sich das aendert, steht
jetzt ein Test.

## v649 (2026-08-22) — EIN Cyanton, auch auf der Startseite

Betreiber: "startseite auch auf den einheitlichen ton".

Der Anlass fuer design-v11.css steht in dessen eigenem Kopf: "Cyan lag in
SECHS Dateien und in DREI verschiedenen Toenen — #2dd4bf, #32f6ea,
#2fd4c9." Die Ansichten tragen seit heute frueh den einen Ton; die
Startseite und das Such-Overlay waren die letzten mit dem alten.

15 Farbwerte rgba(45,212,191,x) -> rgba(50,246,234,x) in:
  start-glass.css     6  (Radial oben, Markenwort, Glasflaeche,
                          Schreibfeld-Rahmen, Chips)
  search-overlay.css  8  (Panel, Formular, Zeilen, Trenner)
  view-chrome.css     1  (innerer Schein)
Deckkraft und Struktur unveraendert — nur der Ton.

WIRKUNG NACHGERECHNET, weil der neue Ton 41 % heller ist und die
Betreiber-Ansage vom 2026-08-16 "Leuchten gedaempft, Augen schonen"
lautet: Auf dem dunklen Grund (#0d0e10) und bei 0.13-0.35 Deckkraft
bleibt von den 41 % eine effektive Abweichung von 5-15 auf 255 uebrig,
also 2-6 %. Im A/B-Screenshot nicht unterscheidbar. Kein Widerspruch.

Buendel-Integritaet geprueft: 1184 Regeln vorher wie nachher, exakt 15
abweichende Zeilen, Bytezahl identisch (die zwei Farbschreibweisen sind
gleich lang). Keine Regel zerrissen — die sed-Falle bei CSS-Sammelregeln
war hier nicht im Spiel, weil nur Werte innerhalb von Deklarationen
ersetzt wurden, keine Selektorzeilen.

Der Treffer in design-v11.css bleibt: er steht im Kommentar, der die
Ton-Vielfalt historisch erklaert.

## v650 (2026-08-23) — Medien lagen an DREI Orten, ausgelagert wurde einer

An 113 echten Gespraechen gemessen: ZEHN lagen ueber MAX_CHAT_BYTES und
wurden deshalb NIE gesichert — sie lebten nur im Browser. Median aller
Chats 7 KB, groesster 1938 KB bei NEUN Nachrichten, einer 1537 KB bei
DREI. Es war also nie zu viel Text, immer ein Medium; bei allen zehn
stand `ausgelagert: 0`.

Ursache: readEntries() speichert dasselbe Medium dreifach — `html`
(innerHTML), `text` (textContent) und `raw` (Modell-Antwort in den
Metadaten), gemessen 7 / 4 / 10 Vorkommen und zusammen 11,5 MB.
lagereMedienAus() arbeitete nur auf dem DOM und fand <img>/<video>:
drei von sieben in `html`, text und raw nie. Die vier verfehlten standen
selbst dort als Markdown — ![Erstelltes Bild](data:image/png;base64,…),
kein Element, also kein querySelector-Treffer.

Jetzt drei Wege mit EINER gemeinsamen Karte (ein Medium, ein Upload):
Elemente, Textknoten im DOM (ueber TreeWalker — innerHTML neu zu
schreiben wuerde Daumen, Kopieren und Vorlesen abreissen) und die
Metadaten. Fail-safe unveraendert: scheitert die Ablage, bleibt der
Datenberg stehen.

Die 512-KB-Grenze und chatSyncStore.js (vier Sperren) blieben unberuehrt
— ohne die Datenberge liegen diese Chats weit darunter.

MARKENKETTE: chat-store.js zog elf Module ueber vier Stufen nach sich,
bis app.js. Zum dritten Mal war chat-history-cards.js das vergessene
Glied — Grund gefunden: der Import ist dort MEHRZEILIG, der Modulname
steht in einer eigenen Zeile und entgeht jeder einzeiligen Suche.

## v651 (2026-08-23) — Markenkette 95/95, erstmals komplett gruen

Die drei maus-Module (absicht 18->19, panel 12->13, chrome 1->2) der
Parallelsitzung nachgezogen. Ihre Dateien waren committet und fertig
(f8e75af1), nur die Import-Marken blieben offen. Damit meldet
check:markenkette zum ersten Mal an diesem Tag 95 von 95 Modulen mit
genau EINER Marke.

Ohne Bump saehen Besucher mit Vorrat weiter die alten Marken — die
Dateien selbst kamen zwar mit v650, die Kette war aber formal offen.

## v652 (2026-08-23) — Favicon auf der Landeseite vervollstaendigt

Betreiber-Freigabe 2026-08-23 ("Reparieren + neu stempeln", Rote Liste).

BEFUND: willkommen.html — die LANDESEITE, erste Seite fuer jeden neuen
Besucher — trug nur EINE Favicon-Referenz statt fuenf, ebenso
programmieren.html. Es fehlten die PNG-Fallbacks (32x32, 16x16), das
apple-touch-icon und die Cache-Marke ?v=112. Folge: in Browsern ohne
SVG-Favicon und beim Hinzufuegen zum Homescreen fehlte das Icon.

Die Verletzung besteht seit b97f5b02 (2026-08-15); der favicon-lock war
am 2026-08-14 eingefroren worden. Sie stammt also NICHT aus dieser
Sitzung, wurde hier nur gefunden.

Ergaenzt wurde exakt der Block aus index.html. Alle fuenf Zieldateien
vorher geprueft: lokal vorhanden UND live 200 — keine toten Referenzen.
favicon-lock danach neu eingefroren.

## v661 — 2026-08-23 — Nutzerreise USA: Englisch vollstaendig, Landingpage-Kopf am Handy
Precache-Dateien geaendert: spur-start.js (b43, Spur ueber t()), google-login.js (Umlaute).
en.js +155 Texte (nicht im Precache). Frontend b4251b2.

## v662 — 2026-08-23 — Wartetext bleibt im Cline-Pfad (Betreiber-Freigabe per Karte)
ai/chatClient.js (v=5 in medien-absicht.js v=5, app.js b87): "smejj denkt nach …"
faellt erst beim ersten Delta; gemessen vorher 3,6 s leere Blase. Start-Lock neu
eingefroren mit Wortlaut der Freigabe.

## v718 — 2026-08-31 — Zentraler API-Bereich (OpenRouter-Stil, Betreiber-Freigabe "Ich finde deinen Vorschlag gut. Kannst Du umsetzen … alle Rechte von A bis z")

Die zwei bisherigen API-Orte (Modelle-Panel "API-Keys" + Reiter "API &
Schlüssel" bzw. /entwickler.html mit sechs Karten) sind in EINE Flaeche
aufgegangen: api-center-surface.js/.css (neu im Precache), Kopfzeile mit
"Schlüssel erstellen", Guthaben-Leiste, Suche + Typfilter, eine Liste fuer
smejj- und Anbieter-Schluessel, Verbinden/Preise als Kompaktkarten.
Geloescht aus dem Precache: api-keys-surface.js/.css, api-konto-surface.js.
Sprachdateien (14) um 26 Waisen erleichtert, 25 neue Schluessel in allen
Sprachen. Marken: app.js b105, premium-surfaces b42g, settings-surface b45,
api-center-surface v2, entwickler.js v=4 (entwickler.html). Start-Lock mit Freigabewortlaut neu
eingefroren; Details docs/approvals/2026-08-31-api-zentrum.md.

## v719 — 2026-08-31 — API-Zentrum im OpenRouter-Layout 1:1 (Betreiber-Nachtrag: "mach 1 zu 1 genau wie openrouter.ai/workspaces/default/keys — gleiche Design")

Nur Design, gleiche Funktionen: grosse Ueberschrift "API-Keys" + ein
Hauptknopf oben rechts, KEINE Kacheln mehr (Guthaben/Verbraucht/Heute als
schlanke Zeile), eine Karte mit grosser Suche ("Nach Name oder Schlüssel
suchen …"), Spalten Schlüssel · Typ · Läuft ab · Zuletzt genutzt · Verbrauch ·
Limit · ⋮, Fusszeile "N Schlüssel", Menue mit Icons. Widerrufene Zeilen
ausgegraut. Verbindung & Preise eingeklappt unter "Verbinden & Preise".
Einstellungs-Panel ohne eigene Ueberschrift (die Flaeche bringt "API-Keys"
selbst mit). i18n: 4 Waisen entfernt, 9 neue Schluessel in 14 Sprachen.
Marken (Schlussstand): app.js b108, premium-surfaces b42j,
settings-surface b48, api-center-surface v5, css v3, entwickler.js v=7.

## v720 — 2026-08-31 — Nachschleife: Fix braucht eigenen Stempel (Lehre wiederholt)

Der b50-Fix (Kommentarleck im API-Panel) lief unter UNVERAENDERTEM sw.js —
Folge: der Vorrat hielt weiter die geleakte settings-surface.js (Precache,
ignoreSearch). v720 zwingt alle Browser zum frischen Vorrat. Lehre (schon
v713/v714): JEDE Aenderung an einer Precache-Datei = SW-Stempel, ohne
Ausnahme, auch Stunden-Debounces nach dem eigentlichen Deploy.
