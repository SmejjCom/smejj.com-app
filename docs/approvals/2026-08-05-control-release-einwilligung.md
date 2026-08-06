# Freigabe: Control-Release „Einwilligung" (2026-08-05)

## Wortlaut des Betreibers

> **„Freigabe Control-Release: Einwilligungs-Endpunkt und Fragen-Erfassung,
> 2026-08-05"**

Fuer den Frontend-Anteil zusaetzlich:

> **„Ja, mach das Frontend genauso schmal"**

Fuer die Korrektur nach dem unten beschriebenen Fehler:

> **„Ja, mach den zweiten Weg"**

## Die Reihenfolge, und warum sie nicht beliebig ist

Der Hash in `SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256` beschreibt die
Datenschutzerklaerung, gegen die ein Nutzer einwilligt. **Serverseitig liest
niemand die Seite nach** — `src/training/consent.js` nimmt den Hash
ausschliesslich aus der Umgebung. Laufen Hash und veroeffentlichter Text
auseinander, faellt das nirgends auf.

Darum: **erst die Seite, dann der Hash, dann der Endpunkt.**

1. Frontend ausgerollt (`smejj-app-frontend@26a1b02`) — live gemessen 30 s
   spaeter mit `89cccf58e723113c0b9a4e17290e3136885f082bf9094238f69f6236258d4c8b`.
2. Control-Release (dieses Dokument).
3. Die sechs Umgebungswerte, gesetzt mit
   `scripts/deploy/set_training_consent_env.mjs` — das Skript holt die
   **Live**-Seite, rechnet den Hash selbst und bricht ab, wenn er nicht passt.

## Frontend-Anteil — vier Dateien auf dem Live-Stand

Von **zwoelf** lokal abweichenden Dateien gingen nur diese vier mit:

| Datei | Aenderung |
| --- | --- |
| `datenschutz.html` | Nur die Fragen koennen Trainingsdaten werden, nie die Antworten; Fragen mit Zugangsdaten werden GANZ verworfen |
| `assets/account-privacy.js` | Einwilligung serverseitig statt nur lokal |
| `assets/account-sessions.js` | drei Aufrufe samt Token |
| `sw.js` | v225 → v226 (beide JS-Dateien liegen cache-first im Precache) |

`sw.js` wurde **nicht** aus der Arbeitskopie uebernommen: die hat eine eigene
Historie und haette die Versionsnotizen v224/v225 geloescht. Genommen wurde die
Live-Fassung mit gehobener Version.

Gegen die Live-Fassung geprueft: `datenschutz.html` ist Live + 14 Zeilen (nur
meine), bei beiden JS-Dateien sind alle entfernten Zeilen solche, die ich selbst
ersetzt habe. Kein Kollateralschaden.

**Fail-closed nachgewiesen, nicht behauptet:** `fetchTrainingNotice()` liefert
bei fehlendem Endpunkt `null` (404 → `!response.ok`), `saveConsent()` setzt den
Schalter dann zurueck und meldet „Einwilligung derzeit nicht moeglich" — statt
Zustimmung anzuzeigen, die der Server nicht kennt.

## Control-Anteil — sechs Dateien

| Datei | Herkunft |
| --- | --- |
| `control-server/src/routes/trainingConsentRoutes.js` | `handleNotice` (+36) |
| `src/shared/platform.js` | Endpunkt-Eintrag (+5) |
| `src/training/fragenerfassung.js` | neu (+130) |
| `src/training/projectcorpus/fragevarianten.js` | neu (+185) |
| `tests/training-fragenerfassung.test.mjs` | neu (+176) |
| `tests/training-fragevarianten.test.mjs` | neu (+112) |

Bewusst **draussen**: `package.json` (nur npm-Skripte, byte-identisch mit Live
gehalten), `src/training/projectcorpus/extract.js` und
`scripts/training/pruefe_fragevarianten.mjs` — die gehoeren zur Korpusarbeit,
nicht zur Einwilligung.

`training-fragen/varianten.json` liegt **nicht** im Artefakt: die Include-Liste
deckt `training-fragen/` nicht ab, und das ist richtig — kein ausgeliefertes
Modul liest die Datei, `fragenerfassung.js` macht keinen Datei-, Netz- oder
Schreibzugriff.

Verdrahtung geprueft: `src/server.js:200` leitet
`startsWith("/api/training/consent")` an den Router, der Router faengt
`ROUTES.api.trainingConsentNotice` fuer GET/HEAD. `check:release-imports` OK
(182 Dateien transitiv).

