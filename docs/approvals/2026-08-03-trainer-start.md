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

## Nicht freigegeben

Teil 2 der Freigabe (`ZEABUR_API_TOKEN`) kam mit unausgefuelltem Platzhalter
zurueck. Der Zugang ist damit weiterhin nicht vorhanden; Gespraechsgedaechtnis,
Projektwissen (RAG) und der Bruecken-Wurzelfix bleiben offen.
