# Freigabe-Nachweis — Start der GPU-Trainergruppe, 2026-08-03

## Wortlaut des Betreibers (Auszug)

```
1) TRAINER STARTEN (GPU-Kosten)

Ich gebe frei, die Salad-Gruppe smejj-lora-trainer wieder zu starten.

Zustand:  gestoppt, Version 11, 10 Umgebungswerte vollstaendig,
          Code-Buendel vorhanden, Basis Qwen/Qwen3-8B, Modus "echt"
Schutz:   startup_probe und liveness_probe auf /health:8080 sind eingerichtet

Mir ist bekannt und ich stimme zu:
- Es ist ein GPU-Container und kostet ab Start wieder Rechenzeit, im bereits
  freigegebenen GPU-Rahmen. Keine neue Kostenposition, kein neuer Anbieter.
- Bedingung: Wird der Trainer nicht innerhalb von 30 Minuten betriebsbereit
  (GET /health = 200) ODER startet die Schleife innerhalb von 60 Minuten
  keinen Trainingszyklus, wird er ohne Rueckfrage wieder gestoppt.
- Danach berichtest du mit Messwerten: Zyklen gestartet, verbrauchte USD,
  erster Trainingslauf.

Betreiber smejj.com
```

## Zustand vor dem Start (geprueft, nicht angenommen)

| Feld | Wert |
|---|---|
| Status | stopped |
| Version | 11 |
| Umgebungswerte | 10 (vollstaendig) |
| Code-Buendel | 13 656 Zeichen vorhanden |
| Basis | `Qwen/Qwen3-8B` |
| Modus | `echt` |
| Bindeadresse | `0.0.0.0:8080` |
| Sonden | `startup_probe` und `liveness_probe` auf `/health:8080` |
| Startbefehl | unveraendert (`exec python3 server.py`) |

Vorgeschichte: Am 2026-08-02 hatte ein Teil-PATCH einer Parallelsitzung neun von
zehn Umgebungswerten geloescht — darunter das Code-Buendel selbst. Das erklaert
die HTTP 503 waehrend meiner Diagnose: der Container hatte schlicht keinen Code.
Wiederhergestellt mit `create_lora_trainer_group.mjs` (Commit `c40166d`).

## Durchfuehrung

- Start: `2026-08-03T05:29:02Z`, HTTP 202 angenommen, Status `deploying`.
- Umgebung nach dem Start gegengeprueft: weiterhin 10 Werte, Buendel unveraendert.

## Abbruchbedingungen (vom Betreiber gesetzt)

| Frist | Zeitpunkt | Kriterium |
|---|---|---|
| 30 Minuten | `05:59:02Z` | `GET /health` = 200 |
| 60 Minuten | `06:29:02Z` | mindestens ein Trainingszyklus gestartet |

Wird eine der beiden Bedingungen verfehlt, wird die Gruppe **ohne Rueckfrage**
gestoppt. Rueckrollpunkt: `backups/salad/smejj-lora-trainer-2026-08-03-vor-sonden.json`.

## Ergebnis: Bedingung verfehlt, Gruppe gestoppt

**Frist 1 verfehlt.** `GET /health` lieferte in **keiner einzigen** Messung 200 —
zwoelf Messungen im Minutentakt, ueber zwei Instanz-Generationen hinweg. Die
Instanz pendelte durchgehend `running -> creating -> running` bei `ready=false`:
die Startsonde schlug an und Salad ersetzte die Instanz, wie vorgesehen.

Gestoppt um `06:02:02Z`, Gesamtlaufzeit **33 Minuten**. Erhalten geblieben:
10 Umgebungswerte, Code-Buendel (13 656 Zeichen), beide Sonden, die
PATH-Korrektur.

| Kennzahl | Wert |
|---|---|
| Trainingszyklen gestartet | **0** |
| verbrauchte USD (Zaehler der Schleife) | **0** |
| erster Trainingslauf | fand nicht statt |
| Grund durchgehend | `trainer_nicht_erreichbar` |

## Ein Reparaturversuch innerhalb des Fensters (Ship-Loop)

Der Startbefehl lautet `bash -lc`. Eine **Login-Shell** setzt `PATH` ueber
`/etc/profile` zurueck und verliert dabei `/opt/conda/bin` — genau dort liegen im
Abbild `pytorch/pytorch:2.4.0` `python3` und `pip`. Der letzte Befehl
`exec python3 server.py` wuerde dann mit "command not found" scheitern, `set -e`
beendet das Skript, der Container endet. Das passt exakt zum beobachteten Pendeln.

Deshalb wurde **eine Zeile** ergaenzt: `export PATH="/opt/conda/bin:$PATH"`
(Version 14). Ausgeschlossen wurde vorher: Buendel defekt (reines Base64, Laenge
durch 4 teilbar, gueltiges gzip, korrektes Verzeichnis mit vier Dateien),
Import-Wettlauf (nur Standardbibliothek), falsche Bindeadresse (`0.0.0.0:8080`),
Code kaputt (laedt lokal fehlerfrei).

**Die Korrektur konnte im Fenster nicht mehr verifiziert werden** — die neue
Instanz war bis zur Frist nicht fertig. Die Vermutung bleibt damit unbewiesen,
die Zeile bleibt aber im Startbefehl stehen.

## Zwischenfall: die Startsonde ging verloren

Nach dem PATCH auf `container.command` meldete der Server `startup_probe: false`,
obwohl nur der Befehl geschickt wurde; gleichzeitig sprang die Version von 11 auf
14, es hat also auch die Parallelsitzung eingegriffen. Sofort wiederhergestellt
(Version 15). **Merkregel: nach JEDEM Salad-PATCH gegenpruefen, was noch da ist —
nicht nur, was man geschickt hat.**

## Nicht freigegeben

Teil 2 der Freigabe (`ZEABUR_API_TOKEN`) kam mit unausgefuelltem Platzhalter
zurueck. Der Zugang ist damit weiterhin nicht vorhanden; Gespraechsgedaechtnis,
Projektwissen (RAG) und der Bruecken-Wurzelfix bleiben offen.
