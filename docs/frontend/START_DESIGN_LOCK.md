# smejj start design lock v1

Status: locked

Diese Startseite ist geschuetzt und darf nicht ohne schriftliche Bestaetigung des Nutzers veraendert werden.

## Dauerhafter Favicon-Lock

Das Browser-Favicon ist final und unveraenderlich. Geschuetzt sind alle
Favicon-Dateien, Apple-Touch-Icons, die zugehoerigen SVG-/PNG-Derivate sowie
saemtliche `<link rel="icon">`, `<link rel="apple-touch-icon">` und
Web-Manifest-Referenzen im gesamten Projekt.

Diese Artefakte duerfen nicht geaendert, geloescht, ueberschrieben,
verschoben oder indirekt durch Refactoring, Build-Anpassungen oder
Aufraeumarbeiten veraendert werden. Falls eine technische Aenderung notwendig
erscheint, muss zuerst eine ausdrueckliche schriftliche Bestaetigung des
Nutzers eingeholt werden; ohne diese Bestaetigung wird nichts ausgefuehrt.

Geschuetzte Bereiche:

- Startseite `#start`
- dunkler Mittelbereich `.home-feed`
- unteres Eingabefeld `.prompt-glass`
- Modellname `smejj 1.0`
- Icon-Zeile `.prompt-actions`
- Trennlinie ueber den Icons
- kompakte linke und rechte Icon-Menues
- linke Navigation: maximal sieben klare Kernpunkte mit Icon plus kurzem Namen sichtbar; sekundäre Punkte gehoeren in Einstellungen, Coding oder rechte Werkzeugleiste
- linkes Fussmenue (Profil-Dock, freigegeben 2026-07-17): links Profilbild + Nutzername (oeffnet die Kontoseite), rechts das Zahnrad (oeffnet die Einstellungen, Label nur fuer Screenreader). Das Zahnrad darf NICHT entfernt oder durch das Profil ersetzt werden; das Profil-Dock darf nicht ohne Freigabe entfernt werden. Schutztests: tests/profile-dock.test.mjs
- Suche: Codex-artige globale Suche ueber Chats, Projekte, Dateien, Code, Quellen und Verlauf; Enter oeffnet den besten Treffer, Cmd/Ctrl+K fokussiert Suche
- einzeilig startendes Textfeld, wachsend bis maximal ca. neun Zeilen

Zusaetzlich geschuetzte FUNKTIONEN (Feature-Lock v2, festgeschrieben 2026-07-03 auf schriftliche Anweisung "alles 100% schuetzen"):

- Plus-Menue `#composerPlusButton` / `#composerPlusMenu` (Datei anhaengen, Foto oder Bild, Projekt-Dateien, Suche oeffnen)
- Mikrofon-Diktat (Toggle-Verhalten, `.is-recording`)
- Sprachmodus-Overlay `#voiceModeOverlay` (Zustaende listening/thinking/speaking, Schliessen per X und Escape)
- Vorlesen der letzten Antwort (Lautsprecher-Icon, `.is-speaking`)
- Modellwahl `#modelPickerButton` mit den fuenf Modellen inkl. `BYOK` und `local browser`
- Client-Chat `public/ai/chatClient.js` (BYOK-Streaming ueber allowgelistete Hosts, lokale Browser-KI, fail-closed Hinweise)
- Module `public/composer-tools.js` und `public/composer-tools.css`
- Service-Worker-Precache dieser Module in `public/sw.js`

Schutzregeln:

- Keine Design-Aenderung in diesem Bereich ohne schriftliches `ja` des Nutzers.
- Keine Farb-, Abstand-, Icon-, Hoehen- oder Hintergrund-Aenderung ohne Freigabe.
- Keine Navigations-Icon-, Label-, Reihenfolge- oder Sichtbarkeits-Aenderung ohne Freigabe.
- Keine der oben gelisteten Funktionen darf ohne schriftliche Bestaetigung entfernt, umbenannt oder im Verhalten geaendert werden.
- Vor und nach jeder erlaubten Aenderung `npm run check:frontend` ausfuehren.
- Der Test `smejj start design lock v1 stays protected` muss gruen bleiben.
- Der Test `smejj composer tools and client chat stay protected (feature lock v2)` muss gruen bleiben.
- Der Test `navigation icon and label contract stays idiotensicher` muss gruen bleiben.
- Der Test `Codex-like global search stays protected` muss gruen bleiben.

