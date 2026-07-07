# smejj start design lock v1

Status: locked

Diese Startseite ist geschuetzt und darf nicht ohne schriftliche Bestaetigung des Nutzers veraendert werden.

Geschuetzte Bereiche:

- Startseite `#start`
- dunkler Mittelbereich `.home-feed`
- unteres Eingabefeld `.prompt-glass`
- Modellname `smejj 1.0`
- Icon-Zeile `.prompt-actions`
- Trennlinie ueber den Icons
- kompakte linke und rechte Icon-Menues
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
- Keine der oben gelisteten Funktionen darf ohne schriftliche Bestaetigung entfernt, umbenannt oder im Verhalten geaendert werden.
- Vor und nach jeder erlaubten Aenderung `npm run check:frontend` ausfuehren.
- Der Test `smejj start design lock v1 stays protected` muss gruen bleiben.
- Der Test `smejj composer tools and client chat stay protected (feature lock v2)` muss gruen bleiben.

Aktuelle stabile Version: `design-lock-52` (Basis-Design unveraendert seit `design-lock-51`; v2 ergaenzt den Funktions-Schutz).

## start lock v3 — verbindlicher 100%-Schutz (byte-genau, festgeschrieben 2026-07-03)

Auf ausdrueckliche schriftliche Anweisung des Nutzers ist der KOMPLETTE Startseiten-Stand
byte-genau eingefroren: Design, Layout, Texte, Icons, Abstaende, Farben, Funktionen und Inhalte.

Absicherung (vier Schichten):

1. BACKUP: vollstaendige Kopie aller 15 Startseiten-Dateien unter
   `backups/start-design-lock/2026-07-03/` (inkl. Manifest); zusaetzlich Git-History
   des Live-Repos SmejjCom/smejj-app-frontend und Rettungs-Repo SmejjCom/smejj-com-source.
2. VERSIONIERUNG: SHA-256-Manifest `docs/frontend/start-lock-manifest.json`
   (eingefroren mit dokumentiertem Wortlaut der Nutzer-Bestaetigung, auditierbar).
   Verifizierte Paritaet zum Zeitpunkt des Einfrierens: lokal == live byte-identisch (15/15).
3. AENDERUNGSPRUEFUNG: `npm run check:start-lock` vergleicht alle 15 Dateien byte-genau
   gegen das Manifest und ist in `check:all` verdrahtet — JEDE Abweichung schlaegt fehl.
4. TESTPFLICHT: unveraendert `check:frontend` (Design-Lock-v1- und Feature-Lock-v2-Tests)
   vor und nach jeder erlaubten Aenderung; zusaetzlich `check:start-lock`.

Aenderungsprozess (einzige erlaubte Ausnahme):

1. Ausdrueckliche schriftliche Bestaetigung des Nutzers einholen (Wortlaut aufbewahren).
2. Aenderung umsetzen; ALLE Check-Suiten gruen.
3. Neu einfrieren und Bestaetigung dokumentieren:
   `node scripts/check-start-lock.mjs --freeze --confirm "<Wortlaut>"`
   (legt automatisch ein neues datiertes Backup unter `backups/start-design-lock/` an).
4. Erst danach deployen; Live-Paritaet erneut pruefen.

Ohne diesen Prozess gilt: nichts anfassen — `check:start-lock` macht jede Abweichung sichtbar.
