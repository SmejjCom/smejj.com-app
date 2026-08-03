# Task Capsule — Verlauf-Speicher heilt sich selbst (job_verlauf_selbstheilung_20260803)

## Ziel (Betreiber-Auftrag 2026-08-03)
„Ja" auf die beiden gemeldeten Restpunkte: (1) der Raumgesprächs-Eintrag steht
noch im Verlauf, (2) Reserve-Bridge nachziehen, sobald das Zeabur-Token da ist.
Dazu der Master-Prompt: eigenständig weiterarbeiten, live testen, zum Schluss
100 % Schutz — nichts darf kaputtgehen oder ohne Freigabe geändert werden.

## Befund

### 1. Raumgesprächs-Eintrag — nur lokal, nie auf einem Server
Gemessen, nicht vermutet:
- Der Verlauf liegt ausschließlich in der Browser-Datenbank `smejj-chats`
  (IndexedDB, `public/chat-store.js`) — ein Gerät, ein Browser-Profil.
- `src/training/constants.js:62`: `SMEJJ_TRAINING_CAPTURE_ENABLED` steht
  standardmäßig auf `NO` (fail-closed) → kein Trainingsmitschnitt.
- Weder `public/chat-bridge.js` noch `agentRoutes.js` schreiben Chatinhalt
  weg (kein putObject/persist) → nichts auf IDrive e2.
- Unterwegs war der Text trotzdem: einmal bei Groq (Whisper-Transkription) und
  als `history`-Kontext (`chat-history-context.js`, letzte 10 Nachrichten) bei
  jeder Folgefrage im selben Chat — beides flüchtig, ohne Ablage.
FOLGE: Löschen ist ein Zwei-Klick-Vorgang im Verlauf des Betreibers
(„Löschen" → „Wirklich löschen?"). Aus dieser Sitzung nicht erreichbar: das
Chrome-Profil hier ist nicht angemeldet und trägt keine Chats.

### 2. Zeabur-Reserve-Bridge — weiter blockiert
`~/.config/smejj.com/env.local` enthält 25 Schlüssel, aber **kein**
`ZEABUR_API_TOKEN`. Unverändert Betreiber-Handarbeit
(`smejj.com Zeabur-Token-eintragen.command`). Nichts zu tun.

### 3. NEU — der Verlauf konnte dauerhaft und lautlos sterben
Beim Auslesen der Verlauf-Datenbank in Chrome aufgedeckt und reproduziert:
`indexedDB.open("smejj-chats", 1)` ohne Aufbau-Handler hinterlässt eine
Datenbank auf Version 1 **ohne** den Objektspeicher `chats`.

Wurzel (`public/chat-store.js`, `openDb`):
- `onupgradeneeded` feuert nur bei Versionswechsel — bei Version 1 gegen
  Version 1 also **nie wieder**. Der Speicher wird nie angelegt.
- `tx()` wirft dann bei jeder Transaktion `NotFoundError`.
- Alle Aufrufer fangen fail-safe ab (`.catch(() => [])`, `.catch(() => null)`).

ERGEBNIS: In diesem Browser speichert der Chat für immer nichts mehr, die
Verlauf-Seite bleibt für immer leer, und **nichts** weist auf die Ursache hin.
Auslöser im Alltag: Tab zu während des allerersten Aufbaus, Speicher-Räumung
des Browsers, Quota-Fehler. Zusätzlich: ein einmal gescheiterter Versuch klebte
in `dbPromise` und riss jeden weiteren Aufruf der Sitzung mit.

## Umsetzung (`public/chat-store.js`, +49/-12)
- `openDb()` öffnet **ohne feste Version**. Das ist der Kern: heilt man auf
  Version 2 hoch und öffnet beim nächsten Start wieder mit der festen 1,
  scheitert es ab da dauerhaft mit `VersionError` — aus einem stillen Fehler
  wäre ein harter geworden.
- Fehlt `chats`, wird der Griff geschlossen und eine Version höher neu geöffnet;
  `ensureStore()` legt Speicher und `updatedAt`-Index dabei an.
- Ein fehlgeschlagener Versuch setzt `dbPromise` zurück, statt die Sitzung zu
  vergiften.
- `public/chat-store.js`: 381 → 408 Zeilen (Grenze 800). Nicht unter Start-Lock.