## Profil-Dock (Freigabe 2026-07-17, Wof Kadavanich)

Wortlaut: "Kannst du in smejj.com Einstellung Icon soll Profil und Profilbild sein genau wie
dieser Screenshots" — auf die Rueckfrage "Soll ich es umsetzen?" folgte "Ja".

Umgesetzt als ERGAENZUNG, nicht als Ersatz: Das Zahnrad bleibt der Einstieg in die
Einstellungen, daneben steht neu Profilbild + Name. Geschuetzt sind:

- `#profileDock` in `public/index.html` (Avatar `#profileDockFace`, Name `#profileDockName`,
  Zahnrad `.profile-dock-gear` mit `data-view="settings"`)
- die Module `public/profile-dock.js`, `public/profile-dock.css`,
  `public/profile-picture-store.js`, `public/profile-picture-control.js`
- die Profilbild-Policy: nur lokal (localStorage), kein Gravatar/kein externer Dienst,
  max. 256x256 und 100 KB, fail-closed bei fremden Typen

Der Test `tests/profile-dock.test.mjs` muss gruen bleiben.

### Feinschliff 2026-07-17 (freigegeben)

- Zahnrad steht **direkt neben dem Namen**, nicht am rechten Rand:
  `.profile-dock-button { flex: 0 1 auto }` in `profile-dock.css`. Nicht auf `1 1 auto`
  zuruecksetzen — das war die urspruengliche Fassung und wurde ausdruecklich bemaengelt.
- Standardbreite der linken Sidebar: **200 px** (vorher 228). Gepflegt an ZWEI Stellen,
  beide muessen zusammenpassen: `--left-panel-width` in `styles.css` und
  `PANEL_WIDTHS.default` in `app.js`. `getPanelWidth()` migriert die alten
  Standardwerte `[306, 228, 225]` auf den neuen Standard; eine bewusst gezogene
  Breite im localStorage gewinnt weiterhin.
- Alle Dock-/Profilbild-Texte sind in 14 Sprachen uebersetzt. **Achtung:**
  `tests/i18n-ui.test.mjs` prueft nur Schluessel-Paritaet, nicht ob ein neuer
  `t()`-String ueberhaupt einen Schluessel hat — neue Texte immer manuell in alle
  Bundles eintragen.

### Profilbereich 2026-07-17 (freigegeben: "soll eine professionelle Profilbereich sein")

- **Avatar-Menue** `#profileDockMenu` (`profile-dock-menu.js`): Kopf mit Name/E-Mail,
  darunter Konto, Einstellungen, **Ausloggen**. Ausloggen MUSS einen Klick vom Avatar
  entfernt bleiben — es war vorher zwei Ebenen tief und wurde nicht gefunden.
- Das Menue haengt am `<body>` und ist `position: fixed` mit `z-index: 80`.
  Nicht zurueck in die Sidebar verschieben: sie hat `overflow: hidden` (schneidet ab)
  und `transform` (macht `position: fixed` wirkungslos). Ihre eigene Ebene ist 70.
- Breite fest `232px` — `100%` waere am `<body>` die Fensterbreite.
- **Kontoseite** (`account-auth-state.js`): nur zustandsrichtige Aktionen. Angemeldet
  genau EIN "Ausloggen", keine Anmelde-Knoepfe; Server-Sitzungen nur fuer E-Mail-Konten.
  Bedienelemente werden ausgeblendet, NIE entfernt.
- **Kontobild**: wird hoechstens EINMAL uebernommen (Merker
  `smejj.profile.picture.autoimport.v1`), ein eigenes Bild hat Vorrang, und das Bild
  wird nach dem Import nie wieder beim Anbieter geladen. Kein Anbieter-Host im Code.

Der Test `tests/profile-dock.test.mjs` (14 Tests) muss gruen bleiben.

### Markdown-Anzeige der Chat-Antworten 2026-07-17 (freigegeben)

- `public/chat-markdown.js` rendert Antworten (fett/kursiv/Code/Listen). Aufruf steht
  am **Ende** von `stream()` in `app.js` — waehrend des Streams baut app.js per
  `textContent +=` auf, ein Rendern mittendrin zerstoert die Rohquelle.
