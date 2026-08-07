# Freigabe: Control-Release „Bestätigungspflicht + Sicherheitsalarm" (2026-08-06)

## Wortlaut des Betreibers

> **„mach 1 und 2"**

Bezogen auf die vorgelegte Liste:

> 1. **E-Mail-Verifizierung erzwingen** — alle 5 Konten stehen auf „verifiziert:
>    nein", auch deins. Das ist die größte verbliebene Lücke: Der Step-up
>    schickt Codes an eine Adresse, deren Besitz nie bestätigt wurde.
> 2. **Alarmierung** — Vortür-429s und Step-up-Fehlversuche laufen still ins
>    Leere. Ein Angriff wäre unsichtbar.

Diese Freigabe deckt zugleich die **Änderung an den 12 Dateien des
Change-Locks** `admin lock v1`, die für 1 und 2 nötig war. Der Lock wurde
danach mit demselben Wortlaut neu eingefroren (jetzt 13 Dateien).

## Teil 1 — Bestätigungspflicht

`resolveAdminActor` verlangt jetzt `emailVerifiedAt`. Ohne bestätigte Adresse:
**403 `admin_email_not_verified`** auf jeder Datenroute.

**Die Aussperr-Falle und wie sie vermieden wurde:** Eine Bestätigungspflicht,
deren einziger Bestätigungsweg selbst hinter der Pflicht liegt, ist eine Tür
ohne Klinke — auch für den Betreiber. Alle fünf Konten, einschließlich des
Owners, waren unbestätigt. Deshalb gibt es genau zwei Ausnahmen
(`erlaubeUnbestaetigt`), und nur diese zwei:

- **Auslieferung der Konsolen-Dateien** (`adminUiRoutes`) — dort stehen keine
  Kontodaten, und ohne sie gäbe es keinen Ort, an dem man den Code eingeben
  könnte.
- **Die Step-up-Routen selbst** — der Weg zum Code muss offen bleiben.

**Der Step-up bestätigt die Adresse gleich mit:** Wer den Code aus der Mail
zurückgibt, hat den Besitz der Adresse bewiesen — ein zweiter
Bestätigungsweg wäre derselbe Beweis noch einmal. `step-up/confirm` ruft
daher `markEmailVerified` und schreibt `user.verify` ins Audit-Log.

Die Konsole fängt `admin_email_not_verified` jetzt auch beim **Lesen** ab
(`hole()` in `admin-ui/api.js`), nicht nur beim Schreiben — sonst stünde der
Betreiber beim ersten Aufruf vor einer Fehlermeldung ohne Knopf.

## Teil 2 — Sicherheitsalarm

Neu: `control-server/src/admin/sicherheitsAlarm.js`. Drei Festlegungen:

1. **Nicht jedes Ereignis meldet.** Ein einzelnes 429 ist Normalbetrieb (die
   Konsole lädt beim Start einen Schwung Dateien). Gemeldet wird ein *Muster*:
   Schwelle innerhalb eines Zeitfensters.
2. **Der Nachweis geht ins Audit-Log** (`security.alarm`) — fälschungssicher
   durch die Hash-Kette.
3. **Die Mail ist gedeckelt** (eine je Art und Ruhezeit). Ein Alarm, der das
   Postfach flutet, wird nach dem dritten Mal ignoriert.

| Art | Schwelle | Fenster | Ruhezeit |
| --- | --- | --- | --- |
| `vortuer_drosselung` | 25 | 5 min | 30 min |
| `step_up_code_falsch` | 5 | 10 min | 30 min |
| `step_up_zu_viele_versuche` | 2 | 30 min | 30 min |

Angehängt an die Vortür (429) und an `step-up/confirm` (falscher/verbrannter
Code). Beide Aufrufe sind bewusst *nach* der Antwort und fire-and-forget: die
Abwehr wartet nie auf die Sicherheitswache.

## Umfang

Basis: laufendes Live-Artefakt `smejj-control-admin-stepup-v2-2026-08-06`
(Salad 150). Alle berührten Dateien in der Basis byte-identisch mit Repo-HEAD
— nichts Fremdes zu mergen.

| Datei | Änderung |
| --- | --- |
| `control-server/src/admin/adminAuth.js` | Bestätigungspflicht + `erlaubeUnbestaetigt` |
| `control-server/src/admin/sicherheitsAlarm.js` | **neu** |
| `control-server/src/routes/adminWriteRoutes.js` | Pflicht ausser für Step-up; `markEmailVerified` bei Erfolg; Alarm bei falschem Code |
| `control-server/src/routes/adminSurfaceRoutes.js` | Alarm an der Vortür |
| `control-server/src/routes/adminUiRoutes.js` | Konsolen-Dateien bleiben erreichbar |
| `control-server/admin-ui/api.js` | Bestätigungsablauf auch beim Lesen |
| `control-server/src/routes/adminVerifiziert.test.js` | **neu**, 9 Tests |
| 5 Test-Fixtures | Adminkonten sind jetzt bestätigt angelegt |

- Release-Id: `smejj-control-admin-verify-alarm-2026-08-06`
- sha256: `b0fee7598c845bd57de206f3007a6ea1dbeaaabbbca35aeb59ee9b1c781d5fa3`
- 1024 Dateien, 2.402.796 Bytes, `secretsIncluded: false`

## Nachweise vor dem Upload

- 405/406 Tests grün im entpackten Release-Baum. Der eine Fehlschlag
  (`opsExperimente`, „das längstlaufende Experiment") ist **vorbestehend und
  zeitabhängig**, nicht von dieser Änderung berührt — eigene Aufgabe.
- `diff -rq` gegen Live: genau die oben gelisteten Dateien + Manifest.

## Nachweise nach dem Ausrollen

Salad-Version **151**, 91 Variablen unverändert. Rückweg:
`smejj-control-admin-stepup-v2-2026-08-06` / `66ab8e9c…`.

Live gegen die Produktion gemessen:

| Prüfung | Ergebnis |
| --- | --- |
| `GET /api/admin/me` (unbestätigt) | **403 `admin_email_not_verified`** |
| `POST …/actions/block` (unbestätigt) | **403 `admin_email_not_verified`** |
| `GET /admin` — Konsole lädt trotzdem | **200** (keine Aussperrung) |
| `POST /api/admin/step-up/request` | **200** — der Weg heraus ist offen |
| `/admin/api.js` enthält den neuen Ablauf | `istBestaetigungNoetig`, `bestaetigungEinholen`, `admin_email_not_verified`, `holeDirekt` — alle vorhanden |

## Offen: der letzte Handgriff gehört dem Betreiber

Die Kette ist bis auf einen Schritt live bewiesen. Was fehlt, ist die Eingabe
des Codes aus dem Postfach `smejjcom@gmail.com` — den kann nur der Betreiber
lesen (das hier verbundene Gmail-Konto ist ein anderes). Der Schritt ist:
`smejj.com/admin` öffnen → die Konsole fragt den Code ab → eingeben. Danach
ist `emailVerifiedAt` gesetzt und der Adminbereich vollständig nutzbar.

Der Ablauf ist durch `adminVerifiziert.test.js` („ein bestandener Step-up
bestätigt die Adresse gleich mit") gegen denselben Route-Handler geprüft, den
die Produktion ausführt.

## Rücknahme

Zeiger zurück auf `smejj-control-admin-stepup-v2-2026-08-06.tar.gz` /
`66ab8e9c6b4b0bbc414fde1f37025eeadd2bc7ba854273749ebf07bb824b600e`.
Kein Datenverlust, keine Migration.
