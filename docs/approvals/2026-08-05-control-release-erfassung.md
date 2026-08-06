# Freigabe: Control-Release „Erfassung" (Teil 3, 2026-08-05)

## Wortlaut des Betreibers

> **„Ja, bau Teil 3"**

## Was Teil 3 ist

`pruefeFrage()` war gebaut, getestet und ausgeliefert — aber **von nichts
aufgerufen**. `POST /api/training/capture` ruft sie auf und ist der einzige
Ort, an dem eine Nutzerfrage zu Trainingsmaterial werden kann.

### Warum ein eigener Endpunkt und kein Haken im Chat-Pfad

Ein Haken im Chat haette eine Einwilligungs-Aufloesung (Netzabruf gegen den
Ledger) und einen Schreibvorgang auf den heissen Pfad **jeder** Frage gelegt —
und ein Fehler in der Nebenfunktion haette die Kernfunktion kippen koennen.
Getrennt ist die Erfassung einzeln testbar, einzeln abschaltbar und kann den
Chat nicht beruehren.

### Fuenf Stufen, jede fail-closed

| Stufe | fehlt | Antwort | erfasst |
| --- | --- | --- | --- |
| 1 | Anmeldung | 401 | nein |
| 2 | Schalter `SMEJJ_TRAINING_CAPTURE_ENABLED` | 503 `capture_disabled` | nein |
| 3 | Einwilligung im Ledger | 200 mit Grund | nein |
| 4 | Form/Inhalt (`pruefeFrage`) | 200 mit Grund | nein |
| 5 | Speicher | 503 `capture_storage_unavailable` | nein |

Stufe 5 ist die, an der man leicht das Falsche tut. Ohne Speicher waere 200
bequem — die Oberflaeche saehe zufrieden aus. Dann meldet die Erfassung aber
Erfolg, ohne dass etwas ankommt, und es faellt monatelang niemandem auf.

Ebenso uebernommen wie im Einwilligungs-Ledger: ein Schreibvorgang gilt erst
als erfolgt, wenn `conditionEnforced`, `contentVerified` **und** `created` alle
wahr sind. „Kein Fehler geworfen" heisst nur, dass niemand widersprochen hat.

Der Klient loest aus, entscheidet aber nichts: die Einwilligung wird
serverseitig aus dem Ledger aufgeloest, nie aus der Anfrage uebernommen. Die
Antwort gibt weder die Frage noch den Objektschluessel zurueck, und der
Schluessel traegt keine Kennung des Fragenden.

## Der Fund, der wichtiger war als Teil 3 selbst

**Die Einwilligung war live technisch unmoeglich.** `createConsentGrant`
verlangt ein `repository` und wirft sonst `consent_repository_invalid`; die
Route antwortet 400. Die am selben Tag ausgelieferte Oberflaeche schickte
keines mit. Der Schalter war fail-closed — aber er konnte **nichts erteilen**.
Dem Widerruf fehlte zusaetzlich die `withdrawalId`.

Kein Test hat es bemerkt: alle prueften die **Felder** der Hinweis-Antwort,
keiner den **Durchstich**. Der neue Waechter
(`tests/training-consent.test.mjs`) nimmt ausschliesslich, was der Endpunkt
herausgibt, und baut daraus eine Einwilligung — ohne den Fix faellt er mit
`consent_repository_invalid` (nachgemessen, indem der Fix zurueckgenommen
wurde).

Behoben:

- `TRAINING_CONSENT_REPOSITORY` steht **einmal** serverseitig; der
  Hinweis-Endpunkt nennt ihn, die Oberflaeche schickt ihn zurueck.
- Die `withdrawalId` wird fuer den Widerruf frisch beim Server geholt, nicht
  aus dem lokalen Speicher — wer seinen Browserspeicher leert, muss trotzdem
  widerrufen koennen.
- `fetchTrainingNotice` prueft jetzt **beide** Pflichtfelder.

Ebenfalls beim Bau gefangen: `authenticatedConsentSubject` war zuerst
nachgebaut und griff auf `user.id` statt `user.userId` zu. Die Bindung haette
lautlos nie zugetroffen — die Einwilligung waere erteilt, die Erfassung haette
sie nur nie gefunden. Jetzt importiert statt nachgebaut.