- **Sicherheit:** erst escapen, dann auszeichnen. Keine Links, Bilder oder rohes HTML.
  Reihenfolge in `inline()` nicht vertauschen.
- **Sprachmodus:** bei aktivem `voiceMode` wird NICHT gerendert (Feature-Lock v2) —
  die Vorlese-Warteschlange verfolgt den Text ueber einen Offset.
- **Cache-Falle:** `app.js` importiert `./components.js?v=...` MIT Version. Ohne sie
  laedt der Browser die alte Datei, der Re-Export fehlt und app.js bricht komplett ab.
- app.js-Baseline steht auf 1404 (dokumentiert in `scripts/check-guidelines.mjs`).

Der Test `tests/chat-markdown.test.mjs` (8 Tests) muss gruen bleiben.

### Sichtbarer Abmeldezustand (Fix 2026-07-17)

Das Dock zeigt Name und Bild **nur im angemeldeten Zustand** (`isSignedIn()` in
`profile-dock.js`, prueft Zugangs-Token ODER `session.authenticated`). Abgemeldet:
"Nutzer", neutrales Personen-Symbol, keine Initiale, kein "Ausloggen" im Menue.

Diese Pruefung darf nicht entfernt werden — ohne sie blieb nach dem Abmelden Name
und Bild stehen und der Betreiber hielt das Ausloggen fuer kaputt. Profil und Bild
werden dabei NICHT geloescht, nur ausgeblendet.

Bekannte Falle: Wird eine dieser Assets geaendert, muss die `?v=`-Cache-Version in
`index.html` mit erhoeht werden — sonst erhalten bestehende Nutzer die alte Datei.

Aktuelle stabile Version: `design-lock-52` (Basis-Design unveraendert seit `design-lock-51`; v2 ergaenzt den Funktions-Schutz).

## start lock v3 — verbindlicher 100%-Schutz (byte-genau, festgeschrieben 2026-07-03)

Auf ausdrueckliche schriftliche Anweisung des Nutzers ist der KOMPLETTE Startseiten-Stand
byte-genau eingefroren: Design, Layout, Texte, Icons, Abstaende, Farben, Funktionen und Inhalte.

Absicherung (vier Schichten):

1. BACKUP: vollstaendige, unverwechselbar UTC-zeitgestempelte Kopie aller geschuetzten
   Startseiten- und Marken-Dateien unter `backups/start-design-lock/` (inkl. Manifest);
   zusaetzlich Git-History des Live-Repos SmejjCom/smejj-app-frontend und Rettungs-Repo
   SmejjCom/smejj-com-source.
2. VERSIONIERUNG: SHA-256-Manifest `docs/frontend/start-lock-manifest.json`
   (eingefroren mit dokumentiertem Wortlaut der Nutzer-Bestaetigung, auditierbar).
   Verifizierte Paritaet zum Zeitpunkt des Einfrierens: lokal == Release-Kandidat byte-identisch.
3. AENDERUNGSPRUEFUNG: `npm run check:start-lock` vergleicht alle im Manifest gefuehrten
   Dateien byte-genau und ist in `check:all` verdrahtet — JEDE Abweichung schlaegt fehl.
   Offizielle SVG-Quellen, transparente Derivate, Favicons, App-Icons und Social-Asset
   werden zusaetzlich durch den byte-reproduzierbaren `check:branding` fail-closed geschuetzt.
4. TESTPFLICHT: unveraendert `check:frontend` (Design-Lock-v1- und Feature-Lock-v2-Tests)
   vor und nach jeder erlaubten Aenderung; zusaetzlich `check:start-lock`.

Aenderungsprozess (einzige erlaubte Ausnahme):

1. Ausdrueckliche schriftliche Bestaetigung des Nutzers einholen (Wortlaut aufbewahren).
2. Aenderung umsetzen; ALLE Check-Suiten gruen.
3. Neu einfrieren und Bestaetigung dokumentieren:
   `node scripts/check-start-lock.mjs --freeze --confirm "<Wortlaut>"`
   (legt automatisch ein neues, unverwechselbares UTC-Zeitstempel-Backup unter
   `backups/start-design-lock/` an und überschreibt nie einen früheren Stand).
4. Erst danach deployen; Live-Paritaet erneut pruefen.

Ohne diesen Prozess gilt: nichts anfassen — `check:start-lock` macht jede Abweichung sichtbar.
