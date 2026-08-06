# Freigabe: Control-Release „Admin-Vortür" (2026-08-05)

## Wortlaut des Betreibers

> **„Ich finde deine Vorschlag gut, kannst du umsetzen und dann zum Schluss mir
> Link hier geben ich will mich einloggen und Adminbereich checken"**

Der Vorschlag war zuvor so beschrieben und damit Gegenstand der Freigabe: eine
zusätzliche Schutzschicht **vor** dem Adminbereich (serverseitige Entsprechung
eines Zero-Trust-Proxys), nachdem der Betreiber nach der professionellen
Absicherung des Admin-Zugangs gefragt hatte.

## Warum überhaupt

Alle bestehenden Rate-Limits des Adminbereichs zählen **pro Admin-Konto** und
greifen erst NACH erfolgreicher Anmeldung (`adminRoutes`, `adminWriteRoutes`,
`adminOpsRoutes`, `adminSicherheitRoutes`, `adminGeldRoutes`,
`adminStage4Routes`). Ein unangemeldeter Scanner konnte `/admin` und
`/api/admin` unbegrenzt abklopfen — jede Anfrage kostete eine
Sitzungsauflösung.

## Umfang — zwei Dateien

Basis ist das **laufende Live-Artefakt**
`deployments/control/smejj-control-rag-changelog-2026-08-05.tar.gz`
(sha256 `7ca3f81a…`, Salad-Version 143), heruntergeladen, SHA-geprüft und
entpackt. NICHT aus HEAD gebaut — HEAD enthält nicht freigegebene fremde
Commits (siehe Freigabe „RAG-Changelog" vom selben Tag).

| Datei | Änderung |
| --- | --- |
| `control-server/src/routes/adminSurfaceRoutes.js` | Vortür: Token-Bucket **pro Client-IP** (90 Burst, 1,5/s Nachfüllung) vor jeder Sitzungsauflösung für `/admin` und `/api/admin`; 429 mit `Retry-After` (HTML für die Oberfläche, JSON `admin_vortuer_rate_limit` für die API). `/api/compliance` und `/api/account/*` bleiben bewusst davor. |
| `control-server/src/routes/adminSurfaceRoutes.test.js` | Neu: vier Tests (Drosselung pro IP, JSON auf der API, fremde IP unberührt, Compliance zählt nicht). |

## Artefakt

- Release-Id: `smejj-control-admin-vortuer-2026-08-05`
- sha256: `d5a43e98f5b4655e0613068c19923bf4d9718d39de0151f282b348452132459a`
- 1017 Dateien (Live: 1016, +1 Testdatei), 2.381.808 Bytes, `secretsIncluded: false`

## Nachweise vor dem Upload

- `diff -rq` zwischen entpacktem Live-Artefakt und entpacktem neuen Artefakt:
  genau `adminSurfaceRoutes.js` geändert, `adminSurfaceRoutes.test.js` neu,
  Manifest neu — sonst byte-identisch.
- 28/28 Tests grün **im entpackten Release-Baum** (`adminSurfaceRoutes`,
  `adminUiRoutes`, `adminWriteRoutes`).
- Vorbestand: `opsExperimente.test.js` („längstlaufendes Experiment") kippt
  zeitabhängig auch ohne diese Änderung — als getrennte Aufgabe erfasst, nicht
  Teil dieses Release.

## Nachweise nach dem Ausrollen

- Upload unveränderlich bewiesen (`created: true`, Überschreib-Beweis 412,
  Readback SHA-gleich); Aktivierung: Salad-Version 143 → **144**, 85 Variablen
  unverändert, `previousArtifactKey` war das RAG-Changelog-Artefakt.
- **Parallelsitzung:** Noch während des Ausrollens hat eine andere Sitzung das
  Einwilligungs-Release `smejj-control-einwilligung-v2-2026-08-05.tar.gz`
  (sha `5d4516a6…`) als Version **146** aktiviert. Das Artefakt wurde
  heruntergeladen, SHA-geprüft und entpackt: es **enthält die Vortür**
  (`vortuerGate` in `adminSurfaceRoutes.js` plus Testdatei) — die
  Parallelsitzung hat auf diesem Stand aufgebaut, nichts ging verloren.
- **Verhaltensbeweis auf Version 146, live gemessen:** 160 parallele
  unangemeldete Anfragen an `/admin` → **96× 401, 64× 429**; eine
  Einzelanfrage kurz danach wieder 401 (Nachfüllung 1,5/s wirkt). Vor dem
  Release: 24 Messrunden à 110 Anfragen ausnahmslos 401, nie 429.
- Die JSON-Variante (`admin_vortuer_rate_limit` mit `retryAfterSec`) ist durch
  die Unit-Tests im Release-Baum abgedeckt; der Live-Einzelnachweis scheiterte
  nur am Timing der Nachfüllung (Einzeltoken war schneller zurück als der Curl).

## Rücknahme

Der Live-Stand vor diesem Release ist das Artefakt
`smejj-control-rag-changelog-2026-08-05.tar.gz` mit sha256
`7ca3f81a26660f06e0122dc18097102e8231f8a698776e693bcc4157e69d824c`.
Zurücksetzen heißt: die zwei Zeiger (`SMEJJ_CONTROL_ARTIFACT_KEY`,
`SMEJJ_CONTROL_ARTIFACT_SHA256`) wieder darauf setzen. Kein Datenverlust,
keine Migration.
