# Freigabe: Konsolen-Dialoge statt Browser-Popups (2026-08-07)

## Wortlaut des Betreibers

> **„ja"**

auf die Empfehlung:

> **Neun weitere Browser-Popups** in der Konsole (Grund-Eingaben, Rollenwahl) —
> gleiche Optik wie die, über die du dich geärgert hast. Ein Durchgang.

Deckt zugleich die Änderung an `control-server/src/routes/adminUiRoutes.js`
(unter `admin lock v1`). Lock danach mit demselben Wortlaut neu eingefroren.

## Was ersetzt wurde

Vorher: neun `window.prompt` und ein `window.confirm`. Diese Browserfenster
stellen jeder Frage den rohen Hostnamen voran („Auf redbean-…salad.cloud wird
Folgendes angezeigt") und sehen aus wie die Aufforderung einer fremden Seite.
Sie können außerdem weder Mindestlängen prüfen noch Auswahllisten zeigen noch
einen Fehler im selben Fenster melden — eine zu kurze Begründung wurde
kommentarlos verworfen.

**Nachher: `control-server/admin-ui/dialog.js`** (neu, 178 Zeilen) mit drei
Formen:

| Form | Wofür | Verhalten |
| --- | --- | --- |
| `D.text()` | Grund, Begründung, Nachweis, Titel | Mindestlänge wird **im Dialog** geprüft, die Eingabe bleibt erhalten; `mehrzeilig` für lange Begründungen |
| `D.auswahl()` | Rollenvergabe | feste Liste statt Abtippen — ein vertippter Rollenname wurde vorher erst vom Server abgewiesen |
| `D.bestaetige()` | Antrag freigeben | Ja/Nein mit klarer Folgenbeschreibung |

Eigene Datei statt Anbau an `api.js`: Single Responsibility und die
800-Zeilen-Regel. Die Sicherheitsbestätigung (Step-up) in `api.js` behält
bewusst ihre eigene, spezialisierte Umsetzung — sie kennt Zwischenzustände
(„prüft …") und eine Wiederholschleife bei falschem Code. Beide teilen sich
die CSS-Klassen in `console.css`.

**Inhaltliche Verbesserungen nebenbei:** Die Rollenliste erklärt jede Rolle in
einem Halbsatz („support — Sitzungen widerrufen, Support-Zugriff"). Der
Freigabe-Dialog sagt ausdrücklich, dass eine Löschung unumkehrbar ist. Die
Akteneinsicht nennt, was protokolliert wird (Name, Zeit, Grund).

## Umfang

Basis: laufendes Live-Artefakt `smejj-control-admin-dialog-2026-08-07`
(Salad 152). Alle sieben berührten Dateien in der Basis byte-identisch mit
Repo-HEAD.

| Datei | Änderung |
| --- | --- |
| `control-server/admin-ui/dialog.js` | **neu** |
| `control-server/admin-ui/console.js` | 6 Aufrufstellen (Akteneinsicht, Index-Neubau, Rollenwahl, Kontoaktion, Support-Anfrage, Antrag ablehnen) + Freigabe-Bestätigung |
| `control-server/admin-ui/console-stage4.js` | `frage()` auf Dialog umgestellt, 16 Aufrufe awaited |
| `control-server/admin-ui/console-stage8.js` | dito, 5 Aufrufe |
| `control-server/admin-ui/console-stage6.js` | Schlüssel-Widerruf (mehrzeilig, min. 10 Zeichen) |
| `control-server/admin-ui/console.css` | Feld-Styles (CSP erlaubt kein style-Attribut) |
| `control-server/admin-ui/index.html` | lädt `dialog.js` **vor** `api.js` |
| `control-server/src/routes/adminUiRoutes.js` | `dialog.js` in die feste Ausliefer-Liste |

**Falle:** `frage()` liefert jetzt ein Promise statt eines Werts. Ohne `await`
an jeder der 21 Aufrufstellen hätte die Konsole „[object Promise]" an den
Server geschickt. Alle Aufrufe wurden umgestellt und syntaktisch geprüft.

**Falle 2:** `dialog.js` muss in `adminUiRoutes.DATEIEN` stehen — die Liste ist
absichtlich fest, damit kein Pfad-Ausbruch möglich ist. Ohne Eintrag wäre die
Datei mit 404 ausgeliefert worden und **jede** Eingabe der Konsole tot.

- Release-Id: `smejj-control-admin-dialoge-2026-08-07`
- sha256: `8afdd82b4a910e906ca2260aff267cb80b425a5d8cc2d6108f04a27d9708c82e`
- 1025 Dateien, 2.407.469 Bytes, `secretsIncluded: false`

## Nachweise

**Vor dem Deploy — echter Browsertest je Dialogform:**

| Fall | Ergebnis |
| --- | --- |
| Text, 2 Zeichen bei Mindestlänge 3 | „Bitte mindestens 3 Zeichen eingeben.", Dialog bleibt offen |
| Text, gültige Eingabe | liefert `"Ticket 4471 — Missbrauch"`, Overlay entfernt |
| Auswahl, Rolle `admin` gewählt | liefert `"admin"`, Overlay entfernt |
| Bestätigen, Escape | liefert `false`, Overlay entfernt |
| Bestätigen, OK | liefert `true`, Overlay entfernt |

405/406 Tests grün im entpackten Release-Baum (der eine Fehlschlag ist der
vorbestehende zeitabhängige `opsExperimente`-Test). 9/9 `adminUiRoutes`-Tests
grün. `diff -rq` gegen Live: genau die acht Dateien + Manifest.

**Nach dem Deploy — Salad-Version 153, 91 Variablen unverändert:**

| Datei live | Ergebnis |
| --- | --- |
| `/admin/dialog.js` | 200, `adminDialog` vorhanden, kein Popup |
| `/admin/index.html` | 200, lädt `/admin/dialog.js` |
| `/admin/console.js` | 200, nutzt `adminDialog`, kein Popup |
| `/admin/console-stage4.js` | 200, nutzt `adminDialog`, kein Popup |

Im gesamten Konsolen-Quelltext gibt es **kein** `window.prompt`,
`window.confirm` oder `window.alert` mehr.

Rückweg: `smejj-control-admin-dialog-2026-08-07.tar.gz` /
`916295fe0d524a64b3d4bc7b558306a4af52eff50a8fcdb988b164dff7e1aba7`.