## Der Fehler — ich habe eine fremde Schutzschicht abgeschaltet

Das erste Artefakt (`65e3afe8…`, Salad-Version 145) war auf `1ed22db` + Rueckbau
+ `fdafbeb` gebaut — also auf dem Stand, den ich beim Release „RAG-Changelog"
zuletzt gesehen hatte.

Inzwischen hatte eine Parallelsitzung `smejj-control-admin-vortuer` ausgerollt
(Version 144): eine Drosselung pro Client-IP **vor** jeder Sitzungsaufloesung
fuer `/admin` und `/api/admin`. Sie hatte sauber gearbeitet — auf meinem
Release A aufgebaut, mit Freigabe und Nachweisen.

Mein Umschalten auf 145 hat diese Schutzschicht **entfernt**. Sie war fuer
einige Minuten aus.

Das ist exakt der Fehler, den ich am selben Tag zweimal bei anderen gemessen
und in `smejj-release-artefakt-aus-head` als Merkregel notiert hatte. Der
Unterschied: „Live-Stand" heisst der Stand, der **jetzt** laeuft — nicht der,
den man zuletzt gesehen hat. Zwischen Bauen und Umschalten koennen Minuten
liegen, und in einer geteilten Arbeitskopie reichen die.

**Korrektur** (`5d4516a6…`, Version 146): dasselbe Release, zusaetzlich
`adminSurfaceRoutes.js` und `adminSurfaceRoutes.test.js` der Parallelsitzung.
Ihre vier Tests laufen im Release-Baum gruen, meine 76 ebenfalls.

**Abgeleitete Pflicht fuer kuenftige Releases:** unmittelbar VOR dem
Umschalten den laufenden `SMEJJ_CONTROL_ARTIFACT_KEY` lesen und gegen die
eigene Basis pruefen. Weicht er ab, neu bauen — nicht umschalten.

## Artefakt

- Release-Id: `smejj-control-einwilligung-v2-2026-08-05`
- sha256: `5d4516a63b719539a82f906328f6a39348284a42458b5fdb1ba5392b50eaa3fb`
- 1019 Dateien, 2.388.654 Bytes, `secretsIncluded: false`
- 85 Umgebungsvariablen vor und nach dem Umschalten

## Ruecknahme

Voriger gesunder Stand: `smejj-control-admin-vortuer-2026-08-05.tar.gz`,
sha256 `d5a43e98f5b4655e0613068c19923bf4d9718d39de0151f282b348452132459a`.
Zuruecksetzen heisst Zeiger darauf und Neustart; kein Datenverlust. Zu beachten:
dieser Stand kennt den Einwilligungs-Endpunkt nicht — die Oberflaeche faellt
dann auf „derzeit nicht moeglich" zurueck, was der gewollte Zustand ist.

## Nachweise nach dem Ausrollen

Salad-Gruppe `smejj-control`, Version **146**, Instanz `running`, `bereit: true`
— nach 60 s erreicht. 85 Umgebungsvariablen.

| Probe | Ergebnis |
| --- | --- |
| `/api/health` | `ok: true` |
| `/api/training/consent/notice` | **503** `consent_configuration_incomplete` |
| `/api/admin` (unangemeldet) | 401 |

Die 503 ist der Beweis, dass der Endpunkt lebt: **vorher** haette derselbe Pfad
404 `training_consent_route_not_found` geliefert. Er antwortet fail-closed,
weil die sechs Umgebungswerte noch fehlen — genau der gewollte Zustand.

Im ausgelieferten Artefakt geprueft (entpackt, nicht im Arbeitsbaum):

- `adminSurfaceRoutes.js` traegt `admin_vortuer_rate_limit` und ist
  **byte-identisch** (`435a40422bcde18c…`) mit der Fassung der Parallelsitzung
  — ihre Schutzschicht ist vollstaendig zurueck.
- `trainingConsentRoutes.js` traegt `handleNotice`, `fragenerfassung.js` liegt
  im Artefakt.

## Offen

Die sechs `SMEJJ_TRAINING_*`-Werte. Danach muss
`/api/training/consent/notice` **200** liefern mit
`89cccf58e723113c0b9a4e17290e3136885f082bf9094238f69f6236258d4c8b`.

Danach fehlt noch Teil 3 der Fragen-Erfassung: die Route, die
`pruefeFrage()` im Betrieb aufruft. Bis dahin ist das Modul gebaut, getestet
und ausgeliefert, aber von nichts aufgerufen — es erfasst nichts.