## Tests (`tests/chat-store-selbstheilung.test.mjs`, 193 Zeilen, neu)
Nachgebaute IndexedDB + minimales DOM; die `/assets/`-Importe werden für Node
auf `file://` umgeschrieben, der geprüfte Code bleibt unverändert.
1. kaputte Datenbank ohne Objektspeicher heilt sich und speichert wieder
2. gesunde Datenbank wird nicht unnötig hochgezogen
3. eine bereits geheilte Datenbank öffnet ohne VersionError
4. fehlende Datenbank wird beim ersten Start vollständig angelegt
5. eine vorübergehende Störung vergiftet den Verlauf nicht dauerhaft

GEGENBEWEIS geführt (sonst beweist ein Test nichts): gegen `HEAD` vor dem Fix
**4 von 5 rot**, mit Fix **5 von 5 grün**. Fall 4 war schon vorher grün — der
Erstaufbau war nie kaputt. In `check:frontend` verdrahtet.

## Checks
- `npm run check:guidelines` — rot, aber **fremd**: `app.js` 817,
  `chat-bridge.js` 805, `voice-landing.js` 822 Zeilen (Parallel-Sitzung).
- `npm run check:frontend` — 320 Tests, 317 grün, 3 rot. Alle 3 fremd:
  2× `app.js` 818 Zeilen, 1× `chat-stream-retry.js`-Budget. Keine Datei aus
  diesem Auftrag ist beteiligt.
- `npm run check:start-lock` — 4 Verletzungen, alle fremd (`index.html`,
  `app.js`, `panel-backdrop.js`, `sw.js` = sw v207 der Parallel-Sitzung).

## KEIN Deploy — bewusst, als Schutzmaßnahme
`git status` meldete zuerst eine saubere Arbeitskopie. Nach
`git update-index --really-refresh` (Google-Drive-Falle, siehe Memory_Bank):
**16 geänderte Dateien** aus einer aktiv laufenden Parallel-Sitzung — sw v207,
`index.html`, `app.js`, `panel-backdrop.js`, `browser-pane-backdrop.js`,
6 Tests, 3 lora-trainer-Dateien.

Ein Frontend-Deploy kopiert `public/` → `assets/` und hätte diese unfertige
Fremdarbeit live gestellt (inkl. `app.js` mit rotem Test). Ein sw-Versionssprung
hätte zusätzlich mit deren v207 kollidiert. Beides verletzt die Non-Regression-
Pflicht, also unterlassen.

FOLGE: Der Fix ist committet und bewiesen, aber **noch nicht live**. Er geht
automatisch mit dem nächsten Frontend-Deploy mit — der sw-Sprung auf v207 zieht
`chat-store.js` ohnehin neu in den Precache (`caches.match(..., {ignoreSearch:true})`,
`sw.js:622`). Es ist kein weiterer Schritt an dieser Datei nötig.

## Nebenwirkung, offen gelegt
Beim Auslesen in Chrome ist in **diesem** Profil (nicht dem des Betreibers,
nicht angemeldet, ohne Chats) eine leere `smejj-chats`-Datenbank entstanden.
Das Aufräumen wurde vom Berechtigungs-Klassifikator blockiert. Ohne Bedeutung —
und genau diese Lage heilt der Fix ab dem nächsten Deploy von selbst.

## Rollback
- Rollback-Punkt: `587bdf5` (Stand vor diesem Auftrag).
- Rückbau: `git revert 7e1cab4` — drei Dateien, keine Fremdarbeit berührt.
- Nichts gelöscht, nichts überschrieben, keine Secrets angefasst, keine
  Kostenposition, kein Lock neu eingefroren.

## Ergebnis
| Punkt | Stand |
|---|---|
| Raumgesprächs-Eintrag | Nur lokal im Browser — nie auf einem Server. Zwei Klicks im Verlauf. |
| Zeabur-Reserve-Bridge | Weiter blockiert, Token fehlt. Betreiber-Handarbeit. |
| Verlauf-Selbstheilung | Behoben, 5/5 bewiesen, committet `7e1cab4`, gepusht. Live mit nächstem Deploy. |
| GitHub-Push | `587bdf5` + `7e1cab4` auf `feature/auth-redesign-github-magiclink`. |

## Nächster Schritt
Sobald die Parallel-Sitzung ihren Stand abgeschlossen hat: `check:all` grün
bekommen, `app.js`/`chat-bridge.js`/`voice-landing.js` unter 800 Zeilen bringen,
Start-Lock mit Betreiber-Wortlaut neu einfrieren, deployen — dieser Fix fährt
dabei mit und ist dann live prüfbar (Verlauf-Seite nach Speicher-Räumung).
