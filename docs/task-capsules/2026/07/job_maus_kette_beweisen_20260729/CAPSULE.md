# Task Capsule — job_maus_kette_beweisen_20260729

Datum: 2026-07-29
Auftrag: "geh browser smejj.com Maus teste, Maus soll eigene Browser oeffnen
und zum Chrome Browser auch gehen koennen ... checken, beheben, Daten Server
hochladen und Datenbank speichern oder aktualisieren und wieder live gehen
checken" (Wof Kadavanich)
Status: **Diagnose abgeschlossen und bewiesen; Werkzeuge live im Repo.**
Die Maus selbst bleibt blockiert — die Behebung braucht zwei Zugangsdaten beim
Zeabur-Dienst und ist damit Rote Liste (Betreiber).

## Ziel

Herausfinden, warum jeder Maus-Auftrag ueber die App scheitert, und den Weg zur
Behebung so hinterlegen, dass er nicht noch einmal Stunden kostet.

## Ausgangslage

Vorherige Sitzungen vermuteten zwei Ursachen (Token-Unterschied,
falsches IDrive-Konto), belegt war keine davon. Der Plan-Pfad verschluckte den
Fehlergrund und meldete `planner_budget_erschoepft`.

## Messwerte (alle live, 2026-07-29)

### Lauf ueber die App (Control-Server -> Engine)

| Messpunkt | Ergebnis |
| --- | --- |
| Engine `smejj-maus-engine.zeabur.app/health` | `ok:true`, 0,32 s |
| Control-Server `/api/health` (Salad, Version 119) | `ok:true` |
| `GET /api/maus/run` | `configured:true`, `missing:[]`, Budget frei |
| `POST /api/maus/run` (`mode:"interaktiv"`, `async:true`) | HTTP 202, `runId=maus-ms6qfd1e-249fa402da64` |
| Ergebnis nach 7 s | `ok:false`, **`error:"nicht_autorisiert"`**, `plannerCalls:0`, leeres actionLog |

`plannerCalls:0` beweist: kein Modell wurde gefragt. Die Engine hat den
Control-Server an der Tuer abgewiesen. Der ehrliche Fehlergrund statt
`planner_budget_erschoepft` ist der Beleg, dass Commit `6c322d2` live wirkt.

### Direktlauf ohne Control-Server (neues Werkzeug)

`node scripts/diagnose/maus-direktlauf.mjs` mit dem vorhandenen Plan
`selbsttest-smejj-com-v1` (30 Schritte, 0 Planer-Roundtrips, 0 Modellkosten):

| Messpunkt | Ergebnis |
| --- | --- |
| HTTP | 200 nach **9,2 s** |
| Schritte | **30 von 30**, davon 0 nicht ok |
| abgebrochen | nein |
| Beweise auf IDrive e2 | **7 Objekte, davon 6 Screenshots** |
| Praefix | `capsules/maus-engine/maus-selbsttest-smejj-com-2026-07-26/result/selbsttest-smejj-com-v1` |

**Befund: die Maus-Engine ist vollstaendig funktionsfaehig.** Browser,
Schritte, Screenshots und e2-Upload sind bewiesen. Der Fehler liegt zwingend
VOR der Engine.

### Blocker 1 — Token: bewiesen, nicht mehr geschlossen

Gegenprobe gegen `POST /run` mit leerem Plan (401 = Token falsch, 422 = richtig):

| Absender | Ergebnis |
| --- | --- |
| lokal hinterlegter Token | HTTP **422 (akzeptiert)** |
| Token des Control-Servers | HTTP **401 (ABGELEHNT)** |

Fingerabdruecke (nie Klartext): Control-Server `sha=c4e4ab90`, lokal
`sha=4cbb7a1f`, beide 64 Zeichen, beide ohne Leerzeichen.

Vorher war das ein Rueckschluss aus zwei Fingerabdruecken. Jetzt ist es eine
Messung am echten Endpunkt.

### Blocker 2 — Eimer: erstmals bewiesen

| Messpunkt | Ergebnis |
| --- | --- |
| Engine legt Beweise ab in | **`smejj-model-files`** (7 Objekte gelesen) |
| Control-Server liest | **`smejj-app`** (`IDRIVE_E2_CAPSULES_BUCKET`) |
| Derselbe Schluessel ueber `/api/storage/presign` | **HTTP 404** |
| Wiedergabe `maus-replay.html`, echter Klickpfad | "Artefakt nicht ladbar (404)" |
| `smejj-app` mit lokalen Zugangsdaten | HTTP 403 — **anderes Konto** |

Der Lauf war fehlerfrei und blieb trotzdem unsichtbar. Das ist die Signatur
dieses Fehlers: kein Fehler im Lauf, sondern ein Fehler in der Adresse.

### Nebenbefund: Salad-Aussetzer

Bei einer Messreihe fielen **2 von 4** Aufrufen von `/api/health` mit
"Failed to fetch" aus, unmittelbar danach 4 von 4 mit HTTP 200 in 136-316 ms.
Kein CORS-Fehler (ausdruecklich A/B geprueft: `presign` mit
`Authorization` liefert 3 von 3 mal HTTP 200 in 151-316 ms). Das ist
Gateway-Flattern des Salad-Containers und ein weiteres Argument fuer den
beschlossenen Umzug des Control-Servers nach Zeabur.
Gegen das Ziel 99,9 % API-Verfuegbarkeit ist das ein Befund, kein Rauschen.