## Umfang

Control (Artefakt `81686488d039286c…`, 1020 Dateien, `secretsIncluded: false`):
18 Dateien gegen die Live-Basis, davon 5 aus den Releases dieses Tages.
`package.json` bewusst auf Live-Stand gehalten.

Frontend (`smejj-app-frontend@35a3a58`, sw **v226 → v227**): drei Dateien,
`sw.js` ist die Live-Fassung mit gehobener Version.

**Reihenfolge: Control zuerst.** Die neue Oberflaeche verlangt `repository` im
Hinweis; gegen einen alten Server haette sie fail-closed abgeschaltet.

## Nachweise

- 94/94 Tests **im Release-Baum** (Erfassung, Einwilligung, Fragenerfassung,
  Fragevarianten, RAG, Websuche, Admin-Vortuer)
- `check:release-imports` OK — 185 Dateien transitiv
- `check:training` 133/133, `check:platform` 7/7, `check:frontend` OK
- Im entpackten Artefakt: neue Route vorhanden, im Server verdrahtet,
  Admin-Vortuer und Changelog-Fix unveraendert erhalten
- **Vor** dem Umschalten den laufenden Artefakt-Schluessel gelesen
  (`einwilligung-v2`, `5d4516a6…`) — er entsprach der Basis. Das ist die Regel,
  die aus dem Fehler beim vorigen Release entstanden ist.
- 91 Umgebungsvariablen vor und nach dem Umschalten

## Offen — und es ist ein Blocker

Die Erfassung kann **nicht schreiben**. Auf `smejj-control` fehlen alle sechs
Speicher-Werte, gemessen:

`IDRIVE_E2_TRAINING_ENDPOINT`, `…_REGION`, `…_ACCESS_KEY`, `…_SECRET_KEY`,
`…_BUCKET`, `…_ALLOWED_PREFIXES` (dieser muss `training/fragen` einschliessen)

Dazu der Schalter `SMEJJ_TRAINING_CAPTURE_ENABLED=YES`, der ebenfalls fehlt.

Bis dahin antwortet die Route ehrlich 503 und erfasst nichts. Das ist der
gewollte Zustand — nicht ein Fehler, sondern die Weigerung, Erfolg zu melden,
den es nicht gibt.

## Ruecknahme

Voriger Stand: `smejj-control-einwilligung-v2-2026-08-05.tar.gz`,
sha256 `5d4516a63b719539a82f906328f6a39348284a42458b5fdb1ba5392b50eaa3fb`.
Achtung: dieser Stand hat den Einwilligungs-Fehler noch — ein Rueckfall macht
die Einwilligung wieder unmoeglich.

## Nachweise nach dem Ausrollen

Control-Version **148**, Frontend sw **v227** — beide innerhalb von 30 s live.

| Probe | Ergebnis |
| --- | --- |
| `/api/training/consent/notice` | 200, jetzt **mit** `repository: smejjcom/smejj-app` |
| `POST /api/training/capture` unangemeldet | **401** `authentication_required` |
| `GET /api/training/capture` | **404** `training_capture_route_not_found` |
| `/api/admin` | 401 (Vortuer steht) |
| `/api/health` | `ok: true` |
| live `sw.js` | `const CACHE_NAME = "smejj-shell-v227"` |
| live `assets/account-sessions.js` | `repository` 3×, `withdrawalId` 4×, `fetchTrainingConsentDecision` 2× |

Die dritte Zeile ist der eigentliche Verdrahtungsbeweis: `404` mit dem
**eigenen** Fehlercode der Route, nicht dem des Servers. Ein nicht
eingehaengtes Modul haette einen anderen 404 geliefert.

**Messfalle notiert:** `grep -o 'smejj-shell-v[0-9]*' | head -1` auf `sw.js`
findet die erste Erwaehnung im KOMMENTAR (hier v221) und nicht die Zuweisung —
das sah nach einem fehlgeschlagenen Deploy aus, obwohl v227 laengst stand. Auf
`const CACHE_NAME = ` pruefen.