## Umsetzung (Code)

Neu, alle rein additiv, keine bestehende Funktion beruehrt:

- `scripts/diagnose/maus-direktlauf.mjs` (168 Zeilen) — schickt einen fertigen
  Plan direkt an die Engine und nimmt damit den Control-Server aus der Kette.
  Trennt "Engine kaputt" von "Absender falsch" in einem Befehl. Braucht kein
  Modell und erzeugt keine Modellkosten. Nur Plaene aus
  `workers/maus-engine/plaene/` werden akzeptiert (kein freier Pfad).
- `scripts/diagnose/maus-befund.mjs` (78 Zeilen) — die Deutung der Messwerte
  als reine Funktionen, ohne Netz und ohne Zugangsdaten. Beide Skripte nutzen
  sie, damit es fuer denselben Befund nicht zwei Wahrheiten gibt.
- `tests/maus-diagnose-befund.test.mjs` (10 Tests) — prueft genau die Deutung.

Erweitert:

- `scripts/diagnose/maus-abgleich.mjs` — zweite Token-Gegenprobe **mit dem
  Token des Control-Servers** (der eigentliche Beweis), Eimer-Gegenprobe am
  echten Objekt (403 und 404 werden getrennt gedeutet) und eine praezise
  Handlungsanweisung fuer den Betreiber.
- `package.json` — `check:maus-engine` prueft die drei neuen/geaenderten
  Dateien und fuehrt den neuen Test mit.

## Ein Messfehler, der wie ein Produktionsfehler aussah

Der erste Direktlauf meldete "0 Beweise" bei `uploaded: true`. Ursache war
mein Auslesen: das Manifest-Feld heisst **`objects`**, nicht `entries`
(`workers/maus-engine/artifact-uploader.mjs`). Ein gelungener Lauf mit 7
Objekten galt dadurch als kaputt.

Lehre und Grund fuer `maus-befund.mjs`: **Ein Diagnose-Werkzeug ohne Tests ist
selbst eine Fehlerquelle.** Genau dieser Fall ist jetzt als Test festgehalten
("Ein Manifest mit 'entries' statt 'objects' liefert 0 — der alte Messfehler").

## Verifikation

| Check | Ergebnis |
| --- | --- |
| `check:maus-engine` | 137 Tests, 137 pass |
| `tests/maus-diagnose-befund.test.mjs` | 10 pass |
| `check:guidelines` | OK |
| `check:json` | OK |
| `check:security` | OK |
| `check:architecture` | OK |
| `check:paths` | OK |
| `check:cost` | OK |
| Live-Klickpfad `maus-replay.html` | geprueft (404-Befund reproduziert) |
| Non-Regression Startseite/Chat | unveraendert, App laedt und antwortet |

Keine Performance-Budgets beruehrt: es wurde kein Frontend-Asset und kein
ausgelieferter Server-Pfad geaendert; die neuen Dateien sind reine
Kommandozeilen-Werkzeuge und werden nie an Besucher ausgeliefert.

## Rollback

`backups/rollback-2026-07-29-maus-diagnose/` — `maus-abgleich.mjs`,
`package.json`, `Memory_Bank.md`, HEAD `9b95ea28`.
Rueckweg: die drei neuen Dateien entfernen, die drei gesicherten
zuruecklegen. Es gibt keinen Deploy, der zurueckgenommen werden muesste.

## Offen — nur der Betreiber (Rote Liste: Zugangsdaten)

Alles bei **Zeabur -> Dienst `smejj-maus-engine`**. Der Control-Server wird
ausdruecklich **nicht** angefasst: in seinem Eimer `smejj-app` liegt der
gesamte Bestand, ihn umzustellen wuerde die Historie abschneiden.

1. `SMEJJ_MAUS_ENGINE_TOKEN` = Wert des Control-Servers (64 Zeichen, ohne
   Leerzeichen und ohne Zeilenumbruch)
2. `IDRIVE_E2_BUCKET` = `smejj-app`
3. `IDRIVE_E2_ACCESS_KEY` / `IDRIVE_E2_SECRET_KEY` = die Werte des
   Control-Servers
4. `IDRIVE_E2_REGION` = `us-west-2`,
   `IDRIVE_E2_ENDPOINT` = `https://s3.us-west-2.idrivee2.com`

Danach genuegt **ein Befehl** als Abnahme:

```
node scripts/diagnose/maus-abgleich.mjs
```

Er endet mit Exit-Code 0, sobald beide Abweichungen weg sind. Zur Vollprobe
danach `node scripts/diagnose/maus-direktlauf.mjs` und die Wiedergabe von
`maus-selbsttest-smejj-com-2026-07-26 / selbsttest-smejj-com-v1` — dann muessen
die 6 Screenshots erscheinen.

## Warum der Chrome-Adapter noch nicht gebaut wurde

Der Auftrag nennt als Ziel, dass die Maus zusaetzlich den echten Chrome
bedienen kann. Das ist bewusst nicht begonnen: ein zweiter Browser-Weg auf
einer Basis, die sich noch nicht anmelden kann, verdoppelt nur die Fehlersuche.
Reihenfolge: Token und Eimer geradeziehen, dann Sitzung mit Lease (heute
Kaltstart pro Lauf, Health-Gate wartet bis 240 s), danach der Chrome-Adapter
ueber eine Erweiterung — nie ueber `--remote-debugging-port`, weil damit jede
offene Webseite im selben Chrome mitlesen koennte.
